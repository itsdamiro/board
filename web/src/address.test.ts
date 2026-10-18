import { describe, expect, it } from "vitest";
import { webAddress } from "./address";

describe("webAddress", () => {
  it("takes one http or https address, trimmed", () => {
    expect(webAddress("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(webAddress("  http://example.com \n")).toBe("http://example.com");
  });

  it("refuses everything else", () => {
    for (const text of [
      "",
      "   ",
      "example.com",
      "ftp://example.com",
      "javascript:alert(1)",
      "https://",
      "see https://example.com",
      "https://a.com https://b.com",
      "https://example.com/a b",
      "a thought",
    ]) {
      expect(webAddress(text), text).toBeNull();
    }
  });
});
