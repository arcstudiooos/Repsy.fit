// Prompt 83: the client's account settings on the Me tab - profile (name, units, goal...), change password
// (or the Google note), timezone for sessions, payment history without amounts, and deleting the account.
import { expect, test, type Page } from "@playwright/test";

type Opts = { google?: boolean; timezone?: string | null; payments?: unknown[]; deleteError?: { status: number; error: string } };

async function mock(page: Page, opts: Opts = {}) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  const acct = { name: "Maya Patel", loginEmail: "maya@example.com", googleConnected: !!opts.google, timezone: opts.timezone ?? null };
  const profile = { goal: "Fat loss", age: 29, heightCm: 165, weightKg: 68, level: "Beginner", units: "kg", injuries: "", weeklyCheckInDay: 0 };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    if (req.method() !== "GET") sent.push({ method: req.method(), path, body });
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c1", name: acct.name, loginEmail: acct.loginEmail, joinStatus: "active", coachName: "Anna Rivers", needsWelcome: false } });
    if (path === "/api/client-auth/me/account") {
      if (req.method() === "PATCH") {
        Object.assign(acct, body);
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({ json: acct });
    }
    if (path === "/api/client-auth/me/profile") {
      if (req.method() === "PATCH") return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ json: profile });
    }
    if (path === "/api/client-auth/change-password") {
      const b = body as { currentPassword: string };
      if (b.currentPassword !== "old-password-1") return route.fulfill({ status: 400, json: { error: "Your current password is not right." } });
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/client-auth/my-payments") return route.fulfill({ json: opts.payments ?? [] });
    if (path === "/api/client-auth/me" && req.method() === "DELETE") return route.fulfill({ status: 204, body: "" });
    if (path === "/api/client-auth/my-sessions") {
      return route.fulfill({ json: { sessions: [{ id: "s1", title: "PT session", type: "In person", startsAt: "2030-01-15T12:30:00.000Z", endsAt: "2030-01-15T13:30:00.000Z", location: "" }], timezone: acct.timezone } });
    }
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: { planName: "Monthly", status: "Active", nextDueDate: "2030-02-01" }, lastPaymentDate: "2030-01-01" } });
    if (path === "/api/client-auth/my-targets") return route.fulfill({ json: { calorieTarget: null, proteinTargetG: null, weeklyCheckInDay: 0 } });
    if (path === "/api/client-auth/my-messages/unread") return route.fulfill({ json: { count: 0 } });
    if (path === "/api/client-auth/logout") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  // DELETE /me is matched above only for GET; route it explicitly.
  await page.route("**/api/client-auth/me", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    sent.push({ method: "DELETE", path: "/api/client-auth/me", body: route.request().postDataJSON() });
    if (opts.deleteError) return route.fulfill({ status: opts.deleteError.status, json: { error: opts.deleteError.error } });
    return route.fulfill({ status: 204, body: "" });
  });
  return { sent };
}

test("profile: edit name, goal and age; switching kg -> lb keeps the same body weight", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/me");
  const form = page.getByRole("form", { name: "Profile" });
  await expect(form.getByLabel("Weight (kg)")).toHaveValue("68");
  await form.getByRole("radio", { name: "lb" }).check();
  await expect(form.getByLabel("Weight (lb)")).toHaveValue("149.9");
  await form.getByLabel("Name").fill("Maya P");
  await form.getByLabel("Age").fill("30");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  expect(sent[0]).toEqual({ method: "PATCH", path: "/api/client-auth/me/account", body: { name: "Maya P" } });
  expect(sent[1]).toMatchObject({ method: "PATCH", path: "/api/client-auth/me/profile", body: { units: "lb", age: 30, goal: "Fat loss", heightCm: 165, level: "Beginner" } });
  expect((sent[1].body as { weightKg: number }).weightKg).toBeCloseTo(68, 1);
  await expect(page.getByText(/sign-in email and your coach can't be changed here/)).toBeVisible();
  await expect(form.getByLabel(/email/i)).toHaveCount(0);
});

test("profile: the health consent tick is offered until given, and is sent when ticked", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/me");
  const form = page.getByRole("form", { name: "Profile" });
  const tick = form.getByRole("checkbox", { name: /can store the health details I enter/ });
  await tick.check();
  await form.getByLabel("Weight (kg)").fill("70");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  expect(sent.at(-1)).toMatchObject({ path: "/api/client-auth/me/profile", body: { weightKg: 70, healthConsent: true } });
});

test("profile validates before saving", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/me");
  const form = page.getByRole("form", { name: "Profile" });
  await form.getByLabel("Age").fill("9");
  await form.getByRole("button", { name: "Save profile" }).click();
  await expect(form.getByRole("alert")).toHaveText("Age: a whole number from 18 to 120.");
  expect(sent).toEqual([]);
});

test("change password: wrong current password shows the error; right one confirms", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/me");
  const form = page.getByRole("form", { name: "Change password" });
  await form.getByLabel("Current password").fill("nope");
  await form.getByLabel("New password").fill("new-password-12");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("alert")).toHaveText("Your current password is not right.");
  await form.getByLabel("Current password").fill("old-password-1");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("status")).toContainText("Password changed. Other devices have been signed out.");
  await expect(form.getByLabel("New password")).toHaveValue("");
  expect(sent.filter((s) => s.path.endsWith("change-password"))).toHaveLength(2);
});

test("a Google-only client sees Connected with Google and a Forgot password pointer, no password form", async ({ page }) => {
  await mock(page, { google: true });
  await page.goto("/client/me");
  await expect(page.getByText(/Connected with Google \(maya@example.com\)/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password" })).toHaveAttribute("href", "/client/forgot-password");
  await expect(page.getByRole("form", { name: "Change password" })).toHaveCount(0);
});

test("timezone: sessions show in the override, and it can be set back to the device's", async ({ page }) => {
  const { sent } = await mock(page, { timezone: "Asia/Kolkata" });
  await page.goto("/client/me");
  const sessions = page.getByRole("region", { name: "My sessions" });
  // 12:30 UTC = 6:00 PM in India.
  await expect(sessions).toContainText(/6:00\s?PM/);
  await expect(sessions).toContainText("Asia/Kolkata");
  await page.getByLabel("Show times in").selectOption("");
  await expect.poll(() => sent.at(-1)).toEqual({ method: "PATCH", path: "/api/client-auth/me/account", body: { timezone: null } });
  await page.getByLabel("Show times in").selectOption("America/New_York");
  await expect(sessions).toContainText(/7:30\s?AM/);
});

test("payment history: date, amount in the coach's currency, plan and method", async ({ page }) => {
  await mock(page, {
    payments: [
      { id: "p2", paidOn: "2026-11-01", amount: 4999, currency: "INR", method: "UPI", planName: "Monthly" },
      { id: "p1", paidOn: "2026-10-01", amount: 125000.5, currency: "INR", method: "Cash", planName: "Monthly" },
    ],
  });
  await page.goto("/client/me");
  const rows = page.getByRole("list", { name: "Payments" }).getByRole("listitem");
  await expect(rows.first()).toContainText("2026-11-01");
  await expect(rows.first()).toContainText("₹4,999.00");
  await expect(rows.first()).toContainText("UPI");
  await expect(rows.last()).toContainText("₹1,25,000.50"); // Indian grouping for INR
});

test("a USD coach's client sees dollars", async ({ page }) => {
  await mock(page, { payments: [{ id: "p1", paidOn: "2026-11-01", amount: 99.5, currency: "USD", method: "Card", planName: "Online" }] });
  await page.goto("/client/me");
  await expect(page.getByRole("list", { name: "Payments" })).toContainText("$99.50");
});

test("delete my account: needs DELETE typed and the password, then goes to sign-in with a note", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/me");
  await page.getByRole("button", { name: "Delete my account..." }).click();
  const form = page.getByRole("form", { name: "Delete my account" });
  await expect(form.getByLabel("Your password")).toBeFocused();
  const go = form.getByRole("button", { name: "Delete my account forever" });
  await go.click();
  await expect(form.getByRole("alert")).toHaveText("Please enter your password.");
  await expect(form.getByLabel("Your password")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Your password").fill("old-password-1");
  await form.getByLabel("Type DELETE to confirm").fill("delete");
  await go.click();
  await expect(form.getByRole("alert")).toHaveText("Type DELETE in capital letters to confirm.");
  expect(sent.filter((s) => s.method === "DELETE")).toEqual([]);
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await go.click();
  await expect(page).toHaveURL(/\/client\/login\?deleted=1$/);
  await expect(page.getByRole("status")).toHaveText("Your account has been deleted.");
  expect(sent.find((s) => s.method === "DELETE")).toEqual({ method: "DELETE", path: "/api/client-auth/me", body: { password: "old-password-1", confirm: "DELETE" } });
});

test("a Google-only client is asked to sign in with Google again; a stale sign-in shows the server's reason", async ({ page }) => {
  const { sent } = await mock(page, { google: true, deleteError: { status: 403, error: "For your safety, sign in with Google again, then delete your account within 5 minutes." } });
  await page.goto("/client/me");
  await page.getByRole("button", { name: "Delete my account..." }).click();
  const form = page.getByRole("form", { name: "Delete my account" });
  await expect(form.getByRole("link", { name: "sign in with Google again" })).toHaveAttribute("href", "/api/client-auth/google/start");
  await expect(form.getByLabel("Your password")).toHaveCount(0);
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete my account forever" }).click();
  await expect(form.getByRole("alert")).toContainText("sign in with Google again");
  expect(sent.find((s) => s.method === "DELETE")?.body).toEqual({ confirm: "DELETE" });
});

test("Cancel closes the delete form and puts focus back on its button", async ({ page }) => {
  await mock(page);
  await page.goto("/client/me");
  await page.getByRole("button", { name: "Delete my account..." }).click();
  await page.getByRole("form", { name: "Delete my account" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Delete my account..." })).toBeFocused();
});

test("a client waiting for approval can still delete their account", async ({ page }) => {
  await mock(page);
  await page.route("**/api/client-auth/me", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "pending", coachName: "Anna Rivers", needsWelcome: false } })
      : route.fallback(),
  );
  await page.goto("/client");
  await expect(page.getByRole("heading", { name: "Waiting for Anna Rivers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account..." })).toBeVisible();
});
