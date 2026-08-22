import { z } from "zod";

/**
 * The shape of a form built inside the portal.
 *
 * Google Forms is what this replaces, so the question types are the ones people
 * reach for there — and no more than that. Every one of them is a closed set the
 * server can validate an answer against, which is the point: a form definition
 * is data written by a head, and a response is data written by anybody, so the
 * response has to be checkable against the definition rather than trusted.
 *
 * The definition lives in `Form.schema` (a JSON column) and the answers in
 * `FormResponse.payload`. Both are re-parsed with these schemas on the way out
 * of the database as well as on the way in — a JSON column has no shape of its
 * own, and a row written by an older version of this file is exactly the sort of
 * thing that turns into a rendering crash on event day.
 */

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "number",
  "date",
  "email",
  "select",
  "radio",
  "checkbox",
  "yes_no_maybe",
  "scale",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  short_text: "Short answer",
  long_text: "Long answer (paragraph)",
  number: "Number",
  date: "Date",
  email: "Email address",
  select: "Dropdown",
  radio: "Multiple choice (pick one)",
  checkbox: "Checkboxes (pick several)",
  yes_no_maybe: "Yes / No / Maybe",
  scale: "Scale of 1 to 5",
};

export const QUESTION_TYPE_HINT: Record<QuestionType, string> = {
  short_text: "One line. Names, room numbers, a shirt size.",
  long_text: "A few sentences. Feedback, reasons, notes.",
  number: "Digits only.",
  date: "A date picker.",
  email: "Checked for an @ and a domain.",
  select: "A dropdown list. Add the options below.",
  radio: "Options shown as buttons; exactly one is chosen.",
  checkbox: "Options shown as boxes; any number may be ticked.",
  yes_no_maybe: "The three options are built in.",
  scale: "1 to 5, shown as buttons.",
};

/** Types whose answers come from a list the author writes. */
export const TYPES_WITH_OPTIONS: QuestionType[] = ["select", "radio", "checkbox"];

export const YES_NO_MAYBE = ["Yes", "No", "Maybe"] as const;
export const SCALE_OPTIONS = ["1", "2", "3", "4", "5"] as const;

export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1, "Every question needs a label.").max(300),
  help: z.string().trim().max(300).optional().or(z.literal("")),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
});

export type Question = z.infer<typeof questionSchema>;

export const formDefinitionSchema = z.object({
  version: z.literal(1),
  questions: z.array(questionSchema).min(1, "Add at least one question.").max(50),
});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/**
 * Reads a definition back out of the JSON column.
 *
 * Returns null rather than throwing: a form saved by an older build, or one
 * whose JSON was edited by hand, must not take down the forms index for
 * everybody. The page renders it as "this form needs rebuilding" instead.
 */
export function parseDefinition(raw: unknown): FormDefinition | null {
  if (raw === null || raw === undefined) return null;
  const parsed = formDefinitionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The choices a given question actually accepts. */
export function optionsFor(question: Question): string[] {
  if (question.type === "yes_no_maybe") return [...YES_NO_MAYBE];
  if (question.type === "scale") return [...SCALE_OPTIONS];
  return question.options;
}

export function hasOptions(type: QuestionType): boolean {
  return TYPES_WITH_OPTIONS.includes(type) || type === "yes_no_maybe" || type === "scale";
}

export type Answer = string | string[];
export type ResponsePayload = Record<string, Answer>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates one submission against the form that produced it.
 *
 * Every rule here exists because the browser is not a source of truth: a
 * `required` attribute is a hint the submitter can delete, a `<select>` sends
 * whatever value the DOM holds at submit time, and a `maxlength` is advisory.
 * So required-ness, membership in the option list and every length cap are
 * re-decided on the server, and anything not in the definition is dropped
 * rather than stored — a response cannot introduce fields of its own.
 */
export function validateResponse(
  definition: FormDefinition,
  raw: FormData,
): { ok: true; payload: ResponsePayload } | { ok: false; error: string } {
  const payload: ResponsePayload = {};

  for (const question of definition.questions) {
    const field = `q_${question.id}`;

    if (question.type === "checkbox") {
      const values = raw
        .getAll(field)
        .map((value) => String(value))
        .filter(Boolean);
      const allowed = optionsFor(question);
      const unknown = values.find((value) => !allowed.includes(value));
      if (unknown) return { ok: false, error: `"${question.label}" got an answer that is not one of its options.` };
      if (question.required && values.length === 0) {
        return { ok: false, error: `"${question.label}" is required.` };
      }
      if (values.length > 0) payload[question.id] = values;
      continue;
    }

    const value = String(raw.get(field) ?? "").trim();

    if (value.length === 0) {
      if (question.required) return { ok: false, error: `"${question.label}" is required.` };
      continue;
    }

    if (hasOptions(question.type)) {
      const allowed = optionsFor(question);
      if (!allowed.includes(value)) {
        return { ok: false, error: `"${question.label}" got an answer that is not one of its options.` };
      }
    }

    if (question.type === "number" && !/^-?\d{1,12}(\.\d{1,4})?$/.test(value)) {
      return { ok: false, error: `"${question.label}" needs a number.` };
    }

    if (question.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { ok: false, error: `"${question.label}" needs a date.` };
    }

    if (question.type === "email" && !EMAIL_SHAPE.test(value)) {
      return { ok: false, error: `"${question.label}" needs an email address.` };
    }

    const cap = question.type === "long_text" ? 5000 : 500;
    if (value.length > cap) {
      return { ok: false, error: `"${question.label}" is too long.` };
    }

    payload[question.id] = value;
  }

  return { ok: true, payload };
}

/** An answer, as text, for the responses table and the CSV export. */
export function answerText(payload: ResponsePayload, question: Question): string {
  const value = payload[question.id];
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

/** A short, stable id for a new question. */
export function questionId(index: number): string {
  return `q${index + 1}${Math.random().toString(36).slice(2, 7)}`;
}
