// AI Coach tab UI (Prompt 16). Every /api call is mocked in the browser, so these run
// without a database or AI key. The mock keeps chat history per client, like the server.
import { expect, test, type Page, type Route } from "@playwright/test";

type Msg = { id: string; clientId: string; role: "coach" | "ai"; content: string; createdAt: string };

const CLIENTS = [
  {
    id: "c-maya",
    coachId: "default-coach",
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
    coachId: "default-coach",
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
        return route.fulfill({ status: 201, json: { question: q, reply: r, suggestion: SUGGESTION } });
      }
    }

    if (req.method() === "GET" && /\/assignments$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const composer = (page: Page) => panel(page).getByRole("textbox", { name: "Ask the AI coach" });
const conversation = (page: Page) => panel(page).getByRole("list", { name: "Conversation" });

test("keeps the existing heading and Selected line", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("AI Coach");
  await expect(panel(page)).toContainText("Selected: Maya Patel");
});

test("summary card shows whose data the AI is using", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const summary = panel(page).getByRole("region", { name: "Client summary" });
  for (const text of [
    "Maya Patel",
    "Fat loss + strength",
    "Intermediate",
    "68 kg",
    "Lower body strength, protein intake",
    "Vegetarian. Trains 4x/week.",
  ]) {
    await expect(summary).toContainText(text);
  }
});

test("coach messages sit right in accent colour, AI messages left in a white card", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const coach = conversation(page).getByText("How is Maya doing?", { exact: true });
  const ai = conversation(page).getByText("Maya is consistent with training.", { exact: true });
  await expect(coach).toHaveCSS("background-color", "rgb(255, 74, 31)");
  await expect(ai).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const c = (await coach.boundingBox())!;
  const a = (await ai.boundingBox())!;
  expect(c.x + c.width).toBeGreaterThan(a.x + a.width);
  expect(c.x).toBeGreaterThan(a.x);
});

test("quick prompt chips are exactly the four prompts and tapping one sends it", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  const chips = panel(page).getByRole("group", { name: "Quick prompts" }).getByRole("button");
  await expect(chips).toHaveText([
    "Summarise this client",
    "What should I focus on this week?",
    "Make a workout plan",
    "Make a nutrition plan",
  ]);
  await chips.nth(2).click();
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  expect(mock.asked).toEqual([{ clientId: "c-maya", question: "Make a workout plan" }]);
});

test("Enter sends, Shift+Enter adds a line", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
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
  await page.goto("/app");
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
  await page.goto("/app");
  await panel(page).getByRole("button", { name: "Make a workout plan" }).click();
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
  await page.goto("/app");
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
  await page.goto("/app");
  await expect(conversation(page).getByText("Message number 29", { exact: true })).toBeInViewport();
  await composer(page).fill("Newest question");
  await composer(page).press("Enter");
  await expect(conversation(page).getByText("Answer about c-maya: keep going.", { exact: true })).toBeInViewport();
});

test("history survives a reload and each client sees only their own chat", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  // Wait for the saved history first, so typing can't race the chat loading.
  await expect(conversation(page)).toContainText("How is Maya doing?");
  await composer(page).fill("Persist me");
  await composer(page).press("Enter");
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  await page.reload();
  await expect(conversation(page)).toContainText("Persist me");
  await expect(conversation(page)).toContainText("Answer about c-maya: keep going.");
  await page.getByRole("group", { name: "Select client" }).getByRole("button", { name: /Arjun/ }).click();
  await expect(conversation(page)).toContainText("Arjun only question");
  await expect(conversation(page)).not.toContainText("Persist me");
  await expect(conversation(page)).not.toContainText("How is Maya doing?");
});
