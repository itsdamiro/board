import { describe, expect, it } from "vitest";
import { BRAND_KEY, readLastBrand, writeLastBrand } from "./lastBrand";

const refusing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("the remembered brand", () => {
  it("is written and read back", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeLastBrand("alpha", storage);
    expect(store.get(BRAND_KEY)).toBe("alpha");
    expect(readLastBrand(storage)).toBe("alpha");
  });

  it("is nothing when nothing was stored", () => {
    expect(readLastBrand({ getItem: () => null })).toBeNull();
    expect(readLastBrand(undefined)).toBeNull();
  });

  it("does not break the page when storage refuses", () => {
    expect(readLastBrand(refusing)).toBeNull();
    expect(() => writeLastBrand("alpha", refusing)).not.toThrow();
    expect(() => writeLastBrand("alpha", undefined)).not.toThrow();
  });
});
