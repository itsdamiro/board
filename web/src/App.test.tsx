import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { COLUMNS_KEY } from "./columns";
import { BRAND_KEY } from "./lastBrand";
import { brandView, dropEvent, installServer, item, pasteEvent, png } from "./fakeServer";
import { STORAGE_KEY } from "./theme";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
  document.documentElement.className = "";
  // jsdom lacks what Radix's menu asks of the browser
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Waits until the brand is the one in the title menu and its cards have loaded. */
async function shown(slug: string) {
  const menu = await screen.findByRole("button", { name: /^Brand/ });
  await waitFor(() => expect(menu.textContent).toContain(slug));
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  await act(async () => {}); // let the page's effects run, which is where it listens for a paste, before a test pastes
  return menu;
}

/** Opens the title menu by the keyboard, which is what jsdom can do of it, and returns its items. */
async function openMenu() {
  const menu = screen.getByRole("button", { name: /^Brand/ });
  menu.focus();
  fireEvent.keyDown(menu, { key: "Enter" });
  return screen.findAllByRole("menuitemradio");
}

async function choose(slug: string) {
  const items = await openMenu();
  const item = items.find((i) => i.textContent === slug);
  if (item === undefined) throw new Error(`no ${slug} in the menu`);
  fireEvent.keyDown(item, { key: "Enter" });
}

/** Pastes an image and returns the description field that appears for it. */
async function withImage() {
  document.dispatchEvent(pasteEvent([png()]));
  return (await screen.findByLabelText("Description")) as HTMLInputElement;
}

describe("the theme", () => {
  it("shows the brand as the title, with one icon that offers the dark mode", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    expect(screen.getByRole("heading", { name: "Board", level: 1 })).toBeTruthy();
    await shown("alpha");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("alpha");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "System" })).toBeNull();
  });

  it("shows a moon to offer the dark mode and a sun to offer the light one", async () => {
    installServer([brandView("alpha")]);
    const { container } = render(<App />);
    await shown("alpha");
    expect(container.querySelector(".lucide-moon")).not.toBeNull();
    expect(container.querySelector(".lucide-sun")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(container.querySelector(".lucide-sun")).not.toBeNull();
    expect(container.querySelector(".lucide-moon")).toBeNull();
  });

  it("flips to dark, remembers it, and flips back", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("starts from the system's setting, and reads the old system choice as following it", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    window.localStorage.setItem(STORAGE_KEY, "system");
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });

  it("follows the system when it changes and nothing was chosen", async () => {
    let listener: () => void = () => {};
    const query = { matches: false, addEventListener: (_: string, fn: () => void) => (listener = fn), removeEventListener: () => {} };
    vi.stubGlobal("matchMedia", () => query);
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    query.matches = true;
    act(() => listener());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("still works when storage refuses", async () => {
    installServer([brandView("alpha"), brandView("beta")]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<App />);
    await shown("alpha");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await choose("beta");
    await shown("beta");
  });
});

describe("the brands", () => {
  it("opens the first brand, alphabetically, when none is remembered, and lists them all in the menu", async () => {
    installServer([brandView("beta"), brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    const items = await openMenu();
    expect(items.map((o) => o.textContent)).toEqual(["alpha", "beta"]);
    expect(items[0]!.getAttribute("aria-checked")).toBe("true");
    expect(items[1]!.getAttribute("aria-checked")).toBe("false");
  });

  it("opens the remembered brand, and remembers a new choice", async () => {
    window.localStorage.setItem(BRAND_KEY, "beta");
    installServer([brandView("alpha"), brandView("beta")]);
    render(<App />);
    await shown("beta");
    await choose("alpha");
    await shown("alpha");
    expect(window.localStorage.getItem(BRAND_KEY)).toBe("alpha");
  });

  it("loads a brand again when Try again is pressed after the load failed", async () => {
    const view = brandView("alpha");
    let failing = true;
    const real = installServer([view]);
    const working = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (failing && String(input) === "/api/brands/alpha") throw new TypeError("failed to fetch");
      return working(input, init);
    });
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("cannot be reached");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await shown("alpha");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(real.calls.filter((c) => c.path === "/api/brands/alpha")).toHaveLength(1);
  });

  it("ignores a remembered brand that is gone", async () => {
    window.localStorage.setItem(BRAND_KEY, "gone");
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
  });

  it("says so when the vault has no brands", async () => {
    installServer([]);
    render(<App />);
    await screen.findByText("The vault has no brands under Brands/.");
  });

  it("shows the brand's badges and summary as the first card and its notes as cards, but not its Moodboard note", async () => {
    installServer([
      brandView("alpha", {
        status: "active",
        client: "A made-up client",
        summary: "One line.",
        panels: [
          { title: "Voice", text: "Plain <b>words</b>\nsecond line", problem: null, date: "2026-10-10" },
          { title: "Moodboard", text: "![[x.png]] raw", problem: null, date: null },
          { title: "Broken", text: "", problem: "this note cannot be read", date: null },
        ],
      }),
    ]);
    render(<App />);
    await shown("alpha");
    const cards = within(screen.getByRole("list", { name: "Cards" })).getAllByRole("listitem").slice(1); // the first card is the paste box
    expect(within(cards[0]!).getByText("active")).toBeTruthy();
    expect(within(cards[0]!).getByText("A made-up client")).toBeTruthy();
    expect(within(cards[0]!).getByText("One line.")).toBeTruthy();
    expect(within(cards[1]!).getByRole("heading", { name: "Voice" })).toBeTruthy();
    expect(within(cards[1]!).getByText(/Plain <b>words<\/b>/)).toBeTruthy(); // as text, not as markup
    expect(within(cards[2]!).getByText("this note cannot be read")).toBeTruthy();
    expect(cards).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "Moodboard" })).toBeNull();
    expect(screen.queryByText(/raw/)).toBeNull();
  });

  it("keeps the browser from opening a file dropped where there is no input", async () => {
    installServer([brandView("alpha", { moodboard: { exists: false, problem: null, items: [] } })]);
    render(<App />);
    await shown("alpha");
    for (const type of ["dragover", "drop"]) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [] } });
      document.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
  });

  it("offers no input for a brand with no Moodboard note", async () => {
    installServer([brandView("alpha", { moodboard: { exists: false, problem: null, items: [] } })]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByText(/has no Moodboard note/)).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Add an item" })).toBeNull();
    expect(screen.queryByText(/paste \/ drop/)).toBeNull();
  });

  it("reports an unreadable Moodboard and a hub that cannot be read", async () => {
    installServer([brandView("alpha", { hub_problem: "the hub is a link", moodboard: { exists: true, problem: "the frontmatter never closes", items: [] } })]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByText("the frontmatter never closes")).toBeTruthy();
    expect(screen.getByText("the hub is a link")).toBeTruthy();
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("failed to fetch");
    });
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("cannot be reached");
  });
});

describe("the cards", () => {
  it("shows each item with its thumbnail, size, description, and address", async () => {
    installServer([
      brandView("alpha", {}, [
        item({ key: "a", description: "a quiet layout", image: "/api/brands/alpha/images/i.png", thumb: "/api/brands/alpha/thumbs/i.png", width: 640, height: 320, source: "https://example.com/p" }),
        item({ key: "b", description: "", text: "a hand-written line" }),
      ]),
    ]);
    render(<App />);
    await shown("alpha");
    const list = screen.getByRole("list", { name: "Cards" });
    const cards = within(list).getAllByRole("listitem").slice(1); // after the paste box
    expect(cards).toHaveLength(2);
    const picture = within(cards[0]!).getByRole("img", { name: "a quiet layout" });
    expect(picture.getAttribute("src")).toBe("/api/brands/alpha/thumbs/i.png");
    expect(picture.getAttribute("width")).toBe("640");
    expect(picture.getAttribute("height")).toBe("320");
    expect(picture.getAttribute("loading")).toBe("lazy");
    const original = within(cards[0]!).getByRole("link", { name: "a quiet layout" });
    expect(original.getAttribute("href")).toBe("/api/brands/alpha/images/i.png");
    expect(original.getAttribute("target")).toBe("_blank");
    expect(original.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(cards[0]!).getByRole("link", { name: "https://example.com/p" }).getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(cards[1]!).getByText("a hand-written line")).toBeTruthy();
  });

  it("calls an image with no description Image", async () => {
    installServer([brandView("alpha", {}, [item({ description: "", text: "", image: "/i.png", thumb: "/t.png" })])]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByRole("img", { name: "Image" })).toBeTruthy();
  });

  it("shows two blocks with the same text both", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    installServer([brandView("alpha", {}, [item({ key: "same", description: "twice" }), item({ key: "same", description: "twice" })])]);
    render(<App />);
    await shown("alpha");
    expect(screen.getAllByText("twice")).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });

  it("shows no cards, only the empty box, when there is nothing yet", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    const cards = within(screen.getByRole("list", { name: "Cards" })).getAllByRole("listitem");
    expect(cards.map((card) => card.textContent)).toEqual(["paste / drop image here"]);
  });

  it("mixes the notes in among the items by date, newest first", async () => {
    installServer([
      brandView(
        "alpha",
        {
          panels: [
            { title: "Old", text: "o", problem: null, date: "2026-10-01" },
            { title: "Middle", text: "m", problem: null, date: "2026-10-14" },
            { title: "Undated", text: "u", problem: null, date: null },
          ],
        },
        [item({ key: "new", description: "newer item", date: "2026-10-15T09:00" }), item({ key: "old", description: "older item", date: "2026-10-12T09:00" })],
      ),
    ]);
    render(<App />);
    await shown("alpha");
    const cards = within(screen.getByRole("list", { name: "Cards" })).getAllByRole("listitem");
    expect(cards.map((card) => card.textContent)).toEqual(["paste / drop image here", "newer item", "Middlem", "older item", "Oldo", "Undatedu"]);
  });

  it("has plus and minus buttons for the number of columns, starting at what the window has room for", async () => {
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    render(<App />);
    await shown("alpha");
    const columns = () => screen.getByRole("list", { name: "Cards" }).style.columns;
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("3"); // jsdom's window is 1024 px wide
    expect(columns()).toBe("18rem");
    fireEvent.click(screen.getByRole("button", { name: "More columns" }));
    expect(columns()).toBe("4");
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("4");
    expect(window.localStorage.getItem(COLUMNS_KEY)).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Fewer columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer columns" }));
    expect(columns()).toBe("2");
  });

  it("stops the buttons at one column and at eight", async () => {
    window.localStorage.setItem(COLUMNS_KEY, "1");
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    render(<App />);
    await shown("alpha");
    expect((screen.getByRole("button", { name: "Fewer columns" }) as HTMLButtonElement).disabled).toBe(true);
    for (let n = 0; n < 7; n += 1) fireEvent.click(screen.getByRole("button", { name: "More columns" }));
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("8");
    expect((screen.getByRole("button", { name: "More columns" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens with the remembered number of columns, and the count follows the window until one is set", async () => {
    window.localStorage.setItem(COLUMNS_KEY, "2");
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("2");
    cleanup();
    window.localStorage.clear();
    render(<App />);
    await shown("alpha");
    act(() => {
      window.innerWidth = 1440;
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("4");
    window.innerWidth = 1024;
  });

  it("shows no column buttons when there are no cards but the paste box", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    expect(screen.queryByRole("button", { name: "More columns" })).toBeNull();
  });

  it("shows text from a note as text, never as markup", async () => {
    installServer([brandView("alpha", {}, [item({ description: "<img src=x onerror=alert(1)>" })])]);
    const { container } = render(<App />);
    await shown("alpha");
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("adding an item", () => {
  async function ready() {
    const server = installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    return { server };
  }

  it("is a dashed box that says only where to paste, with no field until there is something to describe", async () => {
    await ready();
    const box = screen.getByRole("form", { name: "Add an item" });
    expect(box.textContent).toBe("paste / drop image here");
    expect(box.closest("li")?.className).toContain("border-dashed");
    expect(box.closest("li")?.parentElement?.firstElementChild).toBe(box.closest("li")); // the first card
    expect(screen.queryByLabelText("Description")).toBeNull();
  });

  it("shows the thumbnail and a focused description field once an image is pasted", async () => {
    await ready();
    const field = await withImage();
    expect(screen.getByRole("img", { name: "Preview of the file to add" }).getAttribute("src")).toBe("blob:preview");
    expect(screen.queryByText("paste / drop image here")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it("sends a pasted image as base64, with the description, then goes back to the empty box", async () => {
    const { server } = await ready();
    const field = await withImage();
    fireEvent.change(field, { target: { value: "with a picture" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByText("with a picture", { selector: "p" });
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ description: "with a picture", source: null, image: "iVBORw==" });
    expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull();
    expect(screen.getByText("paste / drop image here")).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(server.calls.filter((c) => c.path === "/api/brands/alpha")).toHaveLength(2); // asked again after the add
  });

  it("keeps the paste from also typing the image's name into the page", async () => {
    await ready();
    const event = pasteEvent([png()]);
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("takes a pasted address as the item's address, with the field, and lets other text paste normally", async () => {
    const { server } = await ready();
    const address = pasteEvent([], "https://example.com/page");
    document.dispatchEvent(address);
    expect(address.defaultPrevented).toBe(true);
    await screen.findByText("https://example.com/page");
    const field = screen.getByLabelText("Description");
    const second = pasteEvent([], "https://other.example.com");
    document.dispatchEvent(second); // an address is already set: this one is just text
    expect(second.defaultPrevented).toBe(false);
    const words = pasteEvent([], "some words");
    document.dispatchEvent(words);
    expect(words.defaultPrevented).toBe(false);
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(screen.queryByText("https://example.com/page")).toBeNull());
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ description: "", source: "https://example.com/page", image: null });
  });

  it("keeps the address for the next item when asked, and drops it when it is removed", async () => {
    await ready();
    document.dispatchEvent(pasteEvent([], "https://example.com/page"));
    await screen.findByText("https://example.com/page");
    fireEvent.click(screen.getByLabelText("Keep for the next item"));
    const field = screen.getByLabelText("Description");
    fireEvent.change(field, { target: { value: "one" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByText("one", { selector: "p" });
    expect(screen.getByText("https://example.com/page", { selector: "span" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove address" }));
    expect(screen.queryByText("https://example.com/page", { selector: "span" })).toBeNull();
  });

  it("queues several dropped images and adds them one by one", async () => {
    const { server } = await ready();
    document.dispatchEvent(dropEvent([png(), png()]));
    await screen.findByText("Image 1 of 2");
    const field = screen.getByLabelText("Description");
    fireEvent.change(field, { target: { value: "first" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(screen.queryByText("Image 1 of 2")).toBeNull());
    expect(screen.getByRole("img", { name: "Preview of the file to add" })).toBeTruthy(); // the second is up next
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "second" } });
    fireEvent.submit(screen.getByLabelText("Description").closest("form")!);
    await waitFor(() => expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull());
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("refuses a drop of files that are not images, and ignores a drag of text", async () => {
    await ready();
    document.dispatchEvent(dropEvent([new File(["x"], "notes.txt", { type: "text/plain" })]));
    expect((await screen.findByRole("alert")).textContent).toBe("Only image files can be added.");
    const text = new Event("drop", { cancelable: true });
    Object.defineProperty(text, "dataTransfer", { value: { types: ["text/plain"], files: [] } });
    document.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
  });

  it("lets a file be dragged over the page, so the browser does not open it", async () => {
    await ready();
    const over = new Event("dragover", { cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: { types: ["Files"] } });
    document.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
  });

  it("removes the image that was queued", async () => {
    await ready();
    await withImage();
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull();
    expect(screen.getByText("paste / drop image here")).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("shows the server's refusal and keeps what was typed, so it can be sent again", async () => {
    const server = installServer([brandView("alpha")], { status: 422, error: "that address cannot be taken" });
    render(<App />);
    await shown("alpha");
    const field = await withImage();
    fireEvent.change(field, { target: { value: "kept" } });
    fireEvent.submit(field.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("that address cannot be taken");
    expect(field.value).toBe("kept");
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(2));
  });

  it("sends one add when Enter is pressed twice before the answer", async () => {
    const { server } = await ready();
    const field = await withImage();
    fireEvent.change(field, { target: { value: "once" } });
    const form = field.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText("once", { selector: "p" });
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("does not carry a queued image to another brand", async () => {
    installServer([brandView("alpha"), brandView("beta")]);
    render(<App />);
    await shown("alpha");
    await withImage();
    await choose("beta");
    await shown("beta");
    expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
