import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/session";
import { can } from "@/lib/authorize";
import { audit } from "@/lib/audit";
import { answerText, csvCell, isUpload, parseDefinition, type ResponsePayload } from "@/lib/forms-schema";
import { appOrigin } from "@/lib/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The responses table as a CSV, for whoever runs the form. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const form = await db.form.findUnique({
    where: { id },
    select: { id: true, title: true, type: true, schema: true, deletedAt: true, ownerId: true, departmentId: true },
  });
  if (!form || form.deletedAt || form.type !== "internal") return new NextResponse("Not found", { status: 404 });

  if (!can(viewer, "update", { kind: "form", departmentId: form.departmentId, ownerId: form.ownerId })) {
    await audit(viewer.id, "form.responses.export_denied", {
      type: "form",
      id: form.id,
      detail: `Denied exporting responses to "${form.title}": not the form's owner or an admin`,
    });
    return new NextResponse("Not found", { status: 404 });
  }

  const definition = parseDefinition(form.schema);
  const questions = definition?.questions ?? [];
  const responses = await db.formResponse.findMany({
    where: { formId: form.id },
    include: { user: { select: { name: true, nickname: true } } },
    orderBy: { submittedAt: "desc" },
  });

  const files = await db.attachment.findMany({
    where: { parentType: "form_response", parentId: { in: responses.map((r) => r.id) }, deletedAt: null },
    select: { id: true, name: true },
  });
  const fileById = new Map(files.map((f) => [f.id, f]));
  const origin = await appOrigin();

  const header = ["Submitted", "Email", "Name", ...questions.map((q) => q.label)];
  const rows = responses.map((response) => {
    const payload = response.payload as ResponsePayload;
    return [
      response.submittedAt.toISOString(),
      response.respondentEmail ?? "",
      response.user ? response.user.nickname || response.user.name : "",
      ...questions.map((question) => {
        if (!isUpload(question.type)) return answerText(payload, question);
        const ids = Array.isArray(payload[question.id]) ? (payload[question.id] as string[]) : [];
        return ids
          .map((fid) => fileById.get(fid))
          .filter((f) => f !== undefined)
          .map((f) => `${f.name} (${origin}/api/attachments/${f.id})`)
          .join("; ");
      }),
    ];
  });

  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

  await audit(viewer.id, "form.responses.exported", {
    type: "form",
    id: form.id,
    detail: `Exported ${responses.length} responses to "${form.title}" as CSV`,
  });

  const filename = `${form.title.replace(/[^A-Za-z0-9-_ ]+/g, "").trim().replace(/\s+/g, "-") || "form"}-responses.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
