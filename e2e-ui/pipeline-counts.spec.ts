// The client count line (Inspo C6, Nov 2026).
//
// Repsy deliberately does NOT copy the competitor's four-tab pipeline - the waiting list is already
// on this screen and leads live in Business. These tests pin the small honest version: the count,
// and a nudge only when something is actually waiting.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const client = (id: string, name: string) => ({
  id, coachId: null, name, goal: "Strength", age: 29, weightKg: 68, heightCm: 165,
  level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
});

const waiting = (id: string, name: string, joinStatus: string) => ({
  id, name, joinStatus, joinedVia: "code", createdAt: "2026-11-14T00:00:00.000Z", email: `${id}@example.com`,
});

async function openClients(page: Page, clients: unknown[], waitingList: unknown[] = []) {
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: clients }));
  await page.route("**/api/clients/waiting", (route: Route) => route.fulfill({ status: 200, json: waitingList }));
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
}

test("the client count is shown", async ({ page }) => {
  await openClients(page, [client("c1", "Maya Patel"), client("c2", "Dev Rao")]);
  await expect(page.getByText("2 clients")).toBeVisible();
});

test("one client reads as one, not '1 clients'", async ({ page }) => {
  await openClients(page, [client("c1", "Maya Patel")]);
  await expect(page.getByText("1 client", { exact: true })).toBeVisible();
});

test("someone waiting to be approved is called out", async ({ page }) => {
  await openClients(page, [client("c1", "Maya Patel")], [waiting("w1", "Asha", "pending")]);
  await expect(page.getByText("1 waiting to be approved")).toBeVisible();
});

test("several waiting are counted", async ({ page }) => {
  await openClients(page, [client("c1", "Maya")], [waiting("w1", "Asha", "pending"), waiting("w2", "Ravi", "pending")]);
  await expect(page.getByText("2 waiting to be approved")).toBeVisible();
});

test("a declined request is not counted as waiting", async ({ page }) => {
  // Declined is finished business: counting it would send the coach looking for something to do.
  await openClients(page, [client("c1", "Maya")], [waiting("w1", "Asha", "declined")]);
  await expect(page.getByText(/waiting to be approved/)).toHaveCount(0);
});

test("nothing waiting shows no badge at all, because a permanent '0 waiting' is noise", async ({ page }) => {
  await openClients(page, [client("c1", "Maya")], []);
  await expect(page.getByText(/waiting to be approved/)).toHaveCount(0);
  await expect(page.getByText("1 client", { exact: true })).toBeVisible();
});

test("there is no second pipeline list competing with the waiting list", async ({ page }) => {
  // The deliberate non-feature: no Active/Pending/Archive/Leads tab strip on this screen.
  await openClients(page, [client("c1", "Maya")], [waiting("w1", "Asha", "pending")]);
  await expect(page.getByRole("group", { name: /pipeline/i })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Pending/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Leads/ })).toHaveCount(0);
});
