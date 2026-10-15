import { describe, expect, it } from "vitest";
import { applyTheme, readChoice, resolve, STORAGE_KEY, writeChoice } from "./theme";

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("readChoice", () => {
  it("returns a remembered choice", () => {
    for (const value of ["system", "light", "dark"]) {
      expect(readChoice({ getItem: (key) => (key === STORAGE_KEY ? value : null) })).toBe(value);
    }
  });

  it("falls back to the system for nothing, rubbish, or blocked storage", () => {
    expect(readChoice({ getItem: () => null })).toBe("system");
    expect(readChoice({ getItem: () => "purple" })).toBe("system");
    expect(readChoice({ getItem: () => "Dark" })).toBe("system");
    expect(readChoice(throwing)).toBe("system");
    expect(readChoice(undefined)).toBe("system");
  });
});

describe("writeChoice", () => {
  it("stores under the key", () => {
    const seen: string[][] = [];
    writeChoice({ setItem: (key, value) => void seen.push([key, value]) }, "dark");
    expect(seen).toEqual([[STORAGE_KEY, "dark"]]);
  });

  it("does not throw when storage does", () => {
    expect(() => writeChoice(throwing, "light")).not.toThrow();
    expect(() => writeChoice(undefined, "light")).not.toThrow();
  });
});

describe("resolve", () => {
  it("follows the system only for 'system'", () => {
    expect(resolve("system", true)).toBe("dark");
    expect(resolve("system", false)).toBe("light");
    expect(resolve("light", true)).toBe("light");
    expect(resolve("dark", false)).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets and clears the dark class and the colour scheme", () => {
    const root = document.createElement("html");
    applyTheme(root, "dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    applyTheme(root, "light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });
});
