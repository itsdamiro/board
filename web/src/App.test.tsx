import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { COLUMNS_KEY } from "./columns";
import { BRAND_KEY } from "./lastBrand";
import { LOOKUP_KEY } from "./lookup";
import { brandView, dropEvent, installServer, item, pasteEvent, png } from "./fakeServer";
import { STORAGE_KEY } from "./theme";

// A ResizeObserver whose callbacks a test can fire after giving the stage a width (jsdom lays nothing out).
const watchers: Array<() => void> = [];
function watchingStage() {
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { watchers.push(callback); } observe() {} unobserve() {} disconnect() {} });
}
function resizeStage(width: number) {
  const list = screen.getByRole("list", { name: "Cards" });
  Object.defineProperty(list, "clientWidth", { configurable: true, value: width });
  act(() => watchers.forEach((callback) => callback()));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
  document.documentElement.className = "";
  // jsdom lacks what Radix's menu asks of the browser
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  watchers.length = 0;
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
    expect(within(cards[0]!).getByRole("button", { name: "View a quiet layout" })).toBeTruthy(); // opens the viewer, not a new tab
    expect(within(cards[0]!).queryByRole("link", { name: "a quiet layout" })).toBeNull();
    expect(within(cards[0]!).getByRole("link", { name: "https://example.com/p" }).getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(cards[1]!).getByText("a hand-written line")).toBeTruthy();
  });

  describe("a looked-up address (ADR 008)", () => {
    const looked = (over = {}) =>
      item({
        key: "p",
        description: "my words",
        source: "https://example.com/p",
        title: "The page's own title",
        preview: { url: "/api/brands/alpha/links/0123456789abcdef.png", width: 640, height: 360 },
        ...over,
      });

    it("shows the owner's words, then the small icon with the title apart from them, then the address", async () => {
      installServer([brandView("alpha", {}, [looked()])]);
      render(<App />);
      await shown("alpha");
      const card = within(screen.getByRole("list", { name: "Cards" })).getAllByRole("listitem")[1]!;
      const icon = card.querySelector("img")!;
      expect(icon.getAttribute("src")).toBe("/api/brands/alpha/links/0123456789abcdef.png");
      expect(icon.getAttribute("width")).toBe("32"); // drawn small whatever the stored size (ADR 002, amendment of 2026-10-17)
      expect(icon.getAttribute("height")).toBe("32");
      expect(icon.getAttribute("alt")).toBe(""); // the title beside it says what it is
      expect(icon.getAttribute("loading")).toBe("lazy");
      expect(icon.closest("a, button")).toBeNull(); // no link, and the viewer does not open it
      const title = within(card).getByText("The page's own title", { selector: "p" });
      expect(title.className).toContain("text-muted-foreground");
      expect(icon.parentElement).toBe(title.parentElement); // beside the title
      expect(within(card).getByText("my words").className).not.toContain("text-muted-foreground");
      const link = within(card).getByRole("link", { name: "https://example.com/p" });
      expect(icon.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(card).getByText("my words").compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(card).queryByRole("button", { name: /^View/ })).toBeNull();
    });

    it("shows only a title, or only an icon, when the lookup got only that", async () => {
      installServer([
        brandView("alpha", {}, [
          looked({ key: "t", description: "", text: "", preview: null, title: "Only a title" }),
          looked({ key: "i", description: "", text: "", title: null }),
        ]),
      ]);
      render(<App />);
      await shown("alpha");
      expect(screen.getByText("Only a title", { selector: "p" })).toBeTruthy();
      expect(screen.getAllByRole("img", { name: "Site icon" })).toHaveLength(1); // no title: the alternative text is "Site icon"
    });

    it("shows a bare address as before when nothing was kept, and never an icon for an item with its own picture", async () => {
      installServer([
        brandView("alpha", {}, [
          item({ key: "b", description: "bare", source: "https://example.com/b" }),
          item({ key: "w", description: "own", image: "/api/brands/alpha/images/i.png", thumb: "/api/brands/alpha/thumbs/i.png", width: 10, height: 10, preview: { url: "/api/brands/alpha/links/aaaaaaaaaaaaaaaa.png", width: 1, height: 1 } }),
        ]),
      ]);
      render(<App />);
      await shown("alpha");
      expect(screen.queryByRole("img", { name: "Site icon" })).toBeNull();
      expect(screen.getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual(["/api/brands/alpha/thumbs/i.png"]);
    });

    it("shows a title that looks like markup as text", async () => {
      installServer([brandView("alpha", {}, [looked({ title: "<b>bold</b> & more", preview: null })])]);
      render(<App />);
      await shown("alpha");
      expect(screen.getByText("<b>bold</b> & more")).toBeTruthy();
      expect(document.querySelector("b")).toBeNull();
    });
  });

  describe("the viewer", () => {
    const three = () =>
      installServer([
        brandView("alpha", {}, [
          item({ key: "a", description: "first", image: "/img/a.png", thumb: "/t/a.png", date: "2026-10-03", source: "https://example.com/a" }),
          item({ key: "b", description: "second", image: "/img/b.png", thumb: "/t/b.png", date: "2026-10-02" }),
          item({ key: "c", description: "third", image: "/img/c.png", thumb: "/t/c.png", date: "2026-10-01" }),
        ]),
      ]);
    const original = () => screen.getByRole("dialog").querySelector("img")!;

    it("opens the original over the page when a thumbnail is clicked, with its words and address", async () => {
      three();
      render(<App />);
      await shown("alpha");
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "View second" }));
      const dialog = await screen.findByRole("dialog", { name: "second" });
      expect(original().getAttribute("src")).toBe("/img/b.png");
      expect(within(dialog).getByText("2 of 3")).toBeTruthy();
    });

    it("shows the address as a link that opens in a new tab", async () => {
      three();
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "View first" }));
      const link = within(await screen.findByRole("dialog")).getByRole("link", { name: "https://example.com/a" });
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("goes to the next and previous image by the arrows and the keyboard, and stops at the ends", async () => {
      three();
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "View first" }));
      const dialog = await screen.findByRole("dialog");
      const previous = within(dialog).getByRole("button", { name: "Previous image" }) as HTMLButtonElement;
      const next = within(dialog).getByRole("button", { name: "Next image" }) as HTMLButtonElement;
      expect(previous.disabled).toBe(true);
      fireEvent.click(next);
      expect(original().getAttribute("src")).toBe("/img/b.png");
      fireEvent.keyDown(dialog, { key: "ArrowRight" });
      expect(original().getAttribute("src")).toBe("/img/c.png");
      expect(next.disabled).toBe(true);
      fireEvent.keyDown(dialog, { key: "ArrowRight" });
      expect(original().getAttribute("src")).toBe("/img/c.png");
      fireEvent.keyDown(dialog, { key: "ArrowLeft" });
      expect(original().getAttribute("src")).toBe("/img/b.png");
      fireEvent.click(previous);
      expect(original().getAttribute("src")).toBe("/img/a.png");
    });

    it("closes by the close button, by Escape and by a click on the backdrop, and gives the focus back", async () => {
      three();
      render(<App />);
      await shown("alpha");
      for (const close of [
        () => fireEvent.click(screen.getByRole("button", { name: "Close" })),
        () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }),
        () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { hidden: true, name: "" })),
      ]) {
        const thumb = screen.getByRole("button", { name: "View first" });
        fireEvent.click(thumb);
        await screen.findByRole("dialog");
        close();
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(document.activeElement).toBe(thumb);
      }
    });

    it("steps through only the images, in the order of the cards", async () => {
      installServer([
        brandView("alpha", {}, [
          item({ key: "a", description: "first", image: "/img/a.png", thumb: "/t/a.png", date: "2026-10-03" }),
          item({ key: "w", description: "only words", date: "2026-10-02" }),
          item({ key: "c", description: "third", image: "/img/c.png", thumb: "/t/c.png", date: "2026-10-01" }),
        ]),
      ]);
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "View first" }));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Next image" }));
      expect(original().getAttribute("src")).toBe("/img/c.png");
      expect(within(screen.getByRole("dialog")).getByText("2 of 2")).toBeTruthy();
    });
  });

  describe("deleting an item", () => {
    const two = (refuse?: { status: number; error: string }) =>
      installServer(
        [brandView("alpha", {}, [item({ key: "a", description: "first", date: "2026-10-02" }), item({ key: "b", description: "second", date: "2026-10-01" })])],
        refuse,
      );

    it("has a delete button on each item's card, hidden until the pointer is over the card, but never on the other cards", async () => {
      two();
      render(<App />);
      await shown("alpha");
      const button = screen.getByRole("button", { name: "Delete first" });
      expect(button.className).toContain("opacity-0");
      expect(button.className).toContain("group-hover:opacity-100");
      expect(button.className).toContain("focus-visible:opacity-100"); // the keyboard reaches it too
      expect(button.closest("li")!.className).toContain("group");
      expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(2);
    });

    it("asks first, and removes nothing when cancelled", async () => {
      const { calls } = two();
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "Delete first" }));
      const dialog = await screen.findByRole("dialog", { name: "Delete this item?" });
      expect(within(dialog).getByText("first")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(calls.some((call) => call.method === "DELETE")).toBe(false);
      expect(screen.getByText("first")).toBeTruthy();
    });

    it("deletes the item by its key when confirmed, then shows the brand again without it", async () => {
      const { calls } = two();
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "Delete first" }));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByText("first")).toBeNull());
      expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/api/brands/alpha/items/a"]);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("second")).toBeTruthy();
    });

    describe("with shift-click", () => {
      const three = (refuse?: { status: number; error: string }) =>
        installServer(
          [
            brandView("alpha", {}, [
              item({ key: "a", description: "first", image: "/img/a.png", thumb: "/t/a.png", date: "2026-10-03" }),
              item({ key: "b", description: "second", date: "2026-10-02" }),
              item({ key: "c", description: "third", date: "2026-10-01" }),
            ]),
          ],
          refuse,
        );
      const shiftClick = (element: Element) => fireEvent.click(element, { shiftKey: true });
      const card = (words: string) => screen.getByText(words, { selector: "li p" }).closest("li")!;

      it("picks cards, counts them, and does not open the viewer", async () => {
        three();
        render(<App />);
        await shown("alpha");
        expect(screen.queryByRole("status", { name: "Selection" })).toBeNull();
        shiftClick(screen.getByRole("button", { name: "View first" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        shiftClick(card("second"));
        expect(screen.getByRole("status", { name: "Selection" }).textContent).toContain("2 selected");
        shiftClick(card("second")); // a second shift-click lets it go
        expect(screen.getByRole("status", { name: "Selection" }).textContent).toContain("1 selected");
        fireEvent.click(screen.getByRole("button", { name: "View first" })); // a plain click is still the viewer
        expect(await screen.findByRole("dialog")).toBeTruthy();
      });

      it("deletes all the picked cards after one question, one after the other", async () => {
        const { calls } = three();
        render(<App />);
        await shown("alpha");
        shiftClick(card("first"));
        shiftClick(card("third"));
        fireEvent.click(screen.getByRole("button", { name: "Delete 2" }));
        const dialog = await screen.findByRole("dialog", { name: "Delete 2 items?" });
        expect(within(dialog).getByText("first")).toBeTruthy();
        expect(within(dialog).getByText("third")).toBeTruthy();
        shiftClick(within(dialog).getByRole("button", { name: "Delete" })); // inside the dialog a shift-click picks nothing
        await waitFor(() => expect(screen.queryByText("third")).toBeNull());
        expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/api/brands/alpha/items/a", "/api/brands/alpha/items/c"]);
        expect(screen.getByText("second")).toBeTruthy();
        expect(screen.queryByRole("status", { name: "Selection" })).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
      });

      it("clears the picks with Clear or Escape and deletes nothing", async () => {
        const { calls } = three();
        render(<App />);
        await shown("alpha");
        shiftClick(card("second"));
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.queryByRole("status", { name: "Selection" })).toBeNull();
        shiftClick(card("second"));
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("status", { name: "Selection" })).toBeNull();
        expect(calls.some((call) => call.method === "DELETE")).toBe(false);
      });

      it("says how far it got when the server refuses, and keeps what was not deleted", async () => {
        three();
        render(<App />);
        await shown("alpha");
        shiftClick(card("first"));
        shiftClick(card("second"));
        fireEvent.click(screen.getByRole("button", { name: "Delete 2" }));
        const dialog = await screen.findByRole("dialog", { name: "Delete 2 items?" });
        // the second is changed behind the page's back, so the server answers 409 for it, and what is left is read again
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const delete409 = init?.method === "DELETE" && String(input).endsWith("/b");
          if (delete409) return new Response(JSON.stringify({ error: "The item changed since it was shown." }), { status: 409, headers: { "Content-Type": "application/json" } });
          return new Response(JSON.stringify(init?.method === "DELETE" ? { deleted: "a" } : brandView("alpha", {}, [item({ key: "b", description: "second", date: "2026-10-02" }), item({ key: "c", description: "third", date: "2026-10-01" })])), { status: 200, headers: { "Content-Type": "application/json" } });
        }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect((await within(dialog).findByRole("alert")).textContent).toContain("1 of 2 deleted. The item changed since it was shown.");
        await waitFor(() => expect(screen.queryByText("first", { selector: "li p" })).toBeNull()); // what went is gone from the page
        expect(screen.getByText("second", { selector: "li p" })).toBeTruthy();
      });
    });

    it("shows the server's refusal and keeps the item", async () => {
      two({ status: 409, error: "The item changed since it was shown." });
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "Delete first" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect((await within(dialog).findByRole("alert")).textContent).toContain("changed since it was shown");
      expect(screen.getByText("first", { selector: "li p" })).toBeTruthy();
    });

    /** Wraps the fake `fetch`: `change` may answer a call itself, or return nothing to let the fake answer. */
    function intercept(change: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | undefined) {
      const inner = globalThis.fetch;
      vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => change(input, init) ?? inner(input, init)));
      return inner;
    }
    const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

    it("reads the brand again when the server removed the block but could not remove its files, and keeps its warning up until closed", async () => {
      two();
      const warning = "the item was removed from the note but its image files could not be removed";
      const inner = intercept((input, init) => {
        if (init?.method !== "DELETE") return undefined;
        return inner(input, init).then(() => answer(200, { deleted: "a", warning })); // removed, with a warning
      });
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByRole("button", { name: "Delete first" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect((await within(dialog).findByRole("status")).textContent).toContain("image files could not be removed");
      expect(within(dialog).queryByRole("alert")).toBeNull(); // it is a warning, not a failure
      await waitFor(() => expect(screen.queryByText("first", { selector: "li p" })).toBeNull());
      expect(within(dialog).getByRole("status").textContent).toContain("image files could not be removed"); // the dialog is still up, with the words
      expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull(); // nothing left to delete from it
      expect(screen.getByText("second", { selector: "li p" })).toBeTruthy();
      fireEvent.click(within(dialog).getByText("Close", { selector: "button" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("drops the picks at once when their deletion went through, without waiting for the brand to be read again", async () => {
      installServer([brandView("alpha", {}, [item({ key: "a", description: "first" }), item({ key: "b", description: "second" })])]);
      let deleted = false;
      intercept((input, init) => {
        if (init?.method === "DELETE") deleted = true;
        return deleted && init?.method === undefined && String(input) === "/api/brands/alpha" ? new Promise<Response>(() => {}) : undefined; // the next read never comes
      });
      render(<App />);
      await shown("alpha");
      fireEvent.click(screen.getByText("first", { selector: "li p" }), { shiftKey: true });
      fireEvent.click(screen.getByRole("button", { name: "Delete 1" }));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.queryByRole("status", { name: "Selection" })).toBeNull();
    });

    it("asks about two picked blocks with the same text without a console error", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      installServer([brandView("alpha", {}, [item({ key: "same", description: "twice" }), item({ key: "same", description: "twice" })])]);
      render(<App />);
      await shown("alpha");
      screen.getAllByText("twice", { selector: "li p" }).forEach((words) => fireEvent.click(words, { shiftKey: true }));
      fireEvent.click(screen.getByRole("button", { name: "Delete 2" }));
      const dialog = await screen.findByRole("dialog", { name: "Delete 2 items?" });
      expect(within(dialog).getAllByText("twice")).toHaveLength(2);
      expect(error).not.toHaveBeenCalled();
    });

    it("leaves Escape and the + and - keys to an open viewer, and to a field being typed in", async () => {
      installServer([brandView("alpha", {}, [item({ key: "a", description: "first", image: "/img/a.png", thumb: "/t/a.png" }), item({ key: "b", description: "second" })])]);
      render(<App />);
      await shown("alpha");
      const columns = () => screen.getByRole("status", { name: "Columns shown" }).textContent;
      const selected = () => screen.queryByRole("status", { name: "Selection" })?.textContent;
      fireEvent.click(screen.getByText("second", { selector: "li p" }), { shiftKey: true });
      fireEvent.click(screen.getByRole("button", { name: "View first" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.keyDown(dialog, { key: "+" });
      expect(columns()).toBe("3"); // the viewer is open, so the key is not the columns'
      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(selected()).toContain("1 selected"); // Escape closed the viewer and nothing else
      document.dispatchEvent(pasteEvent([png()]));
      await screen.findByLabelText("Description");
      fireEvent.click(screen.getByRole("button", { name: "Add the address of the original" }));
      fireEvent.keyDown(screen.getByLabelText("Address of the original"), { key: "Escape" });
      expect(selected()).toContain("1 selected"); // Escape in a field closed the field and nothing else
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(selected()).toBeUndefined();
    });
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
    expect(columns()).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "More columns" }));
    expect(columns()).toBe("4");
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("4");
    expect(window.localStorage.getItem(COLUMNS_KEY)).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Fewer columns" }));
    expect(columns()).toBe("3");
  });

  it("changes the columns with the + and - keys, but not while typing, with a modifier, or past the ends", async () => {
    installServer([brandView("alpha", {}, [item()])]);
    render(<App />);
    await shown("alpha");
    const columns = () => screen.getByRole("status", { name: "Columns shown" }).textContent;
    expect(columns()).toBe("3");
    fireEvent.keyDown(document.body, { key: "+" });
    expect(columns()).toBe("4");
    fireEvent.keyDown(document.body, { key: "=" }); // the same key without Shift
    expect(columns()).toBe("5");
    fireEvent.keyDown(document.body, { key: "-" });
    fireEvent.keyDown(document.body, { key: "_" });
    expect(columns()).toBe("3");
    fireEvent.keyDown(document.body, { key: "-" }); // three is the least a large screen allows
    expect(columns()).toBe("3");
    fireEvent.keyDown(document.body, { key: "+", ctrlKey: true }); // the browser's zoom
    fireEvent.keyDown(document.body, { key: "+", metaKey: true });
    expect(columns()).toBe("3");
    document.dispatchEvent(pasteEvent([png()]));
    const field = await screen.findByLabelText("Description");
    fireEvent.keyDown(field, { key: "+" });
    expect(columns()).toBe("3");
    expect(screen.getByRole("button", { name: "More columns" }).getAttribute("aria-keyshortcuts")).toBe("+");
  });

  it("stops the buttons at three columns and at eight on a large screen", async () => {
    window.localStorage.setItem(COLUMNS_KEY, "1");
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("3"); // a remembered 1 is below what a large screen allows
    expect((screen.getByRole("button", { name: "Fewer columns" }) as HTMLButtonElement).disabled).toBe(true);
    for (let n = 0; n < 5; n += 1) fireEvent.click(screen.getByRole("button", { name: "More columns" }));
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("8");
    expect((screen.getByRole("button", { name: "More columns" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stops the buttons at two columns on a tablet", async () => {
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    watchingStage();
    render(<App />);
    await shown("alpha");
    resizeStage(720);
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("2");
    expect((screen.getByRole("button", { name: "Fewer columns" }) as HTMLButtonElement).disabled).toBe(true);
    for (let n = 0; n < 6; n += 1) fireEvent.click(screen.getByRole("button", { name: "More columns" }));
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("8");
  });

  it("has one column and no buttons on a phone, and gives the choice back on a wider stage", async () => {
    window.localStorage.setItem(COLUMNS_KEY, "5");
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    watchingStage();
    render(<App />);
    await shown("alpha");
    resizeStage(327);
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("1");
    expect(screen.queryByRole("button", { name: "More columns" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fewer columns" })).toBeNull();
    expect(window.localStorage.getItem(COLUMNS_KEY)).toBe("5"); // narrowing is not a choice
    resizeStage(1392);
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("5");
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("5");
  });

  it("opens with the remembered number of columns, and the count follows the stage until one is set", async () => {
    window.localStorage.setItem(COLUMNS_KEY, "4");
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByRole("list", { name: "Cards" }).style.columns).toBe("4");
    cleanup();
    window.localStorage.clear();
    watchingStage();
    render(<App />);
    await shown("alpha");
    resizeStage(1392);
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("4");
    resizeStage(700);
    expect(screen.getByRole("status", { name: "Columns shown" }).textContent).toBe("2");
  });

  it("holds a chosen count to the range of the screen, and gives it back when the screen is large again", async () => {
    window.localStorage.setItem(COLUMNS_KEY, "2");
    installServer([brandView("alpha", {}, [item({ description: "one" })])]);
    watchingStage();
    render(<App />);
    await shown("alpha");
    const columns = () => screen.getByRole("list", { name: "Cards" }).style.columns;
    resizeStage(1392);
    expect(columns()).toBe("3"); // a large screen holds at least three
    expect(window.localStorage.getItem(COLUMNS_KEY)).toBe("2");
    resizeStage(720);
    expect(columns()).toBe("2");
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
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ description: "", source: "https://example.com/page", image: null, lookup: true });
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

  it("puts the description field under the picture", async () => {
    await ready();
    const field = await withImage();
    const preview = screen.getByRole("img", { name: "Preview of the file to add" });
    expect(preview.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("takes an address typed after the link button, with Enter, without adding the item", async () => {
    const { server } = await ready();
    const field = await withImage();
    fireEvent.change(field, { target: { value: "a reference" } });
    fireEvent.click(screen.getByRole("button", { name: "Add the address of the original" }));
    const address = screen.getByLabelText("Address of the original");
    fireEvent.change(address, { target: { value: "https://example.com/original" } });
    fireEvent.keyDown(address, { key: "Enter" });
    expect(screen.getByText("https://example.com/original")).toBeTruthy();
    expect(screen.queryByLabelText("Address of the original")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add the address of the original" })).toBeNull();
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(server.calls.find((c) => c.method === "POST")?.body).toMatchObject({ description: "a reference", source: "https://example.com/original" }));
  });

  it("refuses a typed address that is not a web address, and Escape closes the field", async () => {
    await ready();
    await withImage();
    fireEvent.click(screen.getByRole("button", { name: "Add the address of the original" }));
    const address = screen.getByLabelText("Address of the original");
    fireEvent.change(address, { target: { value: "not an address" } });
    fireEvent.keyDown(address, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toMatch(/not a web address/);
    fireEvent.keyDown(address, { key: "Escape" });
    expect(screen.queryByLabelText("Address of the original")).toBeNull();
  });

  it("takes an address left in the typed field when the focus leaves it", async () => {
    await ready();
    await withImage();
    fireEvent.click(screen.getByRole("button", { name: "Add the address of the original" }));
    const address = screen.getByLabelText("Address of the original");
    fireEvent.change(address, { target: { value: "https://example.com/left" } });
    fireEvent.blur(address);
    expect(screen.getByText("https://example.com/left")).toBeTruthy();
    expect(screen.queryByLabelText("Address of the original")).toBeNull();
  });

  it("takes nothing from the blur that follows Escape or Enter on the typed field", async () => {
    await ready();
    await withImage();
    for (const key of ["Escape", "Enter"]) {
      fireEvent.click(screen.getByRole("button", { name: "Add the address of the original" }));
      const address = screen.getByLabelText("Address of the original");
      fireEvent.change(address, { target: { value: "https://example.com/once" } });
      // Both in one batch, as a browser does it: the field is removed after the key, and the blur fires on the way out, before the page has re-rendered.
      act(() => {
        fireEvent.keyDown(address, { key });
        fireEvent.blur(address);
      });
      if (key === "Escape") expect(screen.queryByText("https://example.com/once")).toBeNull();
      else {
        expect(screen.getAllByText("https://example.com/once")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Remove address" }));
      }
    }
  });

  it("leaves an address pasted into the description field as the description's text", async () => {
    await ready();
    const field = await withImage();
    const pasted = pasteEvent([], "https://example.com/page");
    field.dispatchEvent(pasted);
    expect(pasted.defaultPrevented).toBe(false);
    expect(screen.queryByRole("button", { name: "Remove address" })).toBeNull();
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

  it("keeps the next queued image when the one being sent is removed before the server answers", async () => {
    await ready();
    const inner = globalThis.fetch;
    let answer: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => (init?.method === "POST" ? new Promise<Response>((resolve) => { answer = () => resolve(inner(input, init)); }) : inner(input, init))));
    document.dispatchEvent(dropEvent([png(), png()]));
    await screen.findByText("Image 1 of 2");
    const field = screen.getByLabelText("Description");
    fireEvent.change(field, { target: { value: "one" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(answer).toBeDefined()); // the first is on its way
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    await act(async () => answer?.());
    await screen.findByText("one", { selector: "li p" });
    expect(screen.getByRole("img", { name: "Preview of the file to add" })).toBeTruthy(); // the second was never sent and stays
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

  describe("the lookup of an address (ADR 008)", () => {
    const LABEL = "Look up the page's title and preview";
    async function withAddress() {
      const { server } = await ready();
      document.dispatchEvent(pasteEvent([], "https://example.com/page"));
      await screen.findByText("https://example.com/page");
      return server;
    }
    const posted = (server: { calls: Array<{ method: string; body: unknown }> }) => server.calls.find((c) => c.method === "POST")?.body;

    it("offers a checkbox, checked, for an address with no picture, and sends it as lookup", async () => {
      const server = await withAddress();
      expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(true);
      fireEvent.submit(screen.getByLabelText("Description").closest("form")!);
      await waitFor(() => expect(posted(server)).toBeDefined());
      expect(posted(server)).toMatchObject({ source: "https://example.com/page", image: null, lookup: true });
    });

    it("sends lookup false when unchecked, and remembers the choice for the next visit", async () => {
      const server = await withAddress();
      fireEvent.click(screen.getByLabelText(LABEL));
      expect(window.localStorage.getItem(LOOKUP_KEY)).toBe("off");
      fireEvent.submit(screen.getByLabelText("Description").closest("form")!);
      await waitFor(() => expect(posted(server)).toBeDefined());
      expect(posted(server)).toMatchObject({ lookup: false });
      cleanup();
      installServer([brandView("alpha")]);
      render(<App />);
      await shown("alpha");
      document.dispatchEvent(pasteEvent([], "https://example.com/other"));
      await screen.findByText("https://example.com/other");
      expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(false);
    });

    it("is not offered, and not sent, when a picture is queued", async () => {
      const server = await withAddress();
      document.dispatchEvent(pasteEvent([png()]));
      await screen.findByRole("img", { name: "Preview of the file to add" });
      expect(screen.queryByLabelText(LABEL)).toBeNull();
      fireEvent.submit(screen.getByLabelText("Description").closest("form")!);
      await waitFor(() => expect(posted(server)).toBeDefined());
      expect(posted(server)).not.toHaveProperty("lookup");
    });

    it("is not offered with no address", async () => {
      await ready();
      await withImage();
      expect(screen.queryByLabelText(LABEL)).toBeNull();
    });

    it("says the page is being looked up while the add waits, and only when it is", async () => {
      await withAddress();
      const real = fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      let release: () => void = () => {};
      const gate = new Promise<void>((done) => (release = done));
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") await gate;
        return real(input, init);
      }));
      fireEvent.submit(screen.getByLabelText("Description").closest("form")!);
      expect((await screen.findByRole("status")).textContent).toBe("Looking up the page…");
      release();
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    });

    it("does not say so when the lookup is unchecked", async () => {
      await withAddress();
      fireEvent.click(screen.getByLabelText(LABEL));
      const real = fetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      let release: () => void = () => {};
      const gate = new Promise<void>((done) => (release = done));
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") await gate;
        return real(input, init);
      }));
      fireEvent.submit(screen.getByLabelText("Description").closest("form")!);
      await act(async () => {});
      expect(screen.queryByRole("status")).toBeNull();
      release();
    });
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
