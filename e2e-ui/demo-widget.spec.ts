// Interactive landing demo (Prompt 40). The demo must make ZERO API calls and store nothing.
import { expect, test, type Page } from "@playwright/test";

const CLIENTS = ["Maya", "Arjun", "Casey"];
const TYPES = ["Workout", "Nutrition", "Habit", "Recovery"];
const SAMPLE = "Sample answer - the real app uses your client's real data.";

const widget = (page: Page) => page.getByTestId("demo-widget");
const answer = (page: Page) => widget(page).getByTestId("demo-answer");
const plans = (page: Page) => widget(page).getByRole("list", { name: "Demo plan list" }).getByRole("listitem");

async function open(page: Page) {
  const network: string[] = [];
  // Any API, fetch or XHR request counts (page assets like scripts and fonts don't).
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api") || ["fetch", "xhr", "websocket", "eventsource"].includes(req.resourceType())) {
      network.push(req.url());
    }
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/#demo");
  await expect(widget(page)).toBeVisible();
  return network;
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
}

test("labelled as sample data, with 3 client chips, 4 quick asks and a free-text box", async ({ page }) => {
  await open(page);
  await expect(widget(page)).toContainText("Demo - sample data");
  await expect(widget(page).getByRole("group", { name: "Demo client" }).getByRole("button")).toHaveText(CLIENTS);
  await expect(widget(page).getByRole("group", { name: "Quick ask" }).getByRole("button")).toHaveText(TYPES);
  await expect(widget(page).getByLabel(/Ask about/)).toBeVisible();
});

test("every quick ask for all 3 clients: Thinking..., typed answer, sample note, plan card with reasoning", async ({ page }) => {
  test.setTimeout(120_000);
  const network = await open(page);
  const before = await storageSnapshot(page);
  for (const name of CLIENTS) {
    await widget(page).getByRole("group", { name: "Demo client" }).getByRole("button", { name }).click();
    for (const [i, type] of TYPES.entries()) {
      await widget(page).getByRole("group", { name: "Quick ask" }).getByRole("button", { name: type }).click();
      await expect(widget(page).getByTestId("demo-thinking")).toBeVisible();
      await expect(widget(page).getByRole("group", { name: "Quick ask" }).getByRole("button", { name: type })).toBeDisabled();
      await expect(answer(page)).toHaveAttribute("data-done", "true", { timeout: 10_000 });
      await expect(answer(page)).toContainText(SAMPLE);
      await expect(plans(page)).toHaveCount(i + 1);
      const card = plans(page).first();
      await expect(card).toContainText(type);
      await expect(card.getByTestId("demo-reasoning")).toContainText(/^Why: .{10,}/);
    }
  }
  expect(network).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
});

test("a random question gets a safe sample fallback, not an error, and no plan", async ({ page }) => {
  const network = await open(page);
  await widget(page).getByLabel(/Ask about/).fill("What's the capital of France?");
  await widget(page).getByRole("button", { name: "Ask" }).click();
  await expect(answer(page)).toHaveAttribute("data-done", "true", { timeout: 10_000 });
  await expect(answer(page)).toContainText("Here's what I can see for Maya Patel");
  await expect(answer(page)).toContainText(SAMPLE);
  await expect(plans(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(network).toEqual([]);
});

test("free text is matched by keyword, and medical questions get a referral, never advice", async ({ page }) => {
  await open(page);
  const box = widget(page).getByLabel(/Ask about/);
  await box.fill("How much protein should she eat?");
  await box.press("Enter");
  await expect(answer(page)).toHaveAttribute("data-done", "true", { timeout: 10_000 });
  await expect(plans(page).first()).toContainText("Nutrition");

  await box.fill("Her knee pain is back, what is wrong?");
  await box.press("Enter");
  await expect(answer(page)).toHaveAttribute("data-done", "true", { timeout: 10_000 });
  await expect(answer(page)).toContainText("qualified professional");
  await expect(plans(page)).toHaveCount(1); // no new plan for a medical question
});

test("each client keeps their own plan list", async ({ page }) => {
  await open(page);
  await widget(page).getByRole("group", { name: "Quick ask" }).getByRole("button", { name: "Workout" }).click();
  await expect(plans(page)).toHaveCount(1, { timeout: 10_000 });
  await widget(page).getByRole("group", { name: "Demo client" }).getByRole("button", { name: "Arjun" }).click();
  await expect(plans(page)).toHaveCount(0);
  await widget(page).getByRole("group", { name: "Demo client" }).getByRole("button", { name: "Maya" }).click();
  await expect(plans(page)).toHaveCount(1);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the answer appears whole after Thinking..., with no fly-in animation", async ({ page }) => {
    await open(page);
    await widget(page).getByRole("group", { name: "Quick ask" }).getByRole("button", { name: "Habit" }).click();
    await expect(answer(page)).toHaveAttribute("data-done", "true", { timeout: 3_000 });
    expect(await plans(page).first().getByTestId("demo-plan").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });
});

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test("fits without sideways scroll and works", async ({ page }) => {
    await open(page);
    await widget(page).getByRole("group", { name: "Quick ask" }).getByRole("button", { name: "Recovery" }).click();
    await expect(plans(page)).toHaveCount(1, { timeout: 10_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
