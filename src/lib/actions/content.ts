"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, requireViewer } from "@/lib/authorize";
import type { FormState } from "@/lib/actions/auth";
import type { DocStatus } from "@prisma/client";

const DOC_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED"] as const satisfies readonly DocStatus[];

/** Tags arrive as a comma-separated string and live in a JSON column. */
function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Documents — metadata in TiDB, the body stays in Google Docs (decision D3-A).
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  title: z.string().trim().min(2, "Give the document a title.").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  departmentId: z.string().min(1, "Pick a department."),
  externalUrl: z.string().trim().url("Paste the full document link."),
  status: z.enum(DOC_STATUSES),
  tags: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function createDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();

  const parsed = documentSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    externalUrl: formData.get("externalUrl") ?? "",
    status: formData.get("status") ?? "DRAFT",
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

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

  const created = await db.document.create({
    data: {
      title: d.title,
      description: d.description || null,
      departmentId: d.departmentId,
      ownerId: viewer.id,
      externalUrl: d.externalUrl,
      status: d.status,
      tags: parseTags(d.tags),
      approvedById: d.status === "APPROVED" || d.status === "PUBLISHED" ? viewer.id : null,
      approvedAt: d.status === "APPROVED" || d.status === "PUBLISHED" ? new Date() : null,
    },
  });

  await audit(viewer.id, "document.created", { type: "document", id: created.id, detail: d.title });
  revalidatePath("/documents");
  return { ok: "Document added." };
}

export async function setDocumentStatus(id: string, status: DocStatus): Promise<void> {
  const viewer = await requireViewer();
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
}

export async function deleteDocument(id: string): Promise<void> {
  const viewer = await requireViewer();
  const doc = await db.document.findUnique({
    where: { id },
    select: { departmentId: true, ownerId: true },
  });
  if (!doc) return;

  assertCan(viewer, "delete", { kind: "document", ...doc });
  await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "document.deleted", { type: "document", id });
  revalidatePath("/documents");
}

// ---------------------------------------------------------------------------
// Files & assets — link-only (decision D2-1). The portal is the index; Drive
// and Canva hold the bytes. Render's filesystem is ephemeral and TiDB is not
// a blob store, so this is the only shape that survives a redeploy.
// ---------------------------------------------------------------------------

const fileSchema = z.object({
  name: z.string().trim().min(2, "Name the asset.").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  externalUrl: z.string().trim().url("Paste the Drive or Canva link."),
  departmentId: z.string().min(1, "Pick a department."),
  kind: z.string().trim().max(30).optional().or(z.literal("")),
  tags: z.string().trim().max(300).optional().or(z.literal("")),
  isBrandKit: z.coerce.boolean().optional(),
});

export async function createFile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();

  const parsed = fileSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    externalUrl: formData.get("externalUrl") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    kind: formData.get("kind") ?? "",
    tags: formData.get("tags") ?? "",
    isBrandKit: formData.get("isBrandKit") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  assertCan(viewer, "create", { kind: "file", departmentId: d.departmentId, ownerId: viewer.id });

  const created = await db.fileAsset.create({
    data: {
      name: d.name,
      description: d.description || null,
      externalUrl: d.externalUrl,
      departmentId: d.departmentId,
      uploadedById: viewer.id,
      kind: d.kind || "link",
      tags: parseTags(d.tags),
      isBrandKit: Boolean(d.isBrandKit),
    },
  });

  await audit(viewer.id, "file.created", { type: "file", id: created.id, detail: d.name });
  revalidatePath("/files");
  revalidatePath("/brand");
  return { ok: "Asset linked." };
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

  await db.fileAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(viewer.id, "file.deleted", { type: "file", id });
  revalidatePath("/files");
  revalidatePath("/brand");
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
  return { ok: "Posted." };
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const viewer = await requireViewer();
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
// Forms — external links plus admin-defined internal forms (decision D4).
// ---------------------------------------------------------------------------

const formSchema = z.object({
  title: z.string().trim().min(2, "Name the form.").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  type: z.enum(["internal", "external"]),
  url: z.string().trim().url("Paste the form link.").optional().or(z.literal("")),
  responseUrl: z.string().trim().url("That is not a valid link.").optional().or(z.literal("")),
  departmentId: z.string().optional().or(z.literal("")),
  deadline: z.string().optional().or(z.literal("")),
});

export async function createForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();

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
  return { ok: "Form added." };
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
