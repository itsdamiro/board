// Puts text on the clipboard (ADR 009, decision 6). The asynchronous clipboard is tried first; a browser that refuses it (an embedded
// one, or a page without the user's gesture) is given a second try through a selected, off-screen text field. False when both fail.

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the older way
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.tabIndex = -1;
  field.className = "fixed top-0 left-0 size-px opacity-0";
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.append(field);
  try {
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    before?.focus();
  }
}
