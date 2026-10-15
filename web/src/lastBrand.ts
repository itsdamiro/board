// The last brand chosen is remembered in the browser as a convenience (ADR 002, amendment on the screens): storage can be
// missing or throw, and the page works without it, like the theme choice.
import { safeStorage } from "./theme";

export const BRAND_KEY = "board-brand";

export function readLastBrand(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): string | null {
  try {
    return storage?.getItem(BRAND_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastBrand(slug: string, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(BRAND_KEY, slug);
  } catch {
    // the choice still applies for this visit
  }
}
