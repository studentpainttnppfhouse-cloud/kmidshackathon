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
  ]);

  await audit(viewer!.id, "data.exported");

  const payload = {
    manifest: {
      portal: "Hackathon Studio — KMIDS Hackathon 2027",
      exportedAt: new Date().toISOString(),
      exportedBy: viewer!.email,
      note: "Password hashes, session tokens, invite codes and reset codes are deliberately excluded. External file links point at Google Drive and Canva; export those separately. Uploaded files are listed with storage=\"db\" but their bytes are not in this JSON — download each from /files/<id>/raw, or take a database dump, before handing the portal over.",
      counts: {
        users: users.length,
        departments: departments.length,
        assignments: assignments.length,
        documents: documents.length,
        files: files.length,
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
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="hackathon-studio-export-${stamp}.json"`,
    },
  });
}
