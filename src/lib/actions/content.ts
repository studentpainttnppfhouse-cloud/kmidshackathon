"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, requireViewer, can, type Viewer } from "@/lib/authorize";
import { optionalUrlSchema, urlSchema } from "@/lib/url";
import { FILE_KINDS } from "@/lib/uploads";
import { RULES, rateLimit, retryMessage } from "@/lib/rate-limit";
import type { FormState } from "@/lib/actions/auth";
import type { DocStatus } from "@prisma/client";

const DOC_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED"] as const satisfies readonly DocStatus[];

/** Tags arrive as a comma-separated string and live in a JSON column. */
function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * A department id from a form body is a claim, not a fact.
 *
 * `can()` decides whether the viewer may write into department X, but it has no
 * way to know whether X exists — TiDB does not enforce foreign keys under
 * `relationMode = "prisma"`, so an id that matches nothing is inserted
 * perfectly happily and produces a row that every join drops. Checking here
 * turns a silently corrupt record into a form error.
 */
async function assertDepartmentExists(departmentId: string): Promise<boolean> {
  const found = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  return found !== null;
}

/** Guards the write endpoints against a signed-in account being scripted. */
function writeLimit(viewer: Viewer): FormState | null {
  const limit = rateLimit(`write:${viewer.id}`, RULES.write);
  return limit.ok ? null : { error: retryMessage(limit.retryAfter) };
}

// ---------------------------------------------------------------------------
// Document history
//
// The portal is edited by thirty students, several of whom will one day open
// the wrong tab, select all, and paste a Line message over the sponsorship
// plan. Every save therefore files the *previous* state as a revision before
// overwriting it, which turns that afternoon from a loss into two clicks.
//
// Revisions are capped per document: fifty is far more history than anyone
// reads, and a document edited every minute for a week should not become the
// largest thing in the database.
// ---------------------------------------------------------------------------

const REVISIONS_KEPT = 50;

type RevisionSource = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  source: string;
  externalUrl: string | null;
  body: string | null;
  status: DocStatus;
};

/**
 * Snapshots the document as it is now and returns the version number the next
 * save should carry. Never throws: losing the history entry is bad, losing the
 * edit that came with it would be worse.
 */
async function snapshotDocument(
  document: RevisionSource,
  editedById: string,
  reason: "edit" | "restore",
): Promise<number> {
  try {
    await db.documentRevision.create({
      data: {
        documentId: document.id,
        version: document.version,
        title: document.title,
        description: document.description,
        source: document.source,
        externalUrl: document.externalUrl,
        body: document.body,
        status: document.status,
        editedById,
        reason,
      },
    });

    const stale = await db.documentRevision.findMany({
      where: { documentId: document.id },
      select: { id: true },
      orderBy: { version: "desc" },
      skip: REVISIONS_KEPT,
    });
    if (stale.length > 0) {
      await db.documentRevision.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    }
  } catch {
    // A duplicate version means two people saved at the same instant; the
    // other save's snapshot is the one that survives, and this edit proceeds.
  }

  return document.version + 1;
}

// ---------------------------------------------------------------------------
// Documents
//
// Two kinds live in one table (decision D3-B, revising D3-A):
//
//   - "external": a link to Google Docs. The original design, kept because
//     comments and version history there already work and nobody wants to
//     re-learn them.
//   - "portal": written in the portal, Markdown body stored in TiDB, exported
//     to .docx / .pdf / .md on demand, and attachable to an assignment so a
//     submission can be the document itself.
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  title: z.string().trim().min(2, "Give the document a title.").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  departmentId: z.string().min(1, "Pick a department."),
  source: z.enum(["external", "portal"]),
  externalUrl: optionalUrlSchema,
  body: z.string().max(400_000, "That document is too long to store.").optional().or(z.literal("")),
  assignmentId: z.string().max(40).optional().or(z.literal("")),
  status: z.enum(DOC_STATUSES),
  tags: z.string().trim().max(300).optional().or(z.literal("")),
});

/**
 * Attaching a document to a task is a write to that task's meaning, so it needs
 * the same permission as updating the task — not merely the right to read it.
 */
async function resolveAssignmentLink(
  viewer: Viewer,
  assignmentId: string | undefined,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (!assignmentId) return { ok: true, id: null };

  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      deletedAt: true,
      departmentId: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!assignment || assignment.deletedAt) {
    return { ok: false, error: "That task no longer exists." };
  }

  const allowed = can(viewer, "update", {
    kind: "assignment",
    departmentId: assignment.departmentId,
    createdById: assignment.createdById,
    ownerIds: assignment.assignees.map((a) => a.userId),
  });
  if (!allowed) {
    return { ok: false, error: "You cannot attach a document to that task." };
  }

  return { ok: true, id: assignmentId };
}

function readDocumentForm(formData: FormData) {
  return documentSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    source: formData.get("source") ?? "external",
    externalUrl: formData.get("externalUrl") ?? "",
    body: formData.get("body") ?? "",
    assignmentId: formData.get("assignmentId") ?? "",
    status: formData.get("status") ?? "DRAFT",
    tags: formData.get("tags") ?? "",
  });
}

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = readDocumentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.source === "external" && !d.externalUrl) {
    return { error: "Paste the document link, or write the document in the portal instead." };
  }
  if (d.source === "portal" && !d.body?.trim()) {
    return { error: "Write something before saving the document." };
  }

  if (!(await assertDepartmentExists(d.departmentId))) {
    return { error: "That department no longer exists." };
  }

  assertCan(viewer, "create", {
    kind: "document",
    departmentId: d.departmentId,
    ownerId: viewer.id,
  });

  // Only a head or admin may file something straight in as approved.
  if (d.status === "APPROVED" || d.status === "PUBLISHED") {
    assertCan(viewer, "approve", {
      kind: "document",
      departmentId: d.departmentId,
      ownerId: viewer.id,
    });
  }

  const link = await resolveAssignmentLink(viewer, d.assignmentId || undefined);
  if (!link.ok) return { error: link.error };

  const approved = d.status === "APPROVED" || d.status === "PUBLISHED";

  const created = await db.document.create({
    data: {
      title: d.title,
      description: d.description || null,
      departmentId: d.departmentId,
      ownerId: viewer.id,
      source: d.source,
      externalUrl: d.source === "external" ? (d.externalUrl as string) : null,
      body: d.source === "portal" ? (d.body as string) : null,
      assignmentId: link.id,
      status: d.status,
      tags: parseTags(d.tags),
      approvedById: approved ? viewer.id : null,
      approvedAt: approved ? new Date() : null,
    },
  });

  await audit(viewer.id, "document.created", { type: "document", id: created.id, detail: d.title });
  revalidatePath("/documents");
  if (link.id) revalidatePath(`/assignments/${link.id}`);

  redirect(`/documents/${created.id}`);
}

export async function updateDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const id = String(formData.get("id") ?? "");
  const existing = await db.document.findUnique({
    where: { id },
    select: {
      id: true,
      departmentId: true,
      ownerId: true,
      deletedAt: true,
      status: true,
      source: true,
      version: true,
      title: true,
      description: true,
      externalUrl: true,
      body: true,
    },
  });
  if (!existing || existing.deletedAt) return { error: "That document no longer exists." };

  const parsed = readDocumentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Two checks, not one: the right to edit the document where it is now, and
  // the right to create in the department it is being moved to. Without the
  // second, "update" on your own document is a way to file work into any
  // department in the portal.
  assertCan(viewer, "update", {
    kind: "document",
    departmentId: existing.departmentId,
    ownerId: existing.ownerId,
  });
  if (d.departmentId !== existing.departmentId) {
    if (!(await assertDepartmentExists(d.departmentId))) {
      return { error: "That department no longer exists." };
    }
    assertCan(viewer, "create", {
      kind: "document",
      departmentId: d.departmentId,
      ownerId: viewer.id,
    });
  }

  const approved = d.status === "APPROVED" || d.status === "PUBLISHED";
  if (approved && existing.status !== d.status) {
    assertCan(viewer, "approve", {
      kind: "document",
      departmentId: existing.departmentId,
      ownerId: existing.ownerId,
    });
  }

  if (d.source === "external" && !d.externalUrl) {
    return { error: "Paste the document link, or switch it to a portal document." };
  }
  if (d.source === "portal" && !d.body?.trim()) {
    return { error: "Write something before saving the document." };
  }

  const link = await resolveAssignmentLink(viewer, d.assignmentId || undefined);
  if (!link.ok) return { error: link.error };

  // What it said before this save, kept before the save happens.
  const version = await snapshotDocument(existing, viewer.id, "edit");

  await db.document.update({
    where: { id },
    data: {
      title: d.title,
      description: d.description || null,
      departmentId: d.departmentId,
      source: d.source,
      externalUrl: d.source === "external" ? (d.externalUrl as string) : null,
      body: d.source === "portal" ? (d.body as string) : null,
      assignmentId: link.id,
      status: d.status,
      tags: parseTags(d.tags),
      version,
      approvedById: approved ? viewer.id : null,
      approvedAt: approved ? new Date() : null,
    },
  });

  await audit(viewer.id, "document.updated", { type: "document", id });
  revalidatePath(`/documents/${id}/history`);
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
  if (link.id) revalidatePath(`/assignments/${link.id}`);
  return { ok: "Saved." };
}

export async function setDocumentStatus(id: string, status: DocStatus): Promise<void> {
  const viewer = await requireViewer();
  if (!DOC_STATUSES.includes(status)) return;

  const doc = await db.document.findUnique({
    where: { id },
    select: { departmentId: true, ownerId: true },
  });
  if (!doc) return;

  const resource = { kind: "document" as const, ...doc };
  assertCan(viewer, "update", resource);
  if (status === "APPROVED" || status === "PUBLISHED") {
    assertCan(viewer, "approve", resource);
  }

  await db.document.update({
    where: { id },
    data: {
      status,
      approvedById: status === "APPROVED" || status === "PUBLISHED" ? viewer.id : null,
      approvedAt: status === "APPROVED" || status === "PUBLISHED" ? new Date() : null,
    },
  });

  await audit(viewer.id, `document.status.${status.toLowerCase()}`, { type: "document", id });
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  const viewer = await requireViewer();
  const doc = await db.document.findUnique({
    where: { id },
    select: { departmentId: true, ownerId: true },
  });
  if (!doc) return;

  assertCan(viewer, "delete", { kind: "document", ...doc });

  // Soft delete: the row keeps its text and its whole history, and Admin →
  // Recycle bin puts it back exactly as it was. No snapshot is needed here —
  // deleting changes nothing about what the document says.
  await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "document.deleted", { type: "document", id });
  revalidatePath("/documents");
  redirect("/documents");
}

/**
 * Put an earlier version back.
 *
 * The current state is snapshotted first, so a restore can itself be undone —
 * without that, "restore" is just another way to lose the newest work.
 */
export async function restoreDocumentRevision(revisionId: string): Promise<void> {
  const viewer = await requireViewer();

  const revision = await db.documentRevision.findUnique({ where: { id: revisionId } });
  if (!revision) return;

  const document = await db.document.findUnique({
    where: { id: revision.documentId },
    select: {
      id: true,
      departmentId: true,
      ownerId: true,
      deletedAt: true,
      version: true,
      title: true,
      description: true,
      source: true,
      externalUrl: true,
      body: true,
      status: true,
    },
  });
  if (!document || document.deletedAt) return;

  assertCan(viewer, "update", {
    kind: "document",
    departmentId: document.departmentId,
    ownerId: document.ownerId,
  });

  // Restoring an approved version does not re-approve it: the status comes
  // back as a draft unless the person restoring could have approved it anyway.
  const mayApprove = can(viewer, "approve", {
    kind: "document",
    departmentId: document.departmentId,
    ownerId: document.ownerId,
  });
  const approved = revision.status === "APPROVED" || revision.status === "PUBLISHED";
  const status = approved && !mayApprove ? "DRAFT" : revision.status;

  const version = await snapshotDocument(document, viewer.id, "restore");

  await db.document.update({
    where: { id: document.id },
    data: {
      title: revision.title,
      description: revision.description,
      source: revision.source,
      externalUrl: revision.externalUrl,
      body: revision.body,
      status,
      version,
      approvedById: status === "APPROVED" || status === "PUBLISHED" ? viewer.id : null,
      approvedAt: status === "APPROVED" || status === "PUBLISHED" ? new Date() : null,
    },
  });

  await audit(viewer.id, "document.restored_version", {
    type: "document",
    id: document.id,
    detail: `v${revision.version}`,
  });

  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);
  revalidatePath(`/documents/${document.id}/history`);
  redirect(`/documents/${document.id}`);
}

// ---------------------------------------------------------------------------
// Files & assets — links, and files stored in the database (revising D2-1).
//
// The original decision was link-only: Render wipes its disk on every deploy,
// so an uploaded file could not survive one. That reasoning was right about the
// disk and wrong about the database — TiDB is the one part of this deployment
// that outlives a deploy, and a file stored in it is still there after the next
// twenty. So an asset is now either a Drive link or bytes in `file_chunks`.
//
// Linking stays the recommended route for anything large or actively edited in
// Canva. Uploading is for the things that must not depend on a student's
// personal Drive still existing in March: the final logo, the signed forms, the
// print-ready poster.
//
// The upload itself is a route handler, not an action here — Server Actions cap
// their request body. See src/app/(app)/files/upload/route.ts.
// ---------------------------------------------------------------------------

const fileSchema = z.object({
  name: z.string().trim().min(2, "Name the asset.").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  externalUrl: urlSchema,
  departmentId: z.string().min(1, "Pick a department."),
  kind: z.enum(FILE_KINDS).optional(),
  tags: z.string().trim().max(300).optional().or(z.literal("")),
  isBrandKit: z.coerce.boolean().optional(),
});

export async function createFile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = fileSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    externalUrl: formData.get("externalUrl") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    kind: formData.get("kind") || undefined,
    tags: formData.get("tags") ?? "",
    isBrandKit: formData.get("isBrandKit") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (!(await assertDepartmentExists(d.departmentId))) {
    return { error: "That department no longer exists." };
  }

  assertCan(viewer, "create", { kind: "file", departmentId: d.departmentId, ownerId: viewer.id });

  const created = await db.fileAsset.create({
    data: {
      name: d.name,
      description: d.description || null,
      externalUrl: d.externalUrl,
      storage: "link",
      departmentId: d.departmentId,
      uploadedById: viewer.id,
      kind: d.kind ?? "link",
      tags: parseTags(d.tags),
      isBrandKit: Boolean(d.isBrandKit),
    },
  });

  await audit(viewer.id, "file.created", { type: "file", id: created.id, detail: d.name });
  revalidatePath("/files");
  revalidatePath("/brand");
  redirect("/files");
}

export async function deleteFile(id: string): Promise<void> {
  const viewer = await requireViewer();
  const f = await db.fileAsset.findUnique({
    where: { id },
    select: { departmentId: true, uploadedById: true },
  });
  if (!f) return;

  assertCan(viewer, "delete", {
    kind: "file",
    departmentId: f.departmentId,
    ownerId: f.uploadedById,
  });

  // Soft delete, and the chunks stay exactly where they are: a member deleting
  // the wrong asset is a restore from the recycle bin, not a re-scan of a
  // poster nobody has the original of any more.
  await db.fileAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "file.deleted", { type: "file", id });
  revalidatePath("/files");
  revalidatePath("/brand");
}

/**
 * The only path that actually destroys bytes, and it is T4's alone.
 *
 * Deleting an asset hides it; this is what frees the storage, and it is
 * deliberately harder to reach than the delete button — the recycle bin, an
 * owner account, and a confirmation.
 */
export async function purgeFile(id: string): Promise<void> {
  const viewer = await requireViewer();
  assertCan(viewer, "purge", { kind: "system" });

  const f = await db.fileAsset.findUnique({
    where: { id },
    select: { name: true, deletedAt: true, sizeBytes: true },
  });
  if (!f) return;
  // Only from the recycle bin: nothing is purged straight out of the index.
  if (!f.deletedAt) return;

  await db.fileChunk.deleteMany({ where: { fileId: id } });
  await db.fileAsset.delete({ where: { id } });

  await audit(viewer.id, "file.purged", { type: "file", id, detail: f.name });
  revalidatePath("/files");
  revalidatePath("/brand");
  revalidatePath("/admin/trash");
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z.string().trim().min(2, "Give the announcement a title.").max(200),
  body: z.string().trim().min(2, "Write the announcement.").max(5000),
  scope: z.enum(["all", "department"]),
  departmentId: z.string().optional().or(z.literal("")),
  pinned: z.coerce.boolean().optional(),
});

export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = announcementSchema.safeParse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    scope: formData.get("scope") ?? "department",
    departmentId: formData.get("departmentId") ?? "",
    pinned: formData.get("pinned") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const departmentId = d.scope === "all" ? null : d.departmentId || null;
  if (d.scope === "department" && !departmentId) {
    return { error: "Pick which department this is for." };
  }
  if (departmentId && !(await assertDepartmentExists(departmentId))) {
    return { error: "That department no longer exists." };
  }

  // All-staff announcements are an Admin action; a head announces to their own
  // department only. `can()` encodes both — this call is the whole check.
  assertCan(viewer, "create", { kind: "announcement", departmentId, authorId: viewer.id });

  const created = await db.announcement.create({
    data: {
      title: d.title,
      body: d.body,
      scope: d.scope,
      departmentId,
      authorId: viewer.id,
      pinned: Boolean(d.pinned),
    },
  });

  await audit(viewer.id, "announcement.created", { type: "announcement", id: created.id });
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  redirect("/announcements");
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const viewer = await requireViewer();

  // "Read" is written against an id from the page, so the id gets checked
  // rather than trusted: an announcement scoped to another department is not
  // something this account may mark, or even confirm the existence of.
  const announcement = await db.announcement.findUnique({
    where: { id },
    select: { departmentId: true, deletedAt: true, authorId: true },
  });
  if (!announcement || announcement.deletedAt) return;
  if (
    !can(viewer, "read", {
      kind: "announcement",
      departmentId: announcement.departmentId,
      authorId: announcement.authorId,
    })
  ) {
    return;
  }

  await db.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: viewer.id } },
    create: { announcementId: id, userId: viewer.id },
    update: {},
  });
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const viewer = await requireViewer();
  const n = await db.announcement.findUnique({
    where: { id },
    select: { departmentId: true, authorId: true },
  });
  if (!n) return;

  assertCan(viewer, "delete", { kind: "announcement", ...n });
  await db.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "announcement.deleted", { type: "announcement", id });
  revalidatePath("/announcements");
}

// ---------------------------------------------------------------------------
// Forms — external links plus forms built and answered inside the portal.
// The question schema and the responses live in src/lib/actions/forms.ts.
// ---------------------------------------------------------------------------

const formSchema = z.object({
  title: z.string().trim().min(2, "Name the form.").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  type: z.enum(["internal", "external"]),
  url: optionalUrlSchema,
  responseUrl: optionalUrlSchema,
  departmentId: z.string().optional().or(z.literal("")),
  deadline: z.string().max(20).optional().or(z.literal("")),
});

export async function createForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const throttled = writeLimit(viewer);
  if (throttled) return throttled;

  const parsed = formSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    type: formData.get("type") ?? "external",
    url: formData.get("url") ?? "",
    responseUrl: formData.get("responseUrl") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    deadline: formData.get("deadline") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const departmentId = d.departmentId || null;
  if (departmentId && !(await assertDepartmentExists(departmentId))) {
    return { error: "That department no longer exists." };
  }

  assertCan(viewer, "create", { kind: "form", departmentId, ownerId: viewer.id });

  if (d.type === "external" && !d.url) {
    return { error: "An external form needs its link." };
  }

  const created = await db.form.create({
    data: {
      title: d.title,
      description: d.description || null,
      type: d.type,
      url: d.url || null,
      responseUrl: d.responseUrl || null,
      departmentId,
      ownerId: viewer.id,
      deadline: d.deadline ? new Date(`${d.deadline}T23:59:59+07:00`) : null,
    },
  });

  await audit(viewer.id, "form.created", { type: "form", id: created.id, detail: d.title });
  revalidatePath("/forms");
  redirect("/forms");
}

export async function deleteForm(id: string): Promise<void> {
  const viewer = await requireViewer();
  const f = await db.form.findUnique({
    where: { id },
    select: { departmentId: true, ownerId: true },
  });
  if (!f) return;

  assertCan(viewer, "delete", { kind: "form", ...f });
  await db.form.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "form.deleted", { type: "form", id });
  revalidatePath("/forms");
}
