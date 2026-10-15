// How many columns the cards use: by default as many as the window has room for, or the number the owner set with the
// slider (ADR 002, amendment on the slider). The set number is remembered in the browser as a convenience: storage can be
// missing or throw, and the page works without it, like the theme choice.
import { safeStorage } from "./theme";

export const COLUMNS_KEY = "board-columns";
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;
export const CARD_WIDTH = 288; // px, the width a card is given when the count is automatic (18 rem)
export const GAP = 16; // px, between columns (gap-4)
export const PAGE_PADDING = 48; // px, both sides together (p-6)

export function autoColumns(windowWidth: number): number {
  const room = Math.floor((windowWidth - PAGE_PADDING + GAP) / (CARD_WIDTH + GAP));
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, room));
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
