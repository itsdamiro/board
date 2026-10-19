import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "execCommand");
  document.body.replaceChildren();
});

describe("copyText", () => {
  it("uses the asynchronous clipboard first and makes nothing on the page", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const exec = vi.fn(() => true);
    Object.assign(document, { execCommand: exec });
    expect(await copyText("#1A2B3C")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("#1A2B3C");
    expect(exec).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to a selected text field when the clipboard refuses, and takes the field away again", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    let copied = "";
    Object.assign(document, {
      execCommand: vi.fn((command: string) => {
        const field = document.querySelector("textarea");
        copied = `${command}:${field?.value ?? ""}`;
        return true;
      }),
    });
    expect(await copyText("#FFF")).toBe(true);
    expect(copied).toBe("copy:#FFF");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("gives the focus back to what had it", async () => {
    vi.stubGlobal("navigator", {});
    Object.assign(document, {
      execCommand: () => {
        document.querySelector("textarea")?.focus(); // a browser's select() on a field takes the focus
        return true;
      },
    });
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    await copyText("x");
    expect(document.activeElement).toBe(button);
  });

  it("is false when both ways fail, or the second says no", async () => {
    vi.stubGlobal("navigator", {});
    expect(await copyText("x")).toBe(false); // no execCommand at all
    Object.assign(document, { execCommand: () => false });
    expect(await copyText("x")).toBe(false);
    Object.assign(document, {
      execCommand: () => {
        throw new Error("no");
      },
    });
    expect(await copyText("x")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
