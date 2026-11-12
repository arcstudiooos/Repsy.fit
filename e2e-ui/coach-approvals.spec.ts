// Prompt 84: the coach's waiting list (Approve / Decline / Remove declined) in the Invite clients panel,
// "Joined with code" badges, and Home's Client activity alerts that open the right place.
import { expect, test, type Page } from "@playwright/test";

const CLIENT = (id: string, name: string, extra: object = {}) => ({
  id, coachId: "coach-1", name, goal: "Fat loss", age: 30, weightKg: 70, heightCm: 170, level: "Beginner", focus: "", notes: "", createdAt: "2026-11-01T00:00:00Z", loginEmail: null, joinStatus: "active", joinedVia: "coach", ...extra,
});

async function mock(page: Page, opts: { waiting?: unknown[]; alerts?: object; noActive?: boolean } = {}) {
  const state = {
    waiting: [...(opts.waiting ?? [])] as { id: string; name: string; joinStatus: string }[],
    clients: opts.noActive ? [] : [CLIENT("c1", "Maya Patel", { joinedVia: "code" }), CLIENT("c2", "Sam Lee")],
    calls: [] as string[],
  };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() !== "GET") state.calls.push(`${req.method()} ${path}`);
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", email: "anna@example.com", name: "Anna Rivers" } });
    if (path === "/api/clients" && req.method() === "GET") return route.fulfill({ json: state.clients });
    if (path === "/api/clients/waiting") return route.fulfill({ json: state.waiting });
    const decide = path.match(/^\/api\/clients\/([^/]+)\/(approve|decline)$/);
    if (decide) {
      const w = state.waiting.find((c) => c.id === decide[1])!;
      if (decide[2] === "approve") {
        state.waiting = state.waiting.filter((c) => c.id !== w.id);
        state.clients = [...state.clients, CLIENT(w.id, w.name, { joinedVia: "code" })];
      } else w.joinStatus = "declined";
      return route.fulfill({ json: { ...w, joinStatus: decide[2] === "approve" ? "active" : "declined" } });
    }
    const del = path.match(/^\/api\/clients\/([^/]+)$/);
    if (del && req.method() === "DELETE") {
      state.waiting = state.waiting.filter((c) => c.id !== del[1]);
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/join-code") return route.fulfill({ json: { code: "ANNA-7K2Q8M", active: true, approveNewClients: true } });
    if (path === "/api/alerts") return route.fulfill({ json: opts.alerts ?? { waiting: 0, joined: [], finished: [], unread: [] } });
    if (path === "/api/messages/threads") return route.fulfill({ json: { threads: [] } });
    if (/^\/api\/clients\/[^/]+\/messages$/.test(path)) return route.fulfill({ json: { messages: [], hasMore: false } });
    if (path.startsWith("/api/tasks/today")) return route.fulfill({ json: { date: "2026-11-12", tasks: [] } });
    if (path === "/api/checkins/recent") return route.fulfill({ json: { items: [] } });
    if (path === "/api/at-risk") return route.fulfill({ json: { date: "2026-11-12", clients: [] } });
    if (/\/(assignments|chat|progress)$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return state;
}

const W = (id: string, name: string, joinStatus = "pending") => ({ id, name, loginEmail: `${id}@example.com`, joinStatus, joinedVia: "code", createdAt: "2026-11-12T08:00:00Z" });

test("Invite clients shows who's waiting; Approve moves them into the client list", async ({ page }) => {
  const state = await mock(page, { waiting: [W("p1", "Priya Shah"), W("p2", "Omar Ali")] });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  const list = page.getByRole("list", { name: "Waiting for approval" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Waiting for approval (2)" })).toBeVisible();
  await list.getByRole("button", { name: "Approve Priya Shah" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText(/^Approved Priya Shah\./)).toBeAttached();
  await expect(page.locator(":focus")).toBeAttached(); // focus stays in the panel, not lost to the page
  await expect(page.getByRole("button", { name: "Priya Shah - open in AI Coach" })).toBeVisible();
  expect(state.calls).toContain("POST /api/clients/p1/approve");
});

test("Decline moves them to Declined, where they can be removed after confirming", async ({ page }) => {
  const state = await mock(page, { waiting: [W("p1", "Priya Shah")] });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Decline Priya Shah" }).click();
  await page.getByRole("dialog", { name: "Decline Priya Shah?" }).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("list", { name: "Waiting for approval" })).toHaveCount(0);
  await expect(page.getByText("Declined Priya Shah.")).toBeAttached();
  await page.getByText("Declined (1)").click();
  await page.getByRole("button", { name: "Remove Priya Shah" }).click();
  await page.getByRole("dialog", { name: "Remove Priya Shah?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Declined (1)")).toHaveCount(0);
  expect(state.calls).toEqual(["POST /api/clients/p1/decline", "DELETE /api/clients/p1"]);
});

test("clients who joined with the code carry a badge", async ({ page }) => {
  await mock(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  const maya = page.locator("article, li, div").filter({ has: page.getByRole("button", { name: "Maya Patel - open in AI Coach" }) }).last();
  await expect(maya).toContainText("Joined with code");
  const sam = page.locator("article, li, div").filter({ has: page.getByRole("button", { name: "Sam Lee - open in AI Coach" }) }).last();
  await expect(sam).not.toContainText("Joined with code");
});

test("Home: client activity rows - waiting, messages (opens the thread), finished with effort, joined", async ({ page }) => {
  const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
  await mock(page, {
    alerts: {
      waiting: 2,
      joined: [{ clientId: "c1", name: "Maya Patel", at: recent }],
      finished: [{ clientId: "c1", clientName: "Maya Patel", assignmentId: "a1", title: "Leg day", type: "Workout", effort: 8, note: "Tough but good", at: recent }],
      unread: [{ clientId: "c2", name: "Sam Lee", count: 3 }],
    },
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  const alerts = page.getByRole("list", { name: "Client alerts" });
  await expect(alerts.getByRole("listitem")).toHaveCount(4);
  await expect(alerts).toContainText("2 clients waiting for approval");
  await expect(alerts).toContainText("Maya Patel finished Leg day · effort 8/10 · 2 hours ago");
  await expect(alerts).toContainText('"Tough but good"');
  await expect(alerts).toContainText("Maya Patel joined with your code");
  await alerts.getByRole("button", { name: /Sam Lee sent 3 new messages/ }).click();
  await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Conversation with Sam Lee" })).toBeVisible();
});

test("Home: the waiting row opens the Clients tab; no activity shows no card", async ({ page }) => {
  await mock(page, { alerts: { waiting: 1, joined: [], finished: [], unread: [] }, waiting: [W("p1", "Priya Shah")] });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await page.getByRole("button", { name: /1 client waiting for approval/ }).click();
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("list", { name: "Waiting for approval" })).toBeVisible();
});

test("Home without any client activity has no Client activity card", async ({ page }) => {
  await mock(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(page.getByRole("region", { name: "Today's Tasks" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Client activity" })).toHaveCount(0);
});

test("a coach whose only people are waiting still finds them (banner on Home, list in Clients)", async ({ page }) => {
  await mock(page, { noActive: true, waiting: [W("p1", "Priya Shah")] });
  await page.goto("/app");
  await expect(page.getByRole("status").filter({ hasText: "1 person is waiting for you to approve them." })).toBeVisible();
  await page.getByRole("button", { name: "Review in Clients" }).click();
  await expect(page.getByRole("list", { name: "Waiting for approval" })).toContainText("Priya Shah");
  await page.getByRole("button", { name: "Approve Priya Shah" }).click();
  await expect(page.getByRole("button", { name: "Priya Shah - open in AI Coach" })).toBeVisible();
});
