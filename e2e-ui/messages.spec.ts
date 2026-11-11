// Messages tab shell (Prompt 63). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];
const msg = (over: Record<string, unknown>) => ({
  id: "m1",
  coachId: "coach-1",
  clientId: "c-maya",
  sender: "coach",
  body: "How did the session go?",
  createdAt: "2026-11-11T09:00:00.000Z",
  readAt: null,
  ...over,
});

async function openMessages(page: Page, thread: { messages: unknown[]; hasMore: boolean }) {
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/clients/c-maya/messages") {
      calls.push(path);
      return route.fulfill({ json: thread });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Messages" })).toBeVisible();
  return { calls };
}

test("Messages is the 8th tab, after Library, and says it is not live", async ({ page }) => {
  await openMessages(page, { messages: [], hasMore: false });
  await expect(page.getByRole("tab")).toHaveText(["Home", "AI Coach", "Clients", "Manual Planner", "Progress", "Check-ins", "Library", "Messages"]);
  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("Conversation with Maya Patel");
  await expect(panel).toContainText("Not live: messages refresh when you open this tab and every 20 seconds.");
  await expect(panel).toContainText("No messages with Maya Patel yet.");
});

test("shows the thread oldest to newest, as plain text (never HTML)", async ({ page }) => {
  await openMessages(page, {
    messages: [
      msg({ id: "m1" }),
      msg({ id: "m2", sender: "client", body: "<img src=x onerror=alert(1)> Great!\nLegs are sore", createdAt: "2026-11-11T10:00:00.000Z" }),
    ],
    hasMore: false,
  });
  const rows = page.getByRole("list", { name: "Conversation" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("You");
  await expect(rows.first()).toContainText("How did the session go?");
  await expect(rows.nth(1)).toContainText("Maya Patel");
  await expect(rows.nth(1)).toContainText("<img src=x onerror=alert(1)> Great!");
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("says when only the latest 50 are shown", async ({ page }) => {
  await openMessages(page, { messages: [msg({})], hasMore: true });
  await expect(page.getByRole("tabpanel")).toContainText("Showing the latest 50 messages.");
});

test("polls the thread every 20 seconds", async ({ page }) => {
  await page.clock.install();
  const { calls } = await openMessages(page, { messages: [], hasMore: false });
  await expect.poll(() => calls.length).toBe(1);
  await page.clock.fastForward(20_000);
  await expect.poll(() => calls.length).toBe(2);
});

test("a failed refresh keeps the thread on screen", async ({ page }) => {
  await page.clock.install();
  let fail = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/clients/c-maya/messages") {
      return fail ? route.fulfill({ status: 500, json: { error: "down" } }) : route.fulfill({ json: { messages: [msg({})], hasMore: false } });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Messages" }).click();
  const rows = page.getByRole("list", { name: "Conversation" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  fail = true;
  // The next poll fails; a 500 is retried with backoff first, so step past the retries too.
  await page.clock.fastForward(20_000);
  for (let i = 0; i < 6; i++) await page.clock.fastForward(5_000);
  await expect(page.getByRole("tabpanel")).toContainText("Couldn't refresh just now.");
  await expect(rows).toHaveCount(1);
});
