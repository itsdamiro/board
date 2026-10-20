// The page's only door to the vault: the server's API (docs/reference/API.md). Every answer is read as JSON; an error
// answer carries {"error": "<plain text>"}, which is shown as it is.

export interface Item {
  key: string;
  text: string;
  description: string;
  source: string | null;
  image: string | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  date: string | null; // `YYYY-MM-DDTHH:MM`, from the image id (docs/reference/API.md)
  card: SpecialCard | null; // ADR 009: set when the block is a colours, text or type card
  title: string | null; // the looked-up page's title (ADR 008), plain text; null with no lookup
  preview: Preview | null; // the looked-up page's picture, served by the app
}

/** A special card the server recognised in a block (ADR 009); the server wrote `google`, so it is the only address the page links for a type card. */
export type SpecialCard =
  | { kind: "text"; title: string; body: string }
  | { kind: "colors"; title: string; colors: { hex: string; name: string }[] }
  | { kind: "type"; name: string; notes: string; google: string };

/** What the page sends to add or edit a card; the server builds the block's text from it. */
export type CardInput =
  | { kind: "text"; title: string; body: string }
  | { kind: "colors"; title: string; colors: { hex: string; name: string }[] }
  | { kind: "type"; name: string; notes: string };

export interface Preview {
  url: string;
  width: number;
  height: number;
}

/** What to call an item in a label, a picture's alternative text or a question: a card's title or font name, else its description, or "Image". */
export function itemWords(item: Item): string {
  const card = item.card;
  if (card !== null) {
    const name = card.kind === "type" ? card.name : card.title;
    return name !== "" ? name : "Colours";
  }
  return item.description !== "" ? item.description : "Image";
}

export interface Panel {
  title: string;
  text: string;
  problem: string | null;
  date: string | null; // the note's `created`, `YYYY-MM-DD` or with `THH:MM`
}

export interface Brand {
  slug: string;
  status: string | null;
  client: string | null;
  summary: string;
  hub_problem: string | null;
  panels: Panel[];
  moodboard: { exists: boolean; problem: string | null; items: Item[] };
}

export interface NewItem {
  description: string;
  source: string | null;
  image: File | null;
}

export class ApiError extends Error {}

const UNREACHABLE = "The server cannot be reached. Is it still running?";

async function call(path: string, init?: RequestInit, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(UNREACHABLE);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // an answer that is not JSON is handled below by its status
  }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? (body as { error: unknown }).error : null;
    throw new ApiError(typeof message === "string" && message !== "" ? message : `The server answered ${response.status}.`);
  }
  if (typeof body !== "object" || body === null) throw new ApiError("The server's answer was not what the board expects.");
  return body;
}

export async function listBrands(signal?: AbortSignal): Promise<string[]> {
  const body = (await call("/api/brands", undefined, signal)) as { brands: string[] };
  return body.brands;
}

export async function getBrand(slug: string): Promise<Brand> {
  return (await call(`/api/brands/${encodeURIComponent(slug)}`)) as Brand;
}

/** The bytes of a file as base64 text, which is how the API takes an image. */
export function toBase64(file: Blob): Promise<string> {
  return new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onerror = () => fail(new ApiError("The image could not be read."));
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      done(text.slice(text.indexOf(",") + 1)); // "data:<type>;base64,<data>"
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Removes the item whose `key` the brand view gave; the server refuses it (409) if the block changed since it was shown.
 * Returns the server's warning when the block went but its image files stayed, else null.
 */
export async function deleteItem(slug: string, key: string): Promise<string | null> {
  const answer = (await call(`/api/brands/${encodeURIComponent(slug)}/items/${encodeURIComponent(key)}`, { method: "DELETE" })) as { warning?: unknown } | null;
  return typeof answer?.warning === "string" ? answer.warning : null;
}

export async function addItem(slug: string, item: NewItem): Promise<Item> {
  const image = item.image === null ? null : await toBase64(item.image);
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: item.description, source: item.source, image }),
  };
  return (await call(`/api/brands/${encodeURIComponent(slug)}/items`, init)) as Item;
}

/**
 * Asks the server to look up the address of the item with this `key` (ADR 008, amendment of 2026-10-17) and returns the item as
 * it is then. It can take up to eight seconds, which is why the add does not wait for it; the caller does not either.
 */
export async function lookUpItem(slug: string, key: string): Promise<Item> {
  return (await call(`/api/brands/${encodeURIComponent(slug)}/items/${encodeURIComponent(key)}/lookup`, { method: "POST" })) as Item;
}

/** Adds a special card at the end of the Moodboard (ADR 009) and returns it as the brand view shows it. */
export async function addCard(slug: string, card: CardInput): Promise<Item> {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card }) };
  return (await call(`/api/brands/${encodeURIComponent(slug)}/items`, init)) as Item;
}

/** Replaces the card whose `key` the brand view gave by a card of the same kind; the server refuses it (409) if the block changed since it was shown. */
export async function editCard(slug: string, key: string, card: CardInput): Promise<Item> {
  const init = { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card }) };
  return (await call(`/api/brands/${encodeURIComponent(slug)}/items/${encodeURIComponent(key)}`, init)) as Item;
}

/**
 * Moves the item whose `key` the brand view gave to just before the item with key `before` in the Moodboard note, or to the end of
 * the note when `before` is null (ADR 001, amendment of 2026-10-20). The server refuses it (409) if either block changed since it was shown.
 */
export async function moveItem(slug: string, key: string, before: string | null): Promise<void> {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ before }) };
  await call(`/api/brands/${encodeURIComponent(slug)}/items/${encodeURIComponent(key)}/move`, init);
}
