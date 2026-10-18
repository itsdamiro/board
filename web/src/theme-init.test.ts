// public/theme-init.js cannot import src/theme.ts (it runs before any module), so this test runs it for every case
// src/theme.ts decides and checks both reach the same answer. It reads the file relative to web/, where the gates run.

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHOICES, readChoice, resolve, STORAGE_KEY } from "./theme";

const script = readFileSync(resolvePath(process.cwd(), "public/theme-init.js"), "utf8");

function runInit(stored: string | null, systemDark: boolean, storageThrows = false): boolean {
  document.documentElement.className = "";
  vi.stubGlobal("matchMedia", () => ({ matches: systemDark }));
  const getItem = (key: string) => {
    if (storageThrows) throw new Error("blocked");
    return key === STORAGE_KEY ? stored : null;
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(getItem);
  // the script is the page's own public/theme-init.js, run the way the browser runs it before the page loads
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function(script)();
  return document.documentElement.classList.contains("dark");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("theme-init.js", () => {
  it("agrees with src/theme.ts for every remembered choice and system setting", () => {
    for (const choice of CHOICES) {
      for (const systemDark of [true, false]) {
        const expected = resolve(readChoice({ getItem: () => choice }), systemDark) === "dark";
        expect(runInit(choice, systemDark), `${choice}, system dark ${systemDark}`).toBe(expected);
      }
    }
  });

  it("follows the system for nothing remembered, rubbish, or blocked storage", () => {
    expect(runInit(null, true)).toBe(true);
    expect(runInit("purple", true)).toBe(true);
    expect(runInit("purple", false)).toBe(false);
    expect(runInit(null, true, true)).toBe(true);
    expect(runInit(null, false, true)).toBe(false);
  });

  it("sets the colour scheme to match", () => {
    runInit("dark", false);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    runInit("light", true);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
