"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/session";
import { encryptField } from "@/lib/crypto";
import { optionalUrlSchema } from "@/lib/url";
import { RULES, rateLimit, retryMessage } from "@/lib/rate-limit";
import type { FormState } from "@/lib/actions/auth";

const profileSchema = z.object({
  nickname: z.string().trim().min(1, "Enter the name people actually call you.").max(40),
  grade: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  lineId: z.string().trim().max(60).optional().or(z.literal("")),
  shirtSize: z.string().trim().max(10).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(80).optional().or(z.literal("")),
  // An avatar is rendered as `<img src>`. Anything but http/https there is a
  // scheme injection, so it goes through the same allowlist as every other link.
  avatarUrl: optionalUrlSchema,
});

function clean(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const limit = rateLimit(`write:${viewer.id}`, RULES.write);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };

  const parsed = profileSchema.safeParse({
    nickname: formData.get("nickname") ?? "",
    grade: formData.get("grade") ?? "",
    phone: formData.get("phone") ?? "",
    lineId: formData.get("lineId") ?? "",
    shirtSize: formData.get("shirtSize") ?? "",
    roleTitle: formData.get("roleTitle") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Personal data stays minimal on purpose — name, grade, contact, shirt size.
  // Nothing here is an ID number, an address, or anything medical. PDPA
  // compliance is easiest when the data was never collected.
  //
  // The two fields that are still genuinely personal — a student's phone number
  // and LINE ID — are encrypted before they reach the database, so a stolen
  // snapshot is not a contact list. See src/lib/crypto.ts.
  //
  // A profile edit never touches tier, department or the active flags: those
  // are somebody else's decision, and this form is the one endpoint every
  // account can reach. Listing the writable columns by hand is what keeps an
  // extra `<input name="tier">` in the posted body from meaning anything.
  await db.user.update({
    where: { id: viewer.id },
    data: {
      nickname: d.nickname,
      grade: clean(d.grade),
      phone: encryptField(clean(d.phone)),
      lineId: encryptField(clean(d.lineId)),
      shirtSize: clean(d.shirtSize),
      roleTitle: clean(d.roleTitle),
      avatarUrl: clean(d.avatarUrl),
      profileCompletedAt: viewer.profileCompletedAt ?? new Date(),
    },
  });

  await audit(viewer.id, "profile.updated", { type: "user", id: viewer.id });

  if (!viewer.profileCompletedAt) redirect("/dashboard");

  revalidatePath("/settings");
  revalidatePath(`/people/${viewer.id}`);
  return { ok: "Profile saved." };
}
