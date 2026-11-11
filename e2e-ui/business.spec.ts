// Business tab: plans and recorded payments (Prompt 68), plus the client's own "My plan". Mocked API.
import { expect, test, type Page } from "@playwright/test";

const ME = { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z", currency: "INR" };
const client = (id: string, name: string) => ({
  id, coachId: "coach-1", name, goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
});
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Rao"), client("c-casey", "Casey Lin"), client("c-dev", "Dev Shah")];

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
};

type Row = { client: { id: string; name: string }; plan: Record<string, unknown>; lastPayment: Record<string, unknown> | null };
const row = (c: { id: string; name: string }, plan: Record<string, unknown>, lastPayment: Row["lastPayment"] = null): Row => ({
  client: { id: c.id, name: c.name },
  plan: { id: `p-${c.id}`, coachId: "coach-1", clientId: c.id, planName: "Monthly coaching", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-01-15", status: "Active", ...plan },
  lastPayment,
});

/** A small fake server for plans: PUT creates/updates, POST payments advances by one month (or not, for One-time). */
async function mockBusiness(page: Page, rows: Row[], currency = "INR") {
  const state = { rows: structuredClone(rows), payments: [] as Record<string, unknown>[], puts: [] as Record<string, unknown>[] };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { ...ME, currency } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/business/plans") return route.fulfill({ json: { currency, plans: state.rows } });
    const plan = /^\/api\/clients\/([^/]+)\/plan$/.exec(path);
    if (plan && req.method() === "PUT") {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.puts.push({ clientId: plan[1], ...body });
      const c = CLIENTS.find((x) => x.id === plan[1])!;
      const existing = state.rows.find((r) => r.client.id === c.id);
      if (existing) Object.assign(existing.plan, body);
      else state.rows.push(row(c, { ...body, nextDueDate: body.nextDueDate ?? body.startDate, status: body.status ?? "Active" }));
      return route.fulfill({ status: existing ? 200 : 201, json: {} });
    }
    const pay = /^\/api\/clients\/([^/]+)\/plan\/payments$/.exec(path);
    if (pay && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.payments.push({ clientId: pay[1], ...body });
      const r = state.rows.find((x) => x.client.id === pay[1])!;
      if (r.plan.billingCycle !== "One-time") {
        const [y, m, d] = String(r.plan.nextDueDate).split("-").map(Number);
        const next = new Date(Date.UTC(y, m, d));
        r.plan.nextDueDate = next.toISOString().slice(0, 10);
      }
      r.lastPayment = { amount: body.amount, paidOn: body.paidOn, method: body.method };
      return route.fulfill({ status: 201, json: { payment: body, plan: r.plan } });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Business" })).toBeVisible();
  return state;
}

const plans = (page: Page) => page.getByRole("list", { name: "Client plans" }).getByRole("listitem");
const rowFor = (page: Page, name: string) => plans(page).filter({ hasText: name });

test("Business is the 9th and final tab, and says it is record-keeping only", async ({ page }) => {
  await mockBusiness(page, []);
  await expect(page.getByRole("tab")).toHaveText(["Home", "AI Coach", "Clients", "Manual Planner", "Progress", "Check-ins", "Library", "Messages", "Business"]);
  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("Record-keeping only");
  await expect(panel).toContainText("Nothing here charges anyone, sends payment links or reminders, or makes invoices");
  await expect(panel).toContainText("No plans yet.");
  await expect(page.getByRole("group", { name: "Select client" })).toHaveCount(0);
});

test("rows show plan, price in the coach's currency, status, and due state (overdue / due soon)", async ({ page }) => {
  await mockBusiness(page, [
    row(CLIENTS[0], { nextDueDate: iso(-3) }),
    row(CLIENTS[1], { nextDueDate: iso(2), planName: "Quarterly", billingCycle: "Quarterly", priceAmount: 12000 }),
    row(CLIENTS[2], { nextDueDate: iso(30) }),
    row(CLIENTS[3], { nextDueDate: iso(-10), status: "Paused" }),
  ]);
  const maya = rowFor(page, "Maya Patel");
  await expect(maya).toContainText("Monthly coaching · Monthly");
  await expect(maya).toContainText("₹4,999.00");
  // Overdue: the orange pill with dark text (the palette has no red).
  const overdue = maya.getByText("3 days overdue");
  await expect(overdue).toBeVisible();
  await expect(overdue).toHaveCSS("background-color", "rgb(255, 74, 31)");
  // Due within 7 days: amber text.
  const soon = rowFor(page, "Arjun Rao").getByText("Due in 2 days");
  await expect(soon).toBeVisible();
  await expect(soon).toHaveCSS("color", "rgb(146, 64, 14)");
  await expect(rowFor(page, "Arjun Rao")).toContainText("₹12,000.00");
  // A paused plan is never shown as overdue.
  await expect(rowFor(page, "Dev Shah")).not.toContainText("overdue");
  await expect(rowFor(page, "Dev Shah")).toContainText("Paused");
  await expect(rowFor(page, "Dev Shah")).toContainText("Next due date");
  await expect(rowFor(page, "Dev Shah").getByText(/^Due /)).toHaveCount(0);
});

test("filters: All / Overdue / Due this week / Active", async ({ page }) => {
  await mockBusiness(page, [
    row(CLIENTS[0], { nextDueDate: iso(-3) }),
    row(CLIENTS[1], { nextDueDate: iso(2) }),
    row(CLIENTS[2], { nextDueDate: iso(30) }),
    row(CLIENTS[3], { nextDueDate: iso(-10), status: "Paused" }),
  ]);
  const filters = page.getByRole("group", { name: "Filter plans" });
  await expect(plans(page)).toHaveCount(4);
  await filters.getByRole("button", { name: /^Overdue/ }).click();
  await expect(plans(page)).toHaveCount(1);
  await expect(plans(page).first()).toContainText("Maya Patel");
  await filters.getByRole("button", { name: /^Due this week/ }).click();
  await expect(plans(page)).toHaveCount(1);
  await expect(plans(page).first()).toContainText("Arjun Rao");
  await filters.getByRole("button", { name: /^Active/ }).click();
  await expect(plans(page)).toHaveCount(3);
  await expect(filters.getByRole("button", { name: /^Active/ })).toHaveAttribute("aria-pressed", "true");
  await expect(filters.getByRole("button", { name: /^All/ })).toContainText("4");
});

test("record payment: amount pre-filled from the plan, date today, and it advances the next due date", async ({ page }) => {
  const server = await mockBusiness(page, [row(CLIENTS[0], { nextDueDate: iso(-3) })]);
  const maya = rowFor(page, "Maya Patel");
  await maya.getByRole("button", { name: "Record payment" }).click();
  const form = page.getByRole("form", { name: "Record payment for Maya Patel" });
  await expect(form.getByLabel("Amount (INR)")).toHaveValue("4999");
  await expect(form.getByLabel("Paid on")).toHaveValue(iso(0));
  await expect(form).toContainText("Saving moves the next due date on by one monthly cycle.");
  await form.getByLabel("Method").selectOption("Cash");
  await form.getByRole("button", { name: "Save payment" }).click();
  await expect(form).toHaveCount(0);
  expect(server.payments).toEqual([{ clientId: "c-maya", amount: 4999, paidOn: iso(0), method: "Cash", note: "" }]);
  await expect(maya).not.toContainText("overdue");
  await expect(maya).toContainText("Last payment ₹4,999.00");
});

test("a One-time plan says its due date will not move", async ({ page }) => {
  await mockBusiness(page, [row(CLIENTS[0], { nextDueDate: iso(5), billingCycle: "One-time", planName: "Starter pack" })]);
  await rowFor(page, "Maya Patel").getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("form", { name: "Record payment for Maya Patel" })).toContainText("One-time plan: the due date stays the same.");
});

test("add a plan for a client without one, and edit an existing plan's status", async ({ page }) => {
  const server = await mockBusiness(page, [row(CLIENTS[0], { nextDueDate: iso(10) })]);
  await page.getByRole("button", { name: "Add a plan" }).click();
  const form = page.getByRole("form", { name: "Add a plan" });
  // Only clients WITHOUT a plan can be picked.
  await expect(form.getByLabel("Client").locator("option")).toHaveText(["Arjun Rao", "Casey Lin", "Dev Shah"]);
  await form.getByLabel("Client").selectOption({ label: "Casey Lin" });
  await form.getByLabel("Plan name").fill("Yearly coaching");
  await form.getByLabel("Price (INR)").fill("45000");
  await form.getByLabel("Billing cycle").selectOption("Yearly");
  await form.getByRole("button", { name: "Add plan" }).click();
  await expect(rowFor(page, "Casey Lin")).toContainText("Yearly coaching · Yearly");
  expect(server.puts[0]).toMatchObject({ clientId: "c-casey", planName: "Yearly coaching", priceAmount: 45000, billingCycle: "Yearly", status: "Active" });

  await rowFor(page, "Maya Patel").getByRole("button", { name: "Edit plan" }).click();
  const edit = page.getByRole("form", { name: "Edit plan for Maya Patel" });
  await edit.getByLabel("Status").selectOption("Paused");
  await edit.getByRole("button", { name: "Save plan" }).click();
  await expect(rowFor(page, "Maya Patel")).toContainText("Paused");
});

test("prices follow the coach's currency setting (USD)", async ({ page }) => {
  await mockBusiness(page, [row(CLIENTS[0], { nextDueDate: iso(10), priceAmount: 99.5 })], "USD");
  await expect(rowFor(page, "Maya Patel")).toContainText("$99.50");
});

test("the client's own My plan: name, status, next due, last payment date - no amounts", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } });
    if (path === "/api/client-auth/my-plan") {
      return route.fulfill({ json: { plan: { planName: "Monthly coaching", status: "Active", nextDueDate: "2026-12-15" }, lastPaymentDate: "2026-11-15" } });
    }
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
  await page.goto("/client");
  const mine = page.getByRole("region", { name: "My plan" });
  await expect(mine).toContainText("Monthly coaching");
  await expect(mine).toContainText("Active");
  await expect(mine).toContainText("Dec 15, 2026");
  await expect(mine).toContainText("Nov 15, 2026");
  await expect(mine).not.toContainText(/₹|\$|\d,\d{3}/);
});

test("a client with no plan sees a plain note", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } });
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: null, lastPaymentDate: null } });
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
  await page.goto("/client");
  await expect(page.getByRole("region", { name: "My plan" })).toContainText("Your coach has not set up a plan for you yet.");
});

test("an Ended plan has no Record payment button; a Paused plan says the due date will not move", async ({ page }) => {
  await mockBusiness(page, [
    row(CLIENTS[0], { nextDueDate: iso(5), status: "Ended" }),
    row(CLIENTS[1], { nextDueDate: iso(5), status: "Paused" }),
  ]);
  await expect(rowFor(page, "Maya Patel").getByRole("button", { name: "Record payment" })).toHaveCount(0);
  await rowFor(page, "Arjun Rao").getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("form", { name: "Record payment for Arjun Rao" })).toContainText(
    "This plan is paused: the payment is recorded and the due date stays the same.",
  );
});

test("most urgent first: overdue, then due soon, then later, then paused", async ({ page }) => {
  await mockBusiness(page, [
    row(CLIENTS[3], { nextDueDate: iso(-20), status: "Paused" }),
    row(CLIENTS[2], { nextDueDate: iso(30) }),
    row(CLIENTS[1], { nextDueDate: iso(2) }),
    row(CLIENTS[0], { nextDueDate: iso(-3) }),
  ]);
  await expect(plans(page).locator("p.font-semibold")).toHaveText(["Maya Patel", "Arjun Rao", "Casey Lin", "Dev Shah"]);
});

test("editing a plan without touching the due date does not send it (no lost update)", async ({ page }) => {
  const server = await mockBusiness(page, [row(CLIENTS[0], { nextDueDate: iso(10) })]);
  await rowFor(page, "Maya Patel").getByRole("button", { name: "Edit plan" }).click();
  const edit = page.getByRole("form", { name: "Edit plan for Maya Patel" });
  await edit.getByLabel("Plan name").fill("Monthly coaching plus");
  await edit.getByRole("button", { name: "Save plan" }).click();
  await expect(rowFor(page, "Maya Patel")).toContainText("Monthly coaching plus");
  expect(server.puts[0]).not.toHaveProperty("nextDueDate");
});

