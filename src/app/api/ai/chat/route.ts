import { NextResponse } from "next/server";
import { getViewer } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getGeminiConfig } from "@/lib/ai/config";
import { runTurn, type Content } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

const MAX_CONTENTS = 80;

function validContents(value: unknown): value is Content[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_CONTENTS &&
    value.every(
      (c) =>
        c && (c.role === "user" || c.role === "model") && Array.isArray(c.parts) && c.parts.length <= 20,
    )
  );
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const config = await getGeminiConfig();
  if (!config.apiKey) {
    return NextResponse.json(
      { error: "The assistant is not set up yet. An admin can add a Gemini API key in Settings." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || !validContents(body.contents) || JSON.stringify(body.contents).length > 400_000) {
    return NextResponse.json({ error: "That request was not understood." }, { status: 400 });
  }

  try {
    const result = await runTurn({
      apiKey: config.apiKey,
      model: config.model,
      viewer,
      contents: body.contents,
      confirm: body.confirm ? { approved: Boolean(body.confirm.approved) } : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant failed.";
    await audit(viewer.id, "ai.request_failed", { type: "ai", detail: `AI assistant request failed: ${message}`.slice(0, 500) });
    return NextResponse.json({ error: message, contents: body.contents }, { status: 502 });
  }
}
