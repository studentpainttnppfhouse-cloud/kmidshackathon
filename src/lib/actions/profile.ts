"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/session";
import type { FormState } from "@/lib/actions/auth";

const profileSchema = z.object({
  nickname: z.string().trim().min(1, "Enter the name people actually call you.").max(40),
  grade: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  lineId: z.string().trim().max(60).optional().or(z.literal("")),
  shirtSize: z.string().trim().max(10).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(80).optional().or(z.literal("")),
  avatarUrl: z.string().trim().url("That is not a valid link.").optional().or(z.literal("")),
});

function clean(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

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
  await db.user.update({
    where: { id: viewer.id },
    data: {
      nickname: d.nickname,
      grade: clean(d.grade),
      phone: clean(d.phone),
      lineId: clean(d.lineId),
      shirtSize: clean(d.shirtSize),
      roleTitle: clean(d.roleTitle),
      avatarUrl: clean(d.avatarUrl),
      profileCompletedAt: viewer.profileCompletedAt ?? new Date(),
    },
  });

  await audit(viewer.id, "profile.updated", { type: "user", id: viewer.id });

  if (!viewer.profileCompletedAt) redirect("/dashboard");

  revalidatePath("/settings");
  return { ok: "Profile saved." };
}
