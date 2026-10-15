import { useEffect, useRef, useState, type FormEvent } from "react";
import { addItem } from "./api";
import { webAddress } from "./address";

// Adds an item (ADR 001, decision 5): an image pasted or dropped on the page, an address pasted, a one-line description,
// and Enter. The page keeps no copy of the vault: when the server has taken the item, the parent asks it again.

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

  const first = queue[0];
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      {first !== undefined && (
        <div className="flex items-start gap-3">
          <img src={first.url} alt="Preview of the file to add" className="max-h-40 w-auto max-w-[60%] rounded-md border border-border" />
          <div className="flex flex-col items-start gap-1 text-sm">
            <span className="text-muted-foreground">{queue.length > 1 ? `Image 1 of ${queue.length}` : "One image ready"}</span>
            <button type="button" onClick={dropFirst} className="underline focus-visible:outline-2 focus-visible:outline-ring">
              Remove image
            </button>
          </div>
        </div>
      )}
      {source !== null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="break-all font-mono text-xs">{source}</span>
          <button type="button" onClick={() => setSource(null)} className="underline focus-visible:outline-2 focus-visible:outline-ring">
            Remove address
          </button>
        </div>
      )}
      <label htmlFor="description" className="text-sm">
        Description
      </label>
      <input
        id="description"
        ref={input}
        type="text"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        autoComplete="off"
        placeholder="What is this for?"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepSource} onChange={(event) => setKeepSource(event.target.checked)} />
          Keep the address for the next item
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Paste or drop an image, paste an address, type a description, press Enter.</p>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
