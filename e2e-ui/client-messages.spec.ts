// Prompt 82: the client's Messages tab - thread, composer (Enter sends, Shift+Enter new line), polling,
// unread badge, failed send with Retry, and the empty / error states.
import { expect, test, type Page } from "@playwright/test";

type Msg = { id: string; sender: "coach" | "client"; body: string; createdAt: string; readAt: string | null };

async function mock(page: Page, opts: { messages?: Msg[]; unread?: number; failPost?: number; failGet?: boolean; noCoach?: boolean } = {}) {
  const state = { messages: [...(opts.messages ?? [])], unread: opts.unread ?? 0, posts: [] as unknown[], gets: 0, failPost: opts.failPost ?? 0 };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "active", coachName: "Anna Rivers", needsWelcome: false } });
    if (path === "/api/client-auth/my-messages/unread") return route.fulfill({ json: { count: state.unread } });
    if (path === "/api/client-auth/my-messages" && req.method() === "GET") {
      state.gets++;
      if (opts.failGet) return route.fulfill({ status: 500, json: { error: "Something went wrong on our side. Please try again." } });
      state.unread = 0;
      return route.fulfill({ json: opts.noCoach ? { messages: [], hasCoach: false } : { messages: state.messages, hasCoach: true } });
    }
    if (path === "/api/client-auth/my-messages" && req.method() === "POST") {
      state.posts.push(req.postDataJSON());
      if (state.failPost > 0) {
        state.failPost--;
        return route.fulfill({ status: 500, json: { error: "Something went wrong on our side. Please try again." } });
      }
      const m: Msg = { id: `s${state.messages.length}`, sender: "client", body: (req.postDataJSON() as { body: string }).body, createdAt: new Date().toISOString(), readAt: null };
      state.messages.push(m);
      return route.fulfill({ status: 201, json: m });
    }
    if (path === "/api/client-auth/my-assignments") return route.fulfill({ json: [] });
    if (path === "/api/client-auth/my-habits") return route.fulfill({ json: { date: "", days: [], habits: [] } });
    if (path.startsWith("/api/client-auth/my-checkins/")) return route.fulfill({ json: { checkIn: null } });
    if (path === "/api/client-auth/my-targets") return route.fulfill({ json: { calorieTarget: null, proteinTargetG: null, weeklyCheckInDay: 0 } });
    if (path === "/api/client-auth/my-sessions") return route.fulfill({ json: { sessions: [] } });
    if (path === "/api/client-auth/my-streaks") return route.fulfill({ json: { date: "", checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return state;
}

const T = "2026-11-12T09:00:00.000Z";

test("the Messages tab shows an unread badge until the client opens the thread", async ({ page }) => {
  await mock(page, { unread: 2, messages: [{ id: "1", sender: "coach", body: "How was leg day?", createdAt: T, readAt: null }] });
  await page.goto("/client");
  const tab = page.getByRole("navigation", { name: "Client app", exact: true }).getByRole("link", { name: /Messages/ });
  await expect(tab).toHaveAccessibleName("Messages , 2 unread");
  await tab.click();
  await expect(page).toHaveURL(/\/client\/messages$/);
  await expect(page.getByRole("list", { name: "Messages" })).toContainText("How was leg day?");
  await expect(tab).toHaveAccessibleName("Messages");
  await expect(page).toHaveTitle("Messages - Repsy");
});

test("Enter sends, Shift+Enter makes a new line; the message appears once", async ({ page }) => {
  const state = await mock(page, { messages: [{ id: "1", sender: "coach", body: "Hi Maya", createdAt: T, readAt: null }] });
  await page.goto("/client/messages");
  const box = page.getByLabel("Message to Anna Rivers");
  await box.fill("Line one");
  await box.press("Shift+Enter");
  await box.pressSequentially("Line two");
  await expect(box).toHaveValue("Line one\nLine two");
  await box.press("Enter");
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
  const list = page.getByRole("list", { name: "Messages" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").last()).toContainText("Line one\nLine two");
  expect(state.posts).toEqual([{ body: "Line one\nLine two" }]);
});

test("a failed send stays with Retry, and Retry sends it once", async ({ page }) => {
  const state = await mock(page, { failPost: 1 });
  await page.goto("/client/messages");
  await expect(page.getByText(/No messages yet. Say hi to Anna Rivers/)).toBeVisible();
  await page.getByLabel("Message to Anna Rivers").fill("Are we on for Friday?");
  await page.getByRole("button", { name: "Send" }).click();
  const alert = page.getByRole("list", { name: "Messages" }).getByRole("alert");
  await expect(alert).toContainText("Not sent");
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("list", { name: "Messages" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Messages" }).getByRole("alert")).toHaveCount(0);
  expect(state.posts).toHaveLength(2);
});

test("over 2000 characters can't be sent and says why", async ({ page }) => {
  const state = await mock(page);
  await page.goto("/client/messages");
  await page.getByLabel("Message to Anna Rivers").fill("x".repeat(2001));
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByText("Messages can be up to 2000 characters (2001 now).")).toBeVisible();
  await page.getByLabel("Message to Anna Rivers").press("Enter");
  expect(state.posts).toEqual([]);
});

test("the thread re-fetches every 20 seconds while open", async ({ page }) => {
  await page.clock.install();
  const state = await mock(page);
  await page.goto("/client/messages");
  await expect(page.getByText(/No messages yet/)).toBeVisible();
  const before = state.gets;
  state.messages.push({ id: "9", sender: "coach", body: "New from coach", createdAt: T, readAt: null });
  await page.clock.runFor(21_000);
  await expect(page.getByRole("list", { name: "Messages" })).toContainText("New from coach");
  expect(state.gets).toBeGreaterThan(before);
});

test("a load error shows plain words with Retry", async ({ page }) => {
  await mock(page, { failGet: true });
  await page.goto("/client/messages");
  await expect(page.getByRole("button", { name: /Retry|Try again/ })).toBeVisible({ timeout: 20_000 });
});

test("the client's own messages show Seen once the coach has read them", async ({ page }) => {
  await mock(page, { messages: [{ id: "1", sender: "client", body: "Done!", createdAt: T, readAt: T }, { id: "2", sender: "client", body: "Also this", createdAt: T, readAt: null }] });
  await page.goto("/client/messages");
  const items = page.getByRole("list", { name: "Messages" }).getByRole("listitem");
  await expect(items.first()).toContainText("Seen");
  await expect(items.last()).not.toContainText("Seen");
  await expect(items.first()).toContainText("You:");
});

test("a client with no coach sees a plain line and no composer", async ({ page }) => {
  await mock(page, { noCoach: true });
  await page.goto("/client/messages");
  await expect(page.getByText("You don't have a coach to message right now.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Send a message" })).toHaveCount(0);
});

test("a coach message arriving by polling is announced politely", async ({ page }) => {
  await page.clock.install();
  const state = await mock(page, { messages: [{ id: "1", sender: "client", body: "Hi", createdAt: T, readAt: null }] });
  await page.goto("/client/messages");
  await expect(page.getByRole("list", { name: "Messages" })).toContainText("Hi");
  state.messages.push({ id: "2", sender: "coach", body: "Hello!", createdAt: T, readAt: null });
  await page.clock.runFor(21_000);
  await expect(page.getByRole("status").filter({ hasText: "New message from Anna Rivers" })).toBeAttached();
});

test("five tabs fit on a 320px phone, badge included", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mock(page, { unread: 12 });
  await page.goto("/client");
  const nav = page.getByRole("navigation", { name: "Client app tabs" });
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(5);
  await expect(nav.getByRole("link", { name: /Messages/ })).toContainText("9+");
  const scroll = await nav.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(scroll).toBeLessThanOrEqual(0);
  for (let i = 0; i < 5; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(56);
  }
});

test("leaving the Messages tab stops polling the thread", async ({ page }) => {
  await page.clock.install();
  const state = await mock(page);
  await page.goto("/client/messages");
  await expect(page.getByText(/No messages yet/)).toBeVisible();
  await page.getByRole("navigation", { name: "Client app", exact: true }).getByRole("link", { name: "Today" }).click();
  const gets = state.gets;
  await page.clock.runFor(65_000);
  expect(state.gets).toBe(gets);
});

test("messages are split by day: Today, Yesterday and a dated line", async ({ page }) => {
  const now = new Date();
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  await mock(page, {
    messages: [
      { id: "1", sender: "coach", body: "Older note", createdAt: at(4), readAt: null },
      { id: "2", sender: "client", body: "Yesterday reply", createdAt: at(1), readAt: null },
      { id: "3", sender: "coach", body: "Today note", createdAt: at(0), readAt: null },
    ],
  });
  await page.goto("/client/messages");
  const list = page.getByRole("list", { name: "Messages" });
  // The separators are presentation rows: they don't change the message count.
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list).toContainText("Today");
  await expect(list).toContainText("Yesterday");
  // Built in the page so the browser's locale decides the wording, like the app does.
  const dated = await page.evaluate(
    (ms: number) => new Date(ms).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }),
    now.getTime() - 4 * 86_400_000,
  );
  await expect(list).toContainText(dated);
});
