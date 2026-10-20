import { describe, expect, it } from "vitest";
import type { PlacedItem } from "./cardOrder";
import { item } from "./fakeServer";
import { moveRequest, stepRequest } from "./reorder";

// The cards a, b, c, d are shown in that order, so the note holds them as d, c, b, a (the page shows the note last to first).
const shown: PlacedItem[] = ["a", "b", "c", "d"].map((key) => ({ key: `item-${key}`, item: item({ key: `hash-${key}` }) }));

describe("moveRequest", () => {
  it("goes before the item shown just above where the card lands, because the note is shown last to first", () => {
    expect(moveRequest(shown, "item-d", "item-b", "above")).toEqual({ before: "hash-a" }); // a, d, b, c
    expect(moveRequest(shown, "item-d", "item-b", "below")).toEqual({ before: "hash-b" }); // a, b, d, c
    expect(moveRequest(shown, "item-a", "item-c", "below")).toEqual({ before: "hash-c" }); // b, c, a, d
  });

  it("goes to the end of the note, with null, when the card lands at the top of the grid", () => {
    expect(moveRequest(shown, "item-c", "item-a", "above")).toEqual({ before: null }); // c, a, b, d
  });

  it("asks for nothing when the order would not change, or a card is dropped on itself or on one that is not there", () => {
    expect(moveRequest(shown, "item-b", "item-a", "below")).toBeNull();
    expect(moveRequest(shown, "item-b", "item-c", "above")).toBeNull();
    expect(moveRequest(shown, "item-a", "item-a", "above")).toBeNull();
    expect(moveRequest(shown, "item-d", "item-d", "below")).toBeNull();
    expect(moveRequest(shown, "item-a", "item-b", "above")).toBeNull();
    expect(moveRequest(shown, "item-d", "item-c", "below")).toBeNull();
    expect(moveRequest(shown, "item-x", "item-a", "above")).toBeNull();
    expect(moveRequest(shown, "item-a", "item-x", "above")).toBeNull();
  });

  it("uses the item's own key, which the card's key may repeat as a number", () => {
    const twins: PlacedItem[] = [
      { key: "item-same", item: item({ key: "same" }) },
      { key: "item-same-1", item: item({ key: "same" }) },
      { key: "item-z", item: item({ key: "z" }) },
    ];
    expect(moveRequest(twins, "item-z", "item-same-1", "above")).toEqual({ before: "same" });
  });
});

describe("stepRequest", () => {
  it("moves a card one place up or down among the cards shown", () => {
    expect(stepRequest(shown, "item-c", -1)).toEqual({ before: "hash-a" }); // a, c, b, d
    expect(stepRequest(shown, "item-b", 1)).toEqual({ before: "hash-c" }); // a, c, b, d
  });

  it("moves the second card to the top, which is the end of the note", () => {
    expect(stepRequest(shown, "item-b", -1)).toEqual({ before: null });
  });

  it("has nowhere to go from the top going up, the bottom going down, or a card that is not there", () => {
    expect(stepRequest(shown, "item-a", -1)).toBeNull();
    expect(stepRequest(shown, "item-d", 1)).toBeNull();
    expect(stepRequest(shown, "item-x", 1)).toBeNull();
    expect(stepRequest([], "item-a", 1)).toBeNull();
  });
});
