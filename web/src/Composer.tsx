import { useEffect, useRef, useState, type FormEvent } from "react";
import { addItem } from "./api";
import { webAddress } from "./address";

// Adds an item (ADR 001, decision 5; ADR 002, amendment on the cards): an image pasted or dropped on the page, an address
// pasted, a one-line description, and Enter. Empty, it is a dashed box that says where to paste. The page keeps no copy of
// the vault: when the server has taken the item, the parent asks it again.

interface Queued {
  file: File;
  url: string;
}

function images(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

export default function Composer({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [keepSource, setKeepSource] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
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
  useEffect(() => {
    if (ready) input.current?.focus(); // the field appears when there is something to describe, and typing starts there
  }, [ready]);

  useEffect(() => () => live.current.forEach((queued) => URL.revokeObjectURL(queued.url)), []);

  function dropFirst() {
    const first = queue[0];
    if (first === undefined) return;
    URL.revokeObjectURL(first.url);
    setQueue((current) => current.slice(1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await addItem(slug, { description, source, image: queue[0]?.file ?? null });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The item could not be added.");
      setBusy(false);
      return;
    }
    setDescription("");
    if (!keepSource) setSource(null);
    dropFirst();
    setBusy(false);
    onAdded();
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
        <div className="flex items-start gap-4">
          {first !== undefined && (
            <img src={first.url} alt="Preview of the file to add" className="max-h-40 w-auto max-w-[40%] rounded-md border border-border" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <input
              ref={input}
              type="text"
              aria-label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              autoComplete="off"
              placeholder="What is this for?"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
            {first !== undefined && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {queue.length > 1 && <span>Image 1 of {queue.length}</span>}
                <button type="button" onClick={dropFirst} className="underline focus-visible:outline-2 focus-visible:outline-ring">
                  Remove image
                </button>
              </div>
            )}
            {source !== null && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="break-all font-mono text-xs">{source}</span>
                <button type="button" onClick={() => setSource(null)} className="underline focus-visible:outline-2 focus-visible:outline-ring">
                  Remove address
                </button>
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input type="checkbox" checked={keepSource} onChange={(event) => setKeepSource(event.target.checked)} />
                  Keep for the next item
                </label>
              </div>
            )}
          </div>
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
