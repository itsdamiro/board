import type { Item } from "./api";

// The brand's Moodboard items, newest first, in columns so each thumbnail keeps its own proportions (ADR 001, decision 4).
// Every text on a card is shown as text (ADR 002, decision 7); an address is a link only because the server wrote it as one.

function keysFor(items: Item[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = seen.get(item.key) ?? 0;
    seen.set(item.key, n + 1);
    return n === 0 ? item.key : `${item.key}-${n}`; // two blocks with the same text have the same key
  });
}

function Card({ item }: { item: Item }) {
  const words = item.description !== "" ? item.description : item.source === null && item.image === null ? item.text : "";
  return (
    <>
      {item.thumb !== null && item.image !== null && (
        <a href={item.image} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-2 focus-visible:outline-ring">
          <img
            src={item.thumb}
            alt={item.description !== "" ? item.description : "Image"}
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            loading="lazy"
            className="h-auto w-full"
          />
        </a>
      )}
      {(words !== "" || item.source !== null) && (
        <div className="flex flex-col gap-1 p-3 text-sm">
          {words !== "" && <p className="whitespace-pre-wrap">{words}</p>}
          {item.source !== null && (
            <a
              href={item.source}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-mono text-xs text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {item.source}
            </a>
          )}
        </div>
      )}
    </>
  );
}

export default function Grid({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">Nothing here yet. Paste a screenshot to add the first item.</p>;
  }
  const keys = keysFor(items);
  return (
    <ul aria-label="Moodboard items" className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {items.map((item, n) => (
        <li key={keys[n]} className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
          <Card item={item} />
        </li>
      ))}
    </ul>
  );
}
