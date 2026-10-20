import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Board } from "./fixtures";
import { watchProblems } from "./problems";

// Blocks with the same text (ADR 001, amendment of 2026-10-20) in a real browser against the real server: the clicked copy is the one
// deleted, one confirmation deletes picked copies, and a copy can be moved. The note is what is checked.

const NOTE = (board: Board) => join(board.vault, "Brands", "sample-one", "sample-one - Moodboard.md");
const HEAD = "---\ntype: moodboard\n---\n\n";
const blocks = (...words: string[]) => `${HEAD}${words.join("\n\n")}\n`;
const read = (board: Board) => readFileSync(NOTE(board), "utf8");

test("one copy of a text shared by several blocks is deleted by its own trash button, and picked copies by one confirmation", async ({ page, board }) => {
  const problems = watchProblems(page);
  writeFileSync(NOTE(board), blocks("ml", "other", "ml", "ml"));
  await page.goto(board.url);
  await expect(page.getByRole("button", { name: "Delete other" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete ml" })).toHaveCount(3);

  // The card at the top is the note's last block; deleting it takes that block only.
  await page.getByRole("button", { name: "Delete ml" }).first().click();
  await page.getByRole("dialog", { name: "Delete this item?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Delete ml" })).toHaveCount(2);
  expect(read(board)).toBe(blocks("ml", "other", "ml"));

  // A copy is moved: the one at the bottom of the grid is the note's first block, and goes to the end of the note.
  const bottom = page.getByRole("button", { name: "Move ml" }).last();
  await bottom.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => read(board)).toBe(blocks("other", "ml", "ml"));

  // Both copies are picked with shift-click and deleted together.
  const copies = page.getByText("ml", { exact: true });
  await expect(copies).toHaveCount(2);
  await copies.nth(0).click({ modifiers: ["Shift"] });
  await copies.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Delete 2" }).click();
  await page.getByRole("dialog", { name: "Delete 2 items?" }).getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => read(board)).toBe(blocks("other"));
  await expect(page.getByText("ml", { exact: true })).toHaveCount(0);
  expect(problems).toEqual([]);
});
