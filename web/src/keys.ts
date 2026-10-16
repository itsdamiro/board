// Keys the page takes from anywhere (Escape to drop the picks, + and - for the columns) must leave a key press to whatever it
// belongs to: a field being typed in, or a dialog that is open (the viewer and the delete question are not modal).

const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function keyIsTaken(target: EventTarget | null): boolean {
  const typing = target instanceof HTMLElement && (target.isContentEditable || FIELDS.has(target.tagName));
  return typing || document.querySelector('[role="dialog"]') !== null;
}
