import { afterEach, describe, expect, it, vi } from "vitest";
import { addItem, ApiError, getBrand, listBrands, moveItem, toBase64 } from "./api";
import { installServer, brandView, item, png } from "./fakeServer";

afterEach(() => vi.unstubAllGlobals());

describe("the API client", () => {
  it("lists brands and reads one, quoting its name in the address", async () => {
    const { calls } = installServer([brandView("it's café")]);
    expect(await listBrands()).toEqual(["it's café"]);
    expect((await getBrand("it's café")).slug).toBe("it's café");
    expect(calls.map((c) => c.path)).toEqual(["/api/brands", "/api/brands/it's%20caf%C3%A9"]);
  });

  it("shows the server's own words for a refusal", async () => {
    installServer([brandView("a")], { status: 422, error: "that is not an image" });
    await expect(addItem("a", { description: "", source: null, image: null })).rejects.toThrow(new ApiError("that is not an image"));
  });

  it("says so when the answer carries no message, or the server cannot be reached", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 502 }));
    await expect(listBrands()).rejects.toThrow("The server answered 502.");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("failed to fetch");
    });
    await expect(listBrands()).rejects.toThrow("The server cannot be reached");
  });

  it("refuses an answer that is not a JSON object even when its status is good", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200 }));
    await expect(listBrands()).rejects.toThrow("not what the board expects");
    vi.stubGlobal("fetch", async () => new Response("null", { status: 200 }));
    await expect(listBrands()).rejects.toThrow("not what the board expects");
  });

  it("lets an aborted request stay an abort", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response("{}");
    });
    await expect(listBrands(controller.signal)).rejects.toThrow("aborted");
  });

  it("sends an item as JSON with the image as base64 and nothing else", async () => {
    const { calls } = installServer([brandView("a")]);
    await addItem("a", { description: "d", source: "https://example.com", image: png() });
    expect(calls[0]).toEqual({ method: "POST", path: "/api/brands/a/items", body: { description: "d", source: "https://example.com", image: "iVBORw==" } });
  });

  it("sends no image as null", async () => {
    const { calls } = installServer([brandView("a")]);
    await addItem("a", { description: "d", source: null, image: null });
    expect(calls[0]?.body).toEqual({ description: "d", source: null, image: null });
  });

  it("encodes the bytes of a file", async () => {
    expect(await toBase64(new Blob([new Uint8Array([1, 2, 3])]))).toBe("AQID");
  });

  it("moves an item by its key, with the key it goes before or null for the end of the note", async () => {
    const { calls } = installServer([brandView("a", {}, [item({ key: "x" }), item({ key: "y" })])]);
    await moveItem("a", "y", "x");
    await moveItem("a", "x", null);
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ["POST", "/api/brands/a/items/y/move", { before: "x" }],
      ["POST", "/api/brands/a/items/x/move", { before: null }],
    ]);
  });

  it("shows the server's own words when a move is refused", async () => {
    installServer([brandView("a", {}, [item({ key: "x" })])], { status: 409, error: "no block has this text now" });
    await expect(moveItem("a", "x", null)).rejects.toThrow(new ApiError("no block has this text now"));
  });
});
