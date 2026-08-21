"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, type Resource } from "@/lib/authorize";
import { requireViewer } from "@/lib/authorize";
import type { FormState } from "@/lib/actions/auth";
import type { AssignmentStatus, Priority } from "@prisma/client";

const STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "NEEDS_REVIEW",
  "APPROVED",
  "DONE",
] as const satisfies readonly AssignmentStatus[];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const satisfies readonly Priority[];

const assignmentSchema = z.object({
  title: z.string().trim().min(2, "Give the task a title.").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  departmentId: z.string().min(1, "Pick a department."),
  dueDate: z.string().optional().or(z.literal("")),
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
  linkUrl: z.string().trim().url("That is not a valid link.").optional().or(z.literal("")),
  recurrence: z.string().trim().max(60).optional().or(z.literal("")),
});

function parseDue(value: string | undefined): Date | null {
  if (!value) return null;
  // <input type="date"> gives YYYY-MM-DD; treat it as end of that day in ICT
  // so "due today" does not go red at midnight UTC, which is 7 AM in Bangkok.
  const d = new Date(`${value}T23:59:59+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Load the resource shape `authorize()` needs to make a decision. */
async function assignmentResource(id: string): Promise<Resource | null> {
  const a = await db.assignment.findUnique({
    where: { id },
    select: {
      departmentId: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!a) return null;
  return {
    kind: "assignment",
    departmentId: a.departmentId,
    createdById: a.createdById,
    ownerIds: a.assignees.map((x) => x.userId),
  };
}

export async function createAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();

  const parsed = assignmentSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    priority: formData.get("priority") ?? "MEDIUM",
    status: formData.get("status") ?? "NOT_STARTED",
    linkUrl: formData.get("linkUrl") ?? "",
    recurrence: formData.get("recurrence") ?? "",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);

  assertCan(viewer, "create", {
    kind: "assignment",
    departmentId: d.departmentId,
    createdById: viewer.id,
    ownerIds: assigneeIds,
  });

  // Assigning work to somebody else is a Head/Admin action, not a Member one.
  if (assigneeIds.some((id) => id !== viewer.id)) {
    assertCan(viewer, "assign", {
      kind: "assignment",
      departmentId: d.departmentId,
      createdById: viewer.id,
      ownerIds: assigneeIds,
    });
  }

  const created = await db.assignment.create({
    data: {
      title: d.title,
      description: d.description || null,
      departmentId: d.departmentId,
      createdById: viewer.id,
      dueDate: parseDue(d.dueDate),
      priority: d.priority,
      status: d.status,
      linkUrl: d.linkUrl || null,
      recurrence: d.recurrence || null,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
  });

  await audit(viewer.id, "assignment.created", { type: "assignment", id: created.id, detail: d.title });

  revalidatePath("/assignments");
  revalidatePath("/dashboard");
  return { ok: "Task created." };
}

export async function updateAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const id = String(formData.get("id") ?? "");

  const resource = await assignmentResource(id);
  if (!resource) return { error: "That task no longer exists." };

  const parsed = assignmentSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    priority: formData.get("priority") ?? "MEDIUM",
    status: formData.get("status") ?? "NOT_STARTED",
    linkUrl: formData.get("linkUrl") ?? "",
    recurrence: formData.get("recurrence") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  assertCan(viewer, "update", resource);

  const assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);
  const current = resource.kind === "assignment" ? resource.ownerIds : [];
  const changed =
    assigneeIds.length !== current.length || assigneeIds.some((x) => !current.includes(x));
  if (changed) assertCan(viewer, "assign", resource);

  // Approving is a distinct permission from editing — a member moving their own
  // task must not be able to mark it approved.
  const approving = d.status === "APPROVED" || d.status === "DONE";
  const wasApproved = await db.assignment.findUnique({
    where: { id },
    select: { status: true, approvedById: true },
  });
  if (approving && wasApproved?.status !== d.status) {
    assertCan(viewer, "approve", resource);
  }

  await db.assignment.update({
    where: { id },
    data: {
      title: d.title,
      description: d.description || null,
      departmentId: d.departmentId,
      dueDate: parseDue(d.dueDate),
      priority: d.priority,
      status: d.status,
      linkUrl: d.linkUrl || null,
      recurrence: d.recurrence || null,
      approvedById: approving ? viewer.id : null,
      approvedAt: approving ? new Date() : null,
      ...(changed
        ? { assignees: { deleteMany: {}, create: assigneeIds.map((userId) => ({ userId })) } }
        : {}),
    },
  });

  await audit(viewer.id, "assignment.updated", { type: "assignment", id });

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}`);
  revalidatePath("/dashboard");
  return { ok: "Saved." };
}

/** Board drag-and-drop and the quick status buttons both land here. */
export async function setAssignmentStatus(id: string, status: AssignmentStatus): Promise<void> {
  const viewer = await requireViewer();
  const resource = await assignmentResource(id);
  if (!resource) return;

  assertCan(viewer, "update", resource);
  if (status === "APPROVED" || status === "DONE") {
    assertCan(viewer, "approve", resource);
  }

  await db.assignment.update({
    where: { id },
    data: {
      status,
      approvedById: status === "APPROVED" || status === "DONE" ? viewer.id : null,
      approvedAt: status === "APPROVED" || status === "DONE" ? new Date() : null,
    },
  });

  await audit(viewer.id, `assignment.status.${status.toLowerCase()}`, {
    type: "assignment",
    id,
  });

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}`);
  revalidatePath("/dashboard");
}

/** Soft delete only. Students delete things by accident; nothing is ever gone. */
export async function deleteAssignment(id: string): Promise<void> {
  const viewer = await requireViewer();
  const resource = await assignmentResource(id);
  if (!resource) return;

  assertCan(viewer, "delete", resource);

  await db.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "assignment.deleted", { type: "assignment", id });

  revalidatePath("/assignments");
  revalidatePath("/dashboard");
}

export async function restoreAssignment(id: string): Promise<void> {
  const viewer = await requireViewer();
  const a = await db.assignment.findUnique({
    where: { id },
    select: { departmentId: true, createdById: true, assignees: { select: { userId: true } } },
  });
  if (!a) return;

  assertCan(viewer, "delete", {
    kind: "assignment",
    departmentId: a.departmentId,
    createdById: a.createdById,
    ownerIds: a.assignees.map((x) => x.userId),
  });

  await db.assignment.update({ where: { id }, data: { deletedAt: null } });
  await audit(viewer.id, "assignment.restored", { type: "assignment", id });
  revalidatePath("/assignments");
}

// ---------------------------------------------------------------------------
// Comments (shared by assignments, documents, incidents)
// ---------------------------------------------------------------------------

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parentType = String(formData.get("parentType") ?? "");
  const parentId = String(formData.get("parentId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "Write something first." };
  if (body.length > 4000) return { error: "That comment is too long." };
  if (!["assignment", "document", "incident"].includes(parentType)) {
    return { error: "Cannot comment on that." };
  }

  assertCan(viewer, "comment", { kind: "system" });

  await db.comment.create({
    data: { parentType, parentId, userId: viewer.id, body },
  });

  await audit(viewer.id, "comment.added", { type: parentType, id: parentId });

  revalidatePath(`/${parentType}s/${parentId}`);
  return { ok: "" };
}

export async function deleteComment(id: string): Promise<void> {
  const viewer = await requireViewer();
  const comment = await db.comment.findUnique({ where: { id } });
  if (!comment) return;

  assertCan(viewer, "delete", { kind: "comment", authorId: comment.userId });

  await db.comment.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath(`/${comment.parentType}s/${comment.parentId}`);
}
