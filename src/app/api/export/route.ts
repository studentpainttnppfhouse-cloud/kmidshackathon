import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { can } from "@/lib/authorize";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Export everything as one JSON file.
 *
 * This exists from day one on purpose: if the project stalls, if Render goes
 * away, or if the 2028 team inherits nothing else, the data still comes out.
 * Password hashes and session tokens are excluded — an export is a record of
 * the work, not a copy of the credentials.
 */
export async function GET() {
  const viewer = await getViewer();

  if (!can(viewer, "export", { kind: "system" })) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const [
    users,
    departments,
    assignments,
    documents,
    files,
    forms,
    formResponses,
    announcements,
    eventItems,
    checkins,
    incidents,
    attachments,
  ] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        grade: true,
        roleTitle: true,
        tier: true,
        departmentId: true,
        shirtSize: true,
        isReserve: true,
        isMentor: true,
        isAlumni: true,
        createdAt: true,
      },
    }),
    db.department.findMany(),
    db.assignment.findMany({ include: { assignees: { select: { userId: true } } } }),
    db.document.findMany(),
    db.fileAsset.findMany(),
    db.form.findMany(),
    db.formResponse.findMany(),
    db.announcement.findMany(),
    db.eventItem.findMany(),
    db.checkin.findMany(),
    db.incident.findMany(),
    // Metadata only. The bytes live in `attachment_chunks` and would turn a
    // readable JSON file into a hundred megabytes of base64 — a database dump
    // is the right tool for those, and the checksum here is what proves a
    // restored file is the one this export described.
    db.attachment.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        parentType: true,
        parentId: true,
        name: true,
        mimeType: true,
        size: true,
        checksum: true,
        storage: true,
        externalUrl: true,
        departmentId: true,
        uploadedById: true,
        createdAt: true,
      },
    }),
  ]);

  await audit(viewer!.id, "data.exported");

  const payload = {
    manifest: {
      portal: "Hackathon Studio — KMIDS Hackathon 2027",
      exportedAt: new Date().toISOString(),
      exportedBy: viewer!.email,
      note: "Password hashes, session tokens, invite codes, join-link codes and reset codes are deliberately excluded. Attachments are listed with their name, size and SHA-256 but not their bytes — take a database dump for those. External file links point at Google Drive and Canva; export those separately.",
      counts: {
        users: users.length,
        departments: departments.length,
        assignments: assignments.length,
        documents: documents.length,
        files: files.length,
        attachments: attachments.length,
        attachmentBytes: attachments.reduce((sum, file) => sum + file.size, 0),
        forms: forms.length,
        announcements: announcements.length,
      },
    },
    users,
    departments,
    assignments,
    documents,
    files,
    forms,
    formResponses,
    announcements,
    eventItems,
    checkins,
    incidents,
    attachments,
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="hackathon-studio-export-${stamp}.json"`,
    },
  });
}
