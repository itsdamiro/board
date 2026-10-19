import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { SpecialCard } from "./api";
import { brandView, installServer, item } from "./fakeServer";

// The special cards of ADR 009 on the page: the header's Add card menu, the three forms, the cards, click to copy, and the edit.

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
  Reflect.deleteProperty(document, "execCommand");
});

const PALETTE: SpecialCard = {
  kind: "colors",
  title: "Primary",
  colors: [
    { hex: "#1A2B3C", name: "Deep ink" },
    { hex: "#FFF", name: "" },
  ],
};
const MISSION: SpecialCard = { kind: "text", title: "Mission", body: "To make it quiet." };
const INTER: SpecialCard = { kind: "type", name: "Inter", notes: "Body", google: "https://fonts.google.com/specimen/Inter" };

async function shown() {
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  await screen.findByRole("button", { name: /^Brand/ });
  await act(async () => {});
}

async function pick(label: string) {
  const trigger = screen.getByRole("button", { name: "Add card" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const entry = (await screen.findAllByRole("menuitem")).find((i) => i.textContent === label);
  if (entry === undefined) throw new Error(`no ${label} in the menu`);
  fireEvent.keyDown(entry, { key: "Enter" });
  return screen.findByRole("dialog");
}

function setup(items = [item({ key: "a", description: "plain", date: "2026-10-01" })], refuse?: { status: number; error: string }) {
  const server = installServer([brandView("alpha", {}, items)], refuse);
  render(<App />);
  return server;
}

describe("the Add card button", () => {
  it("is in the header with a menu of three choices", async () => {
    setup();
    await shown();
    const trigger = screen.getByRole("button", { name: "Add card" });
    expect(trigger.className).toContain("whitespace-nowrap");
    expect(trigger.className).toContain("pointer-coarse:min-h-11");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect((await screen.findAllByRole("menuitem")).map((i) => i.textContent)).toEqual(["Text card", "Colours", "Font"]);
  });

  it("is not there for a brand with no Moodboard note, where nothing could be added", async () => {
    installServer([brandView("alpha", { moodboard: { exists: false, problem: null, items: [] } })]);
    render(<App />);
    await shown();
    expect(screen.queryByRole("button", { name: "Add card" })).toBeNull();
  });
});

describe("adding colours", () => {
  it("sends the title and each colour, then shows the stripes and closes the form", async () => {
    const { calls } = setup();
    await shown();
    const dialog = await pick("Colours");
    expect(within(dialog).getByRole("heading", { name: "Add colours" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Title (optional)"), { target: { value: "Primary" } });
    fireEvent.change(within(dialog).getByLabelText("Colour 1 hex"), { target: { value: "#1a2b3c" } });
    fireEvent.change(within(dialog).getByLabelText("Colour 1 name"), { target: { value: "Deep ink" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add colour" }));
    fireEvent.change(within(dialog).getByLabelText("Colour 2 hex"), { target: { value: "#fff" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await screen.findByRole("button", { name: "Copy #1a2b3c, Deep ink" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      card: {
        kind: "colors",
        title: "Primary",
        colors: [
          { hex: "#1a2b3c", name: "Deep ink" },
          { hex: "#fff", name: "" },
        ],
      },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the colour picker and the hex field in step, and refuses to remove the last row", async () => {
    setup();
    await shown();
    const dialog = await pick("Colours");
    const picker = within(dialog).getByLabelText("Colour 1") as HTMLInputElement;
    const hex = within(dialog).getByLabelText("Colour 1 hex") as HTMLInputElement;
    fireEvent.change(picker, { target: { value: "#00ff00" } });
    expect(hex.value).toBe("#00ff00");
    fireEvent.change(hex, { target: { value: "#f00" } });
    expect(picker.value).toBe("#ff0000"); // a 3-digit value is shown in full by the picker
    fireEvent.change(hex, { target: { value: "red" } });
    expect(picker.value).toBe("#000000"); // not a hex value: the picker shows black and the server will refuse the text
    expect((within(dialog).getByRole("button", { name: "Remove colour 1" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add colour" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove colour 1" }));
    expect(within(dialog).queryByLabelText("Colour 2 hex")).toBeNull();
  });

  it("stops offering more than twelve colours", async () => {
    setup();
    await shown();
    const dialog = await pick("Colours");
    const more = within(dialog).getByRole("button", { name: "Add colour" }) as HTMLButtonElement;
    for (let n = 0; n < 11; n += 1) fireEvent.click(more);
    expect(within(dialog).getAllByLabelText(/^Colour \d+ hex$/)).toHaveLength(12);
    expect(more.disabled).toBe(true);
  });

  it("shows the server's refusal in the form and keeps what was typed", async () => {
    const { calls } = setup(undefined, { status: 422, error: "a hex value is # and 3 or 6 digits, such as #1A2B3C" });
    await shown();
    const dialog = await pick("Colours");
    fireEvent.change(within(dialog).getByLabelText("Colour 1 hex"), { target: { value: "red" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("a hex value is # and 3 or 6 digits, such as #1A2B3C");
    expect((within(dialog).getByLabelText("Colour 1 hex") as HTMLInputElement).value).toBe("red");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("adding a text card and a font", () => {
  it("sends the title and the words of a text card and shows them as a heading and text", async () => {
    const { calls } = setup();
    await shown();
    const dialog = await pick("Text card");
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Mission" } });
    fireEvent.change(within(dialog).getByLabelText("Words"), { target: { value: "To make it quiet.\nAnd kind." } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Add" }).closest("form")!);
    const card = await screen.findByRole("region", { name: "Mission" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ card: { kind: "text", title: "Mission", body: "To make it quiet.\nAnd kind." } });
    expect(within(card).getByRole("heading", { name: "Mission" })).toBeTruthy();
    expect(card.querySelector("p")?.textContent).toBe("To make it quiet.\nAnd kind.");
  });

  it("sends a font's name and notes and links the address the server wrote, in a new tab with no opener", async () => {
    const { calls } = setup();
    await shown();
    const dialog = await pick("Font");
    fireEvent.change(within(dialog).getByLabelText("Font name"), { target: { value: "Fauna One" } });
    fireEvent.change(within(dialog).getByLabelText("Notes (optional)"), { target: { value: "Headings" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    const card = await screen.findByRole("region", { name: "Font: Fauna One" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ card: { kind: "type", name: "Fauna One", notes: "Headings" } });
    const link = within(card).getByRole("link", { name: "View on Google Fonts" });
    expect(link.getAttribute("href")).toBe("https://fonts.google.com/specimen/Fauna+One");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("cancels with nothing sent, and a text card closes on the dialog's own close button", async () => {
    const { calls } = setup();
    await shown();
    const dialog = await pick("Text card");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("the cards", () => {
  it("draws a colours card as one stripe per colour, in its own colour with a readable ink", async () => {
    setup([item({ key: "p", card: PALETTE })]);
    await shown();
    const dark = screen.getByRole("button", { name: "Copy #1A2B3C, Deep ink" });
    const light = screen.getByRole("button", { name: "Copy #FFF" });
    expect(dark.style.backgroundColor).toBe("rgb(26, 43, 60)");
    expect(dark.style.color).toBe("rgb(255, 255, 255)");
    expect(light.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(light.style.color).toBe("rgb(0, 0, 0)");
    expect(dark.textContent).toBe("#1A2B3CDeep ink");
    expect(screen.getByRole("heading", { name: "Primary" })).toBeTruthy();
  });

  it("turns the words upward when there are more than three stripes", async () => {
    const many = { kind: "colors", title: "", colors: ["#111", "#222", "#333", "#444"].map((hex) => ({ hex, name: "" })) } as const;
    setup([item({ key: "m", card: many })]);
    await shown();
    expect(screen.getByRole("button", { name: "Copy #444" }).querySelector("span")?.className).toContain("writing-mode:vertical-rl");
    expect(within(screen.getByRole("list", { name: "Cards" })).queryByRole("heading")).toBeNull(); // no title, no heading
  });

  it("shows a font's name and sample in its own family, and links only the address of Google Fonts", async () => {
    setup([
      item({ key: "i", card: INTER, date: "2026-10-02" }),
      item({ key: "e", card: { ...INTER, name: "Evil", google: "https://example.com/specimen/Evil" }, date: "2026-10-01" }),
    ]);
    await shown();
    const card = screen.getByRole("region", { name: "Font: Inter" });
    expect(within(card).getByRole("heading", { name: "Inter" }).style.fontFamily).toContain('"Inter"');
    expect(within(card).getByRole("link").getAttribute("href")).toBe("https://fonts.google.com/specimen/Inter");
    expect(within(screen.getByRole("region", { name: "Font: Evil" })).queryByRole("link")).toBeNull();
  });

  it("shows a card's words as text, never as markup", async () => {
    setup([item({ key: "t", card: { kind: "text", title: "<b>Hi</b>", body: "<img src=x onerror=alert(1)>" } })]);
    await shown();
    expect(within(screen.getByRole("region", { name: "<b>Hi</b>" })).getByRole("heading").textContent).toBe("<b>Hi</b>");
    expect(document.querySelector("img")).toBeNull();
  });

  it("names a card by its title in the delete and edit buttons, and a colours card with no title Colours", async () => {
    setup([
      item({ key: "p", card: PALETTE, date: "2026-10-03" }),
      item({ key: "q", card: { kind: "colors", title: "", colors: [{ hex: "#000", name: "" }] }, date: "2026-10-02" }),
      item({ key: "i", card: INTER, date: "2026-10-01" }),
    ]);
    await shown();
    for (const name of ["Delete Primary", "Edit Primary", "Delete Colours", "Edit Colours", "Delete Inter", "Edit Inter"])
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
  });

  it("has an edit button only on a special card", async () => {
    setup([item({ key: "a", description: "plain", date: "2026-10-02" }), item({ key: "t", card: MISSION, date: "2026-10-01" })]);
    await shown();
    expect(screen.getAllByRole("button", { name: /^Edit / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Edit Mission"]);
    const edit = screen.getByRole("button", { name: "Edit Mission" });
    expect(edit.className).toContain("opacity-0");
    expect(edit.className).toContain("group-hover:opacity-100");
    expect(edit.className).toContain("focus-visible:opacity-100");
    expect(edit.className).toContain("pointer-coarse:size-11");
    expect(edit.className).toContain("right-12"); // beside the trash button, not on it
    expect(edit.className).toContain("pointer-coarse:right-16");
  });

  it("hides the edit button in the select mode, as the delete button is", async () => {
    setup([item({ key: "t", card: MISSION })]);
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Select cards" }));
    expect(screen.queryByRole("button", { name: "Edit Mission" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Pick Mission" })).toBeTruthy();
  });
});

describe("copying a hex value", () => {
  it("copies the hex as the card shows it and says Copied on that stripe for a moment", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    setup([item({ key: "p", card: PALETTE })]);
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Copy #1A2B3C, Deep ink" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy #1A2B3C, Deep ink" }).textContent).toBe("CopiedDeep ink"));
    expect(writeText).toHaveBeenCalledWith("#1A2B3C");
    expect(screen.getByRole("button", { name: "Copy #FFF" }).textContent).toBe("#FFF"); // only the stripe that was clicked
  });

  it("says Could not copy when the browser refuses both ways", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    Object.assign(document, { execCommand: () => false });
    setup([item({ key: "p", card: PALETTE })]);
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Copy #FFF" }));
    expect((await screen.findByText("Could not copy")).tagName).toBe("OUTPUT");
    expect(screen.getByRole("button", { name: "Copy #FFF" }).textContent).toBe("#FFF");
  });

  it("goes back to the hex after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });
      setup([item({ key: "p", card: PALETTE })]);
      await shown();
      fireEvent.click(screen.getByRole("button", { name: "Copy #FFF" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Copy #FFF" }).textContent).toBe("Copied"));
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
      expect(screen.getByRole("button", { name: "Copy #FFF" }).textContent).toBe("#FFF");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("editing a card", () => {
  it("opens the same form filled in, sends the new card to the item's key, and shows the change", async () => {
    const { calls } = setup([item({ key: "p", card: PALETTE })]);
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Edit Primary" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit the colours" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Title (optional)") as HTMLInputElement).value).toBe("Primary");
    expect((within(dialog).getByLabelText("Colour 1 hex") as HTMLInputElement).value).toBe("#1A2B3C");
    expect((within(dialog).getByLabelText("Colour 1 name") as HTMLInputElement).value).toBe("Deep ink");
    expect((within(dialog).getByLabelText("Colour 2 hex") as HTMLInputElement).value).toBe("#FFF");
    fireEvent.change(within(dialog).getByLabelText("Colour 2 hex"), { target: { value: "#eeeeee" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Copy #eeeeee" });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/brands/alpha/items/p");
    expect(put?.body).toEqual({
      card: {
        kind: "colors",
        title: "Primary",
        colors: [
          { hex: "#1A2B3C", name: "Deep ink" },
          { hex: "#eeeeee", name: "" },
        ],
      },
    });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("edits a text card and a font with their own fields", async () => {
    const { calls } = setup([item({ key: "t", card: MISSION, date: "2026-10-02" }), item({ key: "i", card: INTER, date: "2026-10-01" })]);
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Edit Mission" }));
    let dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Words") as HTMLTextAreaElement).value).toBe("To make it quiet.");
    fireEvent.change(within(dialog).getByLabelText("Words"), { target: { value: "Quiet." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Quiet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Inter" }));
    dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Font name") as HTMLInputElement).value).toBe("Inter");
    fireEvent.change(within(dialog).getByLabelText("Notes (optional)"), { target: { value: "Interface" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Interface")).toBeTruthy();
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([
      { card: { kind: "text", title: "Mission", body: "Quiet." } },
      { card: { kind: "type", name: "Inter", notes: "Interface" } },
    ]);
  });

  it("shows the server's refusal, as when the card changed since it was shown, and keeps the form open", async () => {
    setup([item({ key: "p", card: PALETTE })], { status: 409, error: "no block has this text now: it was changed or removed since it was shown" });
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "Edit Primary" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("changed or removed since it was shown");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
