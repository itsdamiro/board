import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { brandView, installServer, item } from "./fakeServer";

// Moving an item's card (ADR 001, amendment of 2026-10-20): the grip, the drag, the arrow keys, and what is asked of the server.

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  document.documentElement.className = "";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function shown() {
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  await screen.findByRole("button", { name: /^Brand/ });
  await act(async () => {});
}

// Shown in this order: first, second, third (so the note holds them as third, second, first). A note dated between the items sits between them.
function setup(refuse?: { status: number; error: string }) {
  const voice = { title: "Voice", text: "How it sounds.", problem: null, date: "2026-10-02T12:00" };
  return installServer(
    [
      brandView("alpha", { panels: [voice] }, [
        item({ key: "a", description: "first", date: "2026-10-03T10:00" }),
        item({ key: "b", description: "second", date: "2026-10-02T10:00" }),
        item({ key: "c", description: "third", date: "2026-10-01T10:00" }),
      ]),
    ],
    refuse,
  );
}

const grip = (words: string) => screen.getByRole("button", { name: `Move ${words}` });
const order = () => screen.getAllByRole("button", { name: /^Move / }).map((button) => button.getAttribute("aria-label")?.replace("Move ", ""));
const moves = (calls: { method: string; path: string; body: unknown }[]) =>
  calls.filter((call) => call.path.endsWith("/move")).map((call) => [call.path, call.body]);

/** jsdom lays nothing out: a card is 100 px tall at the top of the page. */
function layOut(card: HTMLElement) {
  card.getBoundingClientRect = () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) });
}

// what a drag from a grip carries: one custom type and no files, which is how the page's own drop handlers know to leave it alone
const transfer = () => ({ effectAllowed: "", dropEffect: "", types: ["application/x-board-card"], files: [], setData: vi.fn(), setDragImage: vi.fn() });

/** Starts dragging the card, and waits for the page to show it dimmed. */
async function startDrag(words: string) {
  fireEvent.dragStart(grip(words), { dataTransfer: transfer() });
  await waitFor(() => expect(grip(words).closest("li")!.className).toContain("opacity-50"));
}

/** A drag event over `card` with the pointer `y` px down the page: jsdom has no DragEvent, so the plain event is given the position. */
function dragEvent(type: "dragOver" | "drop", card: HTMLElement, y: number): boolean {
  const event = createEvent[type](card, { dataTransfer: transfer() });
  Object.defineProperty(event, "clientY", { value: y });
  return fireEvent(card, event);
}

function dropOn(words: string, y: number) {
  const card = grip(words).closest("li")!;
  layOut(card);
  dragEvent("dragOver", card, y);
  dragEvent("drop", card, y);
}

describe("the grip", () => {
  it("is on each item's card, labelled with its words, shown and sized like the trash button, and on no other card", async () => {
    setup();
    render(<App />);
    await shown();
    expect(order()).toEqual(["first", "second", "third"]);
    expect(screen.getAllByRole("region", { name: "Voice" })).toHaveLength(1);
    const own = grip("second");
    expect(own.getAttribute("draggable")).toBe("true");
    expect(own.getAttribute("tabindex")).toBe("0");
    expect(own.className).toContain("opacity-0");
    expect(own.className).toContain("group-hover:opacity-100");
    expect(own.className).toContain("pointer-coarse:size-11");
    expect(own.closest("li")!.className).toContain("group");
    expect(screen.getByRole("region", { name: "Voice" }).closest("li")!.querySelector("[draggable]")).toBeNull();
  });

  it("goes while cards are being picked", async () => {
    setup();
    render(<App />);
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Select cards" }));
    expect(screen.queryAllByRole("button", { name: /^Move / })).toHaveLength(0);
  });
});

describe("dragging a card", () => {
  it("dropped on the lower half of another card, goes below it: the server is asked to put it before the card shown above it", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    await startDrag("first");
    dropOn("third", 90);
    await waitFor(() => expect(order()).toEqual(["second", "third", "first"]));
    expect(moves(calls)).toEqual([["/api/brands/alpha/items/a/move", { before: "c" }]]);
  });

  it("dropped on the upper half of the first card, goes to the top, which is the end of the note", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    await startDrag("third");
    dropOn("first", 10);
    await waitFor(() => expect(order()).toEqual(["third", "first", "second"]));
    expect(moves(calls)).toEqual([["/api/brands/alpha/items/c/move", { before: null }]]);
  });

  it("is dimmed while it is dragged, and the line of the drop shows on the half it would go to, until the drag ends", async () => {
    setup();
    render(<App />);
    await shown();
    await startDrag("first");
    const card = grip("second").closest("li")!;
    layOut(card);
    dragEvent("dragOver", card, 10);
    const line = () => card.querySelector("span[aria-hidden].h-1");
    expect(line()?.className).toContain("top-0");
    dragEvent("dragOver", card, 90);
    expect(line()?.className).toContain("bottom-0");
    fireEvent.dragEnd(grip("first"));
    expect(line()).toBeNull();
    expect(grip("first").closest("li")!.className).not.toContain("opacity-50");
  });

  it("asks nothing when the card is dropped where it is, on itself, or on a note", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    await startDrag("first");
    dropOn("second", 10); // it already is just above the second
    await startDrag("first");
    dropOn("first", 90);
    await startDrag("first");
    const note = screen.getByRole("region", { name: "Voice" }).closest("li")!;
    expect(dragEvent("dragOver", note, 50)).toBe(true); // not cancelled: nothing may be dropped there
    dragEvent("drop", note, 50);
    await act(async () => {});
    expect(moves(calls)).toEqual([]);
    expect(order()).toEqual(["first", "second", "third"]);
  });

  it("lets a card be dropped on another item card, and takes nothing that was not dragged from a grip", async () => {
    setup();
    render(<App />);
    await shown();
    const card = grip("second").closest("li")!;
    layOut(card);
    expect(dragEvent("dragOver", card, 10)).toBe(true); // a file or a link from elsewhere
    await startDrag("first");
    expect(dragEvent("dragOver", card, 10)).toBe(false); // cancelled: the card may be dropped here
  });

  it("starts the drag with no text, so dropping it on a text box pastes nothing", async () => {
    setup();
    render(<App />);
    await shown();
    const data = transfer();
    fireEvent.dragStart(grip("first"), { dataTransfer: data });
    expect(data.effectAllowed).toBe("move");
    expect(data.setData).toHaveBeenCalledTimes(1);
    expect(data.setData.mock.calls[0]?.[0]).not.toBe("text/plain");
    expect(data.setDragImage).toHaveBeenCalledWith(grip("first").closest("li"), expect.any(Number), expect.any(Number));
  });

  it("shows the server's words when the move is refused, and reads the brand again", async () => {
    const { calls } = setup({ status: 409, error: "no block has this text now: it was changed or removed since it was shown" });
    render(<App />);
    await shown();
    const reads = () => calls.filter((call) => call.method === "GET" && call.path === "/api/brands/alpha").length;
    const before = reads();
    await startDrag("first");
    dropOn("third", 90);
    expect((await screen.findByRole("alert")).textContent).toContain("it was changed or removed since it was shown");
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    expect(order()).toEqual(["first", "second", "third"]);
  });

  it("clears the message of a refused move when the next move is tried", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    fireEvent.keyDown(grip("first"), { key: "ArrowDown" });
    await waitFor(() => expect(order()).toEqual(["second", "first", "third"]));
    expect(moves(calls)).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("moving a card with the keys", () => {
  it("Down moves it below the next item card, Up above the one before, and the focus stays on its grip", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    grip("first").focus();
    fireEvent.keyDown(grip("first"), { key: "ArrowDown" });
    await waitFor(() => expect(order()).toEqual(["second", "first", "third"]));
    await waitFor(() => expect(document.activeElement).toBe(grip("first")));
    fireEvent.keyDown(grip("first"), { key: "ArrowUp" });
    await waitFor(() => expect(order()).toEqual(["first", "second", "third"]));
    await waitFor(() => expect(document.activeElement).toBe(grip("first")));
    expect(moves(calls)).toEqual([
      ["/api/brands/alpha/items/a/move", { before: "b" }],
      ["/api/brands/alpha/items/a/move", { before: null }],
    ]);
  });

  it("takes one move at a time: a second key press while the first is being written is left", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    fireEvent.keyDown(grip("first"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("first"), { key: "ArrowDown" });
    await waitFor(() => expect(order()).toEqual(["second", "first", "third"]));
    expect(moves(calls)).toHaveLength(1);
  });

  it("has nowhere to go from the top going up or the bottom going down, and other keys do nothing", async () => {
    const { calls } = setup();
    render(<App />);
    await shown();
    fireEvent.keyDown(grip("first"), { key: "ArrowUp" });
    fireEvent.keyDown(grip("third"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("second"), { key: "Enter" });
    fireEvent.keyDown(grip("second"), { key: " " });
    await act(async () => {});
    expect(moves(calls)).toEqual([]);
  });

  it("says when the server refused it, and gives the focus back to nothing it should not", async () => {
    setup({ status: 409, error: "the note changed" });
    render(<App />);
    await shown();
    grip("first").focus();
    fireEvent.keyDown(grip("first"), { key: "ArrowDown" });
    expect((await screen.findByRole("alert")).textContent).toContain("the note changed");
    expect(order()).toEqual(["first", "second", "third"]);
  });
});
