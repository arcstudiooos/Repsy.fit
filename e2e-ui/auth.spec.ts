// Login screens and app guard (Prompt 46). Every /api call is mocked in the browser; the mock keeps
// a tiny "server" (coaches, passwords, one session cookie-less sign-in state and per-coach clients).
import { expect, test, type Page, type Route } from "@playwright/test";

type Coach = { id: string; name: string; email: string; createdAt: string };
type Mock = {
  coaches: Record<string, { coach: Coach; password: string }>;
  clientsByCoach: Record<string, { id: string; coachId: string; name: string; createdAt: string }[]>;
  signedIn: string | null;
  calls: string[];
  holdMe: boolean;
  releaseMe?: () => void;
};

const MAYA = { id: "c-maya", coachId: "coach-a", name: "Maya Patel", goal: "Fat loss", level: "Intermediate", focus: "", notes: "", age: null, weightKg: null, heightCm: null, createdAt: "2026-10-01T00:00:00.000Z" };

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = {
    coaches: {
      "alice@example.com": {
        coach: { id: "coach-a", name: "Alice Coach", email: "alice@example.com", createdAt: "2026-11-01T00:00:00.000Z" },
        password: "alice-password-1",
      },
      "bob@example.com": {
        coach: { id: "coach-b", name: "Bob Coach", email: "bob@example.com", createdAt: "2026-11-02T00:00:00.000Z" },
        password: "bob-password-12",
      },
    },
    clientsByCoach: { "coach-a": [MAYA], "coach-b": [] },
    signedIn: null,
    calls: [],
    holdMe: false,
  };

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    mock.calls.push(`${req.method()} ${path}`);
    const me = Object.values(mock.coaches).find((c) => c.coach.id === mock.signedIn)?.coach;

    if (path === "/api/auth/me") {
      if (mock.holdMe) await new Promise<void>((resolve) => (mock.releaseMe = resolve));
      return me ? route.fulfill({ json: me }) : route.fulfill({ status: 401, json: { error: "You are not signed in." } });
    }
    if (path === "/api/auth/login" && req.method() === "POST") {
      const { email, password } = req.postDataJSON() as { email: string; password: string };
      const found = mock.coaches[email.toLowerCase()];
      if (!found || found.password !== password) {
        return route.fulfill({ status: 401, json: { error: "That email or password is not right." } });
      }
      mock.signedIn = found.coach.id;
      return route.fulfill({ json: found.coach });
    }
    if (path === "/api/auth/register" && req.method() === "POST") {
      const { name, email, password } = req.postDataJSON() as { name: string; email: string; password: string };
      if (mock.coaches[email.toLowerCase()]) {
        return route.fulfill({ status: 409, json: { error: "That email is already registered." } });
      }
      const coach = { id: `coach-${Object.keys(mock.coaches).length + 1}`, name, email: email.toLowerCase(), createdAt: new Date().toISOString() };
      mock.coaches[coach.email] = { coach, password };
      mock.clientsByCoach[coach.id] = [];
      mock.signedIn = coach.id;
      return route.fulfill({ status: 201, json: coach });
    }
    if (path === "/api/auth/logout" && req.method() === "POST") {
      mock.signedIn = null;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path.startsWith("/api/clients")) {
      if (!me) return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
      if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: mock.clientsByCoach[me.id] ?? [] });
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

test("signed out: /app goes to /login and no dashboard data is requested", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  expect(mock.calls.some((c) => c.includes("/api/clients"))).toBe(false);
});

test("nothing from the dashboard shows until the sign-in check finishes", async ({ page }) => {
  const mock = await mockApi(page);
  mock.signedIn = "coach-a";
  mock.holdMe = true;
  await page.goto("/app");
  await expect(page.getByRole("status").getByText("Loading...")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveCount(0);
  expect(mock.calls.some((c) => c.includes("/api/clients"))).toBe(false);
  mock.releaseMe?.();
  await expect(page.getByRole("tab", { name: "Clients" })).toBeVisible();
});

test("login: right password opens the app with the coach's name, Logout and own clients", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Repsy home" })).toHaveAttribute("href", "/");
  // Prompt 47 turned the "Forgot password?" link on.
  await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("alice-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  // One account menu (initials) holds Account settings and Log out (owner, Nov 2026).
  const menu = page.getByRole("button", { name: "Account menu for Alice Coach" });
  await expect(menu).toHaveText("AC");
  await menu.click();
  await expect(page.getByTestId("coach-name")).toHaveText("Alice Coach");
  await expect(page.getByRole("menuitem", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expect(page.getByText("Maya Patel").first()).toBeVisible();
});

test("login: wrong password shows a plain-words error and stays on /login", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That email or password is not right.");
  await expect(page).toHaveURL(/\/login$/);
});

test("login: empty fields are caught before any request", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Please enter your email.")).toBeVisible();
  await expect(page.getByText("Please enter your password.")).toBeVisible();
  expect(mock.calls.some((c) => c.includes("/auth/login"))).toBe(false);
});

test("register: a new coach lands in an empty app", async ({ page }) => {
  await mockApi(page);
  await page.goto("/register");
  await page.getByLabel("Name").fill("Carol Coach");
  await page.getByLabel("Email").fill("Carol@Example.com");
  await page.getByLabel("Password").fill("carol-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("button", { name: "Account menu for Carol Coach" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No clients yet" })).toBeVisible();
});

test("register: short password and taken email give plain-words errors", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/register");
  await page.getByLabel("Name").fill("Dave");
  await page.getByLabel("Email").fill("dave@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your password needs at least 10 characters.")).toBeVisible();
  expect(mock.calls.some((c) => c.includes("/auth/register"))).toBe(false);

  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("long-enough-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toHaveText("That email is already registered.");
});

test("logout clears everything: the next coach on the same browser sees nothing of the first", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("alice-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Maya Patel").first()).toBeVisible();

  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(mock.signedIn).toBeNull();

  // Same tab, no reload: sign in as the second coach.
  await page.getByLabel("Email").fill("bob@example.com");
  await page.getByLabel("Password").fill("bob-password-12");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("button", { name: "Account menu for Bob Coach" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No clients yet" })).toBeVisible();
  await expect(page.getByText("Maya Patel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Alice Coach/ })).toHaveCount(0);
});

test("the session is not kept in localStorage or sessionStorage", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("alice-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("button", { name: "Account menu for Alice Coach" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toMatch(/token|jwt|session|alice/i);
});
