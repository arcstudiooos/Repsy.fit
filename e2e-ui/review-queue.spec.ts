// Review queue card and Home tab badge (Prompt 52). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];
const suggestion = {
  id: "r1",
  clientId: "c-maya",
  clientName: "Maya Patel",
  kind: "suggestion",
  status: "Pending",
  title: "Lower-body strength day",
  summary: "Adherence climbed from 72% to 86%",
  type: "Workout",
  details: "1. Back Squat - 4 sets x 6 reps",
  reasoning: "Adherence climbed from 72% to 86%",
  assignmentId: null,
  createdAt: "2026-11-11T09:00:00.000Z",
  decidedAt: null,
};
const checkin = { ...suggestion, id: "r2", kind: "checkin", type: null, title: "Check-in 2026-11-10", summary: "70 kg · 84% adherence" };

const card = (page: Page) => page.getByRole("region", { name: "Action centre" });
const items = (page: Page) => card(page).getByRole("list", { name: "Action centre" }).getByRole("listitem");

/** Mocks the app; the queue starts with `pending` and decisions move items to the decided list. */
async function openHome(page: Page, pending: Record<string, unknown>[], options: { failDecide?: boolean } = {}) {
  let queue = [...pending];
  const decided: Record<string, unknown>[] = [];
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue" && route.request().method() === "GET") {
      const wantDecided = url.searchParams.get("status") === "decided";
      return route.fulfill({ json: { pendingCount: queue.length, items: wantDecided ? decided : queue } });
    }
    const decision = /^\/api\/review-queue\/(.+)\/(approve|dismiss)$/.exec(path);
    if (decision) {
      calls.push(`${decision[2]}:${decision[1]}`);
      if (options.failDecide) return route.fulfill({ status: 500, json: { error: "Something went wrong" } });
      const item = queue.find((i) => i.id === decision[1])!;
      queue = queue.filter((i) => i.id !== decision[1]);
      const status = decision[2] === "approve" ? "Approved" : "Dismissed";
      decided.unshift({ ...item, status, decidedAt: "2026-11-11T10:00:00.000Z" });
      return route.fulfill({ json: { item: { ...item, status }, assignment: status === "Approved" && item.kind === "suggestion" ? { id: "a1" } : null } });
    }
    if (path === "/api/tasks/today") return route.fulfill({ json: { date: "2026-11-11", tasks: [] } });
    if (path === "/api/checkins/recent") return route.fulfill({ json: { items: [] } });
    if (path === "/api/at-risk") return route.fulfill({ json: { date: "2026-11-11", clients: [] } });
    if (path === "/api/alerts") return route.fulfill({ json: { waiting: 0, joined: [], finished: [], unread: [] } });
    if (path === "/api/weekly-summary") return route.fulfill({ json: { weekStart: "2026-11-09", summary: null } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: /Home/ }).click();
  await expect(card(page)).toBeVisible();
  return { calls };
}

test("each item shows client, type, summary, with Review and Dismiss", async ({ page }) => {
  await openHome(page, [suggestion, checkin]);
  const rows = items(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Maya Patel");
  await expect(rows.first()).toContainText("Workout");
  await expect(rows.first()).toContainText("Lower-body strength day");
  await expect(rows.first()).toContainText("Adherence climbed from 72% to 86%");
  await expect(rows.nth(1)).toContainText("Check-in");
  // A suggestion offers "Review workout", a check-in "Review check-in"; both offer Dismiss.
  await expect(rows.first().getByRole("button", { name: "Review Lower-body strength day for Maya Patel" })).toBeVisible();
  await expect(rows.first().getByRole("button", { name: "Dismiss Lower-body strength day" })).toBeVisible();
  await expect(rows.nth(1).getByRole("button", { name: "Review Check-in 2026-11-10 for Maya Patel" })).toBeVisible();
});

test("the Home tab badge matches the queue, and clears when the queue empties", async ({ page }) => {
  await openHome(page, [suggestion, checkin]);
  const badge = page.getByRole("tab", { name: /Home/ }).getByText("2", { exact: true });
  await expect(badge).toBeVisible();
  // Approving is inspect-first: open the review drawer, then Approve & send.
  await items(page).first().getByRole("button", { name: /^Review/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByRole("tab", { name: /Home/ }).getByText("1", { exact: true })).toBeVisible();
  // Dismiss hides the row optimistically (with Undo) and is posted after a short hold; the badge then clears.
  await items(page).first().getByRole("button", { name: /^Dismiss/ }).click();
  await expect(card(page)).toContainText("Nothing waiting for your review right now.");
  await expect(page.getByRole("tab", { name: /Home/ }).locator("[aria-label$='waiting in the review queue']")).toHaveCount(0, { timeout: 10_000 });
});

test("approving a suggestion asks the server to create the assignment; dismissing keeps it in history", async ({ page }) => {
  const { calls } = await openHome(page, [suggestion, checkin]);
  await items(page).getByRole("button", { name: "Review Lower-body strength day for Maya Patel" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve & send" }).click();
  await expect(items(page)).toHaveCount(1);
  await items(page).getByRole("button", { name: "Dismiss Check-in 2026-11-10" }).click();
  await expect(card(page)).toContainText("Nothing waiting for your review right now.");
  // The dismiss is held a few seconds (undoable) before it is sent, so wait for the server call.
  await expect.poll(() => calls, { timeout: 10_000 }).toEqual(["approve:r1", "dismiss:r2"]);

  await card(page).getByRole("button", { name: "View review history" }).click();
  const history = card(page).getByRole("list", { name: "Review history" });
  await expect(history).toContainText("Lower-body strength day");
  await expect(history).toContainText("Approved");
  await expect(history).toContainText("Check-in 2026-11-10");
  await expect(history).toContainText("Dismissed");
});

test("an empty queue shows the plain-words state and no badge", async ({ page }) => {
  await openHome(page, []);
  await expect(card(page)).toContainText("Nothing waiting for your review right now.");
  await expect(items(page)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Home/ }).locator("[aria-label$='waiting in the review queue']")).toHaveCount(0);
});

test("a failed approval shows a plain message and keeps the item in the queue", async ({ page }) => {
  await openHome(page, [suggestion], { failDecide: true });
  await items(page).getByRole("button", { name: /^Review/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve & send" }).click();
  await expect(card(page).getByRole("alert")).toContainText("We couldn't approve that just now.");
  await expect(items(page)).toHaveCount(1);
});
