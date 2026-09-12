import type { Tier } from "@prisma/client";

/**
 * Sign-in is restricted to this domain, checked on the server every time.
 *
 * Overridable so a deployment can be brought up before the school addresses
 * are handed out — set ALLOWED_EMAIL_DOMAIN on the service and both the login
 * gate and the seed follow it. The server is what enforces it; the copy the
 * browser bundles is only used for a placeholder, and falls back to the
 * default because Next inlines nothing that is not NEXT_PUBLIC_.
 */
export const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "kmids.ac.th")
  .trim()
  .replace(/^@/, "")
  .toLowerCase();

/** 20 March 2027, 08:00 ICT — the countdown target on every dashboard. */
export const EVENT_START = new Date("2027-03-20T01:00:00.000Z");
export const EVENT_DAYS = ["2027-03-19", "2027-03-20", "2027-03-21"] as const;

/**
 * Sessions last six months and slide forward on use. Combined with opaque
 * database-backed tokens this is what "sign in once" means: a redeploy, a
 * restart, or a rotated AUTH_SECRET all leave the session untouched.
 */
export const SESSION_TTL_DAYS = 180;
export const SESSION_COOKIE = "hs_session";

/** Login throttling. Five misses locks the account for fifteen minutes. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export const MIN_PASSWORD_LENGTH = 10;
export const BCRYPT_COST = 12;

export const INVITE_TTL_DAYS = 14;
export const RESET_TTL_HOURS = 48;

/**
 * Join links — the organisation-wide invite, the one that goes on a poster.
 *
 * `JOIN_LINK_MAX_TIER` is the ceiling on what a self-serve link may grant, and
 * it is deliberately below the ceiling on a personal invite. A per-email invite
 * names one address that an admin typed; a join link is a string that will end
 * up photographed, forwarded and stuck to a wall. Anyone who gets hold of one
 * and has a school address can use it, so what it hands out has to be a tier
 * where that is survivable: a member, or at most a department head. Admin
 * accounts stay on the one-person-at-a-time path.
 */
export const JOIN_LINK_MAX_TIER: Tier = "T2_HEAD";

/** Default life of a new join link. Null is offered too, and never expires. */
export const JOIN_LINK_TTL_DAYS = 30;

/** A link nobody may set above. Keeps a typo from creating an unlimited one. */
export const JOIN_LINK_MAX_USES = 500;

export const TIER_ORDER: Record<Tier, number> = {
  T0_ADVISOR: 0,
  T1_MEMBER: 1,
  T2_HEAD: 2,
  T3_ADMIN: 3,
  T4_OWNER: 4,
};

export const TIER_LABEL: Record<Tier, string> = {
  T0_ADVISOR: "T0 Advisor",
  T1_MEMBER: "T1 Member",
  T2_HEAD: "T2 Head",
  T3_ADMIN: "T3 Admin",
  T4_OWNER: "T4 Owner",
};

export const TIER_BLURB: Record<Tier, string> = {
  T0_ADVISOR: "Teachers and KMIDS staff. Reads and comments; never deletes.",
  T1_MEMBER: "Regular staff. Own department, own work.",
  T2_HEAD: "Department lead. Assigns and approves inside the department.",
  T3_ADMIN: "Administration. Full read/write across every department.",
  T4_OWNER: "Owner. Accounts, tiers, resets, exports, archive.",
};

export const STATUS_LABEL = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  NEEDS_REVIEW: "Needs review",
  APPROVED: "Approved",
  DONE: "Done",
} as const;

export const STATUS_ORDER = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "NEEDS_REVIEW",
  "APPROVED",
  "DONE",
] as const;

export const PRIORITY_LABEL = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
} as const;

export const DOC_STATUS_LABEL = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
} as const;

/**
 * The 2027 staff chart, as the portal understands it.
 *
 * One list, three jobs: it seeds the departments, it fills the role dropdowns,
 * and it says which permission tier a role implies. Keeping those together is
 * what stops "Graphics (Head)" on the org chart from being a T1 account in the
 * database.
 *
 * `slots` is the planned headcount from the chart, so an empty seat is visible
 * before somebody notices the work is not being done. A team can go over it;
 * nothing enforces the number.
 *
 * Roles map to tiers, not the other way round:
 *
 *   T4 Owner    Event director. One person.
 *   T3 Admin    Deputy director, ops. Reads and writes across every team.
 *   T2 Head     Runs one team: assigns inside it and approves its work.
 *   T1 Member   The rest of the team.
 *   T0 Advisor  Teachers. Reads and comments, deletes nothing.
 */
export type TeamRole = {
  title: string;
  tier: Tier;
  /** Marks the one role that leads the team, for the chart and the badges. */
  lead?: boolean;
};

export type Team = {
  name: string;
  slug: string;
  color: string;
  sortOrder: number;
  slots: number;
  description: string;
  isGeneral?: boolean;
  roles: TeamRole[];
};

export const TEAMS: readonly Team[] = [
  {
    name: "General",
    slug: "general",
    color: "#BE185D",
    sortOrder: 0,
    slots: 0,
    isGeneral: true,
    description: "All-staff space: brand assets, the master instruction doc, the schedule.",
    roles: [],
  },
  {
    name: "Management",
    slug: "management",
    color: "#BE185D",
    sortOrder: 1,
    slots: 3,
    description: "Direction, timeline and the final call on anything that crosses two teams.",
    roles: [
      { title: "Event Director", tier: "T4_OWNER", lead: true },
      { title: "Deputy Director", tier: "T3_ADMIN" },
      { title: "Timeline / Ops Manager", tier: "T3_ADMIN" },
    ],
  },
  {
    name: "Marketing",
    slug: "marketing",
    color: "#EC4899",
    sortOrder: 2,
    slots: 3,
    description: "Reaching the schools and the students: campaigns, posters, outreach.",
    roles: [
      { title: "Marketing Head", tier: "T2_HEAD", lead: true },
      { title: "Marketing", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "Accounting",
    slug: "accounting",
    color: "#22C55E",
    sortOrder: 3,
    slots: 1,
    description: "Budget, receipts, reimbursements, and what the event actually costs.",
    roles: [
      { title: "Accounting Head", tier: "T2_HEAD", lead: true },
      { title: "Accounting", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "Sponsors & Partnerships",
    slug: "sponsorship",
    color: "#F59E0B",
    sortOrder: 4,
    slots: 3,
    description: "Sponsor outreach, MOUs, tier packages, and the money that makes the event exist.",
    roles: [
      { title: "Sponsorship Head", tier: "T2_HEAD", lead: true },
      { title: "Partnership Liaison", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "Graphics",
    slug: "graphics",
    color: "#8B5CF6",
    sortOrder: 5,
    slots: 5,
    description: "Every visual the event ships: key art, decks, signage, socials, certificates.",
    roles: [
      { title: "Graphics Head", tier: "T2_HEAD", lead: true },
      { title: "Graphic Designer", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "Judging Coordination",
    slug: "judging",
    color: "#0EA5E9",
    sortOrder: 6,
    slots: 3,
    description: "Judges, briefings, scoring logistics and the judging run on the day.",
    roles: [
      { title: "Judging Head", tier: "T2_HEAD", lead: true },
      { title: "Judging Coordinator", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "MCs",
    slug: "mcs",
    color: "#F472B6",
    sortOrder: 7,
    slots: 3,
    description: "The voice of the event: opening, transitions, awards, and the script behind them.",
    roles: [{ title: "MC", tier: "T1_MEMBER" }],
  },
  {
    name: "Documentation, Rubric & Registration",
    slug: "documentation",
    color: "#2DD4BF",
    sortOrder: 8,
    slots: 4,
    description: "Proposals, the judging rubric, participant registration, and the paper trail.",
    roles: [
      { title: "Documentation Head", tier: "T2_HEAD", lead: true },
      { title: "Documentation & Rubric", tier: "T1_MEMBER" },
      { title: "Registration", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "Social Media",
    slug: "social",
    color: "#DB2777",
    sortOrder: 9,
    slots: 3,
    description: "Content calendar, posting, captions, and everything the public sees.",
    roles: [
      { title: "Social Media Head", tier: "T2_HEAD", lead: true },
      { title: "Social Media", tier: "T1_MEMBER" },
    ],
  },
  {
    name: "Floaters",
    slug: "floaters",
    color: "#64748B",
    sortOrder: 10,
    slots: 3,
    description: "Unassigned on purpose. Wherever the day is short-handed, they go there.",
    roles: [{ title: "Floater", tier: "T1_MEMBER" }],
  },
  {
    name: "Advisors",
    slug: "advisors",
    color: "#94A3B8",
    sortOrder: 11,
    slots: 0,
    description: "Teachers and KMIDS staff overseeing the event.",
    roles: [{ title: "Advisor", tier: "T0_ADVISOR" }],
  },
];

/** Every role title in the chart, with the team it belongs to. */
export const ROLE_OPTIONS: readonly { slug: string; title: string; tier: Tier; lead: boolean }[] =
  TEAMS.flatMap((team) =>
    team.roles.map((role) => ({
      slug: team.slug,
      title: role.title,
      tier: role.tier,
      lead: role.lead === true,
    })),
  );

/**
 * The tier a role title implies, or null for a title somebody typed by hand.
 *
 * A suggestion only. The admin form fills the tier select from this and the
 * admin can still override it, because the chart is a plan and the account is
 * the real thing.
 */
export function tierForRole(title: string): Tier | null {
  const match = ROLE_OPTIONS.find(
    (role) => role.title.toLowerCase() === title.trim().toLowerCase(),
  );
  return match ? match.tier : null;
}

/**
 * Teams notifications, as the control panel names them.
 *
 * Each label is written as the sentence a head reads next to a switch, not as
 * the enum spelled out: "When a task is about to be due" says what turning it
 * on will do, where "ASSIGNMENT_DUE" needs translating first.
 */
export const NOTIFICATION_KIND_LABEL = {
  MANUAL: "Sent by hand",
  ANNOUNCEMENT: "New announcement",
  ASSIGNMENT_NEW: "A task is assigned",
  ASSIGNMENT_DUE: "A task is due soon",
  ASSIGNMENT_OVERDUE: "A task is overdue",
  EVENT_SOON: "Something on the run sheet is starting",
} as const;

export const NOTIFICATION_KIND_BLURB = {
  MANUAL: "Messages a head or admin writes on this page.",
  ANNOUNCEMENT: "Posts the announcement to the channel as soon as it goes up.",
  ASSIGNMENT_NEW: "Tells the channel, and mentions whoever it was given to.",
  ASSIGNMENT_DUE: "One reminder a day while the deadline is inside the warning window.",
  ASSIGNMENT_OVERDUE: "One reminder a day until the task is marked done or approved.",
  EVENT_SOON: "Event-day only. Warns before an item on the run sheet starts.",
} as const;

/** The kinds a head may switch on for their own department. */
export const AUTOMATIC_KINDS = [
  "ANNOUNCEMENT",
  "ASSIGNMENT_NEW",
  "ASSIGNMENT_DUE",
  "ASSIGNMENT_OVERDUE",
  "EVENT_SOON",
] as const;

export const NOTIFICATION_STATUS_LABEL = {
  QUEUED: "Waiting to send",
  SENT: "Sent",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
} as const;
