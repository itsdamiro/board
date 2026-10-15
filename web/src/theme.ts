// The theme: system, light or dark (ADR 002, decision 4). The remembered choice is a convenience: storage can be missing
// or throw (private window, blocked site data), and the page works without it. public/theme-init.js applies the same
// rule before the first paint; its test runs it against this file's rule.

export type Choice = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

export const STORAGE_KEY = "board-theme";
export const CHOICES: readonly Choice[] = ["system", "light", "dark"];

function isChoice(value: unknown): value is Choice {
  return typeof value === "string" && (CHOICES as readonly string[]).includes(value);
}

export function readChoice(storage: Pick<Storage, "getItem"> | undefined): Choice {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isChoice(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function writeChoice(storage: Pick<Storage, "setItem"> | undefined, choice: Choice): void {
  try {
    storage?.setItem(STORAGE_KEY, choice);
  } catch {
    // The choice still applies for this visit; it is only not remembered.
  }
}

export function resolve(choice: Choice, systemPrefersDark: boolean): Resolved {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

export function applyTheme(root: HTMLElement, resolved: Resolved): void {
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
