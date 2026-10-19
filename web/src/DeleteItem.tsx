import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { deleteItem, itemWords, type Item } from "./api";
import type { PlacedItem } from "./cardOrder";

// The delete control of an item's card (ADR 002, amendments of 2026-10-16 on delete): an icon button that shows only while the
// pointer is over the card, or while it has the keyboard's focus (always, where the main input cannot hover: amendment of
// 2026-10-18), and a confirmation before anything is removed. One
// confirmation serves a card's own button and the cards picked with shift-click. The server refuses a block that changed
// since it was shown (409), and its words are shown as they come.

export const BUTTON =
  "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border border-border bg-card text-card-foreground opacity-0 shadow-md transition-opacity pointer-coarse:size-11 [@media(hover:none)]:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none";
const ACTION = "rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

/**
 * Asks, then removes the items one after the other (two writes to one note at once would only meet the server's 409).
 * `onDone` is told the card keys of the items that went, and always runs, so the page asks the server again whatever the answer was.
 * When the server removed a block but could not remove its image files it answers 200 with a warning: the items are gone, and the
 * dialog stays up with the warning until it is closed. The dialog belongs to the cards' list, not to a card, so it stays up with
 * its message while the list is read again.
 */
export function ConfirmDelete({
  slug,
  items,
  onDone,
  onClose,
}: {
  slug: string;
  items: PlacedItem[];
  onDone: (removed: string[]) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function close() {
    if (!busy) onClose();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const removed: string[] = [];
    const warned = new Set<string>();
    try {
      for (const { key, item } of items) {
        const warning = await deleteItem(slug, item.key);
        removed.push(key);
        if (warning !== null) warned.add(warning);
      }
      if (warned.size === 0) onClose();
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "Something went wrong.";
      setProblem(items.length > 1 ? `${removed.length} of ${items.length} deleted. ${reason}` : reason);
    } finally {
      if (warned.size > 0) setWarning([...warned].join(" "));
      setBusy(false);
      onDone(removed);
    }
  }

  const many = items.length > 1;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <div className="relative flex max-h-[80vh] max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
          <DialogTitle className="text-xl">{many ? `Delete ${items.length} items?` : "Delete this item?"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {many ? "They are" : "It is"} removed from the Moodboard note, with {many ? "their" : "its"} image files. This cannot be undone.
          </p>
          {items.some(({ item }) => item.description !== "") && (
            <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto text-sm">
              {items.map(({ key, item }) => (
                <li key={key} className="line-clamp-2 whitespace-pre-wrap">
                  {itemWords(item)}
                </li>
              ))}
            </ul>
          )}
          {problem !== null && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          {warning !== null && <output className="text-sm">{warning}</output>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={busy} className={ACTION}>
              {warning !== null && problem === null ? "Close" : "Cancel"}
            </button>
            {(warning === null || problem !== null) && (
              <button type="button" onClick={confirm} disabled={busy} className={`${ACTION} border-destructive text-destructive hover:bg-destructive/10`}>
                Delete
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteButton({ item, onAsk }: { item: Item; onAsk: () => void }) {
  return (
    <button type="button" aria-label={`Delete ${itemWords(item)}`} onClick={onAsk} className={BUTTON}>
      <Trash2 aria-hidden="true" className="size-4" />
    </button>
  );
}
