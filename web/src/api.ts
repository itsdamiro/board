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
  title: string | null; // the looked-up page's title (ADR 008), plain text; null with no lookup
  preview: Preview | null; // the looked-up page's picture, served by the app
}

export interface Preview {
  url: string;
  width: number;
  height: number;
}

/** What to call an item in a label, a picture's alternative text or a question: its description, or "Image". */
export function itemWords(item: Item): string {
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
  lookup?: boolean; // whether the server may look the address up (ADR 008); left out (undefined is not serialised), the server's default (true) applies
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

export async function getBrand(slug: string, signal?: AbortSignal): Promise<Brand> {
  return (await call(`/api/brands/${encodeURIComponent(slug)}`, undefined, signal)) as Brand;
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
    body: JSON.stringify({ description: item.description, source: item.source, image, lookup: item.lookup }),
  };
  return (await call(`/api/brands/${encodeURIComponent(slug)}/items`, init)) as Item;
}
