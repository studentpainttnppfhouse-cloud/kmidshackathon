"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Part =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type Content = { role: "user" | "model"; parts: Part[] };
type Pending = { name: string; args: Record<string, unknown> };

const LABEL: Record<string, string> = {
  create_assignment: "Create a task",
  update_assignment: "Update a task",
  create_announcement: "Post an announcement",
  create_document: "Create a document",
};

/** Turn portal paths in the answer into links; everything else is plain text. */
function Rich({ text }: { text: string }) {
  const pieces = text.split(/(\/(?:assignments|documents|forms|announcements|people|files|departments)\/[A-Za-z0-9_-]+)/g);
  return (
    <span className="whitespace-pre-wrap">
      {pieces.map((p, i) =>
        i % 2 === 1 ? (
          <Link key={i} href={p} className="underline">{p}</Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function AiChat() {
  const [contents, setContents] = useState<Content[]>([]);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [contents, pending]);

  async function send(next: Content[], confirm?: { approved: boolean }) {
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: next, confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.contents)) setContents(data.contents);
      if (data.pending) setPending(data.pending);
      if (!res.ok || data.error) setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Could not reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || pending) return;
    setInput("");
    const next: Content[] = [...contents, { role: "user", parts: [{ text }] }];
    setContents(next);
    void send(next);
  }

  const bubbles = contents.flatMap((c, i) =>
    c.parts.flatMap((p, j) => {
      if ("text" in p && p.text.trim()) {
        return [
          <div key={`${i}-${j}`} className={c.role === "user" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${c.role === "user" ? "bg-info-soft" : "hs-card"}`}>
              <Rich text={p.text} />
            </div>
          </div>,
        ];
      }
      if ("functionCall" in p && c.role === "model") {
        return [
          <p key={`${i}-${j}`} className="text-xs text-muted">Used {p.functionCall.name.replaceAll("_", " ")}</p>,
        ];
      }
      return [];
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[40vh] space-y-3">
        {bubbles.length === 0 ? (
          <p className="text-sm text-muted">Try: “What tasks are due this week?” or “Post an update to my department.”</p>
        ) : bubbles}
        {busy ? <p className="text-sm text-muted">Thinking…</p> : null}
        {pending ? (
          <div className="rounded-2xl border-2 border-warn-edge bg-warn-soft px-4 py-3 text-sm text-warn-strong">
            <p className="font-semibold">Confirm before the assistant does this:</p>
            <ul className="mt-2 space-y-2">
              {pending.map((p, i) => (
                <li key={i}>
                  <p>{LABEL[p.name] ?? p.name}</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(p.args, null, 2)}</pre>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className="hs-btn hs-btn-primary" onClick={() => send(contents, { approved: true })}>
                Confirm
              </button>
              <button type="button" className="hs-btn hs-btn-secondary" onClick={() => send(contents, { approved: false })}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger-strong" role="alert">{error}</p> : null}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="ai-input" className="sr-only">Message</label>
        <input
          id="ai-input"
          className="hs-input flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant…"
          disabled={busy || Boolean(pending)}
          maxLength={4000}
        />
        <button type="submit" className="hs-btn hs-btn-primary" disabled={busy || Boolean(pending) || !input.trim()}>
          Send
        </button>
        {contents.length > 0 ? (
          <button type="button" className="hs-btn hs-btn-secondary" disabled={busy} onClick={() => { setContents([]); setPending(null); setError(null); }}>
            New chat
          </button>
        ) : null}
      </form>
    </div>
  );
}
