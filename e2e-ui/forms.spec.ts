// Forms: the list, the builder and the answers (Inspo C1/C2, Nov 2026) in Business -> Forms.
//
// Repsy had no forms at all before this, so these cover the whole journey: a sample is read-only and
// copied to change, a form can be built from scratch, answers are checked, and an answer stays
// readable against the questions AS ASKED even after the form has been edited.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Strength", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

const q = (id: string, type: string, label: string, options: string[] = [], required = true) => ({
  id,
  type,
  label,
  help: "",
  required,
  options,
});

const SAMPLE = {
  id: "frm_client_intake",
  name: "Client intake",
  description: "The first form a new client fills in.",
  questions: [q("age", "single", "What is your age?", ["Under 18", "18-24", "25-34"]), q("goal", "longtext", "What is your goal?", [], false)],
  active: true,
  sample: true,
  createdAt: "2026-11-01T00:00:00.000Z",
  submissionCount: 0,
};

const MINE = {
  id: "f1",
  name: "My check-in",
  description: "",
  questions: [q("mood", "single", "How do you feel?", ["Great", "Fine", "Rough"])],
  active: true,
  sample: false,
  createdAt: "2026-11-10T00:00:00.000Z",
  submissionCount: 2,
};

async function openForms(page: Page, forms: unknown[] = [SAMPLE], submissions: unknown[] = []) {
  const posted: { url: string; body: unknown }[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: CLIENTS }));
  await page.route("**/api/forms**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== "GET") {
      posted.push({ url: url.pathname, body: req.postDataJSON() });
      if (url.pathname.endsWith("/copy")) {
        return route.fulfill({ status: 201, json: { ...SAMPLE, id: "copy1", name: "Client intake (copy)", sample: false } });
      }
      if (url.pathname.endsWith("/submissions")) return route.fulfill({ status: 201, json: { id: "s1", createdAt: "x" } });
      return route.fulfill({ status: 201, json: { ...MINE, id: "new", name: (req.postDataJSON() as { name: string }).name } });
    }
    if (url.pathname.endsWith("/submissions")) return route.fulfill({ status: 200, json: submissions });
    return route.fulfill({ status: 200, json: forms });
  });

  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Forms" }).click();
  await expect(page.getByRole("region", { name: "Forms" })).toBeVisible();
  return { posted };
}

test("Repsy's sample forms are there on day one, badged and read-only", async ({ page }) => {
  await openForms(page);
  const card = page.getByRole("listitem").filter({ hasText: "Client intake" });
  await expect(card.getByText("Repsy")).toBeVisible();
  await expect(card).toContainText("2 questions");
  await expect(card.getByRole("button", { name: "Copy to my forms" })).toBeVisible();
  // A shared form cannot be edited or deleted.
  await expect(card.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("the empty state points at the samples instead of leaving a blank page", async ({ page }) => {
  await openForms(page);
  await expect(page.getByText(/None of your own yet/)).toBeVisible();
});

test("copying a sample opens it as the coach's own, ready to change", async ({ page }) => {
  const { posted } = await openForms(page);
  await page.getByRole("button", { name: "Copy to my forms" }).click();
  expect(posted.map((p) => p.url)).toContain("/api/forms/frm_client_intake/copy");
  // It lands straight in the builder.
  await expect(page.getByRole("form", { name: "Edit form" })).toBeVisible();
  await expect(page.getByLabel("Form name")).toHaveValue("Client intake (copy)");
});

test("a form is built question by question, and a collapsed row says what it is", async ({ page }) => {
  const { posted } = await openForms(page);
  await page.getByRole("button", { name: "New form" }).click();
  const builder = page.getByRole("form", { name: "New form" });
  await builder.getByLabel("Form name").fill("Readiness");
  await builder.getByRole("button", { name: "Add a question" }).click();
  await builder.getByLabel("Question", { exact: true }).fill("How is your sleep?");
  await builder.getByLabel("Answer type").selectOption("single");
  await builder.getByLabel("Choice 1").fill("Good");
  await builder.getByLabel("Choice 2").fill("Bad");
  // Collapse it: the row still says the type and whether it is required.
  await builder.getByRole("button", { name: /How is your sleep\?/ }).click();
  await expect(builder.getByText(/Pick one · Required/)).toBeVisible();

  await builder.getByRole("button", { name: "Save form" }).click();
  const body = posted.find((p) => p.url === "/api/forms")?.body as { name: string; questions: { label: string; options: string[] }[] };
  expect(body.name).toBe("Readiness");
  expect(body.questions[0].label).toBe("How is your sleep?");
  expect(body.questions[0].options).toEqual(["Good", "Bad"]);
});

test("a choice question with fewer than two options is refused before any request", async ({ page }) => {
  const { posted } = await openForms(page);
  await page.getByRole("button", { name: "New form" }).click();
  const builder = page.getByRole("form", { name: "New form" });
  await builder.getByLabel("Form name").fill("Half done");
  await builder.getByRole("button", { name: "Add a question" }).click();
  await builder.getByLabel("Question", { exact: true }).fill("Pick something");
  await builder.getByLabel("Answer type").selectOption("single");
  await builder.getByLabel("Choice 1").fill("Only one");
  await builder.getByRole("button", { name: "Save form" }).click();
  await expect(builder.getByRole("alert")).toContainText("at least two options");
  expect(posted.filter((p) => p.url === "/api/forms")).toHaveLength(0);
});

test("a question with no label is refused, naming which one", async ({ page }) => {
  await openForms(page);
  await page.getByRole("button", { name: "New form" }).click();
  const builder = page.getByRole("form", { name: "New form" });
  await builder.getByLabel("Form name").fill("Nameless");
  await builder.getByRole("button", { name: "Add a question" }).click();
  await builder.getByRole("button", { name: "Save form" }).click();
  await expect(builder.getByRole("alert")).toContainText("Question 1 needs a label");
});

test("questions reorder by button, with no dragging", async ({ page }) => {
  const { posted } = await openForms(page);
  await page.getByRole("button", { name: "New form" }).click();
  const builder = page.getByRole("form", { name: "New form" });
  await builder.getByLabel("Form name").fill("Two questions");
  await builder.getByRole("button", { name: "Add a question" }).click();
  await builder.getByLabel("Question", { exact: true }).fill("First");
  // Adding another question closes this one: only one is ever open, so there is nothing to collapse.
  await builder.getByRole("button", { name: "Add a question" }).click();
  await builder.getByLabel("Question", { exact: true }).fill("Second");
  await builder.getByRole("button", { name: "Up" }).nth(1).click();
  await builder.getByRole("button", { name: "Save form" }).click();
  const body = posted.find((p) => p.url === "/api/forms")?.body as { questions: { label: string }[] };
  expect(body.questions.map((x) => x.label)).toEqual(["Second", "First"]);
});

test("filling a form in for a client sends the answers", async ({ page }) => {
  const { posted } = await openForms(page, [MINE]);
  await page.getByRole("button", { name: "Fill in" }).click();
  const form = page.getByRole("form", { name: "Fill in My check-in" });
  await expect(form.getByLabel("Which client")).toHaveValue("c-maya");
  await form.getByLabel("How do you feel?").selectOption("Great");
  await form.getByRole("button", { name: "Save answers" }).click();
  const sent = posted.find((p) => p.url === "/api/forms/f1/submissions")?.body as { clientId: string; answers: Record<string, string> };
  expect(sent).toMatchObject({ clientId: "c-maya", answers: { mood: "Great" } });
});

test("a multiple-choice answer collects several, as chips", async ({ page }) => {
  const multi = { ...MINE, questions: [q("goals", "multi", "Your goals?", ["Fat loss", "Strength", "Health"])] };
  const { posted } = await openForms(page, [multi]);
  await page.getByRole("button", { name: "Fill in" }).click();
  const group = page.getByRole("group", { name: "Your goals?" });
  await group.getByRole("button", { name: "Fat loss" }).click();
  await group.getByRole("button", { name: "Health" }).click();
  // Tapping again takes it off.
  await group.getByRole("button", { name: "Health" }).click();
  await group.getByRole("button", { name: "Health" }).click();
  await page.getByRole("button", { name: "Save answers" }).click();
  const sent = posted.find((p) => p.url.endsWith("/submissions"))?.body as { answers: { goals: string[] } };
  expect(sent.answers.goals).toEqual(["Fat loss", "Health"]);
});

test("the answers are read against the questions as they were asked", async ({ page }) => {
  // The form has since changed its question, but the submission snapshotted the old one.
  const changed = { ...MINE, questions: [q("mood", "single", "A completely different question now?", ["x", "y"])] };
  await openForms(page, [changed], [
    {
      id: "s1",
      clientId: "c-maya",
      clientName: "Maya Patel",
      answers: { mood: "Great", gone: "an answer to a deleted question" },
      asked: [q("mood", "single", "How do you feel?", ["Great", "Fine", "Rough"]), q("gone", "text", "A question since removed")],
      createdAt: "2026-11-12T00:00:00.000Z",
    },
  ]);
  await page.getByRole("button", { name: "See answers" }).click();
  const answers = page.getByRole("region", { name: "Answers to My check-in" });
  // Nov 2026: the list is one row per submission; the answers open in a dialog. Every submission
  // used to render every question inline, which made a 12-question form unscannable.
  await expect(answers).toContainText("Maya Patel");
  await expect(answers).toContainText("2 of 2 answered");
  await answers.getByRole("button", { name: "View answers from Maya Patel" }).click();
  const one = page.getByRole("dialog", { name: "Maya Patel" });
  // The ORIGINAL wording, not the form's current question.
  await expect(one).toContainText("How do you feel?");
  await expect(one).toContainText("Great");
  await expect(one).not.toContainText("A completely different question now?");
  // And a question since deleted still shows its answer.
  await expect(one).toContainText("A question since removed");
});

test("deleting a form warns how many answers go with it", async ({ page }) => {
  await openForms(page, [MINE]);
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText('Delete "My check-in"?');
  await expect(dialog).toContainText("2 answers");
  await expect(dialog).toContainText("cannot be undone");
});

test("an empty answers list says so plainly", async ({ page }) => {
  await openForms(page, [MINE], []);
  await page.getByRole("button", { name: "See answers" }).click();
  await expect(page.getByText("Nobody has filled this in yet.")).toBeVisible();
});

/**
 * Nov 2026: submissions are a scannable list, and the answers open in a dialog that walks the
 * batch. Every submission used to render every question inline, so a 12-question form filled in by
 * 10 clients was an unscannable wall - and reading the next reply meant losing your place.
 */
const sub = (id: string, clientName: string, day: string, answers: Record<string, string>) => ({
  id,
  clientId: `c-${id}`,
  clientName,
  answers,
  asked: [q("mood", "single", "How do you feel?", ["Great", "Fine", "Rough"]), q("why", "text", "Why?", [], false)],
  createdAt: `2026-11-${day}T00:00:00.000Z`,
});

const THREE = [
  sub("s1", "Maya Patel", "10", { mood: "Rough", why: "Left knee" }),
  sub("s2", "Arjun Rao", "11", { mood: "Fine", why: "" }),
  sub("s3", "Leo Brooks", "12", { mood: "Great", why: "Good week" }),
];

test("the submissions list is one row each, with how much was filled in", async ({ page }) => {
  await openForms(page, [MINE], THREE);
  await page.getByRole("button", { name: "See answers" }).click();
  const region = page.getByRole("region", { name: "Answers to My check-in" });
  await expect(region.getByRole("list", { name: "Submissions" }).getByRole("listitem")).toHaveCount(3);
  // The answers are NOT in the list; how much was answered IS, because that decides what to open.
  await expect(region).not.toContainText("Left knee");
  await expect(region).toContainText("2 of 2 answered");
  await expect(region).toContainText("1 of 2 answered");
});

test("Next and Previous walk the batch without closing, and stop at both ends", async ({ page }) => {
  await openForms(page, [MINE], THREE);
  await page.getByRole("button", { name: "See answers" }).click();
  await page.getByRole("button", { name: "View answers from Maya Patel" }).click();

  const maya = page.getByRole("dialog", { name: "Maya Patel" });
  await expect(maya).toContainText("1 of 3");
  await expect(maya).toContainText("Left knee");
  await expect(maya.getByRole("button", { name: "Previous" })).toBeDisabled();

  await maya.getByRole("button", { name: "Next" }).click();
  const arjun = page.getByRole("dialog", { name: "Arjun Rao" });
  await expect(arjun).toContainText("2 of 3");
  // An unanswered question says so rather than leaving an empty row.
  await expect(arjun).toContainText("not answered");

  await arjun.getByRole("button", { name: "Next" }).click();
  const leo = page.getByRole("dialog", { name: "Leo Brooks" });
  await expect(leo).toContainText("3 of 3");
  // The end of the batch is visible, instead of silently wrapping round to the first again.
  await expect(leo.getByRole("button", { name: "Next" })).toBeDisabled();

  await leo.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByRole("dialog", { name: "Arjun Rao" })).toBeVisible();
});

test("a submission can be read and left with the keyboard alone", async ({ page }) => {
  await openForms(page, [MINE], THREE);
  await page.getByRole("button", { name: "See answers" }).click();
  const trigger = page.getByRole("button", { name: "View answers from Maya Patel" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const maya = page.getByRole("dialog", { name: "Maya Patel" });
  await expect(maya).toBeVisible();

  await maya.getByRole("button", { name: "Next" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Arjun Rao" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Arjun Rao" })).toHaveCount(0);
  // Back on the row they opened, so the next one is a Tab away - not thrown to the top.
  await expect(trigger).toBeFocused();
});

test("closing a submission leaves the list where it was, not back on the forms list", async ({ page }) => {
  await openForms(page, [MINE], THREE);
  await page.getByRole("button", { name: "See answers" }).click();
  await page.getByRole("button", { name: "View answers from Leo Brooks" }).click();
  await page.getByRole("dialog", { name: "Leo Brooks" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Submissions" }).getByRole("listitem")).toHaveCount(3);
});
