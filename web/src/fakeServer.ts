// A stand-in for the server's API, for the page's unit tests (not part of the build): the routes of docs/reference/API.md
// that the page uses, over brands held in memory, so an add shows up in the next read as it does with the real one.
import { vi } from "vitest";
import type { Brand, CardInput, Item, SpecialCard } from "./api";

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
  return {
    key: "k1",
    text: "words",
    description: "words",
    source: null,
    image: null,
    thumb: null,
    width: null,
    height: null,
    card: null,
    date: null,
    title: null,
    preview: null,
    ...over,
  };
}

/** What the real server answers for a card it was given: the same fields, a type card with the Google Fonts address it writes. */
function shown(card: CardInput): SpecialCard {
  return card.kind === "type" ? { ...card, google: `https://fonts.google.com/specimen/${card.name.replaceAll(" ", "+")}` } : card;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** What the fake's lookup call does (ADR 008, amendment of 2026-10-17): wait for `gate`, then fail, or give the item `found`. */
export interface LookupBehaviour {
  gate: Promise<void> | null;
  fail: boolean;
  found: Partial<Item>;
}

/**
 * Installs the fake as `fetch` and returns the brands (change them between steps), every call made and how a lookup call goes.
 * `refuse` answers an add or a delete.
 */
/** The path a fetch was asked for, as text (a string, a URL or a Request). */
export function requestPath(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

export function installServer(brands: Brand[], refuse?: { status: number; error: string }) {
  const calls: Call[] = [];
  const lookup: LookupBehaviour = { gate: null, fail: false, found: { title: "A page" } };
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = requestPath(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    calls.push({ method, path, body });
    if (method === "GET" && path === "/api/brands") return json(200, { brands: brands.map((b) => b.slug).sort() });
    const found = /^\/api\/brands\/([^/]+)(\/items)?(?:\/([^/]+))?(\/lookup|\/move)?$/.exec(path);
    const brand = brands.find((b) => b.slug === decodeURIComponent(found?.[1] ?? ""));
    if (found === null || brand === undefined) return json(404, { error: "no such brand" });
    if (method === "PUT" && found[2] !== undefined && found[3] !== undefined && found[4] === undefined) {
      if (refuse !== undefined) return json(refuse.status, { error: refuse.error });
      const target = brand.moodboard.items.find((i) => i.key === decodeURIComponent(found[3] ?? ""));
      if (target === undefined) return json(409, { error: "the item changed since it was shown" });
      if (target.card === null) return json(422, { error: "only a colors, text or type card can be edited" });
      target.card = shown((body as { card: CardInput }).card);
      return json(200, target);
    }
    if (method === "DELETE" && found[2] !== undefined && found[3] !== undefined && found[4] === undefined) {
      if (refuse !== undefined) return json(refuse.status, { error: refuse.error });
      const key = decodeURIComponent(found[3]);
      const at = brand.moodboard.items.findIndex((i) => i.key === key);
      if (at < 0) return json(409, { error: "the item changed since it was shown" });
      brand.moodboard.items.splice(at, 1);
      return json(200, { deleted: key });
    }
    if (method === "POST" && found[4] === "/move" && found[3] !== undefined) {
      if (refuse !== undefined) return json(refuse.status, { error: refuse.error });
      const key = decodeURIComponent(found[3]);
      const before = (body as { before: string | null }).before;
      const list = brand.moodboard.items;
      const at = list.findIndex((i) => i.key === key);
      const anchor = before === null ? -1 : list.findIndex((i) => i.key === before);
      if (at < 0 || (before !== null && anchor < 0)) return json(409, { error: "the item changed since it was shown" });
      const [moved] = list.splice(at, 1);
      // the list is the note's order reversed, and a block goes before another in the note: so after it in the list, or first for the end
      list.splice(before === null ? 0 : list.findIndex((i) => i.key === before) + 1, 0, moved as Item);
      return json(200, { moved: key });
    }
    if (method === "POST" && found[4] === "/lookup" && found[3] !== undefined) {
      await lookup.gate;
      const target = brand.moodboard.items.find((i) => i.key === decodeURIComponent(found[3] ?? ""));
      if (target === undefined) return json(409, { error: "the item changed since it was shown" });
      if (lookup.fail) return json(500, { error: "something went wrong" });
      Object.assign(target, lookup.found);
      return json(200, target);
    }
    if (found[3] !== undefined) return json(404, { error: "no such route" });
    if (method === "GET" && found[2] === undefined) return json(200, brand);
    if (method === "POST" && found[2] !== undefined) {
      if (refuse !== undefined) return json(refuse.status, { error: refuse.error });
      if (body !== null && typeof body === "object" && "card" in body) {
        const card = shown((body as { card: CardInput }).card);
        const added = item({ key: `k${calls.length}`, description: "", text: "", card });
        brand.moodboard.items.unshift(added);
        return json(201, added);
      }
      const sent = body as { description: string; source: string | null; image: string | null };
      const kept = sent.source === null ? undefined : brand.moodboard.items.find((i) => i.source === sent.source && (i.title !== null || i.preview !== null)); // what is kept for an address shows on every item with it
      const added = item({
        key: `k${calls.length}`,
        description: sent.description,
        text: sent.description,
        source: sent.source,
        title: kept?.title ?? null,
        preview: kept?.preview ?? null,
      });
      brand.moodboard.items.unshift(added);
      return json(201, added);
    }
    return json(404, { error: "no such route" });
  };
  vi.stubGlobal("fetch", vi.fn(handler));
  return { calls, lookup };
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
