import type { PlacedItem } from "./cardOrder";

// Where a dragged item goes (ADR 001, amendment of 2026-10-20). The page shows the Moodboard note's blocks last to first, and the
// API speaks of the note: it puts a block just before another block, or at the end. These functions are that translation, with
// no page in them: they take the item cards in the order they are shown and say what to ask the server, or nothing when the
// move would leave the order as it is.

/** The half of a card a drop is in: the item goes above the card, or below it. */
export type Side = "above" | "below";

/** The API's words: the item goes just before the item with this key in the note, or to the end of the note when `before` is null. */
export type MoveRequest = { before: string | null };

/** The item cards' keys as they would be shown with `moving` placed on `side` of `over`; null if that is the order they have, or the ids are not there. */
function placed(keys: string[], moving: string, over: string, side: Side): string[] | null {
  if (moving === over || !keys.includes(moving) || !keys.includes(over)) return null;
  const rest = keys.filter((key) => key !== moving);
  rest.splice(rest.indexOf(over) + (side === "above" ? 0 : 1), 0, moving);
  return rest.every((key, at) => key === keys[at]) ? null : rest;
}

/**
 * What to ask for when the card `moving` is dropped on `side` of the card `over`; both are card keys from `items`, which are in
 * the order shown. The item shown just above where it lands is the one that comes after it in the note, so the move is "before
 * that one"; at the top of the grid nothing is above it, and it goes to the end of the note.
 */
export function moveRequest(items: PlacedItem[], moving: string, over: string, side: Side): MoveRequest | null {
  const order = placed(
    items.map((entry) => entry.key),
    moving,
    over,
    side,
  );
  if (order === null) return null;
  const at = order.indexOf(moving);
  if (at === 0) return { before: null };
  const above = items.find((entry) => entry.key === order[at - 1]);
  return above === undefined ? null : { before: above.item.key };
}

/** The request for moving the card one place up (-1) or down (1) among the item cards shown, or null at the end of the grid. */
export function stepRequest(items: PlacedItem[], moving: string, direction: -1 | 1): MoveRequest | null {
  const at = items.findIndex((entry) => entry.key === moving);
  const next = items[at + direction];
  return at < 0 || next === undefined ? null : moveRequest(items, moving, next.key, direction === -1 ? "above" : "below");
}
