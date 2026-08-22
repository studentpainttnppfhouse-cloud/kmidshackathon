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

export const DEFAULT_DEPARTMENTS = [
  { name: "Sponsorship & Partnerships", slug: "sponsorship", color: "#EC4899", icon: "handshake" },
  { name: "Social Media & External Affairs", slug: "social", color: "#8B5CF6", icon: "megaphone" },
  { name: "Film/Photo & Tech", slug: "film-tech", color: "#0EA5E9", icon: "camera" },
  { name: "Documentation", slug: "documentation", color: "#F59E0B", icon: "file" },
  { name: "Operations", slug: "operations", color: "#22C55E", icon: "cog" },
  { name: "Mentorship", slug: "mentorship", color: "#2DD4BF", icon: "compass" },
] as const;
