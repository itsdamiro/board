// A pasted line counts as a page address only if it is one web address and nothing else, the same test the server applies
// to what it writes (board/moodboard.py): an http or https scheme and a host.

export function webAddress(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "" || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "" ? trimmed : null;
  } catch {
    return null;
  }
}
