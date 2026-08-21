"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, requireViewer, isAdmin } from "@/lib/authorize";
import type { FormState } from "@/lib/actions/auth";

/** Which of the three event days is "today", or the first one otherwise. */
export async function currentEventDay(): Promise<string> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  return today;
}

export async function toggleCheckin(day: string): Promise<void> {
  const viewer = await requireViewer();

  const open = await db.checkin.findFirst({
    where: { userId: viewer.id, day, checkedOutAt: null },
    orderBy: { checkedInAt: "desc" },
  });

  if (open) {
    await db.checkin.update({ where: { id: open.id }, data: { checkedOutAt: new Date() } });
    await audit(viewer.id, "checkin.out", { type: "checkin", id: open.id });
  } else {
    const created = await db.checkin.create({ data: { userId: viewer.id, day } });
    await audit(viewer.id, "checkin.in", { type: "checkin", id: created.id });
  }

  revalidatePath("/event");
}

const incidentSchema = z.object({
  description: z.string().trim().min(5, "Describe what happened.").max(4000),
  severity: z.enum(["low", "medium", "high"]),
  location: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function reportIncident(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();

  const parsed = incidentSchema.safeParse({
    description: formData.get("description") ?? "",
    severity: formData.get("severity") ?? "low",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Anyone on staff can report. Only admins can read the log back.
  const created = await db.incident.create({
    data: {
      reportedById: viewer.id,
      description: d.description,
      severity: d.severity,
      location: d.location || null,
    },
  });

  await audit(viewer.id, "incident.reported", { type: "incident", id: created.id });
  revalidatePath("/event");
  return { ok: "Reported. Operations has been notified in the log." };
}

export async function resolveIncident(id: string, resolution: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "read", { kind: "incident" });
  if (!isAdmin(viewer)) return;

  await db.incident.update({
    where: { id },
    data: { resolution: resolution.slice(0, 4000), resolvedAt: new Date() },
  });

  await audit(viewer.id, "incident.resolved", { type: "incident", id });
  revalidatePath("/event");
}
