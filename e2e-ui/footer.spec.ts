// Redeploy check footer (Prompt 34).
import { expect, test } from "./fixtures";

test("the footer reads 'Repsy Coach - v1' at the bottom of the app", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/app");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toHaveText("Repsy Coach - v1");
  const main = (await page.getByRole("main").boundingBox())!;
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(main.y + main.height);
});
