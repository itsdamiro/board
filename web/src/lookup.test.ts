import { describe, expect, it } from "vitest";
import { LOOKUP_KEY, readLookup, writeLookup } from "./lookup";

const refusing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("the remembered lookup choice", () => {
  it("is on when nothing was stored, or storage is missing", () => {
    expect(readLookup({ getItem: () => null })).toBe(true);
    expect(readLookup(undefined)).toBe(true);
  });

  it("is written and read back, off and on", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeLookup(false, storage);
    expect(store.get(LOOKUP_KEY)).toBe("off");
    expect(readLookup(storage)).toBe(false);
    writeLookup(true, storage);
    expect(readLookup(storage)).toBe(true);
  });

  it("reads anything but off as on", () => {
    expect(readLookup({ getItem: () => "garbage" })).toBe(true);
  });

  it("does not break the page when storage refuses", () => {
    expect(readLookup(refusing)).toBe(true);
    expect(() => writeLookup(false, refusing)).not.toThrow();
    expect(() => writeLookup(false, undefined)).not.toThrow();
  });
});
