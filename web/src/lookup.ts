// Whether an address is looked up when it is added (ADR 002, amendment of 2026-10-17; ADR 008, decision 1) is remembered in
// the browser as a convenience: storage can be missing or throw, and the page works without it, "checked" being the default.
import { safeStorage } from "./theme";

export const LOOKUP_KEY = "board-lookup";

export function readLookup(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(LOOKUP_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeLookup(on: boolean, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(LOOKUP_KEY, on ? "on" : "off");
  } catch {
    // the choice still applies for this visit
  }
}
