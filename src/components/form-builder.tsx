"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveInternalForm } from "@/lib/actions/forms";
import { Feedback, SubmitButton } from "@/components/form-bits";
import {
  FILE_GROUP_KEYS,
  FILE_GROUP_LABEL,
  MAX_FILES_PER_QUESTION,
  PALETTE_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_ICON,
  QUESTION_TYPE_LABEL,
  TYPES_WITH_OPTIONS,
  isUpload,
  optionsFor,
  questionId,
  type FileGroup,
  type FormDefinition,
  type Question,
  type QuestionType,
} from "@/lib/forms-schema";
import { toDateInput } from "@/lib/dates";
import type { FormState } from "@/lib/actions/auth";

const initial: FormState = {};

type Selection = { kind: "form" } | { kind: "question"; id: string };

/**
 * The form builder, laid out like Airtable's: a field list on the left, the
 * form as respondents will see it in the middle, and the selected field's
 * settings on the right. On a phone the three panes stack.
 *
 * The question list lives in React state and is posted as one JSON field. The
 * server re-validates it with the same zod schema the fill page uses.
 */
export function FormBuilder({
  departments,
  form,
}: {
  departments: { id: string; name: string }[];
  form?: {
    id: string;
    title: string;
    description: string | null;
    departmentId: string | null;
    deadline: Date | null;
    isOpen: boolean;
    definition: FormDefinition | null;
  };
}) {
  const [state, action] = useActionState(saveInternalForm, initial);
  const [title, setTitle] = useState(form?.title ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [cover, setCover] = useState(form?.definition?.cover ?? "");
  const [submitLabel, setSubmitLabel] = useState(form?.definition?.submitLabel ?? "");
  const [confirmation, setConfirmation] = useState(form?.definition?.confirmation ?? "");
  const [questions, setQuestions] = useState<Question[]>(
    form?.definition?.questions ?? [blank("short_text", 0)],
  );
  const [selected, setSelected] = useState<Selection>(
    questions[0] ? { kind: "question", id: questions[0].id } : { kind: "form" },
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [coverError, setCoverError] = useState("");

  const current =
    selected.kind === "question" ? questions.find((q) => q.id === selected.id) ?? null : null;

  const update = (id: string, patch: Partial<Question>) =>
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const add = (type: QuestionType) => {
    const q = blank(type, questions.length);
    setQuestions((list) => {
      if (current) {
        const at = list.findIndex((item) => item.id === current.id);
        const next = [...list];
        next.splice(at + 1, 0, q);
        return next;
      }
      return [...list, q];
    });
    setSelected({ kind: "question", id: q.id });
  };

  const duplicate = (id: string) => {
    const source = questions.find((q) => q.id === id);
    if (!source || questions.length >= 50) return;
    const copy = { ...source, id: questionId(questions.length), label: `${source.label} (copy)` };
    setQuestions((list) => {
      const at = list.findIndex((q) => q.id === id);
      const next = [...list];
      next.splice(at + 1, 0, copy);
      return next;
    });
    setSelected({ kind: "question", id: copy.id });
  };

  const remove = (id: string) => {
    if (questions.length === 1) return;
    const at = questions.findIndex((q) => q.id === id);
    const next = questions.filter((q) => q.id !== id);
    setQuestions(next);
    setSelected({ kind: "question", id: next[Math.max(0, at - 1)].id });
  };

  const move = (id: string, direction: -1 | 1) =>
    setQuestions((list) => {
      const index = list.findIndex((q) => q.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setQuestions((list) => {
      const from = list.findIndex((q) => q.id === dragId);
      const to = list.findIndex((q) => q.id === targetId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragId(null);
  };

  const definition: FormDefinition = {
    version: 1,
    cover,
    submitLabel: submitLabel.trim(),
    confirmation: confirmation.trim(),
    questions: questions.map((q) => ({
      ...q,
      label: q.label.trim(),
      help: (q.help ?? "").trim(),
      options: TYPES_WITH_OPTIONS.includes(q.type)
        ? q.options.map((o) => o.trim()).filter(Boolean)
        : [],
      maxFiles: isUpload(q.type) ? q.maxFiles ?? 1 : undefined,
      fileGroups: q.type === "file_upload" ? q.fileGroups ?? [] : undefined,
    })),
  };

  async function pickCover(file: File | undefined) {
    setCoverError("");
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
      setCoverError("Pick a PNG, JPG or WebP image.");
      return;
    }
    try {
      setCover(await downscale(file));
    } catch {
      setCoverError("That image could not be read.");
    }
  }

  return (
    <form action={action} className="space-y-4">
      {form ? <input type="hidden" name="id" value={form.id} /> : null}
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="definition" value={JSON.stringify(definition)} />

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        {/* ------------------------------------------------ Field list */}
        <aside className="hs-card space-y-4 p-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            <h2 className="hs-eyebrow mb-2">Fields</h2>
            <ol className="space-y-1">
              {questions.map((q, index) => {
                const active = selected.kind === "question" && selected.id === q.id;
                return (
                  <li
                    key={q.id}
                    draggable
                    onDragStart={() => setDragId(q.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropOn(q.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`flex items-center gap-1 rounded-lg border text-sm transition ${
                      active ? "border-brand bg-tint" : "border-transparent hover:bg-surface-2"
                    } ${dragId === q.id ? "opacity-50" : ""}`}
                  >
                    <span aria-hidden="true" className="cursor-grab px-1 text-faint">
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: "question", id: q.id })}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                      aria-current={active ? "true" : undefined}
                    >
                      <span aria-hidden="true" className="w-5 shrink-0 text-center text-xs text-faint">
                        {QUESTION_TYPE_ICON[q.type]}
                      </span>
                      <span className="truncate text-ink">
                        {q.label || <span className="text-faint">Question {index + 1}</span>}
                      </span>
                      {q.required ? <span className="text-danger-strong" aria-label="required">*</span> : null}
                    </button>
                    <span className="flex shrink-0 pr-1">
                      <IconButton label="Move up" onClick={() => move(q.id, -1)} disabled={index === 0}>
                        ↑
                      </IconButton>
                      <IconButton
                        label="Move down"
                        onClick={() => move(q.id, 1)}
                        disabled={index === questions.length - 1}
                      >
                        ↓
                      </IconButton>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <h2 className="hs-eyebrow mb-2">Add a field</h2>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {PALETTE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => add(type)}
                  disabled={questions.length >= 50}
                  className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-sm text-muted transition hover:border-brand hover:text-brand-deep disabled:opacity-50"
                >
                  <span aria-hidden="true" className="w-5 text-center text-xs">
                    {QUESTION_TYPE_ICON[type]}
                  </span>
                  {QUESTION_TYPE_LABEL[type]}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------ Canvas */}
        <section aria-label="Form preview" className="min-w-0">
          <div className="hs-card mx-auto max-w-2xl overflow-hidden p-0">
            <div className="group relative">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-40 w-full object-cover sm:h-52" />
              ) : (
                <div className="h-16 w-full bg-tint" />
              )}
              <label className="hs-btn hs-btn-secondary absolute right-3 top-3 cursor-pointer px-3 py-1.5 text-xs">
                {cover ? "Change cover" : "Add cover image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="sr-only"
                  onChange={(event) => pickCover(event.target.files?.[0])}
                />
              </label>
              {cover ? (
                <button
                  type="button"
                  onClick={() => setCover("")}
                  className="hs-btn hs-btn-ghost absolute bottom-3 right-3 bg-surface px-3 py-1.5 text-xs"
                >
                  Remove cover
                </button>
              ) : null}
            </div>
            {coverError ? (
              <p role="alert" className="px-5 pt-3 text-xs text-danger-strong">
                {coverError}
              </p>
            ) : null}

            <div className="space-y-6 p-5 sm:p-8">
              <div className="space-y-2" onClick={() => setSelected({ kind: "form" })}>
                <input
                  aria-label="Form title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Untitled form"
                  maxLength={200}
                  className="w-full border-0 bg-transparent p-0 text-2xl font-bold text-ink outline-none placeholder:text-faint"
                />
                <textarea
                  aria-label="Form description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add a description (optional)"
                  maxLength={1000}
                  rows={2}
                  className="w-full resize-y border-0 bg-transparent p-0 text-sm text-muted outline-none placeholder:text-faint"
                />
              </div>

              {questions.map((q, index) => {
                const active = selected.kind === "question" && selected.id === q.id;
                return (
                  <div
                    key={q.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected({ kind: "question", id: q.id })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSelected({ kind: "question", id: q.id });
                    }}
                    className={`rounded-xl border-2 p-3 transition ${
                      active ? "border-brand" : "border-transparent hover:border-line"
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">
                      {q.label || <span className="text-faint">Question {index + 1}</span>}
                      {q.required ? <span className="ml-0.5 text-danger-strong">*</span> : null}
                    </p>
                    {q.help ? <p className="mt-0.5 text-xs text-faint">{q.help}</p> : null}
                    <div className="pointer-events-none mt-2">
                      <PreviewInput question={q} />
                    </div>
                  </div>
                );
              })}

              <div>
                <span className="hs-btn hs-btn-primary pointer-events-none">
                  {submitLabel.trim() || "Submit"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Settings */}
        <aside className="hs-card space-y-4 p-4 lg:sticky lg:top-4 lg:self-start">
          <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => current || setSelected({ kind: "question", id: questions[0].id })}
              className={`flex-1 rounded-full px-3 py-1.5 ${current ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
            >
              Field
            </button>
            <button
              type="button"
              onClick={() => setSelected({ kind: "form" })}
              className={`flex-1 rounded-full px-3 py-1.5 ${!current ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
            >
              Form
            </button>
          </div>

          {current ? (
            <QuestionSettings
              key={current.id}
              question={current}
              onChange={(patch) => update(current.id, patch)}
              onDuplicate={() => duplicate(current.id)}
              onRemove={() => remove(current.id)}
              canRemove={questions.length > 1}
            />
          ) : null}

          {/* Form settings stay mounted so their inputs are always posted. */}
          <div className={current ? "hidden" : "space-y-4"}>
            <div>
              <label className="hs-label" htmlFor="form-dept">
                Department
              </label>
              <select
                id="form-dept"
                name="departmentId"
                defaultValue={form?.departmentId ?? ""}
                className="hs-input"
              >
                <option value="">Portal-wide</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hs-label" htmlFor="form-deadline">
                Closes on
              </label>
              <input
                id="form-deadline"
                name="deadline"
                type="date"
                defaultValue={form?.deadline ? toDateInput(form.deadline) : ""}
                className="hs-input"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                name="isOpen"
                defaultChecked={form?.isOpen ?? true}
                className="accent-pink-500"
              />
              Accepting responses
            </label>
            <div>
              <label className="hs-label" htmlFor="form-submit-label">
                Submit button text
              </label>
              <input
                id="form-submit-label"
                value={submitLabel}
                onChange={(event) => setSubmitLabel(event.target.value)}
                placeholder="Submit"
                maxLength={40}
                className="hs-input"
              />
            </div>
            <div>
              <label className="hs-label" htmlFor="form-confirmation">
                Message after submitting
              </label>
              <textarea
                id="form-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Thanks, your answers are in."
                maxLength={1000}
                rows={3}
                className="hs-input resize-y"
              />
            </div>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 py-3 backdrop-blur">
        <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
          {form ? "Save form" : "Create form"}
        </SubmitButton>
        {form ? (
          <Link href={`/forms/${form.id}`} className="hs-btn hs-btn-ghost">
            View form
          </Link>
        ) : null}
        <span className="text-xs text-faint">{questions.length} of 50 fields</span>
        <div className="w-full sm:w-auto sm:flex-1">
          <Feedback state={state} />
        </div>
      </div>
    </form>
  );
}

function blank(type: QuestionType, index: number): Question {
  return {
    id: questionId(index),
    type,
    label: "",
    help: "",
    required: false,
    options: TYPES_WITH_OPTIONS.includes(type) ? ["Option 1", "Option 2"] : [],
    ...(isUpload(type) ? { maxFiles: 1 } : {}),
    ...(type === "file_upload" ? { fileGroups: [] } : {}),
  };
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded px-1 text-xs text-faint hover:text-brand-deep disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function QuestionSettings({
  question,
  onChange,
  onDuplicate,
  onRemove,
  canRemove,
}: {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const offered = PALETTE_TYPES.includes(question.type)
    ? PALETTE_TYPES
    : [...PALETTE_TYPES, question.type];

  const changeType = (type: QuestionType) => {
    const patch: Partial<Question> = { type };
    if (TYPES_WITH_OPTIONS.includes(type) && question.options.length === 0) {
      patch.options = ["Option 1", "Option 2"];
    }
    if (isUpload(type) && !question.maxFiles) patch.maxFiles = 1;
    onChange(patch);
  };

  const setOption = (index: number, value: string) =>
    onChange({ options: question.options.map((o, i) => (i === index ? value : o)) });

  const groups = question.fileGroups ?? [];
  const toggleGroup = (group: FileGroup) =>
    onChange({
      fileGroups: groups.includes(group) ? groups.filter((g) => g !== group) : [...groups, group],
    });

  return (
    <div className="space-y-4">
      <div>
        <label className="hs-label" htmlFor="q-type">
          Field type
        </label>
        <select
          id="q-type"
          value={question.type}
          onChange={(event) => changeType(event.target.value as QuestionType)}
          className="hs-input"
        >
          {offered
            .filter((t) => QUESTION_TYPES.includes(t))
            .map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABEL[type]}
              </option>
            ))}
        </select>
      </div>

      <div>
        <label className="hs-label" htmlFor="q-label">
          Label
        </label>
        <input
          id="q-label"
          value={question.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="What do you want to ask?"
          maxLength={300}
          className="hs-input"
          autoFocus={!question.label}
        />
      </div>

      <div>
        <label className="hs-label" htmlFor="q-help">
          Help text
        </label>
        <textarea
          id="q-help"
          value={question.help ?? ""}
          onChange={(event) => onChange({ help: event.target.value })}
          placeholder="Shown under the label"
          maxLength={300}
          rows={2}
          className="hs-input resize-y"
        />
      </div>

      <label className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink">
        Required
        <input
          type="checkbox"
          checked={question.required}
          onChange={(event) => onChange({ required: event.target.checked })}
          className="h-4 w-4 accent-pink-500"
        />
      </label>

      {TYPES_WITH_OPTIONS.includes(question.type) ? (
        <fieldset className="space-y-2">
          <legend className="hs-label">Options</legend>
          {question.options.map((option, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                value={option}
                onChange={(event) => setOption(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (question.options.length < 30) {
                      onChange({ options: [...question.options, ""] });
                      setTimeout(() => optionRefs.current[index + 1]?.focus(), 0);
                    }
                  }
                }}
                aria-label={`Option ${index + 1}`}
                maxLength={160}
                className="hs-input py-1.5"
              />
              <IconButton
                label="Remove option"
                onClick={() => onChange({ options: question.options.filter((_, i) => i !== index) })}
                disabled={question.options.length <= 1}
              >
                ✕
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ options: [...question.options, ""] })}
            disabled={question.options.length >= 30}
            className="text-xs font-semibold text-brand-deep disabled:opacity-50"
          >
            + Add option
          </button>
        </fieldset>
      ) : null}

      {isUpload(question.type) ? (
        <div>
          <label className="hs-label" htmlFor="q-max-files">
            Files allowed
          </label>
          <select
            id="q-max-files"
            value={question.maxFiles ?? 1}
            onChange={(event) => onChange({ maxFiles: Number(event.target.value) })}
            className="hs-input"
          >
            {Array.from({ length: MAX_FILES_PER_QUESTION }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "One file" : `Up to ${n} files`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {question.type === "file_upload" ? (
        <fieldset>
          <legend className="hs-label">Accepted types</legend>
          <p className="mb-2 text-xs text-faint">None ticked means any of these.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {FILE_GROUP_KEYS.map((group) => (
              <label key={group} className="flex items-center gap-1.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={groups.includes(group)}
                  onChange={() => toggleGroup(group)}
                  className="accent-pink-500"
                />
                {FILE_GROUP_LABEL[group]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex gap-2 border-t border-line pt-3">
        <button type="button" onClick={onDuplicate} className="hs-btn hs-btn-secondary flex-1 px-3 py-1.5 text-xs">
          Duplicate
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="hs-btn hs-btn-ghost flex-1 px-3 py-1.5 text-xs text-danger-strong disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** A static picture of the input a respondent will get. */
function PreviewInput({ question }: { question: Question }) {
  switch (question.type) {
    case "long_text":
      return <div className="hs-input h-20" />;
    case "radio":
    case "checkbox":
    case "yes_no_maybe":
    case "scale":
      return (
        <ul className="space-y-1.5">
          {optionsFor(question).map((option, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-muted">
              <span
                aria-hidden="true"
                className={`h-4 w-4 border border-line ${question.type === "checkbox" ? "rounded" : "rounded-full"}`}
              />
              {option || <span className="text-faint">Option {i + 1}</span>}
            </li>
          ))}
        </ul>
      );
    case "select":
      return <div className="hs-input flex justify-between text-faint">Choose… <span>▾</span></div>;
    case "image_upload":
    case "file_upload":
      return (
        <div className="rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-faint">
          Drop {question.type === "image_upload" ? "photos" : "files"} here or browse
        </div>
      );
    default:
      return <div className="hs-input text-faint">{question.type === "date" ? "dd/mm/yyyy" : " "}</div>;
  }
}

/**
 * Shrinks a cover image in the browser so it fits in the form's definition.
 * 1600px wide is plenty for a banner; JPEG at 0.82 keeps it well under the cap.
 */
async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const scale = Math.min(1, 1600 / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 1_400_000 && quality > 0.4) {
      quality -= 0.15;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
