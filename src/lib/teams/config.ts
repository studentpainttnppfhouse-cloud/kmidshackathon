import "server-only";

/**
 * What the Teams integration needs to exist, and how much of it is optional.
 *
 * Nothing here is required for the portal to run. With no configuration at all
 * the notification module is visible to heads and admins, says plainly that no
 * channel is connected, and queues nothing. That is deliberate: this is the
 * one feature whose setup depends on somebody else's Microsoft tenant, and a
 * portal that refuses to boot because a webhook was never pasted in would be a
 * worse portal.
 *
 * Two capabilities, with very different setup costs:
 *
 *   Channel posts (webhook) — a channel owner in Teams creates an Incoming
 *     Webhook, or a Workflows "post to a channel" trigger, and pastes the URL
 *     into the admin screen. No Azure admin, no consent, about a minute. This
 *     is the path that will actually get used.
 *
 *   Personal pings (Graph) — a tenant admin registers an application, grants
 *     TeamsActivity.Send, and the three values below go on the service as
 *     environment variables. This is the only way to reach one person rather
 *     than a channel, and it is gated behind a grown-up with admin rights
 *     because Microsoft gates it there, not because the portal wants to.
 */

// ---------------------------------------------------------------------------
// Webhook URLs
// ---------------------------------------------------------------------------

/**
 * Hosts a webhook URL may point at.
 *
 * This is an SSRF control, and it is the reason webhook URLs are not simply
 * validated with `isSafeUrl()` like every other link in the portal. Every other
 * link is rendered for a browser to follow; this one is fetched *by the server*,
 * from inside the deployment's own network, with a POST body attached. An admin
 * who pasted `http://169.254.169.254/latest/meta-data/` — by mistake, or because
 * somebody told them it was the new Teams URL — would be asking the portal to
 * read the cloud metadata service and mail the result to itself.
 *
 * So the destination is allowlisted by suffix rather than filtered for badness.
 * These are the hosts Microsoft actually issues Teams webhooks on:
 *
 *   webhook.office.com   classic Incoming Webhook connectors
 *   logic.azure.com      Power Automate / Workflows, which is what the "Post to
 *                        a channel when a webhook request is received" template
 *                        produces now that connectors are being retired
 *
 * `TEAMS_WEBHOOK_HOSTS` can add more, comma-separated, for a tenant on a
 * sovereign cloud (`logic.azure.us`, `logic.azure.cn`). It adds; it cannot
 * subtract, so a stray value cannot open the portal up to arbitrary hosts by
 * replacing the list with something permissive.
 */
const BUILT_IN_HOSTS = ["webhook.office.com", "logic.azure.com"] as const;

function extraHosts(): string[] {
  return (process.env.TEAMS_WEBHOOK_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^\./, ""))
    .filter((host) => host.length > 0 && host.includes("."))
    .slice(0, 8);
}

export function allowedWebhookHosts(): string[] {
  return [...BUILT_IN_HOSTS, ...extraHosts()];
}

export type WebhookUrlCheck =
  | { ok: true; url: string; host: string; hint: string }
  | { ok: false; error: string };

/**
 * Any space, tab, newline or DEL anywhere in the string.
 *
 * Written as a code-point scan rather than a regular expression because the
 * characters being looked for are exactly the ones that do not survive being
 * typed into a source file legibly. Same set as CONTROL_CHARS in src/lib/url.ts.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Validates a webhook URL on the way in, and again on the way out.
 *
 * Checked twice on purpose. The form check is what produces a readable error
 * for the admin pasting the URL; the check inside the sender is what protects a
 * row that was written before this function existed, or by a future code path
 * that forgets the form. The same reasoning as `safeHref()` in src/lib/url.ts.
 */
export function checkWebhookUrl(raw: string): WebhookUrlCheck {
  const trimmed = raw.trim();

  if (trimmed.length === 0) return { ok: false, error: "Paste the webhook URL from Teams." };
  if (trimmed.length > 2048) return { ok: false, error: "That URL is too long to be a webhook." };
  // A tab or a newline inside a URL is how a split scheme sneaks past a parser.
  if (hasControlCharacter(trimmed)) {
    return { ok: false, error: "That URL has stray spaces or line breaks in it." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That does not look like a URL." };
  }

  // Plain HTTP would put the webhook URL — a bearer credential — on the wire.
  if (url.protocol !== "https:") {
    return { ok: false, error: "A Teams webhook URL always starts with https://" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Remove the username and password from that URL." };
  }

  const host = url.hostname.toLowerCase();
  const allowed = allowedWebhookHosts().some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  if (!allowed) {
    return {
      ok: false,
      error: `The portal only posts to Microsoft's own webhook hosts (${allowedWebhookHosts().join(", ")}). Copy the URL again from the Teams channel.`,
    };
  }

  return {
    ok: true,
    url: url.toString(),
    host,
    // Enough to tell two webhooks in the same channel apart, far too little to
    // post with. The full URL is never rendered back to a browser.
    hint: trimmed.slice(-4),
  };
}

// ---------------------------------------------------------------------------
// Microsoft Graph — the optional half
// ---------------------------------------------------------------------------

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The Teams app the activity notification appears to come from. */
  teamsAppId: string;
};

export function graphConfig(): GraphConfig | null {
  const tenantId = process.env.MS_TENANT_ID?.trim();
  const clientId = process.env.MS_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim();
  const teamsAppId = process.env.MS_TEAMS_APP_ID?.trim();

  if (!tenantId || !clientId || !clientSecret || !teamsAppId) return null;
  return { tenantId, clientId, clientSecret, teamsAppId };
}

/** Whether personal Teams pings are possible at all on this deployment. */
export function graphAvailable(): boolean {
  return graphConfig() !== null;
}

// ---------------------------------------------------------------------------
// The dispatcher's key
// ---------------------------------------------------------------------------

/**
 * The shared secret on /api/teams/dispatch.
 *
 * The dispatcher sends queued messages, so an open one is a stranger's button
 * for making the portal post into a staff channel as often as they like. It is
 * therefore closed unless a secret is configured — absent means the route
 * answers 503 and explains itself, rather than silently running for anybody
 * who found the path.
 */
export function dispatchSecret(): string | null {
  const secret = process.env.TEAMS_DISPATCH_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return secret;
}

/** How long a single outbound call gets before it is treated as a failure. */
export const SEND_TIMEOUT_MS = 10_000;

/** How many times a queued message is retried before it is left as failed. */
export const MAX_ATTEMPTS = 4;

/** How many messages one dispatch run will send. Keeps a run inside a request. */
export const DISPATCH_BATCH = 25;

/**
 * Backoff between attempts, in minutes. A Teams outage is usually minutes long
 * and a bad URL is forever, so the curve is short at the start and gives up
 * quickly rather than retrying a 404 all afternoon.
 */
export const RETRY_BACKOFF_MINUTES = [1, 5, 20] as const;
