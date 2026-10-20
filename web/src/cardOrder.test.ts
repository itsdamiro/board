import { describe, expect, it } from "vitest";
import type { Panel } from "./api";
import { orderCards } from "./cardOrder";
import { brandView, item } from "./fakeServer";

const note = (title: string, date: string | null): Panel => ({ title, text: title, problem: null, date });
const order = (cards: ReturnType<typeof orderCards>) => cards.map((c) => (c.kind === "item" ? c.item.description : c.kind === "note" ? c.panel.title : "hub"));

describe("orderCards", () => {
  it("puts the hub card first, then items and notes, newest first", () => {
    const brand = brandView("a", { summary: "s", panels: [note("Mid", "2026-10-14"), note("Top", "2026-10-16")] }, [
      item({ key: "1", description: "i1", date: "2026-10-15T10:00" }),
      item({ key: "2", description: "i2", date: "2026-10-13T10:00" }),
    ]);
    expect(order(orderCards(brand))).toEqual(["hub", "Top", "i1", "Mid", "i2"]);
  });

  it("gives a tie, or the same day, to the item, and puts a note with no date last", () => {
    const brand = brandView("a", { panels: [note("Nodate", null), note("Day", "2026-10-15")] }, [
      item({ key: "1", description: "i1", date: "2026-10-15T10:00" }),
    ]);
    expect(order(orderCards(brand))).toEqual(["i1", "Day", "Nodate"]);
  });

  it("gives a note and an item of exactly the same time to the item", () => {
    const brand = brandView("a", { panels: [note("Same", "2026-10-15T10:00")] }, [item({ key: "1", description: "i1", date: "2026-10-15T10:00" })]);
    expect(order(orderCards(brand))).toEqual(["i1", "Same"]);
  });

  it("sorts the notes newest first whatever order they came in, and keeps the order of notes with the same date", () => {
    const brand = brandView("a", { panels: [note("B", "2026-10-02"), note("A", "2026-10-02"), note("Newest", "2026-10-09"), note("Oldest", "2026-10-01")] });
    expect(order(orderCards(brand))).toEqual(["Newest", "B", "A", "Oldest"]);
  });

  it("puts a dated note before an item with no date, and keeps the items in the order the server gave", () => {
    const brand = brandView("a", { panels: [note("N", "2020-01-01")] }, [
      item({ key: "1", description: "later id, listed first", date: "2026-10-15T10:00" }),
      item({ key: "2", description: "listed second", date: "2026-10-16T10:00" }),
      item({ key: "3", description: "none", date: null }),
    ]);
    expect(order(orderCards(brand))).toEqual(["later id, listed first", "listed second", "N", "none"]);
  });

  it("leaves out the Moodboard note, and the hub card when the hub says nothing", () => {
    const brand = brandView("a", { panels: [note("Moodboard", "2026-10-16"), note("moodboard", null)] });
    expect(orderCards(brand)).toEqual([]);
  });

  it("shows the hub card for a hub that could not be read, and gives each item card its own key with a prefix", () => {
    const brand = brandView("a", { hub_problem: "a link" }, [item({ key: "hash-1" }), item({ key: "hash-0" })]);
    const cards = orderCards(brand);
    expect(cards.map((c) => c.key)).toEqual(["hub", "item-hash-1", "item-hash-0"]);
  });
});
