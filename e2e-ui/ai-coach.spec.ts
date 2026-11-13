// AI Coach tab UI (Prompt 16). Every /api call is mocked in the browser, so these run
// without a database or AI key. The mock keeps chat history per client, like the server.
import { expect, test, type Page, type Route, selectClient, openAiCoach } from "./fixtures";

type Msg = { id: string; clientId: string; role: "coach" | "ai"; content: string; createdAt: string };

const CLIENTS = [
  {
    id: "c-maya",
    coachId: null,
    name: "Maya Patel",
    goal: "Fat loss + strength",
    age: 29,
    weightKg: 68,
    heightCm: 165,
    level: "Intermediate",
    focus: "Lower body strength, protein intake",
    notes: "Vegetarian. Trains 4x/week.",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  {
    id: "c-arjun",
    coachId: null,
    name: "Arjun Mehta",
    goal: "Muscle gain",
    age: 24,
    weightKg: 62,
    heightCm: 178,
    level: "Beginner",
    focus: "Upper body, calorie surplus",
    notes: "Student, budget meals.",
    createdAt: "2026-10-02T00:00:00.000Z",
  },
];

/** Lets one test swap the suggestion's details. */
const SUGGESTION_OVERRIDE: { details: string | null } = { details: null };

const SUGGESTION = {
  type: "Workout",
  title: "Lower-body strength session",
  details: "Back squat 4x6\nRomanian deadlift 3x8",
  reasoning: "Builds the lower-body strength Maya is focusing on.",
};

type Mock = {
  chats: Record<string, Msg[]>;
  asked: { clientId: string; question: string }[];
  askBehaviour: "ok" | "fail" | "hold";
  release?: () => void;
};

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = {
    chats: {
      "c-maya": [
        { id: "m1", clientId: "c-maya", role: "coach", content: "How is Maya doing?", createdAt: "2026-11-09T10:00:00.000Z" },
        { id: "m2", clientId: "c-maya", role: "ai", content: "Maya is consistent with training.", createdAt: "2026-11-09T10:00:05.000Z" },
      ],
      "c-arjun": [
        { id: "a1", clientId: "c-arjun", role: "coach", content: "Arjun only question", createdAt: "2026-11-09T11:00:00.000Z" },
      ],
    },
    asked: [],
    askBehaviour: "ok",
  };
  let nextId = 100;

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });

    const chat = path.match(/^\/api\/clients\/([^/]+)\/chat$/);
    if (chat) {
      const clientId = decodeURIComponent(chat[1]);
      if (req.method() === "GET") return route.fulfill({ json: mock.chats[clientId] ?? [] });
      if (req.method() === "POST") {
        const { question } = req.postDataJSON() as { question: string };
        mock.asked.push({ clientId, question });
        if (mock.askBehaviour === "hold") await new Promise<void>((resolve) => (mock.release = resolve));
        if (mock.askBehaviour === "fail") {
          return route.fulfill({ status: 500, json: { error: "Something went wrong on the server." } });
        }
        const now = new Date().toISOString();
        const q: Msg = { id: `m${nextId++}`, clientId, role: "coach", content: question, createdAt: now };
        const r: Msg = { id: `m${nextId++}`, clientId, role: "ai", content: `Answer about ${clientId}: keep going.`, createdAt: now };
        (mock.chats[clientId] ??= []).push(q, r);
        return route.fulfill({ status: 201, json: { question: q, reply: r, suggestion: { ...SUGGESTION, details: SUGGESTION_OVERRIDE.details ?? SUGGESTION.details } } });
      }
    }

    if (req.method() === "GET" && /\/assignments$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const composer = (page: Page) => panel(page).getByRole("textbox", { name: "Ask the AI coach" });
const conversation = (page: Page) => panel(page).getByRole("list", { name: "Conversation" });

test("keeps the existing heading and Selected line", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("AI Coach");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("summary card is one line (goal · level · weight · focus) and More shows every detail", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  const summary = panel(page).getByRole("region", { name: "Client summary" });
  await expect(summary).toContainText("Fat loss + strength · Intermediate · 68 kg · Lower body strength, protein intake");
  // Notes stay behind the disclosure until the coach asks for them.
  await expect(summary).not.toContainText("Vegetarian. Trains 4x/week.");
  const more = summary.getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(summary.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
  for (const text of ["Fat loss + strength", "Intermediate", "68 kg", "Lower body strength, protein intake", "Vegetarian. Trains 4x/week."]) {
    await expect(summary).toContainText(text);
  }
  for (const label of ["Age", "Height", "Notes"]) await expect(summary.getByText(label, { exact: true })).toBeVisible();
  // The client's name is in the client header right above.
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("coach messages sit right in accent colour, AI messages left in a white card", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  const coach = conversation(page).getByText("How is Maya doing?", { exact: true });
  // AI text is formatted (paragraphs, lists) inside its card.
  const ai = conversation(page).getByRole("listitem").filter({ hasText: "Maya is consistent with training." }).locator("> div");
  await expect(coach).toHaveCSS("background-color", "rgb(255, 74, 31)");
  await expect(ai).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const c = (await coach.boundingBox())!;
  const a = (await ai.boundingBox())!;
  expect(c.x + c.width).toBeGreaterThan(a.x + a.width);
  expect(c.x).toBeGreaterThan(a.x);
});

test("quick prompt chips are exactly the four questions (no plan-making chips) and tapping one sends it", async ({ page }) => {
  const mock = await mockApi(page);
  await openAiCoach(page);
  const chips = panel(page).getByRole("group", { name: "Quick prompts" }).getByRole("button");
  await expect(chips).toHaveText([
    "Summarise this client",
    "What changed since the last check-in?",
    "What should I focus on this week?",
    "Any warning signs?",
  ]);
  await chips.nth(1).click();
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  expect(mock.asked).toEqual([{ clientId: "c-maya", question: "What changed since the last check-in?" }]);
});

test("Enter sends, Shift+Enter adds a line", async ({ page }) => {
  const mock = await mockApi(page);
  await openAiCoach(page);
  const box = composer(page);
  await box.fill("Line one");
  await box.press("Shift+Enter");
  await box.pressSequentially("Line two");
  await expect(box).toHaveValue("Line one\nLine two");
  expect(mock.asked).toHaveLength(0);
  await box.press("Enter");
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  expect(mock.asked).toEqual([{ clientId: "c-maya", question: "Line one\nLine two" }]);
  await expect(box).toHaveValue("");
});

test("while waiting, Send is disabled and reads Thinking...", async ({ page }) => {
  const mock = await mockApi(page);
  mock.askBehaviour = "hold";
  await openAiCoach(page);
  await composer(page).fill("Hold on");
  await panel(page).getByRole("button", { name: "Send" }).click();
  await expect(panel(page).getByRole("button", { name: "Thinking..." })).toBeDisabled();
  await expect.poll(() => mock.asked.length).toBe(1);
  mock.askBehaviour = "ok";
  mock.release!();
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  await expect(panel(page).getByRole("button", { name: "Send" })).toBeVisible();
});

test("an AI suggestion shows under the answer with Assign and a working Dismiss", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  await composer(page).fill("Make a workout plan");
  await composer(page).press("Enter");
  const answer = conversation(page).getByText("Answer about c-maya: keep going.", { exact: true });
  const card = panel(page).getByRole("region", { name: "AI suggestion" });
  await expect(card).toContainText("Lower-body strength session");
  await expect(card.getByText("Workout", { exact: true })).toHaveCSS("background-color", "rgb(255, 74, 31)");
  await expect(card).toContainText("Back squat 4x6");
  await expect(card).toContainText("Why: Builds the lower-body strength Maya is focusing on.");
  await expect(card.getByRole("button", { name: "Assign to client" })).toBeEnabled();
  expect((await card.boundingBox())!.y).toBeGreaterThan((await answer.boundingBox())!.y);
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
});

test("a failed send shows the error in the chat and keeps the typed text", async ({ page }) => {
  const mock = await mockApi(page);
  mock.askBehaviour = "fail";
  await openAiCoach(page);
  await composer(page).fill("Will this fail?");
  await composer(page).press("Enter");
  await expect(panel(page).getByRole("alert")).toContainText("The server had a problem");
  await expect(composer(page)).toHaveValue("Will this fail?");
});

test("the chat auto-scrolls to the newest message", async ({ page }) => {
  const mock = await mockApi(page);
  for (let i = 0; i < 30; i++) {
    mock.chats["c-maya"].push({
      id: `x${i}`,
      clientId: "c-maya",
      role: i % 2 ? "ai" : "coach",
      content: `Message number ${i}`,
      createdAt: "2026-11-09T12:00:00.000Z",
    });
  }
  await openAiCoach(page);
  await expect(conversation(page).getByText("Message number 29", { exact: true })).toBeInViewport();
  await composer(page).fill("Newest question");
  await composer(page).press("Enter");
  await expect(conversation(page).getByText("Answer about c-maya: keep going.", { exact: true })).toBeInViewport();
});

test("history survives a reload and each client sees only their own chat", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  // Wait for the saved history first, so typing can't race the chat loading.
  await expect(conversation(page)).toContainText("How is Maya doing?");
  await composer(page).fill("Persist me");
  await composer(page).press("Enter");
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  await page.reload();
  await page.getByRole("tab", { name: "AI Coach" }).click();
  await expect(conversation(page)).toContainText("Persist me");
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  await selectClient(page, "Arjun");
  await expect(conversation(page)).toContainText("Arjun only question");
  await expect(conversation(page)).not.toContainText("Persist me");
  await expect(conversation(page)).not.toContainText("How is Maya doing?");
});

test("AI replies are formatted: bold and bullet lists render, no raw ** marks", async ({ page }) => {
  const mock = await mockApi(page);
  mock.chats["c-maya"].push({
    id: "m3",
    clientId: "c-maya",
    role: "ai",
    content: "For Maya, keep **strength first**:\n- Adherence is 86%\n- Sleep averages 6.5 h",
    createdAt: "2026-11-09T10:01:00.000Z",
  });
  await openAiCoach(page);
  const reply = conversation(page).getByRole("listitem").filter({ hasText: "For Maya, keep" });
  await expect(reply.locator("strong")).toHaveText("strength first");
  await expect(reply.getByRole("listitem")).toHaveText(["Adherence is 86%", "Sleep averages 6.5 h"]);
  await expect(reply).not.toContainText("**");
});

test("a suggested plan shows day headings and each exercise as a row with sets x reps, load and rest", async ({ page }) => {
  await mockApi(page);
  SUGGESTION_OVERRIDE.details = [
    "Day 1 — Push",
    "1. Bench Press — 4 sets × 6 reps · 60 kg · Rest 120s",
    "2. Dips — 3 sets × 10 reps · bodyweight · Rest 90s",
    "3. Incline Dumbbell Press — 3 sets × 8 reps · 25 kg each arm · Rest 90s",
    "Day 2 — Pull",
    "1. Deadlift — 3 sets × 5 reps · 100 kg · Rest 180s",
  ].join("\n");
  await openAiCoach(page);
  await composer(page).fill("Make a push pull week");
  await composer(page).press("Enter");
  const card = panel(page).getByRole("region", { name: "AI suggestion" });
  await expect(card.getByText("Day 1 — Push")).toBeVisible();
  await expect(card.getByText("Day 2 — Pull")).toBeVisible();
  const rows = card.locator('[data-plan-line="exercise"]');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Bench Press");
  await expect(rows.nth(0)).toContainText("4 × 6 · 60 kg · 120s");
  await expect(rows.nth(1)).toContainText("3 × 10 · bodyweight · 90s");
  await expect(rows.nth(2)).toContainText("3 × 8 · 25 kg each arm · 90s");
  await expect(rows.nth(3)).toContainText("3 × 5 · 100 kg · 180s");
  SUGGESTION_OVERRIDE.details = null;
});
