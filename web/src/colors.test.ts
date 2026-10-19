import { describe, expect, it } from "vitest";
import { fullHex, inkFor } from "./colors";

describe("fullHex", () => {
  it("gives #rrggbb in lower case for 3 and 6 digits", () => {
    expect(fullHex("#1A2B3C")).toBe("#1a2b3c");
    expect(fullHex("#fA0")).toBe("#ffaa00");
    expect(fullHex(" #fff ")).toBe("#ffffff");
  });

  it("gives null for anything else", () => {
    for (const bad of ["", "fff", "#ff", "#ffff", "#fffff", "#fffffff", "#ggg", "red", "#12345g"]) expect(fullHex(bad), bad).toBeNull();
  });
});

describe("inkFor", () => {
  it("is white on dark colours and black on light ones", () => {
    expect(inkFor("#000")).toBe("#ffffff");
    expect(inkFor("#1a2b3c")).toBe("#ffffff");
    expect(inkFor("#fff")).toBe("#000000");
    expect(inkFor("#f5e9d3")).toBe("#000000");
    expect(inkFor("#ffc914")).toBe("#000000");
  });

  it("picks the larger contrast on a mid colour", () => {
    expect(inkFor("#e4572e")).toBe("#000000"); // contrast 6.1 with black against 3.4 with white
    expect(inkFor("#767676")).toBe("#000000"); // 4.54 with white against 4.62 with black: black is a hair larger
    expect(inkFor("#6a6a6a")).toBe("#ffffff"); // 5.4 with white against 3.9 with black
    expect(inkFor("#cd5c5c")).toBe("#000000"); // 5.3 with black against 4.0 with white: a colour whose channels sit below the formula's bend
  });

  it("is black for a value that is not a colour", () => {
    expect(inkFor("nope")).toBe("#000000");
  });
});
