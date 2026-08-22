/**
 * Form responses are the one place where a person with no special tier writes
 * structured data the portal will later show to a head. Everything a browser
 * could lie about is re-decided here, so this file is where that gets proved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formDefinitionSchema,
  parseDefinition,
  optionsFor,
  validateResponse,
  answerText,
  type FormDefinition,
  type Question,
} from "../src/lib/forms-schema";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    type: "short_text",
    label: "Your name",
    help: "",
    required: false,
    options: [],
    ...overrides,
  };
}

function definition(...questions: Question[]): FormDefinition {
  return { version: 1, questions };
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const item of value) data.append(key, item);
    else data.append(key, value);
  }
  return data;
}

test("a valid definition round-trips", () => {
  const parsed = parseDefinition(definition(question()));
  assert.ok(parsed);
  assert.equal(parsed!.questions.length, 1);
});

test("a corrupt definition returns null rather than throwing", () => {
  assert.equal(parseDefinition({ version: 2, questions: [] }), null);
  assert.equal(parseDefinition({ questions: "nope" }), null);
  assert.equal(parseDefinition(null), null);
  assert.equal(parseDefinition("[]"), null);
});

test("an unknown question type is refused", () => {
  const result = formDefinitionSchema.safeParse({
    version: 1,
    questions: [{ ...question(), type: "file_upload" }],
  });
  assert.equal(result.success, false);
});

test("a required answer cannot be left out", () => {
  const spec = definition(question({ required: true }));
  const result = validateResponse(spec, form({}));
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /required/);
});

test("an optional answer left out is simply absent", () => {
  const spec = definition(question({ required: false }));
  const result = validateResponse(spec, form({}));
  assert.equal(result.ok, true);
  assert.deepEqual((result as { payload: object }).payload, {});
});

test("a choice outside the option list is refused", () => {
  const spec = definition(
    question({ type: "radio", options: ["Friday", "Saturday"], required: true }),
  );

  const good = validateResponse(spec, form({ q_q1: "Saturday" }));
  assert.equal(good.ok, true);

  // The exact attack a devtools user runs: keep the field, change the value.
  const bad = validateResponse(spec, form({ q_q1: "Every day forever" }));
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /not one of its options/);
});

test("checkbox answers are each checked against the list", () => {
  const spec = definition(question({ type: "checkbox", options: ["A", "B", "C"] }));

  const good = validateResponse(spec, form({ q_q1: ["A", "C"] }));
  assert.equal(good.ok, true);
  assert.deepEqual((good as { payload: Record<string, unknown> }).payload.q1, ["A", "C"]);

  const bad = validateResponse(spec, form({ q_q1: ["A", "Z"] }));
  assert.equal(bad.ok, false);
});

test("yes/no/maybe and scale carry their own fixed options", () => {
  assert.deepEqual(optionsFor(question({ type: "yes_no_maybe" })), ["Yes", "No", "Maybe"]);
  assert.deepEqual(optionsFor(question({ type: "scale" })), ["1", "2", "3", "4", "5"]);

  const spec = definition(question({ type: "yes_no_maybe" }));
  assert.equal(validateResponse(spec, form({ q_q1: "Maybe" })).ok, true);
  assert.equal(validateResponse(spec, form({ q_q1: "Absolutely" })).ok, false);
});

test("numbers, dates and emails are shape-checked on the server", () => {
  const number = definition(question({ type: "number" }));
  assert.equal(validateResponse(number, form({ q_q1: "42" })).ok, true);
  assert.equal(validateResponse(number, form({ q_q1: "forty two" })).ok, false);

  const date = definition(question({ type: "date" }));
  assert.equal(validateResponse(date, form({ q_q1: "2027-03-20" })).ok, true);
  assert.equal(validateResponse(date, form({ q_q1: "20/03/2027" })).ok, false);

  const email = definition(question({ type: "email" }));
  assert.equal(validateResponse(email, form({ q_q1: "a@kmids.ac.th" })).ok, true);
  assert.equal(validateResponse(email, form({ q_q1: "not-an-email" })).ok, false);
});

test("length caps are enforced server-side, not by maxlength", () => {
  const short = definition(question({ type: "short_text" }));
  assert.equal(validateResponse(short, form({ q_q1: "x".repeat(501) })).ok, false);

  const long = definition(question({ type: "long_text" }));
  assert.equal(validateResponse(long, form({ q_q1: "x".repeat(4999) })).ok, true);
  assert.equal(validateResponse(long, form({ q_q1: "x".repeat(5001) })).ok, false);
});

test("fields the form never asked for are dropped, not stored", () => {
  const spec = definition(question());
  const result = validateResponse(
    spec,
    form({ q_q1: "Ploy", q_injected: "surprise", tier: "T4_OWNER" }),
  );

  assert.equal(result.ok, true);
  const payload = (result as { payload: Record<string, unknown> }).payload;
  assert.deepEqual(Object.keys(payload), ["q1"]);
});

test("answerText renders both single and multiple answers", () => {
  const single = question();
  const multi = question({ id: "q2", type: "checkbox", options: ["A", "B"] });

  assert.equal(answerText({ q1: "Ploy" }, single), "Ploy");
  assert.equal(answerText({ q2: ["A", "B"] }, multi), "A, B");
  assert.equal(answerText({}, single), "");
});
