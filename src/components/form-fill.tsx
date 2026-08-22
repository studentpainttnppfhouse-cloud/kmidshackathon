"use client";

import { useActionState } from "react";
import { submitFormResponse } from "@/lib/actions/forms";
import { Feedback, SubmitButton } from "@/components/form-bits";
import { optionsFor, type FormDefinition, type Question, type ResponsePayload } from "@/lib/forms-schema";
import type { FormState } from "@/lib/actions/auth";

const initial: FormState = {};

/**
 * Answering a portal form.
 *
 * `required` here is a courtesy that saves a round trip; the server checks it
 * again, along with option membership and every length cap, because none of
 * these attributes survive a devtools inspector. See `validateResponse`.
 */
export function FormFill({
  formId,
  definition,
  existing,
}: {
  formId: string;
  definition: FormDefinition;
  existing: ResponsePayload | null;
}) {
  const [state, action] = useActionState(submitFormResponse, initial);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="formId" value={formId} />

      {existing ? (
        <p className="hs-feedback hs-feedback-ok" role="status">
          <span aria-hidden="true">✓</span> You have answered this already. Changing anything below
          and submitting replaces your previous answers.
        </p>
      ) : null}

      {definition.questions.map((question, index) => (
        <QuestionField
          key={question.id}
          question={question}
          index={index}
          value={existing?.[question.id]}
        />
      ))}

      <Feedback state={state} />

      <SubmitButton className="hs-btn hs-btn-primary" pendingLabel="Sending…">
        {existing ? "Update my answers" : "Submit"}
      </SubmitButton>
    </form>
  );
}

function QuestionField({
  question,
  index,
  value,
}: {
  question: Question;
  index: number;
  value: string | string[] | undefined;
}) {
  const name = `q_${question.id}`;
  const id = `field-${question.id}`;
  const helpId = question.help ? `${id}-help` : undefined;
  const single = Array.isArray(value) ? "" : (value ?? "");

  const label = (
    <>
      <span className="text-sm font-semibold text-ink">
        {index + 1}. {question.label}
      </span>
      {question.required ? (
        <span className="ml-1 text-red-600" aria-hidden="true">
          *
        </span>
      ) : null}
      {question.required ? <span className="sr-only"> (required)</span> : null}
    </>
  );

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
      <fieldset className="hs-card p-4">
        <legend className="px-1">{label}</legend>
        {help}
        <div
          className={`mt-2.5 ${question.type === "scale" ? "flex flex-wrap gap-2" : "space-y-1.5"}`}
        >
          {optionsFor(question).map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-pink-50/60"
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
    <div className="hs-card p-4">
      <label htmlFor={id} className="block">
        {label}
      </label>
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
