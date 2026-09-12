import "server-only";
import { SEND_TIMEOUT_MS, graphConfig } from "@/lib/teams/config";
import type { SendResult } from "@/lib/teams/webhook";

/**
 * Microsoft Graph — the half that can reach one person.
 *
 * A channel webhook posts to a room. That covers "the whole team should know",
 * and it is most of what this feature is for. What it cannot do is put a red
 * badge on one person's Teams for the task that is theirs and overdue, because
 * a webhook has no idea who anybody is.
 *
 * `sendActivityNotification` is the supported way to do that: it drops an entry
 * in a person's Activity feed, which is the same place Teams puts an @mention.
 * It needs an app registration with the `TeamsActivity.Send` application
 * permission, admin-consented, and the portal's Teams app installed for the
 * people being notified. All of that is somebody else's tenant, so every path
 * through this module degrades to "not configured" rather than throwing.
 *
 * Deliberately not used: posting a 1:1 chat message. That needs either a
 * registered bot with a conversation reference per person, or Graph's import
 * permissions, and both are a large amount of Azure for a notification that the
 * activity feed already delivers.
 */

const LOGIN_HOST = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

type CachedToken = { value: string; expiresAt: number };

/**
 * One token, cached in process memory.
 *
 * An app-only token lasts about an hour and is identical for every call, so
 * fetching one per notification would turn a ten-message dispatch run into
 * twenty HTTPS round trips. The portal runs as a single Render instance; a
 * second instance would simply hold its own copy, which is correct, just less
 * efficient. Refreshed 60 seconds early so a token never expires mid-flight.
 */
let cached: CachedToken | null = null;

async function accessToken(): Promise<{ ok: true; token: string } | { ok: false; error: string; retryable: boolean }> {
  const config = graphConfig();
  if (!config) return { ok: false, error: "Microsoft Graph is not configured.", retryable: false };

  if (cached && cached.expiresAt > Date.now()) return { ok: true, token: cached.value };

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  let response: Response;
  try {
    response = await fetch(`${LOGIN_HOST}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return { ok: false, error: `Could not reach Microsoft sign-in (${name}).`, retryable: true };
  }

  if (!response.ok) {
    // The response body here quotes the client id and sometimes the secret's
    // description. Only the AADSTS code is kept — enough to search for, with
    // nothing in it worth leaking into an audit trail a head can read.
    const text = await response.text().catch(() => "");
    const code = /AADSTS\d+/.exec(text)?.[0] ?? `HTTP ${response.status}`;
    return {
      ok: false,
      error: `Microsoft refused the app credentials (${code}).`,
      retryable: response.status >= 500,
    };
  }

  const json = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;

  if (!json?.access_token) {
    return { ok: false, error: "Microsoft returned no access token.", retryable: true };
  }

  const lifetime = Math.max(60, Number(json.expires_in ?? 3600));
  cached = { value: json.access_token, expiresAt: Date.now() + (lifetime - 60) * 1000 };
  return { ok: true, token: cached.value };
}

/** Drops the cached token. Called when Graph rejects one as expired. */
export function forgetToken(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// The personal ping
// ---------------------------------------------------------------------------

export type ActivityPing = {
  /** UPN or Entra object id of the person to notify. */
  recipientId: string;
  /** One line. This is what appears in the activity feed and on a phone. */
  preview: string;
  /** Where tapping it should land. Must be a URL Teams is willing to open. */
  url: string;
};

/**
 * Sends one activity-feed notification.
 *
 * `activityType: "systemDefault"` with a `systemDefaultText` parameter is the
 * one topic that works without declaring custom activity types in a Teams app
 * manifest — which matters, because the manifest is the part a school admin is
 * least likely to update on request.
 */
export async function sendActivityNotification(ping: ActivityPing): Promise<SendResult> {
  const config = graphConfig();
  if (!config) {
    return { ok: false, retryable: false, error: "Microsoft Graph is not configured." };
  }

  const token = await accessToken();
  if (!token.ok) return { ok: false, retryable: token.retryable, error: token.error };

  const payload = {
    topic: { source: "text", value: "Hackathon Studio", webUrl: ping.url },
    activityType: "systemDefault",
    previewText: { content: ping.preview.slice(0, 150) },
    templateParameters: [{ name: "systemDefaultText", value: ping.preview.slice(0, 150) }],
  };

  let response: Response;
  try {
    response = await fetch(
      `${GRAPH}/users/${encodeURIComponent(ping.recipientId)}/teamwork/sendActivityNotification`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return { ok: false, retryable: true, error: `Could not reach Graph (${name}).` };
  }

  if (response.status === 401) {
    // A token that was fine a minute ago and is not now: the cached copy is
    // stale. Drop it so the retry fetches a fresh one instead of replaying the
    // same rejected header.
    forgetToken();
    return { ok: false, retryable: true, error: "Graph rejected the token; it will be renewed." };
  }

  if (response.ok || response.status === 204) return { ok: true };

  const text = await response.text().catch(() => "");
  const code = /"code"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? `HTTP ${response.status}`;

  // 404 on this endpoint almost always means the person has never had the
  // Teams app installed, which is a setup problem and not a transient one.
  const hint =
    response.status === 404
      ? " The portal's Teams app is probably not installed for that person."
      : "";

  return {
    ok: false,
    retryable: response.status === 429 || response.status >= 500,
    error: `Graph refused the notification (${code}).${hint}`,
  };
}
