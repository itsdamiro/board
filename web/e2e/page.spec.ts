import { expect, test } from "./fixtures";
import { watchProblems } from "./problems";

// The first end-to-end test (ADR 006): the page the Python server serves loads in a real browser, in both themes, with
// no console error and no Content-Security-Policy violation, and it can reach the API on its own origin.

for (const scheme of ["light", "dark"] as const) {
  test(`the served page loads and answers its API in ${scheme}`, async ({ page, board }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const problems = watchProblems(page);

    await page.goto(board.url);
    await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark).*$/);

    const brands = await page.evaluate(async () => (await fetch("/api/brands")).json());
    expect(brands).toEqual({ brands: ["sample-one", "sample-two"] });

    // Fonts are loaded files, not data: URIs the policy would refuse; wait for them so a refusal is seen.
    await page.evaluate(() => document.fonts.ready);
    expect(problems).toEqual([]);
  });
}

test("the theme switch overrides the browser's setting", async ({ page, board }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(board.url);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
