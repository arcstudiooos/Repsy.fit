// Coach app navigation (Nov 2026): 5 top tabs (Home, Clients, AI Coach, Messages, Business), the client
// workspace in Clients (Plans / Progress / Check-ins sub-tabs), the client header with "Switch client",
// Library as a Business view, the phone bottom tab bar, and Home's card order / counts / grouped check-ins.
// Every /api call is mocked.
import { expect, test, openClientTab, selectClient, type Page, type Route, openAiCoach } from "./fixtures";

const client = (i: number) => ({
  id: `c-${i}`,
  coachId: null,
  name: i === 0 ? "Maya Patel" : i === 1 ? "Leo Brooks" : `Client ${String(i).padStart(2, "0")}`,
  goal: i === 1 ? "Muscle gain" : "Fat loss",
  age: 30,
  weightKg: 70,
  heightCm: 170,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});
const CLIENTS = Array.from({ length: 32 }, (_, i) => client(i));

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const progress = (id: string, clientIndex: number, hours: number) => ({
  kind: "progress",
  id,
  clientId: `c-${clientIndex}`,
  clientName: CLIENTS[clientIndex].name,
  createdAt: ago(hours),
  weightKg: 70,
  adherence: 80,
  workoutsDone: 3,
  note: "",
});
const daily = (id: string, clientIndex: number, hours: number) => ({
  kind: "daily",
  id,
  clientId: `c-${clientIndex}`,
  clientName: CLIENTS[clientIndex].name,
  createdAt: ago(hours),
  energy: 4,
  mood: 4,
  sleepHours: 7,
  waterLiters: null,
  steps: null,
  foodNote: "",
});
// Newest first, as the server sends them: Maya has 3, then 6 more clients have one each (7 clients).
const RECENT = [
  daily("d1", 0, 1),
  progress("p1", 1, 2),
  progress("p2", 0, 3),
  progress("p3", 2, 4),
  progress("p4", 3, 5),
  progress("p5", 4, 6),
  progress("p6", 5, 7),
  progress("p7", 6, 7.5),
  daily("d2", 0, 8),
];

async function mockApi(page: Page) {
  await page.route("**/api/**", (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/tasks/today") return route.fulfill({ json: { date: "2026-11-13", tasks: [] } });
    if (path === "/api/checkins/recent") return route.fulfill({ json: { items: RECENT } });
    if (path === "/api/at-risk") {
      return route.fulfill({
        json: { date: "2026-11-13", clients: [{ clientId: "c-1", clientName: "Leo Brooks", reasons: [{ rule: "inactive", text: "No check-in for 12 days" }] }] },
      });
    }
    if (path === "/api/weekly-summary") return route.fulfill({ json: { weekStart: "2026-11-09", summary: null } });
    if (path === "/api/alerts") return route.fulfill({ json: { waiting: 1, joined: [], finished: [], unread: [] } });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/templates" || path === "/api/meals") return route.fulfill({ json: [] });
    if (req.method() === "GET" && /\/(assignments|chat|progress|daily-checkins|measurements|habits)$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

const header = (page: Page) => page.getByRole("region", { name: "Selected client" });

test("5 top tabs; arrow keys move between them (roving focus)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const tabs = page.getByRole("tablist", { name: "Sections" }).getByRole("tab");
  await expect(tabs).toHaveText(["Home", "Clients", "AI Coach", "Messages", "Business"]);
  // /app opens on Home (owner, Nov 2026).
  await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("tab", { name: "AI Coach" })).toHaveAttribute("tabindex", "-1");
  await page.getByRole("tab", { name: "Home" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Clients" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Messages" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
});

test("Clients shows the roster; a client card opens the workspace with sub-tabs and a way back", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Open Leo Brooks" }).click();
  await expect(header(page)).toContainText("Leo Brooks");
  await expect(header(page)).toContainText("Muscle gain");
  const sub = page.getByRole("tablist", { name: "Client workspace: Leo Brooks" }).getByRole("tab");
  await expect(sub).toHaveText(["Plans", "Progress", "Check-ins"]);
  await expect(page.getByRole("tab", { name: "Plans", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Plans" })).toBeVisible();
  // Sub-tabs follow the same arrow-key pattern.
  await page.getByRole("tab", { name: "Plans", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Progress", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 2, name: "Progress" })).toBeVisible();
  // No old "Selected: <name>" lines.
  await expect(page.getByText(/Selected:/)).toHaveCount(0);
  await page.getByRole("button", { name: "Back to all clients" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Clients" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Leo Brooks" })).toHaveAttribute("aria-pressed", "true");
});

test("Switch client: a searchable list that works with 30+ clients and by keyboard", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  await expect(header(page)).toContainText("Maya Patel");
  const button = page.getByRole("button", { name: "Switch client" });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const search = page.getByRole("combobox", { name: "Search clients" });
  await expect(search).toBeFocused();
  const list = page.getByRole("listbox", { name: "Clients" });
  await expect(list.getByRole("option")).toHaveCount(32);
  await expect(list.getByRole("option", { name: /Maya Patel/ })).toHaveAttribute("aria-selected", "true");
  // Type to filter, arrow to the second match, Enter picks it.
  await search.fill("client 3");
  await expect(list.getByRole("option")).toHaveText([/Client 30/, /Client 31/]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(header(page)).toContainText("Client 31");
  // Escape closes without changing the client; no match says so.
  await button.click();
  await search.fill("zzz");
  await expect(page.getByText('No clients match "zzz".')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(header(page)).toContainText("Client 31");
  // The helper the other specs use.
  await selectClient(page, "Leo Brooks");
  await expect(header(page)).toContainText("Leo Brooks");
});

test("the selected client carries from AI Coach into the workspace", async ({ page }) => {
  await mockApi(page);
  await openAiCoach(page);
  await selectClient(page, "Client 12");
  await openClientTab(page, "Check-ins");
  await expect(header(page)).toContainText("Client 12");
  await expect(page.getByRole("tab", { name: "Check-ins", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("Library is a Business view", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  const views = page.getByRole("group", { name: "Business view" }).getByRole("button");
  await expect(views).toHaveText(["Payments", "Schedule", "Engagement", "Reports", "Library"]);
  await views.filter({ hasText: "Library" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Library" })).toBeVisible();
});

test("Home: actionable cards first, with counts", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  const panel = page.getByRole("tabpanel").first();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText([
    "Needs attention · 1",
    "Review queue",
    "Client activity · 1",
    "Today's Tasks",
    "New check-ins · 7",
    "AI weekly summary",
  ]);
});

test("Home: new check-ins grouped by client, 5 rows then See all; a row opens that client's workspace", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  const rows = page.getByRole("list", { name: "New check-ins" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("Maya Patel");
  await expect(rows.nth(0)).toContainText("+2 earlier");
  await expect(rows.nth(0)).toContainText("energy 4/5");
  await expect(rows.nth(1)).toContainText("Leo Brooks");
  await expect(rows.nth(1)).not.toContainText("earlier");
  const seeAll = page.getByRole("button", { name: "See all (7)" });
  await seeAll.click();
  await expect(rows).toHaveCount(7);
  await page.getByRole("button", { name: "Show fewer" }).click();
  await expect(rows).toHaveCount(5);
  // Maya's latest is a daily check-in, so her row opens her Check-ins.
  await page.getByRole("button", { name: "Open check-ins: Maya Patel" }).click();
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Check-ins", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(header(page)).toContainText("Maya Patel");
  // Leo's latest is a weekly progress log, which lives on Progress.
  await page.getByRole("tab", { name: "Home" }).click();
  await page.getByRole("list", { name: "New check-ins" }).getByRole("button", { name: "Open progress: Leo Brooks" }).click();
  await expect(page.getByRole("tab", { name: "Progress", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(header(page)).toContainText("Leo Brooks");
});

test.describe("phone (375px)", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("bottom tab bar with icons; the workspace and switcher fit without sideways scroll", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app");
    const bar = page.getByRole("tablist", { name: "Sections" });
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(800);
    await expect(bar.locator("svg")).toHaveCount(5);
    for (const tab of await bar.getByRole("tab").all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await openClientTab(page, "Plans", "Client 05");
    await expect(header(page)).toContainText("Client 05");
    await page.getByRole("button", { name: "Switch client" }).click();
    const popup = page.getByRole("listbox", { name: "Clients" });
    const popBox = (await popup.boundingBox())!;
    expect(popBox.x).toBeGreaterThanOrEqual(0);
    expect(popBox.x + popBox.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test("desktop: tabs sit at the top, not in a bottom bar", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const bar = page.getByRole("tablist", { name: "Sections" });
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  expect((await bar.boundingBox())!.y).toBeLessThan(200);
  await expect(bar.locator("svg").first()).toBeHidden();
});
