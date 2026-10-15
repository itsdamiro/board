import { useEffect, useRef, useState, type ReactNode } from "react";
import { orderCards, type Card } from "./cardOrder";
import type { Columns } from "./useColumns";
import Viewer from "./Viewer";
import type { Brand, Item, Panel } from "./api";

// The brand as cards in columns, as many as the stage's width has room for, each card keeping its own proportions
// (ADR 001, decision 4; ADR 002, amendment on the cards). Every text on a card is shown as text (ADR 002, decision 7);
// an address is a link only because the server wrote it as one.

const LINK = "focus-visible:outline-2 focus-visible:outline-ring";

function ItemCard({ item, onView }: { item: Item; onView: (opener: HTMLElement) => void }) {
  const words = item.description !== "" ? item.description : item.source === null && item.image === null ? item.text : "";
  return (
    <>
      {item.thumb !== null && item.image !== null && (
        <button type="button" aria-label={`View ${item.description !== "" ? item.description : "image"}`} onClick={(event) => onView(event.currentTarget)} className={`block w-full cursor-zoom-in ${LINK}`}>
          <img
            src={item.thumb}
            alt={item.description !== "" ? item.description : "Image"}
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            loading="lazy"
            className="h-auto w-full"
          />
        </button>
      )}
      {(words !== "" || item.source !== null) && (
        <div className="flex flex-col gap-1 p-3 text-sm">
          {words !== "" && <p className="whitespace-pre-wrap">{words}</p>}
          {item.source !== null && (
            <a href={item.source} target="_blank" rel="noopener noreferrer" className={`break-all font-mono text-xs text-muted-foreground underline ${LINK}`}>
              {item.source}
            </a>
          )}
        </div>
      )}
    </>
  );
}

function NoteCard({ panel }: { panel: Panel }) {
  return (
    <section aria-label={panel.title} className="flex flex-col gap-2 p-4">
      <h2 className="text-xl">{panel.title}</h2>
      {panel.problem !== null ? <p className="text-sm text-destructive">{panel.problem}</p> : <p className="whitespace-pre-wrap text-sm">{panel.text}</p>}
    </section>
  );
}

function HubCard({ brand }: { brand: Brand }) {
  return (
    <section aria-label="About this brand" className="flex flex-col gap-2 p-4 text-sm">
      {brand.hub_problem !== null && <p role="alert" className="text-destructive">{brand.hub_problem}</p>}
      {(brand.status !== null || brand.client !== null) && (
        <p className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {brand.status !== null && <span className="rounded-md border border-border px-2 py-0.5">{brand.status}</span>}
          {brand.client !== null && <span className="rounded-md border border-border px-2 py-0.5">{brand.client}</span>}
        </p>
      )}
      {brand.summary !== "" && <p>{brand.summary}</p>}
    </section>
  );
}

function Body({ card, onView }: { card: Card; onView: (opener: HTMLElement) => void }) {
  if (card.kind === "hub") return <HubCard brand={card.brand} />;
  if (card.kind === "note") return <NoteCard panel={card.panel} />;
  return <ItemCard item={card.item} onView={onView} />;
}

/** `adder` is the box that takes a pasted or dropped image; it is the first card, before the brand's own. */
export default function Cards({ brand, adder, columns }: { brand: Brand; adder?: ReactNode; columns: Columns }) {
  const cards = orderCards(brand);
  // The viewer steps through the images in the order of the cards, so previous and next are the neighbours the owner sees.
  const gallery = cards.flatMap((card) => (card.kind === "item" && card.item.image !== null ? [{ key: card.key, item: card.item }] : []));
  const [viewing, setViewing] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const viewed = gallery.findIndex((entry) => entry.key === viewing);
  const [stage, setStage] = useState<HTMLUListElement | null>(null);
  const { setWidth, chosen, count, choosable } = columns;
  useEffect(() => {
    if (stage === null) return;
    const follow = () => {
      if (stage.clientWidth > 0) setWidth(stage.clientWidth); // 0 is a page not laid out (hidden, or no layout engine)
    };
    follow();
    const watcher = new ResizeObserver(follow);
    watcher.observe(stage);
    return () => watcher.disconnect();
  }, [stage, setWidth]);
  if (cards.length === 0 && adder === undefined) return null;
  return (
    <>
      <ul ref={setStage} aria-label="Cards" className="gap-4" style={{ columns: chosen === null && choosable ? "18rem" : count }}>
        {adder !== undefined && <li className="mb-4 break-inside-avoid rounded-lg border-2 border-dashed border-border text-card-foreground">{adder}</li>}
        {cards.map((card) => (
          <li key={card.key} className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
            <Body card={card} onView={(from) => { opener.current = from; setViewing(card.key); }} />
          </li>
        ))}
      </ul>
      {viewed >= 0 && (
        <Viewer
          images={gallery.map((entry) => entry.item)}
          index={viewed}
          onIndex={(next) => setViewing(gallery[next]?.key ?? null)}
          onClose={() => {
            setViewing(null);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}
