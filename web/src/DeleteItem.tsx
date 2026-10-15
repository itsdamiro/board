import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { deleteItem, type Item } from "./api";

// The delete control of an item's card (ADR 002, amendments of 2026-10-16 on delete): an icon button that shows only while the
// pointer is over the card, or while it has the keyboard's focus, and a confirmation before anything is removed. The same
// confirmation serves the cards picked with shift-click. The server refuses a block that changed since it was shown (409),
// and its words are shown as they come.

const BUTTON =
  "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border border-border bg-card text-card-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none";
const ACTION = "rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

const words = (item: Item) => (item.description !== "" ? item.description : "Image");

/** Asks, then removes the items one after the other (two writes to one note at once would only meet the server's 409). */
export function ConfirmDelete({ slug, items, onDeleted, onClose }: { slug: string; items: Item[]; onDeleted: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function close() {
    if (!busy) onClose();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    let removed = 0;
    try {
      for (const item of items) {
        await deleteItem(slug, item.key);
        removed += 1;
      }
      onClose();
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "Something went wrong.";
      setProblem(items.length > 1 ? `${removed} of ${items.length} deleted. ${reason}` : reason);
    } finally {
      setBusy(false);
      if (removed > 0) onDeleted(); // show what is left, whether or not the rest went
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
          {items.some((item) => item.description !== "") && (
            <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto text-sm">
              {items.map((item) => (
                <li key={item.key} className="line-clamp-2 whitespace-pre-wrap">
                  {words(item)}
                </li>
              ))}
            </ul>
          )}
          {problem !== null && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={busy} className={ACTION}>
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={busy} className={`${ACTION} border-destructive text-destructive hover:bg-destructive/10`}>
              Delete
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DeleteItem({ slug, item, onDeleted }: { slug: string; item: Item; onDeleted: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" aria-label={`Delete ${item.description !== "" ? item.description : "image"}`} onClick={() => setAsking(true)} className={BUTTON}>
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      {asking && <ConfirmDelete slug={slug} items={[item]} onDeleted={onDeleted} onClose={() => setAsking(false)} />}
    </>
  );
}
