// Messages tab: chat data shell (Prompt 63) and the coach chat UI (Prompt 64). Every /api call is mocked.
import { expect, test, type Page, type Route } from "@playwright/test";

const client = (id: string, name: string) => ({
  id,
  coachId: "coach-1",
  name,
  goal: "Fat loss",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Rao"), client("c-casey", "Casey Lin")];

type Msg = { id: string; coachId: string; clientId: string; sender: "coach" | "client"; body: string; createdAt: string; readAt: string | null };
const msg = (over: Partial<Msg>): Msg => ({
  id: "m1",
  coachId: "coach-1",
  clientId: "c-maya",
  sender: "coach",
  body: "How did the session go?",
  createdAt: "2026-11-11T09:00:00.000Z",
  readAt: null,
  ...over,
});

type Setup = {
  threads?: Record<string, Msg[]>;
  hasMore?: boolean;
  /** Make POSTs fail this many times before succeeding. */
  failSends?: number;
  threadFails?: () => boolean;
  /** Home tab badge count. */
  reviewCount?: number;
};

/** A small fake server: threads per client, unread client messages, and a POST that can fail. */
async function mockServer(page: Page, setup: Setup = {}) {
  const threads: Record<string, Msg[]> = structuredClone(setup.threads ?? {});
  let failSends = setup.failSends ?? 0;
  const posts: string[] = [];
  const threadGets: string[] = [];
  const reviewQueueGets: number[] = [];
  let seq = 100;

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") {
      reviewQueueGets.push(Date.now());
      return route.fulfill({ json: { pendingCount: setup.reviewCount ?? 0, items: [] } });
    }
    if (path === "/api/messages/threads") {
      return route.fulfill({
        json: {
          threads: CLIENTS.map((c) => {
            const list = threads[c.id] ?? [];
            const last = list[list.length - 1];
            return {
              clientId: c.id,
              lastMessage: last ? { sender: last.sender, body: last.body, createdAt: last.createdAt } : null,
              unreadCount: list.filter((m) => m.sender === "client" && m.readAt === null).length,
            };
          }),
        },
      });
    }
    const m = /^\/api\/clients\/([^/]+)\/messages$/.exec(path);
    if (m) {
      const id = m[1];
      if (req.method() === "POST") {
        const body = (req.postDataJSON() as { body: string }).body;
        posts.push(body);
        if (failSends > 0) {
          failSends--;
          return route.fulfill({ status: 503, json: { error: "down" } });
        }
        const saved = msg({ id: `m${++seq}`, clientId: id, body, createdAt: new Date().toISOString() });
        (threads[id] ??= []).push(saved);
        return route.fulfill({ status: 201, json: saved });
      }
      threadGets.push(id);
      if (setup.threadFails?.()) return route.fulfill({ status: 500, json: { error: "down" } });
      // Opening marks the client's messages read, like the real server.
      for (const x of threads[id] ?? []) if (x.sender === "client" && !x.readAt) x.readAt = new Date().toISOString();
      return route.fulfill({ json: { messages: threads[id] ?? [], hasMore: setup.hasMore ?? false } });
    }
    return route.fulfill({ json: [] });
  });
  return { posts, threadGets, reviewQueueGets, threads };
}

async function openMessages(page: Page) {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Messages" })).toBeVisible();
}

const list = (page: Page) => page.getByRole("list", { name: "Clients" });
const pane = (page: Page) => page.getByRole("region", { name: /^Conversation with / });
const box = (page: Page) => page.getByLabel(/^Message to /);

test("Messages is the 8th tab, after Library, says it is not live, and has no client strip", async ({ page }) => {
  await mockServer(page);
  await openMessages(page);
  await expect(page.getByRole("tab")).toHaveText(["Home", "AI Coach", "Clients", "Manual Planner", "Progress", "Check-ins", "Library", "Messages"]);
  await expect(page.getByRole("tabpanel")).toContainText("Not live: messages refresh when you open this tab and every 20 seconds.");
  await expect(page.getByRole("group", { name: "Select client" })).toHaveCount(0);
});

test("client list: names, last-message previews, unread dots, search by name", async ({ page }) => {
  await mockServer(page, {
    threads: {
      "c-maya": [msg({ id: "m1" })],
      "c-arjun": [msg({ id: "a1", clientId: "c-arjun", sender: "client", body: "Can we move Friday?", createdAt: "2026-11-11T11:00:00.000Z" })],
    },
  });
  await openMessages(page);
  const rows = list(page).getByRole("button");
  await expect(rows).toHaveCount(3);
  // Most recent conversation first.
  await expect(rows.first()).toContainText("Arjun Rao");
  await expect(rows.first()).toContainText("Can we move Friday?");
  await expect(list(page).getByRole("button", { name: /Maya Patel/ })).toContainText("You: How did the session go?");
  await expect(list(page).getByRole("button", { name: /Casey Lin/ })).toContainText("No messages yet");
  await expect(list(page).getByRole("button", { name: "Arjun Rao, 1 unread" }).getByTestId("unread-dot")).toBeVisible();

  await page.getByLabel("Search clients by name").fill("cas");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Casey Lin");
  await page.getByLabel("Search clients by name").fill("zzz");
  await expect(page.getByRole("region", { name: "Conversations" })).toContainText('No clients match "zzz".');
});

test("selecting a conversation opens it, marks it read and clears its unread dot", async ({ page }) => {
  const server = await mockServer(page, {
    threads: { "c-arjun": [msg({ id: "a1", clientId: "c-arjun", sender: "client", body: "Can we move Friday?" })] },
  });
  await openMessages(page);
  const arjun = list(page).getByRole("button", { name: /Arjun Rao/ });
  await expect(arjun.getByTestId("unread-dot")).toBeVisible();
  await arjun.click();
  await expect(pane(page)).toHaveAttribute("aria-label", "Conversation with Arjun Rao");
  await expect(pane(page).getByRole("listitem")).toContainText("Can we move Friday?");
  await expect(arjun.getByTestId("unread-dot")).toHaveCount(0);
  await expect(arjun).toHaveAttribute("aria-current", "true");
  expect(server.threadGets).toContain("c-arjun");
  expect(server.threads["c-arjun"][0].readAt).not.toBeNull();
});

test("bubbles: coach on the right, client on the left, rendered as plain text (never HTML)", async ({ page }) => {
  await mockServer(page, {
    threads: {
      "c-maya": [
        msg({ id: "m1" }),
        msg({ id: "m2", sender: "client", body: "<img src=x onerror=alert(1)> Great!\nLegs are sore", createdAt: "2026-11-11T10:00:00.000Z" }),
      ],
    },
  });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  const coach = pane(page).locator('li[data-sender="coach"]');
  const fromClient = pane(page).locator('li[data-sender="client"]');
  await expect(coach).toContainText("How did the session go?");
  await expect(fromClient).toContainText("<img src=x onerror=alert(1)> Great!");
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  const coachBox = await coach.locator("div").first().boundingBox();
  const clientBox = await fromClient.locator("div").first().boundingBox();
  const paneBox = await pane(page).boundingBox();
  // Coach bubble hugs the right edge, client bubble the left.
  expect(coachBox!.x + coachBox!.width).toBeGreaterThan(paneBox!.x + paneBox!.width - 40);
  expect(clientBox!.x).toBeLessThan(paneBox!.x + 40);
  await expect(coach.locator("div").first()).toHaveCSS("background-color", "rgb(14, 124, 107)");
  // The pane says clearly that this is not the AI Coach.
  await expect(pane(page)).toContainText("Client messages - separate from the AI Coach");
});

test("Enter sends; Shift+Enter adds a new line", async ({ page }) => {
  const server = await mockServer(page);
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(pane(page)).toContainText("Start the conversation - your client sees this in their app view.");

  await box(page).fill("Line one");
  await box(page).press("Shift+Enter");
  await box(page).pressSequentially("line two");
  await expect(box(page)).toHaveValue("Line one\nline two");
  expect(server.posts).toEqual([]);

  await box(page).press("Enter");
  await expect(pane(page).locator('li[data-sender="coach"]')).toContainText("line two");
  expect(server.posts).toEqual(["Line one\nline two"]);
  await expect(box(page)).toHaveValue("");
  // The list preview updates to the new last message.
  await expect(list(page).getByRole("button", { name: /Maya Patel/ })).toContainText("You: Line one");
});

test("a failed send shows Retry, and retrying does not duplicate the message", async ({ page }) => {
  const server = await mockServer(page, { failSends: 1 });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await box(page).fill("See you Monday");
  await page.getByRole("button", { name: "Send" }).click();

  const alert = pane(page).getByRole("alert");
  await expect(alert).toContainText("Not sent.");
  await expect(pane(page).locator("li[data-pending='failed']")).toHaveCount(1);

  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(pane(page).getByRole("alert")).toHaveCount(0);
  const bubbles = pane(page).getByRole("listitem").filter({ hasText: "See you Monday" });
  await expect(bubbles).toHaveCount(1); // one bubble, reconciled with the saved message
  await expect(pane(page).locator("li[data-pending]")).toHaveCount(0);
  expect(server.posts).toEqual(["See you Monday", "See you Monday"]);
  expect(server.threads["c-maya"]).toHaveLength(1);
});

test("loading, and a failed first load with Retry", async ({ page }) => {
  let failing = true;
  await mockServer(page, { threadFails: () => failing });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(pane(page).getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 15_000 });
  failing = false;
  await pane(page).getByRole("button", { name: "Retry" }).click();
  await expect(pane(page)).toContainText("Start the conversation");
});

test("says when only the latest 50 are shown", async ({ page }) => {
  await mockServer(page, { threads: { "c-maya": [msg({})] }, hasMore: true });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(pane(page)).toContainText("Showing the latest 50 messages.");
});

test("polls the open thread every 20 seconds, and a failed refresh keeps it on screen", async ({ page }) => {
  await page.clock.install();
  let failing = false;
  const server = await mockServer(page, { threads: { "c-maya": [msg({})] }, threadFails: () => failing });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(pane(page).getByRole("listitem")).toHaveCount(1);
  const before = server.threadGets.length;
  await page.clock.fastForward(20_000);
  await expect.poll(() => server.threadGets.length).toBeGreaterThan(before);

  failing = true;
  await page.clock.fastForward(20_000);
  for (let i = 0; i < 6; i++) await page.clock.fastForward(5_000); // past the retries
  await expect(pane(page)).toContainText("Couldn't refresh just now.");
  await expect(pane(page).getByRole("listitem")).toHaveCount(1);
});

test("chat never changes the Home review-queue count", async ({ page }) => {
  await mockServer(page, { reviewCount: 2, threads: { "c-arjun": [msg({ id: "a1", clientId: "c-arjun", sender: "client", body: "Hi" })] } });
  await openMessages(page);
  // The badge lives on the Home tab button, so it is visible from the Messages tab too.
  const homeBadge = page.getByRole("tab", { name: /Home/ }).getByText("2", { exact: true });
  await expect(homeBadge).toBeVisible();
  await list(page).getByRole("button", { name: /Arjun Rao/ }).click();
  await box(page).fill("Sure");
  await box(page).press("Enter");
  await expect(pane(page).locator('li[data-sender="coach"]')).toContainText("Sure");
  await expect(homeBadge).toBeVisible(); // still 2
});

test("a message sent before the thread finishes loading still shows up", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await mockServer(page);
  // Hold the first thread load open until after the send.
  await page.route("**/api/clients/c-maya/messages", async (route) => {
    if (route.request().method() === "GET") {
      await gate;
    }
    return route.fallback();
  });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await box(page).fill("Early bird");
  await box(page).press("Enter");
  // Shown straight away, before the thread has loaded (and after the server saved it).
  await expect(pane(page).getByRole("listitem").filter({ hasText: "Early bird" })).toHaveCount(1);
  release();
  await expect(pane(page).getByRole("listitem").filter({ hasText: "Early bird" })).toHaveCount(1);
  await expect(pane(page).locator("li[data-pending]")).toHaveCount(0);
});

test("a refresh that read the database before the send can never make the message vanish", async ({ page }) => {
  // The thread GET answers with the state from BEFORE the send, as a poll in flight would.
  const server = await mockServer(page, { threads: { "c-maya": [msg({ id: "m1" })] } });
  let staleNext = 0;
  await page.route("**/api/clients/c-maya/messages", async (route) => {
    if (route.request().method() === "GET" && staleNext > 0) {
      staleNext--;
      return route.fulfill({ json: { messages: [msg({ id: "m1" })], hasMore: false } });
    }
    return route.fallback();
  });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(pane(page).getByRole("listitem")).toHaveCount(1);
  staleNext = 1; // the refetch right after the send returns the old thread
  await box(page).fill("Still here");
  await box(page).press("Enter");
  const sent = pane(page).getByRole("listitem").filter({ hasText: "Still here" });
  await expect(sent).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(sent).toHaveCount(1); // never zero, never two
  expect(server.posts).toEqual(["Still here"]);
});

test("a send that fails after switching client is kept, with Retry, in that conversation", async ({ page }) => {
  let releasePost: () => void = () => {};
  const held = new Promise<void>((r) => (releasePost = r));
  const server = await mockServer(page, { failSends: 1 });
  await page.route("**/api/clients/c-maya/messages", async (route) => {
    if (route.request().method() === "POST") await held;
    return route.fallback();
  });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await box(page).fill("Half-typed thought");
  await box(page).press("Enter");
  // Switch away while the send is still in flight; then it fails.
  await list(page).getByRole("button", { name: /Arjun Rao/ }).click();
  await expect(pane(page)).toHaveAttribute("aria-label", "Conversation with Arjun Rao");
  releasePost();
  // The list tells the coach, and coming back shows the message with Retry.
  await expect(list(page).getByRole("button", { name: /Maya Patel/ })).toContainText("Not sent - open to retry");
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(pane(page).getByRole("alert")).toContainText("Not sent.");
  await pane(page).getByRole("button", { name: "Retry" }).click();
  await expect(pane(page).getByRole("listitem").filter({ hasText: "Half-typed thought" })).toHaveCount(1);
  await expect(pane(page).getByRole("alert")).toHaveCount(0);
  expect(server.posts).toEqual(["Half-typed thought", "Half-typed thought"]);
  expect(server.threads["c-maya"]).toHaveLength(1);
});

test("double-clicking Retry sends once", async ({ page }) => {
  const server = await mockServer(page, { failSends: 1 });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await box(page).fill("Once only");
  await box(page).press("Enter");
  await expect(pane(page).getByRole("alert")).toBeVisible();
  await pane(page).getByRole("button", { name: "Retry" }).dblclick();
  await expect(pane(page).getByRole("listitem").filter({ hasText: "Once only" })).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(server.posts).toEqual(["Once only", "Once only"]); // the first failed try + exactly one retry
  expect(server.threads["c-maya"]).toHaveLength(1);
});

test("a draft is kept per client when switching conversations", async ({ page }) => {
  await mockServer(page);
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await box(page).fill("For Maya");
  await list(page).getByRole("button", { name: /Arjun Rao/ }).click();
  await expect(box(page)).toHaveValue("");
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(box(page)).toHaveValue("For Maya");
});

test("a long emoji preview is never cut in half", async ({ page }) => {
  const body = "🏋️".repeat(70);
  await mockServer(page, { threads: { "c-maya": [msg({ body })] } });
  await openMessages(page);
  const preview = await list(page).getByRole("button", { name: /Maya Patel/ }).locator("span span").nth(1).innerText();
  expect(preview).not.toContain("\uFFFD");
  expect(preview.endsWith("…")).toBe(true);
});

test("leaving the Messages tab keeps a failed message and the draft", async ({ page }) => {
  await mockServer(page, { failSends: 1 });
  await openMessages(page);
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await box(page).fill("Did not go through");
  await box(page).press("Enter");
  await expect(pane(page).getByRole("alert")).toContainText("Not sent.");
  await box(page).fill("Half a draft");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(pane(page).getByRole("alert")).toContainText("Not sent.");
  await expect(box(page)).toHaveValue("Half a draft");
});

