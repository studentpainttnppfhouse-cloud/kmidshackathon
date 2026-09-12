import "server-only";
import { SEND_TIMEOUT_MS, checkWebhookUrl } from "@/lib/teams/config";
import type { AdaptiveCardMessage } from "@/lib/teams/card";

/**
 * Posting a card to a Teams channel.
 *
 * The whole transport is one `fetch`, which is the point: an Incoming Webhook
 * takes a JSON body on a URL that carries its own authentication, so there is
 * no SDK, no token, and nothing to keep in sync with Microsoft's release notes.
 *
 * What this module does add is the part that matters when it goes wrong:
 * a timeout, and an honest answer about whether trying again would help.
 */

export type SendResult =
  | { ok: true; detail?: string }
  | { ok: false; retryable: boolean; error: string };

/**
 * Whether a failure is worth another go.
 *
 * The distinction is the difference between a queue that drains and one that
 * hammers a dead URL every minute until somebody notices:
 *
 *   429, 5xx, timeout, DNS  — Teams is busy, down, or unreachable. Retry.
 *   400, 401, 403, 404      — the URL is wrong, revoked, or the card is
 *                             malformed. No amount of retrying fixes any of
 *                             those, and the admin needs to see the error.
 */
function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Trims a provider's error page down to something an admin can read. */
function shortBody(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function postToWebhook(
  rawUrl: string,
  message: AdaptiveCardMessage,
): Promise<SendResult> {
  // Re-checked at the point of use. The row may predate the form's validation,
  // or have been written by a code path that skipped it. See the note on
  // checkWebhookUrl().
  const checked = checkWebhookUrl(rawUrl);
  if (!checked.ok) {
    return { ok: false, retryable: false, error: `Webhook URL rejected: ${checked.error}` };
  }

  let response: Response;
  try {
    response = await fetch(checked.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      // A webhook that answers with a redirect to somewhere else is the SSRF
      // the host allowlist exists to prevent, arriving one hop later. The
      // allowlist checks the URL we chose; `redirect: "error"` is what stops
      // the far end choosing the next one.
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    // A timeout and a dropped connection are both "try again later".
    return {
      ok: false,
      retryable: name !== "TypeError",
      error: name === "TimeoutError" ? "Teams did not answer within 10 seconds." : `Network error (${name}).`,
    };
  }

  if (response.ok) {
    // A classic Incoming Webhook answers with the literal string "1"; a Power
    // Automate flow answers with an empty 202. Neither is worth keeping, but a
    // flow that returns an error *body* with a 200 status is worth seeing.
    const text = await response.text().catch(() => "");
    const detail = shortBody(text);
    return { ok: true, ...(detail && detail !== "1" ? { detail } : {}) };
  }

  const text = await response.text().catch(() => "");
  return {
    ok: false,
    retryable: retryableStatus(response.status),
    error: `Teams answered ${response.status}. ${shortBody(text)}`.trim(),
  };
}
