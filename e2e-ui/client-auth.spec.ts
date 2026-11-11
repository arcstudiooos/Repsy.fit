// Client invite (coach side) and client sign-in pages (Prompt 65). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z", loginEmail: null },
];
const ME = { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" };

// ----- Coach side: the invite panel on the Clients tab -----

async function openInvite(page: Page, opts: { emailConfigured: boolean; status?: "none" | "invited" | "active"; inviteStatus?: number } = { emailConfigured: false }) {
  const invites: string[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: ME });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/clients/c-maya/invite" && req.method() === "GET") {
      const active = opts.status === "active";
      return route.fulfill({
        json: { loginEmail: active ? "maya@example.com" : null, pendingEmail: null, status: opts.status ?? "none", inviteExpiresAt: null, emailConfigured: opts.emailConfigured },
      });
    }
    if (path === "/api/clients/c-maya/invite" && req.method() === "POST") {
      const email = (req.postDataJSON() as { email: string }).email;
      invites.push(email);
      if (opts.inviteStatus === 409) return route.fulfill({ status: 409, json: { error: "That email can't be used for a client sign-in. Please use a different one." } });
      const base = { loginEmail: email, inviteExpiresAt: "2026-11-13T20:00:00.000Z" };
      return route.fulfill({
        status: 201,
        json: opts.emailConfigured
          ? { ...base, sent: true }
          : { ...base, sent: false, inviteLink: "http://localhost:4173/client/set-password?token=abc123", note: "Email is not configured - share this link with your client." },
      });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Client sign-in for Maya Patel" }).click();
  const panel = page.getByRole("region", { name: "Client sign-in for Maya Patel" });
  await expect(panel).toBeVisible();
  return { panel, invites };
}

test("without email set up, the coach gets a copyable invite link and a clear note", async ({ page }) => {
  const { panel, invites } = await openInvite(page, { emailConfigured: false });
  await expect(panel).toContainText("Not invited yet.");
  await panel.getByLabel("Client's email").fill("Maya@Example.com");
  await panel.getByRole("button", { name: "Send invite" }).click();
  await expect(panel).toContainText("Email is not configured - share this link with your client.");
  await expect(panel.getByLabel(/Invite link for maya@example.com/)).toHaveValue("http://localhost:4173/client/set-password?token=abc123");
  await expect(panel.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(invites).toEqual(["maya@example.com"]); // trimmed + lower-cased by the shared schema
});

test("with email set up, it says the invite was sent and shows no link", async ({ page }) => {
  const { panel } = await openInvite(page, { emailConfigured: true });
  await panel.getByLabel("Client's email").fill("maya@example.com");
  await panel.getByRole("button", { name: "Send invite" }).click();
  await expect(panel).toContainText("Invite sent to maya@example.com. The link works once, for 48 hours.");
  await expect(panel.getByLabel(/Invite link/)).toHaveCount(0);
});

test("a bad email is caught before sending; a taken email shows the server's plain words", async ({ page }) => {
  const { panel, invites } = await openInvite(page, { emailConfigured: false, inviteStatus: 409 });
  await panel.getByLabel("Client's email").fill("not-an-email");
  await panel.getByRole("button", { name: "Send invite" }).click();
  await expect(panel.getByRole("alert")).toContainText("Please enter a valid email address.");
  expect(invites).toEqual([]);
  await panel.getByLabel("Client's email").fill("taken@example.com");
  await panel.getByRole("button", { name: "Send invite" }).click();
  await expect(panel.getByRole("alert")).toContainText("That email can't be used for a client sign-in. Please use a different one.");
});

test("an active client shows as active, and the button offers a new invite", async ({ page }) => {
  const { panel } = await openInvite(page, { emailConfigured: false, status: "active" });
  await expect(panel).toContainText("Active - they can sign in. Signs in as maya@example.com.");
  await expect(panel.getByLabel("Client's email")).toHaveValue("maya@example.com");
  await expect(panel.getByRole("button", { name: "Send a new invite" })).toBeVisible();
});

// ----- Client side: /client/login, /client/set-password, /client -----

async function mockClientAuth(page: Page, opts: { loginOk?: boolean; setOk?: boolean } = {}) {
  const calls: string[] = [];
  let signedIn = false;
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${path}`);
    if (path === "/api/client-auth/login") {
      if (opts.loginOk === false) return route.fulfill({ status: 401, json: { error: "That email or password is not right." } });
      signedIn = true;
      return route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } });
    }
    if (path === "/api/client-auth/set-password") {
      return opts.setOk === false
        ? route.fulfill({ status: 400, json: { error: "This invite link is not valid any more. Please ask your coach for a new one." } })
        : route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/client-auth/me") {
      return signedIn
        ? route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } })
        : route.fulfill({ status: 401, json: { error: "You are not signed in." } });
    }
    if (path === "/api/client-auth/logout") {
      signedIn = false;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
  return { calls };
}

test("client login page: labelled, same design system, and no sign-up link", async ({ page }) => {
  await mockClientAuth(page);
  await page.goto("/client/login");
  await expect(page).toHaveTitle("Client sign-in - Repsy Coach");
  await expect(page.getByRole("heading", { level: 1, name: "Client sign-in" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Client sign-in - Repsy Coach" })).toBeVisible();
  await expect(page.getByText("Repsy Coach - for clients invited by their coach.")).toBeVisible();
  await expect(page.getByRole("link", { name: /create|sign up|register/i })).toHaveCount(0);
  await expect(page.locator("a[href='/register']")).toHaveCount(0);
  // Same design system as the coach screens: the orange primary button.
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS("background-color", "rgb(255, 74, 31)");
});

test("client signs in with the CLIENT endpoint, lands on /client, and signs out", async ({ page }) => {
  const { calls } = await mockClientAuth(page);
  await page.goto("/client/login");
  await page.getByLabel("Email").fill("maya@example.com");
  await page.getByLabel("Password").fill("client password 123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hi, Maya Patel" })).toBeVisible();
  expect(calls).toContain("POST /api/client-auth/login");
  expect(calls.some((c) => c.startsWith("POST /api/auth/"))).toBe(false); // never the coach login
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/client\/login$/);
  expect(calls).toContain("POST /api/client-auth/logout");
});

test("a wrong password shows plain words and stays on the page", async ({ page }) => {
  await mockClientAuth(page, { loginOk: false });
  await page.goto("/client/login");
  await page.getByLabel("Email").fill("maya@example.com");
  await page.getByLabel("Password").fill("wrong password!!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("That email or password is not right.");
  await expect(page).toHaveURL(/\/client\/login$/);
});

test("/client while signed out goes to the CLIENT login, not the coach login", async ({ page }) => {
  await mockClientAuth(page);
  await page.goto("/client");
  await expect(page).toHaveURL(/\/client\/login$/);
});

test("set-password from the invite link, then sign in", async ({ page }) => {
  const { calls } = await mockClientAuth(page);
  await page.goto("/client/set-password?token=abc123");
  await expect(page.getByRole("heading", { level: 1, name: "Choose your password" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Your password needs at least 10 characters.")).toBeVisible();
  expect(calls.filter((c) => c.includes("set-password"))).toEqual([]);

  await page.getByLabel("Password", { exact: true }).fill("client password 123");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/client\/login\?set=1$/);
  await expect(page.getByRole("status")).toContainText("Your password is set. Sign in with it below.");
});

test("a used or expired invite link shows plain words", async ({ page }) => {
  await mockClientAuth(page, { setOk: false });
  await page.goto("/client/set-password?token=spent");
  await page.getByLabel("Password", { exact: true }).fill("client password 123");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("alert")).toContainText("This invite link is not valid any more. Please ask your coach for a new one.");
});

test("a set-password page with no token says the link is not valid", async ({ page }) => {
  await mockClientAuth(page);
  await page.goto("/client/set-password");
  await expect(page.getByRole("alert")).toContainText("This invite link is not valid any more.");
});

test("a client session cannot open /app: the coach guard sends them to the coach login", async ({ page }) => {
  await mockClientAuth(page); // every coach /api route answers 401
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
