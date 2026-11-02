import { z } from "zod";
import { extensionOf, formatBytes } from "@/lib/attachments";

/**
 * The shape of a form built inside the portal.
 *
 * The definition lives in `Form.schema` (a JSON column) and the answers in
 * `FormResponse.payload`. Both are re-parsed with these schemas on the way out
 * of the database as well as on the way in. The builder, the fill page and the
 * server action all read this one file, so the browser's checks and the
 * server's checks cannot drift apart.
 */

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "radio",
  "checkbox",
  "select",
  "number",
  "email",
  "date",
  "image_upload",
  "file_upload",
  // Older types: still answerable, no longer offered in the palette.
  "yes_no_maybe",
  "scale",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** What the builder's "add a field" palette offers, in order. */
export const PALETTE_TYPES: QuestionType[] = [
  "short_text",
  "long_text",
  "radio",
  "checkbox",
  "select",
  "number",
  "email",
  "date",
  "image_upload",
  "file_upload",
];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  email: "Email",
  select: "Dropdown",
  radio: "Single choice",
  checkbox: "Multiple choice",
  image_upload: "Photo upload",
  file_upload: "File upload",
  yes_no_maybe: "Yes / No / Maybe",
  scale: "Scale of 1 to 5",
};

export const QUESTION_TYPE_ICON: Record<QuestionType, string> = {
  short_text: "Aa",
  long_text: "¶",
  number: "#",
  date: "📅",
  email: "@",
  select: "▾",
  radio: "◉",
  checkbox: "☑",
  image_upload: "🖼",
  file_upload: "📎",
  yes_no_maybe: "?",
  scale: "★",
};

/** Kept for older imports. */
export const QUESTION_TYPE_HINT: Record<QuestionType, string> = {
  short_text: "One line.",
  long_text: "A few sentences.",
  number: "Digits only.",
  date: "A date picker.",
  email: "Checked for an @ and a domain.",
  select: "A dropdown list.",
  radio: "Exactly one option.",
  checkbox: "Any number of options.",
  image_upload: "Photos from the device or camera.",
  file_upload: "Any allowed file from the device.",
  yes_no_maybe: "The three options are built in.",
  scale: "1 to 5.",
};

/** Types whose answers come from a list the author writes. */
export const TYPES_WITH_OPTIONS: QuestionType[] = ["select", "radio", "checkbox"];
export const UPLOAD_TYPES: QuestionType[] = ["image_upload", "file_upload"];

export const YES_NO_MAYBE = ["Yes", "No", "Maybe"] as const;
export const SCALE_OPTIONS = ["1", "2", "3", "4", "5"] as const;

// ---------------------------------------------------------------------------
// File rules
// ---------------------------------------------------------------------------

/** Groups of extensions an author can allow on a file question. */
export const FILE_GROUPS = {
  images: ["png", "jpg", "jpeg", "gif", "webp", "avif", "heic"],
  pdf: ["pdf"],
  documents: ["doc", "docx", "txt", "md"],
  spreadsheets: ["xls", "xlsx", "csv"],
  slides: ["ppt", "pptx"],
  video: ["mp4", "mov"],
  audio: ["mp3", "wav"],
  archives: ["zip"],
} as const;

export type FileGroup = keyof typeof FILE_GROUPS;
export const FILE_GROUP_KEYS = Object.keys(FILE_GROUPS) as FileGroup[];
export const FILE_GROUP_LABEL: Record<FileGroup, string> = {
  images: "Images",
  pdf: "PDF",
  documents: "Documents",
  spreadsheets: "Spreadsheets",
  slides: "Slides",
  video: "Video",
  audio: "Audio",
  archives: "ZIP",
};

/** Every extension any group allows. A file question never accepts more. */
const ALL_EXTENSIONS: string[] = Object.values(FILE_GROUPS).flat();

/** Hard ceiling on all files in one submission (the action body limit is 24 MB). */
export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_QUESTION = 10;

export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1, "Every question needs a label.").max(300),
  help: z.string().trim().max(300).optional().or(z.literal("")),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  /** Upload questions: how many files one answer may carry. */
  maxFiles: z.number().int().min(1).max(MAX_FILES_PER_QUESTION).optional(),
  /** File questions: which groups are allowed. Empty means every group. */
  fileGroups: z.array(z.enum(FILE_GROUP_KEYS as [FileGroup, ...FileGroup[]])).max(8).optional(),
});

export type Question = z.infer<typeof questionSchema>;

/**
 * A cover image: an https URL, or a downscaled image the builder encoded
 * itself. Capped so one form cannot bloat every query that reads the column.
 */
const coverSchema = z
  .string()
  .max(1_500_000, "That cover image is too large. Pick a smaller one.")
  .refine(
    (value) =>
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ||
      /^https:\/\/[^\s"'<>]+$/.test(value),
    "The cover has to be an image.",
  );

export const formDefinitionSchema = z.object({
  version: z.literal(1),
  questions: z.array(questionSchema).min(1, "Add at least one question.").max(50),
  cover: coverSchema.optional().or(z.literal("")),
  submitLabel: z.string().trim().max(40).optional().or(z.literal("")),
  confirmation: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** Reads a definition back out of the JSON column, or null if it does not fit. */
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

export function isUpload(type: QuestionType): boolean {
  return UPLOAD_TYPES.includes(type);
}

/** The extensions an upload question accepts. */
export function allowedExtensions(question: Question): string[] {
  if (question.type === "image_upload") return [...FILE_GROUPS.images];
  if (question.type !== "file_upload") return [];
  const groups = question.fileGroups ?? [];
  if (groups.length === 0) return ALL_EXTENSIONS;
  return groups.flatMap((group) => [...FILE_GROUPS[group]]);
}

/** The `accept` attribute for an upload question's file input. */
export function acceptAttribute(question: Question): string {
  return allowedExtensions(question)
    .map((ext) => `.${ext}`)
    .join(",");
}

export function maxFilesFor(question: Question): number {
  return question.maxFiles ?? 1;
}

/**
 * One file checked against its question. Used by the fill page before upload
 * and by the server after, so the two give the same answer.
 */
export function checkFile(
  question: Question,
  file: { name: string; size: number },
  maxBytes: number,
): string | null {
  const ext = extensionOf(file.name);
  if (!allowedExtensions(question).includes(ext)) {
    return `"${file.name}" is not an allowed type for "${question.label}".`;
  }
  if (file.size <= 0) return `"${file.name}" is empty.`;
  if (file.size > maxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)} per file.`;
  }
  return null;
}

export type Answer = string | string[];
export type ResponsePayload = Record<string, Answer>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates one submission against the form that produced it.
 *
 * Required-ness, option membership, length caps, file types, sizes and counts
 * are all re-decided on the server. Anything not in the definition is dropped.
 *
 * Upload questions come back in `files` (to be stored by the caller) rather
 * than in `payload`; the caller writes the stored attachment ids into the
 * payload. `previous` lets a re-submission keep files it did not replace.
 */
export function validateResponse(
  definition: FormDefinition,
  raw: FormData,
  options: { maxBytes?: number; previous?: ResponsePayload | null } = {},
):
  | { ok: true; payload: ResponsePayload; files: Record<string, File[]> }
  | { ok: false; error: string } {
  const payload: ResponsePayload = {};
  const files: Record<string, File[]> = {};
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  let totalBytes = 0;

  for (const question of definition.questions) {
    const field = `q_${question.id}`;

    if (isUpload(question.type)) {
      const picked = raw
        .getAll(field)
        .filter((entry): entry is File => typeof entry === "object" && entry !== null && "size" in entry && (entry as File).size > 0);

      if (picked.length > maxFilesFor(question)) {
        return { ok: false, error: `"${question.label}" takes at most ${maxFilesFor(question)} files.` };
      }
      for (const file of picked) {
        const problem = checkFile(question, file, maxBytes);
        if (problem) return { ok: false, error: problem };
        totalBytes += file.size;
      }

      if (picked.length > 0) {
        files[question.id] = picked;
        continue;
      }

      // Nothing new chosen: keep what an earlier submission stored, unless the
      // person asked to clear it.
      const kept = options.previous?.[question.id];
      const cleared = raw.get(`${field}__clear`) === "1";
      if (!cleared && Array.isArray(kept) && kept.length > 0) {
        payload[question.id] = kept;
        continue;
      }
      if (question.required) return { ok: false, error: `"${question.label}" is required.` };
      continue;
    }

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

  if (totalBytes > MAX_SUBMISSION_BYTES) {
    return {
      ok: false,
      error: `These files add up to ${formatBytes(totalBytes)}. One submission can carry ${formatBytes(MAX_SUBMISSION_BYTES)}.`,
    };
  }

  return { ok: true, payload, files };
}

/**
 * Structural rules a definition must meet beyond its field-level schema.
 * Returns an error message, or null when the definition is fine.
 */
export function checkDefinition(definition: FormDefinition): string | null {
  const seen = new Set<string>();
  for (const question of definition.questions) {
    if (seen.has(question.id)) return "Two questions ended up with the same id. Reload and try again.";
    seen.add(question.id);

    if (TYPES_WITH_OPTIONS.includes(question.type) && question.options.length < 1) {
      return `"${question.label}" needs at least one option.`;
    }
    if (new Set(question.options).size !== question.options.length) {
      return `"${question.label}" has the same option twice.`;
    }
  }
  return null;
}

/** An answer, as text, for the responses table and the CSV export. */
export function answerText(payload: ResponsePayload, question: Question): string {
  const value = payload[question.id];
  if (value === undefined) return "";
  if (isUpload(question.type)) {
    const count = Array.isArray(value) ? value.length : 1;
    return `${count} ${count === 1 ? "file" : "files"}`;
  }
  return Array.isArray(value) ? value.join(", ") : value;
}

/** A short, stable id for a new question. */
export function questionId(index: number): string {
  return `q${index + 1}${Math.random().toString(36).slice(2, 7)}`;
}
