// Small colour helpers for the colours card (ADR 009).

/** `#RGB` or `#RRGGBB` as `#rrggbb` in lower case, or null for anything else. */
export function fullHex(hex: string): string | null {
  const found = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (found === null) return null;
  const digits = (found[1] ?? "").toLowerCase();
  return `#${
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits
  }`;
}

/** Black or white, whichever reads better on this colour (WCAG's relative luminance; the larger contrast wins). */
export function inkFor(hex: string): "#000000" | "#ffffff" {
  const full = fullHex(hex);
  if (full === null) return "#000000";
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
    const channel = parseInt(full.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.05 ? "#ffffff" : "#000000";
}
