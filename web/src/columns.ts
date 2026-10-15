// How many columns the cards use: by default as many as the window has room for, or the number the owner set with the
// buttons (ADR 002, amendment of 2026-10-16). The set number is remembered in the browser as a convenience: storage can be
// missing or throw, and the page works without it, like the theme choice.
import { safeStorage } from "./theme";

export const COLUMNS_KEY = "board-columns";
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;
export const CARD_WIDTH = 288; // px, the width a card is given when the count is automatic (18 rem)
export const GAP = 16; // px, between columns (gap-4)
export const PAGE_PADDING = 48; // px, both sides together (p-6); only the guess before the stage is measured
export const TABLET_STAGE = 640; // px, the stage width from which the screen counts as a tablet (Tailwind's sm)
export const LARGE_STAGE = 960; // px, the stage width from which the screen counts as a large one

export type Range = { min: number; max: number };

/** The counts the owner may choose between: one column and no choice on a phone, 2 to 8 on a tablet, 3 to 8 on a large screen. */
export function columnRange(stageWidth: number): Range {
  if (stageWidth < TABLET_STAGE) return { min: MIN_COLUMNS, max: MIN_COLUMNS };
  if (stageWidth < LARGE_STAGE) return { min: 2, max: MAX_COLUMNS };
  return { min: 3, max: MAX_COLUMNS };
}

export function clampColumns(count: number, range: Range): number {
  return Math.min(range.max, Math.max(range.min, count));
}

/** The count when the owner has not set one: as many cards of the usual width as the stage has room for, within the range. */
export function autoColumns(stageWidth: number): number {
  const room = Math.floor((stageWidth + GAP) / (CARD_WIDTH + GAP));
  return clampColumns(room, columnRange(stageWidth));
}

export function readColumns(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): number | null {
  try {
    const value = Number(storage?.getItem(COLUMNS_KEY));
    return Number.isInteger(value) && value >= MIN_COLUMNS && value <= MAX_COLUMNS ? value : null;
  } catch {
    return null;
  }
}

export function writeColumns(count: number, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(COLUMNS_KEY, String(count));
  } catch {
    // the number still applies for this visit
  }
}
