import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link2, X } from "lucide-react";
import { addItem, type Item } from "./api";
import { webAddress } from "./address";
import { readLookup, writeLookup } from "./lookup";

// Adds an item (ADR 001, decision 5; ADR 002, amendment on the cards): an image pasted or dropped on the page, an address
// pasted or typed with the link button, a one-line description under the picture, and Enter. Empty, it is a dashed box that says where to paste. The page keeps no copy of
// the vault: when the server has taken the item, the parent asks it again, and looks the address up if it was asked to (ADR 008, amendment of 2026-10-17):
// the add never waits for that, so the box is free for the next item at once.

interface Queued {
  file: File;
  url: string;
}

const ICON = "flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring";

function images(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

export default function Composer({ slug, onAdded }: { slug: string; onAdded: (item: Item, lookUp: boolean) => void }) {
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [keepSource, setKeepSource] = useState(false);
  const [lookup, setLookup] = useState(readLookup); // ADR 008: an address with no picture is looked up after it is added, unless unchecked
  const [typing, setTyping] = useState(false); // the field for an address typed, opened by the link button
  const [typed, setTyped] = useState("");
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const typedField = useRef<HTMLInputElement>(null);
  const settled = useRef(false); // the address field was closed by Enter or Escape, so the blur that may follow takes nothing
  const live = useRef(queue);
  useEffect(() => {
    live.current = queue;
  }, [queue]);

  function enqueue(files: File[]) {
    const added = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setQueue((current) => [...current, ...added]);
    setError(null);
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = images(event.clipboardData?.files);
      if (files.length > 0) {
        event.preventDefault();
        enqueue(files);
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; // text pasted into a field is that field's own
      const address = source === null ? webAddress(event.clipboardData?.getData("text/plain") ?? "") : null;
      if (address !== null) {
        event.preventDefault();
        setSource(address);
      }
    }
    function onDrop(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      const files = images(event.dataTransfer.files);
      if (files.length > 0) enqueue(files);
      else setError("Only image files can be added.");
    }
    document.addEventListener("paste", onPaste);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("drop", onDrop);
    };
  }, [source]);

  const first = queue[0];
  const ready = first !== undefined || source !== null;
  const lookingUp = source !== null && first === undefined; // the lookup is only made for an address with no picture of its own
  useEffect(() => {
    if (ready) input.current?.focus(); // the field appears when there is something to describe, and typing starts there
  }, [ready]);

  useEffect(() => {
    if (!typing) return;
    settled.current = false;
    typedField.current?.focus(); // the link button opens the field and typing starts there
  }, [typing]);

  useEffect(() => () => live.current.forEach((queued) => URL.revokeObjectURL(queued.url)), []);

  function drop(queued: Queued) {
    URL.revokeObjectURL(queued.url);
    setQueue((current) => current.filter((one) => one !== queued));
  }

  function takeTyped() {
    const address = webAddress(typed);
    if (address === null) {
      setError("That is not a web address (it starts with http:// or https://).");
      return;
    }
    settled.current = true;
    setSource(address);
    setTyping(false);
    setTyped("");
    setError(null);
    input.current?.focus();
  }

  function onTypedKey(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault(); // Enter here sets the address; it does not add the item
      takeTyped();
    } else if (event.key === "Escape") {
      settled.current = true;
      setTyping(false);
      setTyped("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const sent = queue[0]; // by identity: the picture may be removed while it is on its way, and the next one must stay
    let added: Item;
    try {
      added = await addItem(slug, { description, source, image: sent?.file ?? null });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The item could not be added.");
      setBusy(false);
      return;
    }
    setDescription("");
    if (!keepSource) setSource(null);
    if (sent !== undefined) drop(sent);
    setBusy(false);
    onAdded(added, lookingUp && lookup);
    input.current?.focus();
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Add an item"
      className="flex flex-col gap-3 p-4"
    >
      {!ready ? (
        <p className="py-10 text-center text-sm text-muted-foreground">paste / drop image here</p>
      ) : (
        <div className="flex flex-col gap-3">
          {first !== undefined && (
            <div className="relative">
              <img src={first.url} alt="Preview of the file to add" className="max-h-64 w-full rounded-md border border-border object-contain" />
              <button type="button" aria-label="Remove image" title="Remove image" onClick={() => drop(first)} className={`${ICON} absolute top-2 right-2 bg-card shadow-md`}>
                <X aria-hidden="true" className="size-4" />
              </button>
              {queue.length > 1 && (
                <span className="absolute bottom-2 left-2 rounded-md bg-card px-2 py-0.5 text-xs text-muted-foreground shadow-md">Image 1 of {queue.length}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={input}
              type="text"
              aria-label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              autoComplete="off"
              placeholder="What is this for?"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
            {source === null && (
              <button
                type="button"
                aria-label="Add the address of the original"
                title="Add the address of the original"
                aria-expanded={typing}
                onClick={() => setTyping((open) => !open)}
                className={`${ICON} border border-input`}
              >
                <Link2 aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          {source === null && typing && (
            <input
              ref={typedField}
              type="url"
              aria-label="Address of the original"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={onTypedKey}
              onBlur={() => !settled.current && typed.trim() !== "" && takeTyped()}
              autoComplete="off"
              placeholder="https://… then Enter"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
          )}
          {source !== null && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 break-all font-mono text-xs">{source}</span>
              <button type="button" aria-label="Remove address" title="Remove address" onClick={() => setSource(null)} className={ICON}>
                <X aria-hidden="true" className="size-4" />
              </button>
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={keepSource} onChange={(event) => setKeepSource(event.target.checked)} />
                Keep for the next item
              </label>
            </div>
          )}
          {lookingUp && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={lookup}
                onChange={(event) => {
                  setLookup(event.target.checked);
                  writeLookup(event.target.checked);
                }}
              />
              Look up the page&apos;s title and preview
            </label>
          )}
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
