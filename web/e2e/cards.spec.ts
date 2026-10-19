import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Board } from "./fixtures";
import { watchProblems } from "./problems";

// The special cards of ADR 009 in a real browser against the real server: added from the header's menu, written as plain text at the end
// of the Moodboard, copied by a click, edited in place (only the card's own lines change), refused when the block changed meanwhile,
// and deleted. The colours are set through the style property, so the console stays clean under the Content-Security-Policy.

const NOTE = (board: Board) => join(board.vault, "Brands", "sample-one", "sample-one - Moodboard.md");
const read = (board: Board) => readFileSync(NOTE(board), "utf8");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("the three cards are added from the header menu, copied, edited in place and deleted", async ({ page, board }) => {
  const problems = watchProblems(page);
  await page.goto(board.url);
  await expect(page.getByRole("form", { name: "Add an item" })).toBeVisible();
  const before = read(board);

  // Colours
  await page.getByRole("button", { name: "Add card" }).click();
  await page.getByRole("menuitem", { name: "Colours" }).click();
  const dialog = page.getByRole("dialog", { name: "Add colours" });
  await expect(dialog.getByLabel("Title (optional)")).toBeFocused();
  await dialog.getByLabel("Title (optional)").fill("Primary");
  await dialog.getByLabel("Colour 1 hex").fill("#1a2b3c");
  await dialog.getByLabel("Colour 1 name").fill("Deep ink");
  // One line per colour: name, then hex, then the swatch (jsdom cannot see layout)
  const box = async (label: string) => (await dialog.getByLabel(label, { exact: true }).boundingBox())!;
  const name1 = await box("Colour 1 name");
  const hex1 = await box("Colour 1 hex");
  const swatch1 = await box("Colour 1");
  expect(Math.abs(name1.y - hex1.y)).toBeLessThan(8);
  expect(Math.abs(hex1.y - swatch1.y)).toBeLessThan(8);
  expect(name1.x + name1.width).toBeLessThanOrEqual(hex1.x);
  expect(hex1.x + hex1.width).toBeLessThanOrEqual(swatch1.x);
  await dialog.getByRole("button", { name: "Add colour" }).click();
  await dialog.getByLabel("Colour 2 hex").fill("#f5e9d3");
  await dialog.getByLabel("Colour 2 name").fill("Paper");
  await dialog.getByLabel("Colour 2 hex").press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(read(board)).toBe(`${before}**Primary**\n#1A2B3C Deep ink\n#F5E9D3 Paper\n`);

  const ink = page.getByRole("button", { name: "Copy #1A2B3C, Deep ink" });
  await expect(ink).toHaveCSS("background-color", "rgb(26, 43, 60)");
  await expect(ink).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.getByRole("button", { name: "Copy #F5E9D3, Paper" })).toHaveCSS("color", "rgb(0, 0, 0)");
  const boxes = await page
    .getByRole("region", { name: "Primary" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect()));
  expect(boxes[0]!.top).toBe(boxes[1]!.top); // side by side, as columns
  expect(boxes[1]!.height).toBeGreaterThan(boxes[1]!.width); // taller than wide: vertical columns

  // A click copies the hex
  await ink.click();
  await expect(ink).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("#1A2B3C");
  await expect(ink).toContainText("#1A2B3C", { timeout: 5000 }); // back to the hex after a moment

  // Text card and font
  await page.getByRole("button", { name: "Add card" }).click();
  await page.getByRole("menuitem", { name: "Text card" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Mission");
  await page.getByLabel("Words").fill("To make it quiet.\nAnd kind.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("region", { name: "Mission" })).toContainText("To make it quiet.");
  await page.getByRole("button", { name: "Add card" }).click();
  await page.getByRole("menuitem", { name: "Font" }).click();
  await page.getByLabel("Font name").fill("Fauna One");
  await page.getByLabel("Notes (optional)").fill("Headings");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const font = page.getByRole("region", { name: "Font: Fauna One" });
  await expect(font.getByRole("link", { name: "View on Google Fonts" })).toHaveAttribute("href", "https://fonts.google.com/specimen/Fauna+One");
  expect(read(board)).toBe(`${before}**Primary**\n#1A2B3C Deep ink\n#F5E9D3 Paper\n\n**Mission**\nTo make it quiet.\nAnd kind.\n\nFont: Fauna One\nHeadings\n`);

  // Edit: only the card's own line changes
  const kept = read(board);
  await page.getByRole("button", { name: "Edit Primary" }).click();
  const edit = page.getByRole("dialog", { name: "Edit the colours" });
  await expect(edit.getByLabel("Colour 2 hex")).toHaveValue("#F5E9D3");
  await edit.getByLabel("Colour 2 hex").fill("#eeeeee");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy #EEEEEE, Paper" })).toBeVisible();
  expect(read(board)).toBe(kept.replace("#F5E9D3 Paper", "#EEEEEE Paper"));

  // A refusal: the owner changed the block by hand since it was shown
  await page.getByRole("button", { name: "Edit Mission" }).click();
  const changed = read(board).replace("And kind.", "And kind. (by hand)");
  writeFileSync(NOTE(board), changed);
  const refused = page.getByRole("dialog", { name: "Edit the text card" });
  await refused.getByLabel("Words").fill("Replaced");
  await refused.getByRole("button", { name: "Save" }).click();
  await expect(refused.getByRole("alert")).toContainText("changed or removed since it was shown");
  expect(read(board)).toBe(changed);
  await refused.getByRole("button", { name: "Cancel" }).click();

  // Delete takes only that card's block
  await page.reload();
  await page.getByRole("button", { name: "Delete Primary" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("region", { name: "Primary" })).toHaveCount(0);
  expect(read(board)).toBe(changed.replace("**Primary**\n#1A2B3C Deep ink\n#EEEEEE Paper\n\n", ""));

  // The one refusal above, which the test caused on purpose, is the only thing that went wrong: the answer and the browser's note of it.
  expect(problems.filter((problem) => !/\b409\b/.test(problem))).toEqual([]);
  expect(problems).toHaveLength(2);
});

test("the favicon is served as an SVG that runs nothing, and the page links it", async ({ page, board }) => {
  await page.goto(board.url);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  const answer = await page.request.get(`${board.url}/favicon.svg`);
  expect(answer.status()).toBe(200);
  expect(answer.headers()["content-type"]).toBe("image/svg+xml");
  expect(answer.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(await answer.text()).not.toMatch(/<script|onload|href=/i);
});
