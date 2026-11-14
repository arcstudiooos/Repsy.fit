// Form questions and answers (Inspo C1/C2, Nov 2026).
//
// `Form.questions` and `FormSubmission.answers` are JSONB, so this module is the ONLY thing standing
// between a coach's form and the database. Everything read out of Json is parsed through here too:
// a column typed Json is a column that can hold anything, including whatever an older release wrote.
import { z } from "zod";

/** The question types a coach can build with. Each renders differently in the form. */
export const QUESTION_TYPES = ["single", "multi", "text", "longtext", "number", "date", "scale"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types whose answer is chosen from `options`. */
export const CHOICE_TYPES: readonly QuestionType[] = ["single", "multi"];

export const QuestionSchema = z
  .object({
    /** Stable across edits: an answer is stored against it, so renaming a label must not orphan it. */
    id: z
      .string({ error: "Every question needs an id." })
      .trim()
      .min(1, "Every question needs an id.")
      .max(40, "A question id must be 40 characters or fewer.")
      .regex(/^[a-zA-Z0-9_-]+$/, "A question id can hold letters, numbers, hyphens and underscores only."),
    type: z.enum(QUESTION_TYPES, { error: `A question type must be one of: ${QUESTION_TYPES.join(", ")}.` }),
    label: z
      .string({ error: "Every question needs a label." })
      .trim()
      .min(1, "Every question needs a label.")
      .max(300, "A question must be 300 characters or fewer."),
    /** Shown under the label, for the awkward questions. */
    help: z.string().trim().max(300, "Help text must be 300 characters or fewer.").default(""),
    required: z.boolean().default(true),
    options: z
      .array(z.string().trim().min(1, "An option cannot be blank.").max(120, "An option must be 120 characters or fewer."))
      .max(30, "A question can offer at most 30 options.")
      .default([]),
  })
  .refine((q) => !CHOICE_TYPES.includes(q.type) || q.options.length >= 2, {
    error: "A choice question needs at least two options.",
  })
  .refine((q) => CHOICE_TYPES.includes(q.type) || q.options.length === 0, {
    error: "Only a single-choice or multiple-choice question can have options.",
  });
export type FormQuestion = z.infer<typeof QuestionSchema>;

export const FormSchema = z.object({
  name: z
    .string({ error: "Give the form a name." })
    .trim()
    .min(1, "Give the form a name.")
    .max(120, "A form name must be 120 characters or fewer."),
  description: z.string().trim().max(500, "A description must be 500 characters or fewer.").default(""),
  questions: z
    .array(QuestionSchema)
    .max(60, "A form can hold at most 60 questions.")
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { error: "Two questions share the same id." })
    .default([]),
  active: z.boolean().default(true),
});

/**
 * Reads questions back out of the Json column.
 *
 * Anything that does not parse is DROPPED rather than thrown: one bad question written by an older
 * release must not make a form unopenable, and a coach would rather see nine questions than an
 * error page. The dropped count is returned so the caller can say so if it matters.
 */
export function readQuestions(value: unknown): { questions: FormQuestion[]; dropped: number } {
  if (!Array.isArray(value)) return { questions: [], dropped: 0 };
  const questions: FormQuestion[] = [];
  let dropped = 0;
  for (const raw of value) {
    const parsed = QuestionSchema.safeParse(raw);
    if (parsed.success) questions.push(parsed.data);
    else dropped += 1;
  }
  return { questions, dropped };
}

/** One answer: a string, or a list of them for a multiple choice. */
const AnswerSchema = z.union([z.string().max(5000), z.array(z.string().max(500)).max(30)]);

export const AnswersSchema = z.record(z.string().max(40), AnswerSchema);
export type Answers = z.infer<typeof AnswersSchema>;

/** Reads answers back out of the Json column, dropping anything unrecognisable. */
export function readAnswers(value: unknown): Answers {
  const parsed = AnswersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** True when this answer counts as given (a blank string or empty list does not). */
export const isAnswered = (answer: unknown): boolean =>
  typeof answer === "string" ? answer.trim() !== "" : Array.isArray(answer) && answer.length > 0;

/**
 * Checks a set of answers against the questions asked.
 *
 * Returns the first problem in plain words, or null. An answer to a choice question must be one of
 * its options - a client cannot submit an option the coach never offered.
 */
export function answerProblem(questions: FormQuestion[], answers: Answers): string | null {
  for (const q of questions) {
    const answer = answers[q.id];
    const given = isAnswered(answer);
    if (q.required && !given) return `"${q.label}" needs an answer.`;
    if (!given) continue;

    if (q.type === "multi") {
      if (!Array.isArray(answer)) return `"${q.label}" needs one or more of the choices.`;
      const unknown = answer.find((a) => !q.options.includes(a));
      if (unknown !== undefined) return `"${unknown}" is not one of the choices for "${q.label}".`;
    } else if (Array.isArray(answer)) {
      return `"${q.label}" takes a single answer.`;
    } else if (q.type === "single") {
      if (!q.options.includes(answer)) return `"${answer}" is not one of the choices for "${q.label}".`;
    } else if (q.type === "number" || q.type === "scale") {
      if (!Number.isFinite(Number(answer))) return `"${q.label}" needs a number.`;
    } else if (q.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(answer)) return `"${q.label}" needs a date.`;
    }
  }
  return null;
}
