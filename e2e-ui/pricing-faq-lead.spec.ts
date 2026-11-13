// Pricing, FAQ and start-free capture (Prompt 41). /api/leads is mocked like the server.
import { expect, test, type Page } from "@playwright/test";

type Mock = { posts: Record<string, unknown>[]; emails: Set<string> };

async function open(page: Page): Promise<Mock> {
  const mock: Mock = { posts: [], emails: new Set() };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/leads") {
      const body = req.postDataJSON() as { name: string; email: string };
      mock.posts.push(body);
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return route.fulfill({ status: 400, json: { error: "Please enter a valid email address." } });
      if (mock.emails.has(email)) return route.fulfill({ status: 409, json: { error: "You are already on the list." } });
      mock.emails.add(email);
      return route.fulfill({ status: 201, json: { id: "l1", name: body.name.trim(), email, createdAt: new Date().toISOString() } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/?design=classic");
  await expect(page.locator("#pricing").getByTestId("plan")).toHaveCount(3);
  return mock;
}

const form = (page: Page) => page.getByRole("form", { name: "Start free" });

test("3 plans at the published prices, trial noted once, payments honestly 'coming soon'", async ({ page }) => {
  await open(page);
  const plans = page.locator("#pricing").getByTestId("plan");
  await expect(plans.nth(0)).toContainText("Solo");
  await expect(plans.nth(0)).toContainText("$39/mo");
  await expect(plans.nth(0)).toContainText("Up to 30 clients");
  await expect(plans.nth(1)).toContainText("Pro");
  await expect(plans.nth(1)).toContainText("$89/mo");
  await expect(plans.nth(2)).toContainText("Studio");
  await expect(plans.nth(2)).toContainText("$199/mo");
  const body = await page.evaluate(() => {
    // The <noscript> shell for non-JS crawlers is in the DOM but never rendered: not visitor copy.
    const copy = document.body.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("noscript").forEach((n) => n.remove());
    return copy.textContent ?? "";
  });
  expect(body.match(/7-day free trial/gi)).toHaveLength(1);
  expect(body).toContain("Client payments: coming soon.");
  expect(body).not.toMatch(/stripe|checkout|credit card|testimonial|trusted by/i);
  // Plan buttons go to the start-free form, not a checkout.
  for (let i = 0; i < 3; i++) await expect(plans.nth(i).getByRole("link")).toHaveAttribute("href", "#start");
});

test("FAQ: the 6 questions, each opens with a plain answer, by keyboard too", async ({ page }) => {
  await open(page);
  const faqs = page.locator("#faq").getByTestId("faq");
  await expect(faqs.locator("summary")).toHaveText([
    /What does Repsy Coach do\?/,
    /Who is it for\?/,
    /Does the AI replace the coach\?/,
    /Can I plan manually\?/,
    /Is my client data private\?/,
    /Can I cancel\?/,
  ]);
  await faqs.nth(2).locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(faqs.nth(2)).toHaveAttribute("open", "");
  await expect(faqs.nth(2)).toContainText("only saved when you tap Assign");
  await faqs.nth(4).locator("summary").click();
  await expect(faqs.nth(4)).toContainText("no login yet");
});

test("real email, then the same email again: success, then 'already on the list'", async ({ page }) => {
  const mock = await open(page);
  await form(page).getByLabel("Name").fill("Priya");
  await form(page).getByLabel("Email").fill("priya@example.com");
  await form(page).getByRole("button", { name: "Start free" }).click();
  await expect(page.getByTestId("lead-result")).toContainText("You're on the list, Priya.");
  expect(mock.posts).toEqual([{ name: "Priya", email: "priya@example.com" }]);

  await page.reload();
  await form(page).getByLabel("Name").fill("Priya again");
  await form(page).getByLabel("Email").fill("PRIYA@example.com");
  await form(page).getByRole("button", { name: "Start free" }).click();
  await expect(page.getByTestId("lead-result")).toContainText("You are already on the list.");
});

test("a bad email shows a clear error next to the field and sends nothing", async ({ page }) => {
  const mock = await open(page);
  await form(page).getByLabel("Name").fill("Sam");
  await form(page).getByLabel("Email").fill("sam@nowhere");
  await form(page).getByRole("button", { name: "Start free" }).click();
  await expect(form(page)).toContainText("Please enter a valid email address.");
  await expect(form(page).getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await form(page).getByLabel("Name").fill("");
  await expect(form(page)).toContainText("Please enter your name.");
  expect(mock.posts).toEqual([]);
});

test("privacy line is shown and only name + email are asked for", async ({ page }) => {
  await open(page);
  await expect(form(page)).toContainText("We only use your name and email to contact you about Repsy Coach.");
  await expect(form(page).locator("input")).toHaveCount(2);
});

test("keyboard only: reach Start free in the header, and submit the lead form", async ({ page }) => {
  const mock = await open(page);
  await page.keyboard.press("Tab"); // logo
  await page.keyboard.press("Tab");
  // Tab until the header Start free link has focus.
  for (let i = 0; i < 6 && !(await page.evaluate(() => document.activeElement?.textContent?.trim() === "Start free")); i++) {
    await page.keyboard.press("Tab");
  }
  expect(await page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe("/app");
  await form(page).getByLabel("Name").focus();
  await page.keyboard.type("Kim");
  await page.keyboard.press("Tab");
  await page.keyboard.type("kim@example.com");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lead-result")).toContainText("You're on the list, Kim.");
  expect(mock.posts).toHaveLength(1);
});
