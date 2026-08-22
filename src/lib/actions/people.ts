"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, requireViewer } from "@/lib/authorize";
import { emailSchema, generateCode } from "@/lib/auth";
import { INVITE_TTL_DAYS, TIER_ORDER } from "@/lib/constants";
import { RULES, rateLimit, retryMessage } from "@/lib/rate-limit";
import type { FormState } from "@/lib/actions/auth";
import type { Tier } from "@prisma/client";

/**
 * Bulk invites, pasted from a spreadsheet.
 *
 * Onboarding sixty people one form at a time is the sort of chore that ends
 * with somebody sharing one login, so the portal takes a CSV paste instead.
 *
 * It is *invites* that get created, never accounts: an imported row cannot
 * arrive with a password, so there is no way for this to mint a usable login
 * that nobody chose the credentials for. Every row is validated exactly as the
 * single-invite form validates its one row — same email schema, same domain
 * check, same tier ceiling — because a bulk path that is more permissive than
 * the single path is a bulk path that will be used to get around the single one.
 */

const MAX_ROWS = 300;

type Row = {
  line: number;
  email: string;
  name: string;
  tier: Tier;
  departmentSlug: string;
  roleTitle: string;
};

export type ImportResult = FormState & {
  created?: number;
  skipped?: { line: number; email: string; reason: string }[];
};

/**
 * Splits one CSV line, honouring double-quoted fields.
 *
 * Written out rather than `line.split(",")` because a role title like
 * "Head, Sponsorship" is exactly what somebody pastes, and a naive split turns
 * it into a shifted row that lands the tier in the department column.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }

  cells.push(cell);
  return cells.map((value) => value.trim());
}

const HEADER_WORDS = ["email", "e-mail", "address"];

export async function importPeople(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId: viewer.id });

  const limit = rateLimit(`import:${viewer.id}`, RULES.write);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  const raw = String(formData.get("rows") ?? "");
  if (raw.trim().length === 0) return { error: "Paste some rows first." };
  if (raw.length > 200_000) return { error: "That is more than one import can take. Split it up." };

  const defaultTier = String(formData.get("defaultTier") ?? "T1_MEMBER") as Tier;
  if (!(defaultTier in TIER_ORDER)) return { error: "Pick a valid default tier." };
  if (TIER_ORDER[defaultTier] > TIER_ORDER[viewer.tier]) {
    return { error: "You cannot invite people at a higher tier than your own." };
  }

  const departments = await db.department.findMany({ select: { id: true, slug: true, name: true } });
  const bySlug = new Map(departments.map((d) => [d.slug.toLowerCase(), d.id]));
  const byName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));

  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > MAX_ROWS) {
    return { error: `That is ${lines.length} rows. Import at most ${MAX_ROWS} at a time.` };
  }

  const skipped: { line: number; email: string; reason: string }[] = [];
  const rows: Row[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const cells = splitCsvLine(line);

    // A header row pasted along with the data is the normal case, not an error.
    if (index === 0 && HEADER_WORDS.some((word) => cells[0]?.toLowerCase() === word)) return;

    const [emailRaw = "", name = "", tierRaw = "", departmentRaw = "", roleTitle = ""] = cells;

    const email = emailSchema.safeParse(emailRaw);
    if (!email.success) {
      skipped.push({ line: lineNumber, email: emailRaw.slice(0, 80), reason: email.error.issues[0].message });
      return;
    }

    if (seen.has(email.data)) {
      skipped.push({ line: lineNumber, email: email.data, reason: "Listed twice in this paste." });
      return;
    }
    seen.add(email.data);

    let tier = defaultTier;
    if (tierRaw) {
      const candidate = tierRaw.toUpperCase().replace(/[\s-]/g, "_") as Tier;
      if (!(candidate in TIER_ORDER)) {
        skipped.push({ line: lineNumber, email: email.data, reason: `Unknown tier "${tierRaw}".` });
        return;
      }
      // The ceiling is re-checked per row: a CSV cell is browser input, and
      // "T4_OWNER" in column three must not be a way past the check above.
      if (TIER_ORDER[candidate] > TIER_ORDER[viewer.tier]) {
        skipped.push({
          line: lineNumber,
          email: email.data,
          reason: "That tier is above your own.",
        });
        return;
      }
      tier = candidate;
    }

    rows.push({
      line: lineNumber,
      email: email.data,
      name: name.slice(0, 120),
      tier,
      departmentSlug: departmentRaw,
      roleTitle: roleTitle.slice(0, 80),
    });
  });

  if (rows.length === 0) {
    return {
      error: "No usable rows found.",
      skipped: skipped.slice(0, 50),
    };
  }

  // One query for every address in the paste rather than one per row.
  const existing = await db.user.findMany({
    where: { email: { in: rows.map((row) => row.email) } },
    select: { email: true, passwordHash: true },
  });
  const hasAccount = new Set(
    existing.filter((user) => user.passwordHash !== null).map((user) => user.email),
  );

  const pending = await db.invite.findMany({
    where: {
      email: { in: rows.map((row) => row.email) },
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { email: true },
  });
  const alreadyInvited = new Set(pending.map((invite) => invite.email));

  const toCreate = rows.filter((row) => {
    if (hasAccount.has(row.email)) {
      skipped.push({ line: row.line, email: row.email, reason: "Already has an account." });
      return false;
    }
    if (alreadyInvited.has(row.email)) {
      skipped.push({ line: row.line, email: row.email, reason: "Already has a pending invite." });
      return false;
    }
    if (row.departmentSlug) {
      const id =
        bySlug.get(row.departmentSlug.toLowerCase()) ?? byName.get(row.departmentSlug.toLowerCase());
      if (!id) {
        skipped.push({
          line: row.line,
          email: row.email,
          reason: `No department called "${row.departmentSlug}".`,
        });
        return false;
      }
    }
    return true;
  });

  if (toCreate.length === 0) {
    return { error: "Every row was skipped — see the reasons below.", skipped: skipped.slice(0, 50) };
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.invite.createMany({
    data: toCreate.map((row) => ({
      email: row.email,
      code: generateCode(),
      name: row.name || null,
      roleTitle: row.roleTitle || null,
      tier: row.tier,
      departmentId: row.departmentSlug
        ? (bySlug.get(row.departmentSlug.toLowerCase()) ??
          byName.get(row.departmentSlug.toLowerCase()) ??
          null)
        : null,
      invitedById: viewer.id,
      expiresAt,
    })),
  });

  await audit(viewer.id, "people.imported", {
    type: "invite",
    detail: `${toCreate.length} invites, ${skipped.length} skipped`,
  });

  revalidatePath("/admin");
  revalidatePath("/people");

  return {
    ok: `${toCreate.length} ${toCreate.length === 1 ? "invite" : "invites"} created. Copy the links from the admin panel and send them out.`,
    created: toCreate.length,
    skipped: skipped.slice(0, 50),
  };
}
