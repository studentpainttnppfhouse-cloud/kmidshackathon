import "server-only";
import type { Viewer } from "@/lib/authorize";
import { geminiToolDeclarations, runTool, TOOL_BY_NAME } from "@/lib/ai/tools";

export type Part =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export type Content = { role: "user" | "model"; parts: Part[] };

export type PendingCall = { name: string; args: Record<string, unknown> };
export type TurnResult = { contents: Content[]; pending?: PendingCall[]; error?: string };

const MAX_STEPS = 6;

function systemPrompt(viewer: Viewer) {
  return [
    "You are the assistant inside the KMIDS Hackathon Studio staff portal.",
    `You act for ${viewer.name} (tier ${viewer.tier}${viewer.department ? `, department ${viewer.department.name}` : ""}, user id ${viewer.id}, department id ${viewer.departmentId ?? "none"}).`,
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    "Use the tools to read and change portal data. You only have this person's permissions; if a tool says not allowed, say so plainly.",
    "Look up ids with list_departments/list_people/list_assignments instead of guessing. Write tools are confirmed by the person before they run.",
    "Be brief. When you mention a record, include its portal link (href) if you have one.",
  ].join(" ");
}

async function callGemini(apiKey: string, model: string, viewer: Viewer, contents: Content[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(viewer) }] },
      contents,
      tools: geminiToolDeclarations(),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `Gemini returned ${res.status}.`;
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {}
    throw new Error(message);
  }
  const json = await res.json();
  const content = json?.candidates?.[0]?.content as Content | undefined;
  if (!content?.parts?.length) return { role: "model", parts: [{ text: "(No answer.)" }] } as Content;
  return { role: "model", parts: content.parts } as Content;
}

function calls(content: Content) {
  return content.parts.flatMap((p) => ("functionCall" in p ? [p.functionCall] : []));
}

async function respond(viewer: Viewer, content: Content, approved: boolean): Promise<Content> {
  const parts: Part[] = [];
  for (const call of calls(content)) {
    const tool = TOOL_BY_NAME.get(call.name);
    const result =
      tool?.write && !approved
        ? { ok: false, message: "The user declined this action." }
        : await runTool(viewer, call.name, call.args ?? {});
    parts.push({ functionResponse: { name: call.name, response: { result } } });
  }
  return { role: "user", parts };
}

/**
 * One conversational turn. Reads run straight away; a model turn that wants to
 * write stops here and comes back as `pending` for the person to confirm.
 */
export async function runTurn(opts: {
  apiKey: string;
  model: string;
  viewer: Viewer;
  contents: Content[];
  confirm?: { approved: boolean };
}): Promise<TurnResult> {
  const contents = [...opts.contents];

  if (opts.confirm) {
    const last = contents.at(-1);
    if (!last || last.role !== "model" || calls(last).length === 0) {
      return { contents, error: "Nothing is waiting for confirmation." };
    }
    contents.push(await respond(opts.viewer, last, opts.confirm.approved));
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callGemini(opts.apiKey, opts.model, opts.viewer, contents);
    contents.push(reply);
    const wanted = calls(reply);
    if (wanted.length === 0) return { contents };
    if (wanted.some((c) => TOOL_BY_NAME.get(c.name)?.write)) {
      return { contents, pending: wanted.map((c) => ({ name: c.name, args: c.args ?? {} })) };
    }
    contents.push(await respond(opts.viewer, reply, true));
  }
  return { contents, error: "Stopped after too many steps." };
}
