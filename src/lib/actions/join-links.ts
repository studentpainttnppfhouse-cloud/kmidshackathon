"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, requireViewer } from "@/lib/authorize";
import { emailSchema, generateCode, hashPassword, normalizeEmail, passwordSchema } from "@/lib/auth";
import { JOIN_LINK_MAX_TIER, JOIN_LINK_MAX_USES, TIER_ORDER } from "@/lib/constants";
import { RULES, clearRateLimit, rateLimit, retryMessage } from "@/lib/rate-limit";
import { clientIp, displayIp, looksAutomated, userAgent } from "@/lib/request";
import { createSession } from "@/lib/session";
import { JOIN_LINK_MESSAGE, joinLinkMessage, joinLinkStatus } from "@/lib/join-links";
import type { FormState } from "@/lib/actions/auth";
import type { Tier } from "@prisma/client";

/**
 * The organisation invite: one link, one QR code, everybody.
 *
 * Microsoft Teams and Google Classroom both work this way, and the reason is
 * not convenience for the admin — it is that the alternative does not scale to
 * a room. Sixty people at the first staff meeting cannot each be sent a
 * personal link while they are sitting there. One code on the projector, and
 * the room registers itself.
 *
 * The whole risk of that shape is that the link is a bearer token: whoever has
 * it can make an account. Four things bound it, and all four are enforced on
 * the server:
 *
 *   1. the KMIDS email domain, exactly as the login gate enforces it;
 *   2. a tier ceiling that no join link may exceed, whoever made it;
 *   3. uses and expiry, both checked at the moment of registration;
 *   4. `revokedAt`, so an admin who sees the code posted somewhere public
 *      switches it off and every copy of the poster dies at once.
 *
 * A used link is not spent, which is the difference from `Invite`. That is the
 * point of it, and it is also why every use is counted, audited, and traceable
 * back to the link through `users.joinedViaLinkId`.
 */

const TIERS = ["T0_ADVISOR", "T1_MEMBER", "T2_HEAD"] as const satisfies readonly Tier[];

// ---------------------------------------------------------------------------
// Creating and managing links (admins only)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  label: z.string().trim().min(2, "Name the link so you know what it is for.").max(80),
  tier: z.enum(TIERS),
  departmentId: z.string().max(40).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(80).optional().or(z.literal("")),
  maxUses: z.coerce
    .number()
    .int()
    .min(1, "A link has to be good for at least one person.")
    .max(JOIN_LINK_MAX_USES, `Cap a link at ${JOIN_LINK_MAX_USES} uses or fewer.`)
    .optional(),
  days: z.coerce
    .number()
    .int()
    .min(1, "Give the link at least a day.")
    .max(365, "A year is the longest a join link may live.")
    .optional(),
});

export type JoinLinkState = FormState & { code?: string };

export async function createJoinLink(
  _prev: JoinLinkState,
  formData: FormData,
): Promise<JoinLinkState> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId: viewer.id });

  const limit = rateLimit(`write:${viewer.id}`, RULES.write);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  // "Unlimited" and "never expires" are real choices, so the two fields are
  // read as optional rather than defaulted — an empty box means no ceiling.
  const usesRaw = String(formData.get("maxUses") ?? "").trim();
  const daysRaw = String(formData.get("days") ?? "").trim();

  const parsed = createSchema.safeParse({
    label: formData.get("label") ?? "",
    tier: formData.get("tier") ?? "T1_MEMBER",
    departmentId: formData.get("departmentId") ?? "",
    roleTitle: formData.get("roleTitle") ?? "",
    maxUses: usesRaw === "" ? undefined : usesRaw,
    days: daysRaw === "" ? undefined : daysRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Two ceilings, both of which have to hold: nobody hands out a tier above
  // their own, and no join link hands out a tier above the standing cap.
  if (TIER_ORDER[d.tier] > TIER_ORDER[viewer.tier]) {
    return { error: "You cannot create a link that grants a tier above your own." };
  }
  if (TIER_ORDER[d.tier] > TIER_ORDER[JOIN_LINK_MAX_TIER]) {
    return { error: "A join link cannot grant an admin account. Send a personal invite instead." };
  }

  if (d.departmentId) {
    const department = await db.department.findUnique({
      where: { id: d.departmentId },
      select: { id: true },
    });
    if (!department) return { error: "That department no longer exists." };
  }

  const link = await db.inviteLink.create({
    data: {
      code: generateCode(),
      label: d.label,
      tier: d.tier,
      departmentId: d.departmentId || null,
      roleTitle: d.roleTitle || null,
      createdById: viewer.id,
      maxUses: d.maxUses ?? null,
      expiresAt: d.days ? new Date(Date.now() + d.days * 24 * 60 * 60 * 1000) : null,
    },
  });

  await audit(viewer.id, "join_link.created", {
    type: "invite_link",
    id: link.id,
    detail: `${d.label} · ${d.tier}`,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/invite");
  return { ok: `"${d.label}" is live. Print the code or send the link.`, code: link.code };
}

export async function revokeJoinLink(id: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "manage_users", { kind: "user", userId: viewer.id });

  // updateMany rather than update: an id matching nothing is a no-op, not a
  // P2025 that surfaces as a 500 on the admin page.
  await db.inviteLink.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await audit(viewer.id, "join_link.revoked", { type: "invite_link", id });
  revalidatePath("/admin");
  revalidatePath("/admin/invite");
}

// ---------------------------------------------------------------------------
// Using a link
// ---------------------------------------------------------------------------

/**
 * Registers somebody from a join link, and signs them straight in.
 *
 * The one thing this must never do is let a second person take over an
 * existing account. Anyone can post a school address to this endpoint, so an
 * address that already has a password is refused outright and told to sign in
 * — no password is set, no session is created, and the answer is the same
 * whether the account exists or not, so the endpoint cannot be used to find
 * out who works here.
 *
 * An address with a *row* but no password is the ordinary case — a CSV import
 * created it — and that account is claimed rather than duplicated.
 */
export async function useJoinLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientIp();

  const limit = rateLimit(`code:${ip}`, RULES.code);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  if (looksAutomated(formData)) {
    return { error: JOIN_LINK_MESSAGE.missing };
  }

  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!name) return { error: "Enter your full name." };
  if (name.length > 120) return { error: "That name is too long." };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { error: pw.error.issues[0].message };

  const parsedEmail = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsedEmail.success) return { error: parsedEmail.error.issues[0].message };
  const email = normalizeEmail(parsedEmail.data);

  const link = await db.inviteLink.findUnique({ where: { code } });
  const status = joinLinkStatus(link);
  if (status !== "ok" || !link) return { error: joinLinkMessage(status) };

  // The tier stored on the link is re-checked against the cap on every use.
  // A row written before the cap existed, or edited outside the portal, does
  // not get to be the thing that hands out an admin account.
  if (TIER_ORDER[link.tier] > TIER_ORDER[JOIN_LINK_MAX_TIER]) {
    return { error: JOIN_LINK_MESSAGE.revoked };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    return {
      error: "That address already has an account. Sign in instead, or ask an admin for a reset.",
    };
  }

  // Claim a use before writing the account, with the ceiling in the WHERE.
  // Two phones scanning the same poster at the same moment would otherwise
  // both read useCount = 49 against a cap of 50 and both pass; letting the
  // database decide the winner is what makes the cap a real cap.
  const claimed = await db.inviteLink.updateMany({
    where: {
      id: link.id,
      revokedAt: null,
      ...(link.maxUses === null ? {} : { useCount: { lt: link.maxUses } }),
    },
    data: { useCount: { increment: 1 } },
  });
  if (claimed.count === 0) return { error: JOIN_LINK_MESSAGE.full };

  const passwordHash = await hashPassword(password);

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: existing.name || name,
          // The higher of the two wins. A CSV import may already have put
          // somebody at T3; joining through a member link must not demote
          // them, and the link's own tier is capped above, so this cannot
          // promote anybody either.
          tier: TIER_ORDER[existing.tier] > TIER_ORDER[link.tier] ? existing.tier : link.tier,
          departmentId: existing.departmentId ?? link.departmentId,
          roleTitle: existing.roleTitle ?? link.roleTitle,
          joinedViaLinkId: link.id,
          isActive: true,
          failedLogins: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      })
    : await db.user.create({
        data: {
          email,
          passwordHash,
          name,
          tier: link.tier,
          departmentId: link.departmentId,
          roleTitle: link.roleTitle,
          joinedViaLinkId: link.id,
          lastLoginAt: new Date(),
        },
      });

  clearRateLimit(`code:${ip}`);

  await createSession(user.id, { userAgent: await userAgent(), ip: await displayIp() });
  await audit(user.id, "join_link.used", {
    type: "invite_link",
    id: link.id,
    detail: link.label,
  });

  redirect("/welcome");
}
