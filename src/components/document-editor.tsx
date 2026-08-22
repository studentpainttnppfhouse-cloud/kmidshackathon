"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { createDocument, updateDocument } from "@/lib/actions/content";
import { Feedback, SubmitButton } from "@/components/form-bits";
import { renderMarkdown, wordCount } from "@/lib/markdown";
import { DOC_STATUS_LABEL } from "@/lib/constants";
import type { FormState } from "@/lib/actions/auth";
import type { DocStatus } from "@prisma/client";

const initial: FormState = {};

export type EditorDoc = {
  id: string;
  title: string;
  description: string | null;
  departmentId: string;
  source: string;
  externalUrl: string | null;
  body: string | null;
  assignmentId: string | null;
  status: DocStatus;
  tags: string[];
};

/**
 * Write a document in the portal, or point at one in Drive.
 *
 * The editor is a textarea with a live preview rather than a rich-text surface.
 * That is a deliberate call and not a shortcut: a contenteditable editor stores
 * HTML, which means the portal would be storing markup written by a user and
 * rendering it back — the exact shape of a stored-XSS bug, and one that a
 * sanitiser has to keep winning forever. Markdown stores text. The preview runs
 * the same renderer the saved document will, so what you see is what the
 * document is, and the export files are generated from the same source.
 */
export function DocumentEditor({
  departments,
  assignments,
  canApprove,
  document,
}: {
  departments: { id: string; name: string }[];
  assignments: { id: string; title: string }[];
  canApprove: boolean;
  document?: EditorDoc;
}) {
  const [state, action] = useActionState(document ? updateDocument : createDocument, initial);

  const [source, setSource] = useState<"external" | "portal">(
    (document?.source as "external" | "portal") ?? "portal",
  );
  const [body, setBody] = useState(document?.body ?? "");
  const [preview, setPreview] = useState(false);

  const html = useMemo(() => (preview ? renderMarkdown(body) : ""), [preview, body]);
  const words = useMemo(() => wordCount(body), [body]);

  return (
    <form action={action} className="space-y-5">
      {document ? <input type="hidden" name="id" value={document.id} /> : null}
      <input type="hidden" name="source" value={source} />

      <div className="hs-card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="hs-label" htmlFor="doc-title">
              Title
            </label>
            <input
              id="doc-title"
              name="title"
              required
              maxLength={200}
              defaultValue={document?.title ?? ""}
              className="hs-input"
              placeholder="Partnership deck v4"
            />
          </div>
          <div>
            <label className="hs-label" htmlFor="doc-dept">
              Department
            </label>
            <select
              id="doc-dept"
              name="departmentId"
              required
              defaultValue={document?.departmentId ?? departments[0]?.id ?? ""}
              className="hs-input"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="hs-label" htmlFor="doc-desc">
            Summary
          </label>
          <textarea
            id="doc-desc"
            name="description"
            rows={2}
            maxLength={2000}
            defaultValue={document?.description ?? ""}
            className="hs-input resize-y"
            placeholder="One line, so people know what this is without opening it."
          />
        </div>
      </div>

      <fieldset className="hs-card p-5">
        <legend className="hs-label px-1">Where does this document live?</legend>

        <div className="grid gap-2 sm:grid-cols-2">
          <SourceCard
            active={source === "portal"}
            onSelect={() => setSource("portal")}
            title="Write it here"
            blurb="Stored in the portal, exported to .docx, .pdf or Markdown whenever you need a file."
          />
          <SourceCard
            active={source === "external"}
            onSelect={() => setSource("external")}
            title="Link a Google Doc"
            blurb="The portal indexes it; the content stays in Drive with its comments and history."
          />
        </div>

        {source === "external" ? (
          <div className="mt-4">
            <label className="hs-label" htmlFor="doc-url">
              Document link
            </label>
            <input
              id="doc-url"
              name="externalUrl"
              type="url"
              defaultValue={document?.externalUrl ?? ""}
              className="hs-input"
              placeholder="https://docs.google.com/document/d/…"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="hs-label mb-0" htmlFor="doc-body">
                Document
              </label>
              <div className="flex items-center gap-2 text-xs text-faint">
                <span>{words} words</span>
                <button
                  type="button"
                  onClick={() => setPreview((value) => !value)}
                  className="hs-btn hs-btn-ghost px-3 py-1 text-xs"
                  aria-pressed={preview}
                >
                  {preview ? "Keep writing" : "Preview"}
                </button>
              </div>
            </div>

            {preview ? (
              <div
                className="hs-prose min-h-[18rem] rounded-[10px] border border-line bg-surface p-5"
                // The only HTML injected anywhere in the portal, and it is the
                // output of src/lib/markdown.ts — which escapes the author's
                // text before it interprets a single Markdown character, so
                // every tag in this string is one the renderer wrote itself.
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <textarea
                id="doc-body"
                name="body"
                rows={18}
                maxLength={400_000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="hs-input resize-y font-mono text-[0.875rem] leading-relaxed"
                placeholder={"# Heading\n\nWrite normally. **Bold**, *italic*, `code`.\n\n- bullet points\n1. numbered lists\n\n> a quote"}
              />
            )}

            {!preview ? (
              <p className="text-xs text-faint">
                Markdown: <code># heading</code>, <code>**bold**</code>, <code>*italic*</code>,{" "}
                <code>- bullet</code>, <code>1. numbered</code>, <code>&gt; quote</code>,{" "}
                <code>[label](https://link)</code>.
              </p>
            ) : null}
          </div>
        )}
      </fieldset>

      <div className="hs-card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="hs-label" htmlFor="doc-status">
            Status
          </label>
          <select
            id="doc-status"
            name="status"
            defaultValue={document?.status ?? "DRAFT"}
            className="hs-input"
          >
            {(Object.keys(DOC_STATUS_LABEL) as DocStatus[]).map((status) => (
              <option
                key={status}
                value={status}
                disabled={!canApprove && (status === "APPROVED" || status === "PUBLISHED")}
              >
                {DOC_STATUS_LABEL[status]}
                {!canApprove && (status === "APPROVED" || status === "PUBLISHED")
                  ? " (head only)"
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="hs-label" htmlFor="doc-tags">
            Tags
          </label>
          <input
            id="doc-tags"
            name="tags"
            maxLength={300}
            defaultValue={document?.tags.join(", ") ?? ""}
            className="hs-input"
            placeholder="sponsor, deck, 2027"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="hs-label" htmlFor="doc-assignment">
            Attach to a task
          </label>
          <select
            id="doc-assignment"
            name="assignmentId"
            defaultValue={document?.assignmentId ?? ""}
            className="hs-input"
          >
            <option value="">Not attached to anything</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-faint">
            Attaching it makes this document the submission for that task — it shows up on the
            task page and counts as the work being handed in. Only tasks you can edit are listed.
          </p>
        </div>
      </div>

      <Feedback state={state} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
          {document ? "Save changes" : "Create document"}
        </SubmitButton>
        <Link
          href={document ? `/documents/${document.id}` : "/documents"}
          className="hs-btn hs-btn-ghost"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function SourceCard({
  active,
  onSelect,
  title,
  blurb,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`rounded-[10px] border p-3 text-left transition ${
        active
          ? "border-pink-400 bg-pink-50/60 text-ink"
          : "border-line text-muted hover:border-pink-300"
      }`}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed">{blurb}</span>
    </button>
  );
}
