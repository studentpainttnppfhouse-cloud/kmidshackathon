"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveInternalForm } from "@/lib/actions/forms";
import { Feedback, SubmitButton } from "@/components/form-bits";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_HINT,
  QUESTION_TYPE_LABEL,
  TYPES_WITH_OPTIONS,
  questionId,
  type FormDefinition,
  type Question,
  type QuestionType,
} from "@/lib/forms-schema";
import { toDateInput } from "@/lib/dates";
import type { FormState } from "@/lib/actions/auth";

const initial: FormState = {};

/**
 * The form builder — the portal's answer to Google Forms, kept internal.
 *
 * The question list is edited in React state and posted as one JSON field,
 * because a nested structure does not survive a flat form body. That JSON is
 * re-validated on the server against the same zod schema regardless of having
 * come from this component: what the browser sends is a proposal, not a fact.
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
  const [questions, setQuestions] = useState<Question[]>(
    form?.definition?.questions ?? [blank(0)],
  );

  function blank(index: number): Question {
    return {
      id: questionId(index),
      type: "short_text",
      label: "",
      help: "",
      required: false,
      options: [],
    };
  }

  const update = (id: string, patch: Partial<Question>) =>
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const move = (index: number, direction: -1 | 1) =>
    setQuestions((list) => {
      const next = [...list];
      const target = index + direction;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) =>
    setQuestions((list) => (list.length === 1 ? list : list.filter((q) => q.id !== id)));

  const definition: FormDefinition = {
    version: 1,
    questions: questions.map((q) => ({
      ...q,
      label: q.label.trim(),
      help: q.help?.trim() ?? "",
      options: TYPES_WITH_OPTIONS.includes(q.type)
        ? q.options.map((o) => o.trim()).filter(Boolean)
        : [],
    })),
  };

  return (
    <form action={action} className="space-y-5">
      {form ? <input type="hidden" name="id" value={form.id} /> : null}
      <input type="hidden" name="definition" value={JSON.stringify(definition)} />

      <div className="hs-card space-y-4 p-5">
        <div>
          <label className="hs-label" htmlFor="form-title">
            Form name
          </label>
          <input
            id="form-title"
            name="title"
            required
            maxLength={200}
            defaultValue={form?.title ?? ""}
            className="hs-input"
            placeholder="Event-day availability"
          />
        </div>

        <div>
          <label className="hs-label" htmlFor="form-desc">
            What is this for?
          </label>
          <textarea
            id="form-desc"
            name="description"
            rows={2}
            maxLength={1000}
            defaultValue={form?.description ?? ""}
            className="hs-input resize-y"
            placeholder="Shown above the questions when somebody opens the form."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
              defaultValue={toDateInput(form?.deadline)}
              className="hs-input"
            />
          </div>
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
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="hs-h2">Questions</h2>
          <span className="text-xs text-faint">{questions.length} of 50</span>
        </div>

        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            total={questions.length}
            onChange={(patch) => update(question.id, patch)}
            onMove={(direction) => move(index, direction)}
            onRemove={() => remove(question.id)}
          />
        ))}

        <button
          type="button"
          onClick={() =>
            setQuestions((list) =>
              list.length >= 50 ? list : [...list, blank(list.length)],
            )
          }
          disabled={questions.length >= 50}
          className="hs-btn hs-btn-secondary w-full"
        >
          <span aria-hidden="true">＋</span> Add a question
        </button>
      </div>

      <Feedback state={state} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Saving…">
          {form ? "Save form" : "Create form"}
        </SubmitButton>
        <Link href={form ? `/forms/${form.id}` : "/forms"} className="hs-btn hs-btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function QuestionCard({
  question,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  question: Question;
  index: number;
  total: number;
  onChange: (patch: Partial<Question>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const needsOptions = TYPES_WITH_OPTIONS.includes(question.type);

  return (
    <fieldset className="hs-card space-y-3 p-4">
      <legend className="sr-only">Question {index + 1}</legend>

      <div className="flex items-center justify-between gap-2">
        <span className="hs-eyebrow">Question {index + 1}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="hs-btn hs-btn-ghost px-2 py-1 text-xs"
            aria-label={`Move question ${index + 1} up`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="hs-btn hs-btn-ghost px-2 py-1 text-xs"
            aria-label={`Move question ${index + 1} down`}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={total === 1}
            className="hs-btn hs-btn-ghost px-2 py-1 text-xs text-danger-strong"
            aria-label={`Remove question ${index + 1}`}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
        <div>
          <label className="hs-label" htmlFor={`label-${question.id}`}>
            Question
          </label>
          <input
            id={`label-${question.id}`}
            value={question.label}
            onChange={(event) => onChange({ label: event.target.value })}
            maxLength={300}
            className="hs-input"
            placeholder="Which shifts can you cover?"
          />
        </div>
        <div>
          <label className="hs-label" htmlFor={`type-${question.id}`}>
            Answer type
          </label>
          <select
            id={`type-${question.id}`}
            value={question.type}
            onChange={(event) => onChange({ type: event.target.value as QuestionType })}
            className="hs-input"
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-faint">{QUESTION_TYPE_HINT[question.type]}</p>
        </div>
      </div>

      <div>
        <label className="hs-label" htmlFor={`help-${question.id}`}>
          Helper text (optional)
        </label>
        <input
          id={`help-${question.id}`}
          value={question.help ?? ""}
          onChange={(event) => onChange({ help: event.target.value })}
          maxLength={300}
          className="hs-input"
          placeholder="Anything the person answering needs to know."
        />
      </div>

      {needsOptions ? (
        <div>
          <label className="hs-label" htmlFor={`options-${question.id}`}>
            Options — one per line
          </label>
          <textarea
            id={`options-${question.id}`}
            value={question.options.join("\n")}
            onChange={(event) =>
              onChange({ options: event.target.value.split("\n").slice(0, 30) })
            }
            rows={Math.min(8, Math.max(3, question.options.length + 1))}
            className="hs-input resize-y"
            placeholder={"Friday setup\nSaturday morning\nSaturday afternoon"}
          />
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={question.required}
          onChange={(event) => onChange({ required: event.target.checked })}
          className="accent-pink-500"
        />
        Required
      </label>
    </fieldset>
  );
}
