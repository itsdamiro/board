import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, type Board } from "./fixtures";
import { watchProblems } from "./problems";

// Moving a card (ADR 001, amendment of 2026-10-20) in a real browser against the real server: a real drag by the grip, the arrow keys
// with the focus staying on the grip, and a refusal when the note was edited by hand meanwhile. What is checked is the note itself:
// the page shows its blocks last to first, and only their order may change.

const NOTE = (board: Board) => join(board.vault, "Brands", "sample-one", "sample-one - Moodboard.md");
const HEAD = "---\ntype: moodboard\n---\n\n";
const blocks = (...words: string[]) => `${HEAD}${words.join("\n\n")}\n`;
const read = (board: Board) => readFileSync(NOTE(board), "utf8");

const cards = (page: Page) => page.getByRole("list", { name: "Cards" }).getByRole("listitem");
/** The words on the grips, in the order the cards are shown. */
const shown = (page: Page) =>
  page.getByRole("button", { name: /^Move / }).evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")?.replace("Move ", "")));

test("a card is moved by dragging its grip, and by the arrow keys, and only the order of the note changes", async ({ page, board }) => {
  const problems = watchProblems(page);
  writeFileSync(NOTE(board), blocks("alpha", "bravo", "charlie"));
  await page.goto(board.url);
  await expect(page.getByRole("button", { name: "Move charlie" })).toBeVisible();
  await expect.poll(() => shown(page)).toEqual(["charlie", "bravo", "alpha"]); // the note's order, reversed

  // Drag the top card onto the lower half of the last one: it is then last in the grid, which is first in the note.
  const last = cards(page).filter({ hasText: "alpha" });
  const box = (await last.boundingBox())!;
  await page.getByRole("button", { name: "Move charlie" }).dragTo(last, { targetPosition: { x: box.width / 2, y: box.height - 6 } });
  await expect.poll(() => read(board)).toBe(blocks("charlie", "alpha", "bravo"));
  await expect.poll(() => shown(page)).toEqual(["bravo", "alpha", "charlie"]);

  // The arrow keys move a card one place, and the focus stays on its grip.
  const alpha = page.getByRole("button", { name: "Move alpha" });
  await alpha.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => read(board)).toBe(blocks("charlie", "bravo", "alpha"));
  await expect.poll(() => shown(page)).toEqual(["alpha", "bravo", "charlie"]);
  await expect(alpha).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => read(board)).toBe(blocks("charlie", "alpha", "bravo"));
  await expect(alpha).toBeFocused();

  // Nowhere to go from the end of the grid, so nothing is written.
  const first = page.getByRole("button", { name: "Move bravo" });
  await first.focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  expect(read(board)).toBe(blocks("charlie", "alpha", "bravo"));
  expect(problems).toEqual([]);
});

test("a move is refused, and says so, when a block was edited by hand since the page showed it", async ({ page, board }) => {
  writeFileSync(NOTE(board), blocks("alpha", "bravo", "charlie"));
  await page.goto(board.url);
  await expect(page.getByRole("button", { name: "Move bravo" })).toBeVisible();
  const edited = blocks("alpha", "bravo, edited by hand", "charlie");
  writeFileSync(NOTE(board), edited);
  const grip = page.getByRole("button", { name: "Move charlie" });
  await grip.focus();
  await page.keyboard.press("ArrowDown"); // below bravo, which is no longer the text the page showed
  await expect(page.getByRole("alert")).toContainText("changed or removed since it was shown");
  expect(read(board)).toBe(edited);
  await expect(page.getByRole("button", { name: "Move bravo, edited by hand" })).toBeVisible(); // the page read the note again
});
