import { describe, expect, it } from "vitest";
import { asApiHeaders, isApiPath, refusal } from "./vite.proxy.ts";

const PORT = 5173;

describe("refusal (ADR 004, decision 3)", () => {
  it("lets the dev page's own host and origin through", () => {
    expect(refusal({ host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" }, PORT)).toBeNull();
    expect(refusal({ host: "localhost:5173", origin: "http://localhost:5173" }, PORT)).toBeNull();
  });

  it("lets a request with no Origin through when the host is right", () => {
    expect(refusal({ host: "127.0.0.1:5173" }, PORT)).toBeNull();
  });

  it("refuses a foreign Origin", () => {
    expect(refusal({ host: "127.0.0.1:5173", origin: "https://evil.test" }, PORT)).not.toBeNull();
  });

  it("refuses the Python server's own origin when it comes from a page on that port", () => {
    expect(refusal({ host: "127.0.0.1:5173", origin: "http://127.0.0.1:8765" }, PORT)).not.toBeNull();
  });

  it("refuses look-alike origins", () => {
    for (const origin of [
      "http://127.0.0.1:5173.evil.test",
      "http://localhost:5173.evil.test",
      "http://127.0.0.1:51730",
      "https://127.0.0.1:5173",
      "http://127.0.0.1:5173/",
      "null",
      "",
    ]) {
      expect(refusal({ host: "127.0.0.1:5173", origin }, PORT), origin).not.toBeNull();
    }
  });

  it("refuses a foreign or missing Host", () => {
    expect(refusal({ host: "evil.test:5173" }, PORT)).not.toBeNull();
    expect(refusal({ host: "127.0.0.1:9999" }, PORT)).not.toBeNull();
    expect(refusal({ host: "127.0.0.1" }, PORT)).not.toBeNull();
    expect(refusal({}, PORT)).not.toBeNull();
  });

  it("refuses an Origin that arrives as two joined values", () => {
    expect(refusal({ host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173, https://evil.test" }, PORT)).not.toBeNull();
  });

  it("judges against the port given, not a fixed one", () => {
    expect(refusal({ host: "127.0.0.1:6000", origin: "http://127.0.0.1:6000" }, 6000)).toBeNull();
    expect(refusal({ host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" }, 6000)).not.toBeNull();
  });
});

describe("isApiPath", () => {
  it("matches exactly what the proxy forwards, including look-alikes the proxy also forwards", () => {
    expect(isApiPath("/api/brands")).toBe(true);
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/apix")).toBe(true);
    expect(isApiPath("/")).toBe(false);
    expect(isApiPath("/assets/app.js")).toBe(false);
    expect(isApiPath(undefined)).toBe(false);
  });
});

describe("asApiHeaders", () => {
  it("speaks as the Python server's own page", () => {
    expect(asApiHeaders(8765)).toEqual({ host: "127.0.0.1:8765", origin: "http://127.0.0.1:8765" });
  });
});
