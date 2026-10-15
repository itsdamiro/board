import { describe, expect, it } from "vitest";
import { autoColumns, columnRange, COLUMNS_KEY, MAX_COLUMNS, readColumns, writeColumns } from "./columns";

const refusing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("columnRange", () => {
  it("is one column and no choice on a phone, 2 to 8 on a tablet, 3 to 8 on a large screen", () => {
    expect(columnRange(0)).toEqual({ min: 1, max: 1 });
    expect(columnRange(375 - 48)).toEqual({ min: 1, max: 1 });
    expect(columnRange(720)).toEqual({ min: 2, max: 8 });
    expect(columnRange(1392)).toEqual({ min: 3, max: 8 });
    expect(columnRange(10_000)).toEqual({ min: 3, max: MAX_COLUMNS });
  });

  it("changes at the exact stage widths of a tablet and of a large screen", () => {
    expect(columnRange(639)).toEqual({ min: 1, max: 1 });
    expect(columnRange(640)).toEqual({ min: 2, max: 8 });
    expect(columnRange(959)).toEqual({ min: 2, max: 8 });
    expect(columnRange(960)).toEqual({ min: 3, max: 8 });
  });
});

describe("autoColumns", () => {
  it("fits as many 18 rem cards as the stage has room for, inside the range of its screen", () => {
    expect(autoColumns(327)).toBe(1);
    expect(autoColumns(100)).toBe(1);
    expect(autoColumns(700)).toBe(2);
    expect(autoColumns(976)).toBe(3);
    expect(autoColumns(1392)).toBe(4);
    expect(autoColumns(10_000)).toBe(MAX_COLUMNS);
  });

  it("is always inside the range", () => {
    for (let width = 0; width <= 3000; width += 7) {
      const { min, max } = columnRange(width);
      expect(autoColumns(width)).toBeGreaterThanOrEqual(min);
      expect(autoColumns(width)).toBeLessThanOrEqual(max);
    }
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
