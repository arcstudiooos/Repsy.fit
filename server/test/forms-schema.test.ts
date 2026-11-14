// Form questions, answers and validation (Inspo C1/C2, Nov 2026).
//
// `questions` and `answers` are JSONB columns, so this module is the only thing between a coach's
// form and the database - and the only thing protecting a read from whatever an older release
// happened to write. Both directions are tested here.
import { describe, expect, it } from "vitest";
import {
  AnswersSchema,
  CHOICE_TYPES,
  FormSchema,
  QUESTION_TYPES,
  answerProblem,
  isAnswered,
  readAnswers,
  readQuestions,
  type FormQuestion,
} from "../src/forms/schema.js";

const q = (over: Partial<FormQuestion> = {}): FormQuestion => ({
  id: "goal",
  type: "text",
  label: "What is your goal?",
  help: "",
  required: true,
  options: [],
  ...over,
});

const choice = (over: Partial<FormQuestion> = {}) =>
  q({ id: "age", type: "single", label: "Your age?", options: ["18-24", "25-34"], ...over });

describe("FormSchema", () => {
  it("accepts a form and fills the defaults", () => {
    const parsed = FormSchema.parse({ name: "Intake", questions: [{ id: "a", type: "text", label: "Name?" }] });
    expect(parsed).toMatchObject({ description: "", active: true });
    expect(parsed.questions[0]).toMatchObject({ required: true, options: [], help: "" });
  });

  it("needs a name and a label, in plain words", () => {
    const noName = FormSchema.safeParse({ name: "  " });
    expect(noName.success).toBe(false);
    if (!noName.success) expect(noName.error.issues[0].message).toBe("Give the form a name.");

    const noLabel = FormSchema.safeParse({ name: "F", questions: [{ id: "a", type: "text", label: "" }] });
    expect(noLabel.success).toBe(false);
    if (!noLabel.success) expect(noLabel.error.issues[0].message).toBe("Every question needs a label.");
  });

  it("refuses two questions with the same id, because an answer is stored against it", () => {
    const dup = FormSchema.safeParse({
      name: "F",
      questions: [
        { id: "a", type: "text", label: "One" },
        { id: "a", type: "text", label: "Two" },
      ],
    });
    expect(dup.success).toBe(false);
    if (!dup.success) expect(dup.error.issues.some((i) => i.message === "Two questions share the same id.")).toBe(true);
  });

  it("refuses a question id with spaces or punctuation", () => {
    for (const id of ["my question", "a.b", "a/b", ""]) {
      expect(FormSchema.safeParse({ name: "F", questions: [{ id, type: "text", label: "x" }] }).success).toBe(false);
    }
  });

  it("insists a choice question offers at least two options", () => {
    for (const type of CHOICE_TYPES) {
      const one = FormSchema.safeParse({ name: "F", questions: [{ id: "a", type, label: "x", options: ["only"] }] });
      expect(one.success, `${type} with one option was accepted`).toBe(false);
      const two = FormSchema.safeParse({ name: "F", questions: [{ id: "a", type, label: "x", options: ["a", "b"] }] });
      expect(two.success).toBe(true);
    }
  });

  it("refuses options on a question that cannot use them", () => {
    const bad = FormSchema.safeParse({
      name: "F",
      questions: [{ id: "a", type: "text", label: "x", options: ["a", "b"] }],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts every question type", () => {
    for (const type of QUESTION_TYPES) {
      const options = CHOICE_TYPES.includes(type) ? ["a", "b"] : [];
      expect(FormSchema.safeParse({ name: "F", questions: [{ id: "a", type, label: "x", options }] }).success, type).toBe(true);
    }
  });

  it("refuses a type it does not know", () => {
    expect(FormSchema.safeParse({ name: "F", questions: [{ id: "a", type: "signature", label: "x" }] }).success).toBe(false);
  });
});

describe("readQuestions: a Json column can hold anything", () => {
  it("reads good questions back", () => {
    const { questions, dropped } = readQuestions([{ id: "a", type: "text", label: "Name?" }]);
    expect(questions).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it("DROPS a broken question rather than throwing, so a form stays openable", () => {
    // The whole point: nine good questions beat an error page.
    const { questions, dropped } = readQuestions([
      { id: "a", type: "text", label: "Good" },
      { id: "b", type: "tarot", label: "Written by a release that no longer exists" },
      { nonsense: true },
      null,
    ]);
    expect(questions.map((x) => x.id)).toEqual(["a"]);
    expect(dropped).toBe(3);
  });

  it("copes with a column that is not even a list", () => {
    for (const value of [null, undefined, {}, "[]", 42]) {
      expect(readQuestions(value)).toEqual({ questions: [], dropped: 0 });
    }
  });
});

describe("readAnswers", () => {
  it("reads strings and lists", () => {
    expect(readAnswers({ a: "yes", b: ["x", "y"] })).toEqual({ a: "yes", b: ["x", "y"] });
  });

  it("falls back to empty rather than throwing on junk", () => {
    for (const value of [null, "nope", 42, { a: { nested: true } }, { a: [1, 2] }]) {
      expect(readAnswers(value)).toEqual({});
    }
  });
});

describe("isAnswered", () => {
  it("treats blank and empty as not answered", () => {
    expect(isAnswered("")).toBe(false);
    expect(isAnswered("   ")).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered("no")).toBe(true);
    expect(isAnswered(["a"])).toBe(true);
  });
});

describe("answerProblem", () => {
  it("passes a complete set", () => {
    expect(answerProblem([q(), choice()], { goal: "Get strong", age: "25-34" })).toBeNull();
  });

  it("names the question that is missing", () => {
    expect(answerProblem([q({ label: "Your goal?" })], {})).toBe('"Your goal?" needs an answer.');
  });

  it("lets an optional question go unanswered", () => {
    expect(answerProblem([q({ required: false })], {})).toBeNull();
  });

  it("refuses a choice the coach never offered", () => {
    // Someone posting straight at the API must not be able to invent an option.
    expect(answerProblem([choice()], { age: "90+" })).toBe('"90+" is not one of the choices for "Your age?".');
    expect(answerProblem([choice({ type: "multi" })], { age: ["18-24", "invented"] })).toBe(
      '"invented" is not one of the choices for "Your age?".',
    );
  });

  it("accepts several answers only where several were asked for", () => {
    expect(answerProblem([choice({ type: "multi" })], { age: ["18-24", "25-34"] })).toBeNull();
    expect(answerProblem([choice()], { age: ["18-24", "25-34"] })).toContain("takes a single answer");
  });

  it("checks a number and a date", () => {
    expect(answerProblem([q({ id: "n", type: "number", label: "How many?" })], { n: "not a number" })).toBe(
      '"How many?" needs a number.',
    );
    expect(answerProblem([q({ id: "n", type: "number", label: "How many?" })], { n: "12" })).toBeNull();
    expect(answerProblem([q({ id: "d", type: "date", label: "When?" })], { d: "soon" })).toBe('"When?" needs a date.');
    expect(answerProblem([q({ id: "d", type: "date", label: "When?" })], { d: "2026-11-15" })).toBeNull();
  });

  it("ignores an answer to a question that is no longer asked", () => {
    // The form was edited after this was filled in; the stale answer must not block anything.
    expect(answerProblem([q()], { goal: "Get strong", removedQuestion: "old answer" })).toBeNull();
  });

  it("treats whitespace as unanswered for a required question", () => {
    expect(answerProblem([q()], { goal: "   " })).toBe('"What is your goal?" needs an answer.');
  });
});

describe("AnswersSchema", () => {
  it("refuses an answer shape the database should never hold", () => {
    expect(AnswersSchema.safeParse({ a: { nested: true } }).success).toBe(false);
    expect(AnswersSchema.safeParse({ a: [1, 2, 3] }).success).toBe(false);
    expect(AnswersSchema.safeParse({ a: "fine", b: ["also", "fine"] }).success).toBe(true);
  });
});
