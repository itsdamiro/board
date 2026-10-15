// A stand-in for the server's API, for the page's unit tests (not part of the build): the routes of docs/reference/API.md
// that the page uses, over brands held in memory, so an add shows up in the next read as it does with the real one.
import { vi } from "vitest";
import type { Brand, Item } from "./api";

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

export function brandView(slug: string, over: Partial<Brand> = {}, items: Item[] = []): Brand {
  return {
    slug,
    status: null,
    client: null,
    summary: "",
    hub_problem: null,
    panels: [],
    moodboard: { exists: true, problem: null, items },
    ...over,
  };
}

export function item(over: Partial<Item> = {}): Item {
  return { key: "k1", text: "words", description: "words", source: null, image: null, thumb: null, width: null, height: null, date: null, ...over };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Installs the fake as `fetch` and returns the brands (change them between steps) and every call made. `refuse` answers an add or a delete. */
export function installServer(brands: Brand[], refuse?: { status: number; error: string }) {
  const calls: Call[] = [];
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    calls.push({ method, path, body });
    if (method === "GET" && path === "/api/brands") return json(200, { brands: brands.map((b) => b.slug).sort() });
    const found = /^\/api\/brands\/([^/]+)(\/items)?(?:\/([^/]+))?$/.exec(path);
    const brand = brands.find((b) => b.slug === decodeURIComponent(found?.[1] ?? ""));
    if (found === null || brand === undefined) return json(404, { error: "no such brand" });
    if (method === "DELETE" && found[2] !== undefined && found[3] !== undefined) {
      if (refuse !== undefined) return json(refuse.status, { error: refuse.error });
      const key = decodeURIComponent(found[3]);
      const at = brand.moodboard.items.findIndex((i) => i.key === key);
      if (at < 0) return json(409, { error: "the item changed since it was shown" });
      brand.moodboard.items.splice(at, 1);
      return json(200, { deleted: key });
    }
    if (found[3] !== undefined) return json(404, { error: "no such route" });
    if (method === "GET" && found[2] === undefined) return json(200, brand);
    if (method === "POST" && found[2] !== undefined) {
      if (refuse !== undefined) return json(refuse.status, { error: refuse.error });
      const sent = body as { description: string; source: string | null; image: string | null };
      const added = item({ key: `k${calls.length}`, description: sent.description, text: sent.description, source: sent.source });
      brand.moodboard.items.unshift(added);
      return json(201, added);
    }
    return json(404, { error: "no such route" });
  };
  vi.stubGlobal("fetch", vi.fn(handler));
  return { calls };
}

/** A paste or a drop as the page sees it, with a generated file: jsdom has no ClipboardEvent or DataTransfer. */
export function pasteEvent(files: File[], text = ""): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files, getData: () => text } });
  return event;
}

export function dropEvent(files: File[]): Event {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files } });
  return event;
}

export const png = () => new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
