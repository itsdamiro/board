import type { Brand, Item, Panel } from "./api";

// The cards of a brand, in the order the page shows them (ADR 002, amendment on the cards): the hub card first, then the
// Moodboard's items and the other notes together, newest first. The server sends each item and note with its date; this
// only merges the two lists, so an item keeps its place among the items and a note its place among the notes.

export type Card =
  | { kind: "hub"; key: string; brand: Brand }
  | { kind: "item"; key: string; item: Item }
  | { kind: "note"; key: string; panel: Panel };

function isNote(panel: Panel): boolean {
  return panel.title.toLowerCase() !== "moodboard"; // the grid shows what the Moodboard note holds
}

/** An item's key can repeat (two blocks with the same text), so a repeat gets a number. */
function itemKeys(items: Item[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = seen.get(item.key) ?? 0;
    seen.set(item.key, n + 1);
    return n === 0 ? `item-${item.key}` : `item-${item.key}-${n}`;
  });
}

type DatedPanel = Panel & { date: string };

function hasDate(panel: Panel): panel is DatedPanel {
  return panel.date !== null;
}

/** A note goes before an item only if it is strictly later; an item with no date is older than any note with one. */
function goesBefore(note: DatedPanel, item: Item): boolean {
  return item.date === null || note.date > item.date;
}

/** An item with its card's key, which is unique on the page where the item's own key can repeat. */
export type PlacedItem = { key: string; item: Item };

/** The item cards among `cards`, in order. */
export function itemCards(cards: Card[]): PlacedItem[] {
  return cards.flatMap((card) => (card.kind === "item" ? [{ key: card.key, item: card.item }] : []));
}

export function orderCards(brand: Brand): Card[] {
  const cards: Card[] = [];
  if (brand.status !== null || brand.client !== null || brand.summary !== "" || brand.hub_problem !== null) {
    cards.push({ kind: "hub", key: "hub", brand });
  }
  const notes = brand.panels.filter(isNote);
  const dated = notes.filter(hasDate).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const undated = notes.filter((n) => !hasDate(n));
  const items = brand.moodboard.items;
  const keys = itemKeys(items);
  let next = 0;
  const note = (panel: Panel): Card => ({ kind: "note", key: `note-${panel.title}`, panel });
  items.forEach((item, n) => {
    for (let waiting = dated[next]; waiting !== undefined && goesBefore(waiting, item); waiting = dated[++next]) cards.push(note(waiting));
    cards.push({ kind: "item", key: keys[n] ?? `item-${n}`, item });
  });
  dated.slice(next).forEach((panel) => cards.push(note(panel)));
  undated.forEach((panel) => cards.push(note(panel)));
  return cards;
}
