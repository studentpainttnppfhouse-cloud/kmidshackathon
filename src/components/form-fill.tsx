"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitFormResponse } from "@/lib/actions/forms";
import { Feedback, SubmitButton } from "@/components/form-bits";
import {
  acceptAttribute,
  checkFile,
  isUpload,
  maxFilesFor,
  optionsFor,
  type FormDefinition,
  type Question,
  type ResponsePayload,
} from "@/lib/forms-schema";
import { formatBytes } from "@/lib/attachments";
import type { FormState } from "@/lib/actions/auth";

const initial: FormState = {};

export type StoredFile = { id: string; name: string; mimeType: string; size: number };

/**
 * Answering a portal form: one clean column, Airtable style, with the cover on
 * top. Browser checks save a round trip; the server re-checks everything with
 * the same schema (`validateResponse`).
 */
export function FormFill({
  formId,
  title,
  description,
  definition,
  existing,
  existingFiles = {},
  maxBytes,
}: {
  formId: string;
  title: string;
  description?: string | null;
  definition: FormDefinition;
  existing: ResponsePayload | null;
  existingFiles?: Record<string, StoredFile[]>;
  maxBytes: number;
}) {
  const [state, action] = useActionState(submitFormResponse, initial);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);

  const done = Boolean(state.ok) && !editing;

  return (
    <div className="hs-card mx-auto max-w-2xl overflow-hidden p-0">
      {definition.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={definition.cover} alt="" className="h-40 w-full object-cover sm:h-56" />
      ) : null}

      <div className="p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 whitespace-pre-line text-sm text-muted">{description}</p>
        ) : null}

        {done ? (
          <div role="status" className="mt-8 space-y-4 py-6 text-center">
            <p className="text-4xl" aria-hidden="true">
              ✓
            </p>
            <p className="text-lg font-semibold text-ink">
              {definition.confirmation || state.ok}
            </p>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setVersion((v) => v + 1);
              }}
              className="hs-btn hs-btn-secondary"
            >
              Edit my answers
            </button>
          </div>
        ) : (
          <form
            key={version}
            action={action}
            onSubmit={() => setEditing(false)}
            className="mt-6 space-y-6"
          >
            <input type="hidden" name="formId" value={formId} />

            {existing ? (
              <p className="hs-feedback hs-feedback-ok" role="status">
                <span aria-hidden="true">✓</span> You have answered this already. Submitting again
                replaces your previous answers.
              </p>
            ) : null}

            {definition.questions.map((question) =>
              isUpload(question.type) ? (
                <UploadField
                  key={question.id}
                  question={question}
                  stored={existingFiles[question.id] ?? []}
                  maxBytes={maxBytes}
                resync={state}
                />
              ) : (
                <QuestionField key={question.id} question={question} value={existing?.[question.id]} />
              ),
            )}

            <Feedback state={state.ok ? {} : state} />

            <SubmitButton className="hs-btn hs-btn-primary w-full sm:w-auto" pendingLabel="Sending…">
              {definition.submitLabel || (existing ? "Update my answers" : "Submit")}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ question, htmlFor }: { question: Question; htmlFor?: string }) {
  const inner = (
    <>
      <span className="text-sm font-semibold text-ink">{question.label}</span>
      {question.required ? (
        <span className="ml-1 text-danger-strong" aria-hidden="true">
          *
        </span>
      ) : null}
      {question.required ? <span className="sr-only"> (required)</span> : null}
    </>
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} className="block">
      {inner}
    </label>
  ) : (
    <span className="block">{inner}</span>
  );
}

/**
 * A drag-and-drop zone that also opens the file picker. The chosen files are
 * written back into a real <input type="file"> so the form posts them with
 * everything else; previews are object URLs, revoked when the file goes.
 */
function UploadField({
  question,
  stored,
  maxBytes,
  resync,
}: {
  question: Question;
  stored: StoredFile[];
  maxBytes: number;
  /** Changes after each submit; React resets file inputs then, so refill it. */
  resync: unknown;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [cleared, setCleared] = useState(false);
  const id = `field-${question.id}`;
  const limit = maxFilesFor(question);
  const images = question.type === "image_upload";

  useEffect(() => {
    const urls = files.map((file) => (file.type.startsWith("image/") ? URL.createObjectURL(file) : ""));
    setPreviews(urls);
    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [files]);

  const sync = (next: File[]) => {
    setFiles(next);
    const input = inputRef.current;
    if (!input) return;
    try {
      const transfer = new DataTransfer();
      next.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    } catch {
      // Very old browsers: the picker's own selection is still posted.
    }
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input || files.length === 0 || input.files?.length) return;
    try {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    } catch {
      // Nothing to do: the person picks the file again.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resync]);

  const accept = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    setError("");
    const next = limit === 1 ? [] : [...files];
    for (const file of Array.from(incoming)) {
      const problem = checkFile(question, file, maxBytes);
      if (problem) {
        setError(problem);
        continue;
      }
      if (next.length >= limit) {
        setError(`At most ${limit} ${limit === 1 ? "file" : "files"} here.`);
        break;
      }
      next.push(file);
    }
    sync(next);
  };

  const showStored = stored.length > 0 && files.length === 0 && !cleared;

  return (
    <div>
      <FieldLabel question={question} htmlFor={id} />
      {question.help ? <p className="mt-1 text-xs text-faint">{question.help}</p> : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-2.5 cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          over ? "border-brand bg-tint" : "border-line hover:border-brand"
        }`}
      >
        <p className="text-sm text-muted">
          <span aria-hidden="true">{images ? "🖼" : "📎"}</span> Drop {images ? "photos" : "files"} here, or{" "}
          <span className="font-semibold text-brand-deep underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-faint">
          {limit === 1 ? "One file" : `Up to ${limit} files`}, {formatBytes(maxBytes)} each
        </p>
        <input
          ref={inputRef}
          id={id}
          name={`q_${question.id}`}
          type="file"
          accept={images ? "image/*" : acceptAttribute(question)}
          multiple={limit > 1}
          // Required only when nothing is stored already; the server decides.
          required={question.required && !showStored && files.length === 0}
          onChange={(event) => accept(event.target.files)}
          onClick={(event) => event.stopPropagation()}
          className="sr-only"
        />
      </div>

      {cleared ? <input type="hidden" name={`q_${question.id}__clear`} value="1" /> : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger-strong">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative overflow-hidden rounded-lg border border-line">
              {previews[index] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[index]} alt={file.name} className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center text-2xl" aria-hidden="true">
                  📄
                </div>
              )}
              <p className="truncate px-2 py-1 text-xs text-muted">
                {file.name} · {formatBytes(file.size)}
              </p>
              <button
                type="button"
                onClick={() => sync(files.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className="absolute right-1 top-1 rounded-full bg-surface px-1.5 text-xs shadow"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showStored ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-faint">Already sent (choosing new files replaces these):</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stored.map((file) => (
              <li key={file.id} className="overflow-hidden rounded-lg border border-line">
                {file.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/attachments/${file.id}?inline=1`} alt={file.name} className="h-24 w-full object-cover" />
                ) : null}
                <a
                  href={`/api/attachments/${file.id}`}
                  className="block truncate px-2 py-1 text-xs text-brand-deep"
                >
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
          {!question.required ? (
            <button type="button" onClick={() => setCleared(true)} className="text-xs text-danger-strong">
              Remove sent files
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuestionField({
  question,
  value,
}: {
  question: Question;
  value: string | string[] | undefined;
}) {
  const name = `q_${question.id}`;
  const id = `field-${question.id}`;
  const helpId = question.help ? `${id}-help` : undefined;
  const single = Array.isArray(value) ? "" : (value ?? "");

  const label = <FieldLabel question={question} />;

  const help = question.help ? (
    <p id={helpId} className="mt-1 text-xs text-faint">
      {question.help}
    </p>
  ) : null;

  // Radios and checkboxes are a group, so the label has to be a <legend> inside
  // a <fieldset> — a <label> pointing at one of several inputs would be read
  // out for that one input only.
  if (
    question.type === "radio" ||
    question.type === "checkbox" ||
    question.type === "yes_no_maybe" ||
    question.type === "scale"
  ) {
    const multiple = question.type === "checkbox";
    const selected = Array.isArray(value) ? value : value ? [value] : [];

    return (
      <fieldset>
        <legend className="mb-0.5">{label}</legend>
        {help}
        <div
          className={`mt-2.5 ${question.type === "scale" ? "flex flex-wrap gap-2" : "space-y-1.5"}`}
        >
          {optionsFor(question).map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-tint/60"
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={option}
                defaultChecked={selected.includes(option)}
                required={question.required && !multiple}
                aria-describedby={helpId}
                className="accent-pink-500"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <FieldLabel question={question} htmlFor={id} />
      {help}

      {question.type === "long_text" ? (
        <textarea
          id={id}
          name={name}
          rows={4}
          maxLength={5000}
          required={question.required}
          defaultValue={single}
          aria-describedby={helpId}
          className="hs-input mt-2.5 resize-y"
        />
      ) : question.type === "select" ? (
        <select
          id={id}
          name={name}
          required={question.required}
          defaultValue={single}
          aria-describedby={helpId}
          className="hs-input mt-2.5"
        >
          <option value="">Choose…</option>
          {optionsFor(question).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={name}
          type={
            question.type === "number"
              ? "number"
              : question.type === "date"
                ? "date"
                : question.type === "email"
                  ? "email"
                  : "text"
          }
          maxLength={500}
          required={question.required}
          defaultValue={single}
          aria-describedby={helpId}
          className="hs-input mt-2.5"
        />
      )}
    </div>
  );
}
