import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BRAND_KEY } from "./lastBrand";
import { brandView, dropEvent, installServer, item, pasteEvent, png } from "./fakeServer";
import { STORAGE_KEY } from "./theme";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function shown(slug: string) {
  const heading = await screen.findByRole("heading", { name: slug, level: 2 });
  await act(async () => {}); // let the page's effects run, which is where it listens for a paste, before a test pastes
  return heading;
}

describe("the theme", () => {
  it("shows the title and a theme switch with the system choice pressed", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    expect(screen.getByRole("heading", { name: "Board", level: 1 })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("true");
    await shown("alpha");
  });

  it("applies the dark theme, remembers it, and can go back", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
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
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "beta" }));
    await shown("beta");
  });
});

describe("the brands", () => {
  it("opens the first brand, alphabetically, when none is remembered", async () => {
    installServer([brandView("beta"), brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByRole("button", { name: "alpha" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "beta" }).getAttribute("aria-current")).toBeNull();
  });

  it("opens the remembered brand, and remembers a new choice", async () => {
    window.localStorage.setItem(BRAND_KEY, "beta");
    installServer([brandView("alpha"), brandView("beta")]);
    render(<App />);
    await shown("beta");
    fireEvent.click(screen.getByRole("button", { name: "alpha" }));
    await shown("alpha");
    expect(window.localStorage.getItem(BRAND_KEY)).toBe("alpha");
  });

  it("keeps showing the brand when its own name is clicked again", async () => {
    installServer([brandView("alpha"), brandView("beta")]);
    render(<App />);
    await shown("alpha");
    fireEvent.click(screen.getByRole("button", { name: "alpha" }));
    await shown("alpha");
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("loads a brand again when its name is clicked after the load failed", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "alpha" }));
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

  it("shows the brand's badges, summary and notes, but not its Moodboard panel", async () => {
    installServer([
      brandView("alpha", {
        status: "active",
        client: "A made-up client",
        summary: "One line.",
        panels: [
          { title: "Voice", text: "Plain <b>words</b>\nsecond line", problem: null },
          { title: "Moodboard", text: "![[x.png]] raw", problem: null },
          { title: "Broken", text: "", problem: "this note cannot be read" },
        ],
      }),
    ]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByText("active")).toBeTruthy();
    expect(screen.getByText("A made-up client")).toBeTruthy();
    expect(screen.getByText("One line.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Voice" })).toBeTruthy();
    expect(screen.getByText(/Plain <b>words<\/b>/)).toBeTruthy(); // as text, not as markup
    expect(screen.getByText("this note cannot be read")).toBeTruthy();
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
    expect(screen.queryByLabelText("Description")).toBeNull();
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

describe("the grid", () => {
  it("shows each item with its thumbnail, size, description, and address", async () => {
    installServer([
      brandView("alpha", {}, [
        item({ key: "a", description: "a quiet layout", image: "/api/brands/alpha/images/i.png", thumb: "/api/brands/alpha/thumbs/i.png", width: 640, height: 320, source: "https://example.com/p" }),
        item({ key: "b", description: "", text: "a hand-written line" }),
      ]),
    ]);
    render(<App />);
    await shown("alpha");
    const list = screen.getByRole("list", { name: "Moodboard items" });
    const cards = within(list).getAllByRole("listitem");
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

  it("says when there is nothing yet", async () => {
    installServer([brandView("alpha")]);
    render(<App />);
    await shown("alpha");
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
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
    return { server, field: screen.getByLabelText("Description") as HTMLInputElement };
  }

  it("adds a described item on Enter, clears the field, and shows it from the server's next answer", async () => {
    const { server, field } = await ready();
    fireEvent.change(field, { target: { value: "a thought" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByText("a thought", { selector: "p" });
    expect(server.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ description: "a thought", source: null, image: null }]);
    expect(field.value).toBe("");
    expect(server.calls.filter((c) => c.path === "/api/brands/alpha")).toHaveLength(2); // asked again after the add
  });

  it("sends a pasted image as base64, with the description, then forgets it", async () => {
    const { server, field } = await ready();
    document.dispatchEvent(pasteEvent([png()]));
    const preview = await screen.findByRole("img", { name: "Preview of the file to add" });
    expect(preview.getAttribute("src")).toBe("blob:preview");
    fireEvent.change(field, { target: { value: "with a picture" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByText("with a picture", { selector: "p" });
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ description: "with a picture", source: null, image: "iVBORw==" });
    expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("keeps the paste from also typing the image's name into the page", async () => {
    await ready();
    const event = pasteEvent([png()]);
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("takes a pasted address as the item's address and lets other text paste normally", async () => {
    const { server, field } = await ready();
    const address = pasteEvent([], "https://example.com/page");
    document.dispatchEvent(address);
    expect(address.defaultPrevented).toBe(true);
    await screen.findByText("https://example.com/page");
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
    const { field } = await ready();
    fireEvent.click(screen.getByLabelText("Keep the address for the next item"));
    document.dispatchEvent(pasteEvent([], "https://example.com/page"));
    await screen.findByText("https://example.com/page");
    fireEvent.change(field, { target: { value: "one" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByText("one", { selector: "p" });
    expect(screen.getByText("https://example.com/page", { selector: "span" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove address" }));
    expect(screen.queryByText("https://example.com/page", { selector: "span" })).toBeNull();
  });

  it("queues several dropped images and adds them one by one", async () => {
    const { server, field } = await ready();
    document.dispatchEvent(dropEvent([png(), png()]));
    await screen.findByText("Image 1 of 2");
    fireEvent.change(field, { target: { value: "first" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByText("One image ready");
    fireEvent.change(field, { target: { value: "second" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => expect(screen.queryByText("One image ready")).toBeNull());
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
    document.dispatchEvent(pasteEvent([png()]));
    await screen.findByRole("img", { name: "Preview of the file to add" });
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("shows the server's refusal and keeps what was typed", async () => {
    installServer([brandView("alpha")], { status: 422, error: "that address cannot be taken" });
    render(<App />);
    await shown("alpha");
    const field = screen.getByLabelText("Description") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "kept" } });
    fireEvent.submit(field.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("that address cannot be taken");
    expect(field.value).toBe("kept");
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends one add when Enter is pressed twice before the answer", async () => {
    const { server, field } = await ready();
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
    document.dispatchEvent(pasteEvent([png()]));
    await screen.findByRole("img", { name: "Preview of the file to add" });
    fireEvent.click(screen.getByRole("button", { name: "beta" }));
    await shown("beta");
    expect(screen.queryByRole("img", { name: "Preview of the file to add" })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
