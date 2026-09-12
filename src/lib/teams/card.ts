import type { NotificationKind, Priority } from "@prisma/client";

/**
 * The Adaptive Card a Teams message is made of.
 *
 * Teams renders three different things depending on what you post. Plain text
 * in a `text` field is the old MessageCard path and looks like a system log
 * entry; a full Adaptive Card is what a person reads as a message. The card is
 * worth the extra assembly because the whole point of this feature is that the
 * notification is *actionable*: a title, a due date, who it belongs to, and a
 * button that lands on the task itself.
 *
 * Version 1.4 is the highest the Teams desktop, web and mobile clients all
 * render without falling back, which matters more here than any 1.5 feature.
 *
 * This module is deliberately pure — no database, no fetch, no `server-only`.
 * Building the JSON is the part worth testing directly, and a test should not
 * have to stand up Prisma to check that a mention is escaped.
 */

export type CardMention = {
  /** UPN or Entra object id. What Teams resolves the mention against. */
  id: string;
  /** The name shown in the message. */
  name: string;
};

export type CardInput = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep link back into the portal. Rendered as the card's button. */
  url?: string | null;
  priority?: Priority;
  /** Small grey lines under the title: department, due date, who posted. */
  facts?: { label: string; value: string }[];
  mentions?: CardMention[];
  /** The line above the title. Usually the department name. */
  eyebrow?: string | null;
};

/** Teams' own accent colours for a card's heading. */
const PRIORITY_COLOR: Record<Priority, "default" | "accent" | "warning" | "attention"> = {
  LOW: "default",
  MEDIUM: "accent",
  HIGH: "warning",
  URGENT: "attention",
};

const KIND_HEADING: Record<NotificationKind, string> = {
  MANUAL: "From the portal",
  ANNOUNCEMENT: "Announcement",
  ASSIGNMENT_NEW: "New task",
  ASSIGNMENT_DUE: "Due soon",
  ASSIGNMENT_OVERDUE: "Overdue",
  EVENT_SOON: "Coming up",
};

/**
 * Control characters, minus the newline and tab that a message legitimately
 * contains. Built from code points rather than written as a literal: the
 * characters this matches are exactly the ones that do not survive being typed
 * into a source file.
 */
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}` +
    `${String.fromCharCode(11)}${String.fromCharCode(12)}` +
    `${String.fromCharCode(14)}-${String.fromCharCode(31)}` +
    `${String.fromCharCode(127)}]`,
  "g",
);

/**
 * Strips anything that would let message text forge part of the card.
 *
 * Two separate problems, both from the same root — the body is written by a
 * person and rendered by Teams as limited Markdown:
 *
 *   1. `<at>Somebody</at>` is how a mention is written. A body containing that
 *      literal text, with no matching entry in `msteams.entities`, renders as a
 *      broken mention; worse, a body that names a real person could be made to
 *      look like the portal pinged them when it did not. Angle brackets go.
 *
 *   2. Teams strips most HTML but the safest thing to hand a renderer whose
 *      exact sanitiser is not ours is text with no markup in it at all.
 *
 * Markdown emphasis and links are left alone. Those are formatting a head may
 * legitimately want, and the worst case is an ugly message rather than a
 * misleading one — a Markdown link's destination is visible in Teams before it
 * is clicked, and the portal's own URLs are the only ones it builds itself.
 */
export function plainText(value: string, limit = 4000): string {
  return value
    .replace(/[<>]/g, " ")
    .replace(CONTROL_CHARS, "")
    .trim()
    .slice(0, limit);
}

/** The `<at>…</at>` run Teams swaps for a real mention chip. */
function mentionTag(name: string): string {
  return `<at>${name}</at>`;
}

/**
 * Mention names are rewritten, not trusted.
 *
 * The name comes from a portal profile, which the person owns and can set to
 * anything — including `</at><at>Someone Else`. The tag is built from a
 * stripped copy so the card's markup cannot be closed early from inside a
 * profile field.
 */
function safeMentionName(name: string): string {
  const cleaned = name.replace(/[<>]/g, "").trim().slice(0, 60);
  return cleaned.length > 0 ? cleaned : "Someone";
}

export type AdaptiveCardMessage = {
  type: "message";
  attachments: {
    contentType: "application/vnd.microsoft.card.adaptive";
    contentUrl: null;
    content: Record<string, unknown>;
  }[];
};

/**
 * Builds the whole message body posted to a webhook.
 *
 * The envelope (`type: "message"` with one `attachments` entry) is the shape
 * both an Incoming Webhook and a Power Automate "post a card" action accept,
 * so one builder serves both transports.
 */
export function buildCard(input: CardInput): AdaptiveCardMessage {
  const priority = input.priority ?? "MEDIUM";
  const heading = KIND_HEADING[input.kind];

  const mentions = (input.mentions ?? []).slice(0, 20).map((mention) => ({
    id: mention.id,
    name: safeMentionName(mention.name),
  }));

  const body: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      text: input.eyebrow ? `${heading} · ${plainText(input.eyebrow, 60)}` : heading,
      weight: "bolder",
      size: "small",
      color: PRIORITY_COLOR[priority],
      isSubtle: priority === "LOW",
      spacing: "none",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: plainText(input.title, 200),
      weight: "bolder",
      size: "medium",
      wrap: true,
      spacing: "small",
    },
  ];

  const message = plainText(input.body);
  if (message.length > 0) {
    body.push({ type: "TextBlock", text: message, wrap: true, spacing: "small" });
  }

  const facts = (input.facts ?? [])
    .filter((fact) => fact.value.trim().length > 0)
    .slice(0, 8)
    .map((fact) => ({ title: plainText(fact.label, 40), value: plainText(fact.value, 120) }));

  if (facts.length > 0) {
    body.push({ type: "FactSet", facts, spacing: "medium" });
  }

  if (mentions.length > 0) {
    body.push({
      type: "TextBlock",
      text: `For: ${mentions.map((m) => mentionTag(m.name)).join(", ")}`,
      wrap: true,
      spacing: "medium",
      isSubtle: true,
    });
  }

  const content: Record<string, unknown> = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body,
    msteams: {
      width: "full",
      // Declaring the entity is what turns the `<at>` run above into a real
      // mention chip — and, for a person, a red badge on the channel.
      entities: mentions.map((mention) => ({
        type: "mention",
        text: mentionTag(mention.name),
        mentioned: { id: mention.id, name: mention.name },
      })),
    },
  };

  // Only http(s) links become a button. A card action is the one place a URL
  // from the database reaches a Teams client, so it is checked here rather
  // than assumed to have been checked upstream.
  if (input.url && /^https?:\/\//i.test(input.url)) {
    content.actions = [
      {
        type: "Action.OpenUrl",
        title: openLabel(input.kind),
        url: input.url,
      },
    ];
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content,
      },
    ],
  };
}

function openLabel(kind: NotificationKind): string {
  switch (kind) {
    case "ASSIGNMENT_NEW":
    case "ASSIGNMENT_DUE":
    case "ASSIGNMENT_OVERDUE":
      return "Open the task";
    case "ANNOUNCEMENT":
      return "Read it";
    case "EVENT_SOON":
      return "Open the run sheet";
    default:
      return "Open the portal";
  }
}

/**
 * The short form, for a personal activity notification.
 *
 * Graph's activity feed shows one line of text, so the card is no use there —
 * what it needs is a sentence that makes sense on a phone's lock screen.
 */
export function previewLine(input: Pick<CardInput, "kind" | "title">): string {
  return plainText(`${KIND_HEADING[input.kind]}: ${input.title}`, 140);
}
