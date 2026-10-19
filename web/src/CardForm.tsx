import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { addCard, editCard, type CardInput, type Item, type SpecialCard } from "./api";
import { fullHex } from "./colors";

// The form that adds a special card, or edits one (ADR 009, decisions 3 to 5): a dialog like the delete question's. The server builds
// the block from what is sent and refuses what would not read back as the card; its words are shown as they come. The same form,
// filled in, is the edit, and an edit keeps the card's kind.

const MAX_COLORS = 12; // the server's limit, repeated here only to stop the Add colour button; the server decides
const FIELD =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11";
const ACTION =
  "rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 pointer-coarse:min-h-11";

type Row = { hex: string; name: string };

const TITLES = { text: "Add a text card", colors: "Add colours", type: "Add a font" } as const;
const EDIT_TITLES = { text: "Edit the text card", colors: "Edit the colours", type: "Edit the font" } as const;

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{text}</span>
      {children}
    </label>
  );
}

function ColorRow({
  at,
  row,
  onChange,
  onRemove,
  removable,
}: {
  at: number;
  row: Row;
  onChange: (next: Row) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const n = at + 1;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        aria-label={`Colour ${n}`}
        value={fullHex(row.hex) ?? "#000000"}
        onChange={(event) => onChange({ ...row, hex: event.target.value })}
        className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5 pointer-coarse:size-11"
      />
      <input
        aria-label={`Colour ${n} hex`}
        value={row.hex}
        onChange={(event) => onChange({ ...row, hex: event.target.value })}
        className={`${FIELD} w-24 font-mono`}
        spellCheck={false}
      />
      <input
        aria-label={`Colour ${n} name`}
        value={row.name}
        onChange={(event) => onChange({ ...row, name: event.target.value })}
        placeholder="Name (optional)"
        className={FIELD}
      />
      <button
        type="button"
        aria-label={`Remove colour ${n}`}
        onClick={onRemove}
        disabled={!removable}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 pointer-coarse:size-11"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

/** `kind` is what an add makes; `editing` is a card to change, whose kind wins, with the key of its item. `onSaved` runs once the server took it. */
export default function CardForm({
  slug,
  kind,
  editing,
  onSaved,
  onClose,
}: {
  slug: string;
  kind: CardInput["kind"];
  editing?: { key: string; card: SpecialCard };
  onSaved: (item: Item) => void;
  onClose: () => void;
}) {
  const start = editing?.card;
  const what = start?.kind ?? kind;
  const [title, setTitle] = useState(start !== undefined && start.kind !== "type" ? start.title : "");
  const [body, setBody] = useState(start?.kind === "text" ? start.body : "");
  const [name, setName] = useState(start?.kind === "type" ? start.name : "");
  const [notes, setNotes] = useState(start?.kind === "type" ? start.notes : "");
  const [rows, setRows] = useState<Row[]>(start?.kind === "colors" ? start.colors.map((c) => ({ ...c })) : [{ hex: "#808080", name: "" }]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function close() {
    if (!busy) onClose();
  }

  function input(): CardInput {
    if (what === "colors") return { kind: "colors", title, colors: rows };
    if (what === "text") return { kind: "text", title, body };
    return { kind: "type", name, notes };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const saved = editing === undefined ? await addCard(slug, input()) : await editCard(slug, editing.key, input());
      onSaved(saved);
      onClose();
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form
          onSubmit={(event) => void submit(event)}
          className="relative flex max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg"
        >
          <DialogTitle className="text-xl">{(editing === undefined ? TITLES : EDIT_TITLES)[what]}</DialogTitle>
          {what === "text" && (
            <>
              <Label text="Title">
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Mission, Audience, Voice…" className={FIELD} />
              </Label>
              <Label text="Words">
                <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className={FIELD} />
              </Label>
            </>
          )}
          {what === "type" && (
            <>
              <Label text="Font name">
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Fauna One" className={FIELD} />
              </Label>
              <Label text="Notes (optional)">
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Headings" className={FIELD} />
              </Label>
            </>
          )}
          {what === "colors" && (
            <>
              <Label text="Title (optional)">
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Primary" className={FIELD} />
              </Label>
              <ul aria-label="Colours" className="flex flex-col gap-2">
                {rows.map((row, at) => (
                  <ColorRow
                    key={at}
                    at={at}
                    row={row}
                    removable={rows.length > 1}
                    onChange={(next) => setRows(rows.map((r, i) => (i === at ? next : r)))}
                    onRemove={() => setRows(rows.filter((_, i) => i !== at))}
                  />
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setRows([...rows, { hex: "#808080", name: "" }])}
                disabled={rows.length >= MAX_COLORS}
                className={`${ACTION} flex items-center gap-1 self-start`}
              >
                <Plus aria-hidden="true" className="size-4" />
                Add colour
              </button>
            </>
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
            <button type="submit" disabled={busy} className={`${ACTION} border-primary bg-primary text-primary-foreground`}>
              {editing === undefined ? "Add" : "Save"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
