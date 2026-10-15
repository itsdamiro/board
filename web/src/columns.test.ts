import { describe, expect, it } from "vitest";
import { autoColumns, COLUMNS_KEY, MAX_COLUMNS, readColumns, writeColumns } from "./columns";

const refusing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("autoColumns", () => {
  it("fits as many 18 rem cards as the window has room for, at least one and at most the top count", () => {
    expect(autoColumns(375)).toBe(1);
    expect(autoColumns(100)).toBe(1);
    expect(autoColumns(1024)).toBe(3);
    expect(autoColumns(1440)).toBe(4);
    expect(autoColumns(10_000)).toBe(MAX_COLUMNS);
  });

  it("changes at the exact width where another card fits", () => {
    expect(autoColumns(48 + 288 * 2 + 16 - 1)).toBe(1);
    expect(autoColumns(48 + 288 * 2 + 16)).toBe(2);
  });
});

describe("the remembered column count", () => {
  it("is written and read back", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeColumns(5, storage);
    expect(store.get(COLUMNS_KEY)).toBe("5");
    expect(readColumns(storage)).toBe(5);
  });

  it("is nothing for nothing, for rubbish, or for a number the buttons cannot make", () => {
    for (const value of [null, "", "abc", "0", "9", "2.5", "-1"]) expect(readColumns({ getItem: () => value })).toBeNull();
    expect(readColumns(undefined)).toBeNull();
  });

  it("does not break the page when storage refuses", () => {
    expect(readColumns(refusing)).toBeNull();
    expect(() => writeColumns(3, refusing)).not.toThrow();
    expect(() => writeColumns(3, undefined)).not.toThrow();
  });
});
