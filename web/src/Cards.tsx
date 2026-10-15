import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { orderCards, type Card } from "./cardOrder";
import type { Columns } from "./useColumns";
import DeleteItem, { ConfirmDelete } from "./DeleteItem";
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

/** `adder` is the box that takes a pasted or dropped image; it is the first card, before the brand's own. `onChanged` is told after an item is deleted. */
export default function Cards({ brand, adder, columns, onChanged }: { brand: Brand; adder?: ReactNode; columns: Columns; onChanged: () => void }) {
  const cards = orderCards(brand);
  // The viewer steps through the images in the order of the cards, so previous and next are the neighbours the owner sees.
  const gallery = cards.flatMap((card) => (card.kind === "item" && card.item.image !== null ? [{ key: card.key, item: card.item }] : []));
  const [viewing, setViewing] = useState<string | null>(null);
  // Cards picked with shift-click, to delete together. Keys of items no longer in the brand are ignored, so nothing is pruned by hand.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const selection = cards.flatMap((card) => (card.kind === "item" && picked.has(card.key) ? [card.item] : []));
  const none = selection.length === 0;
  useEffect(() => {
    if (none || asking) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicked(new Set());
    };
    document.addEventListener("keydown", clear);
    return () => document.removeEventListener("keydown", clear);
  }, [none, asking]);
  const opener = useRef<HTMLElement | null>(null);
  const viewed = gallery.findIndex((entry) => entry.key === viewing);
  const [stage, setStage] = useState<HTMLUListElement | null>(null);
  const { setWidth, chosen, count, choosable } = columns;
  useEffect(() => {
    if (stage === null) return;
    // A shift-click on an item card picks it instead of doing what the click would. It is caught here, on the list, in the capture
    // phase, so the picture's own click never runs; a click in the confirmation dialog is outside the list and is left alone.
    const cardOf = (event: MouseEvent) => (event.shiftKey && event.target instanceof Element ? event.target.closest<HTMLElement>("li[data-item-key]") : null);
    const pick = (event: MouseEvent) => {
      const key = cardOf(event)?.dataset.itemKey;
      if (key === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      setPicked((now) => {
        const next = new Set(now);
        if (!next.delete(key)) next.add(key);
        return next;
      });
    };
    const noTextSelection = (event: MouseEvent) => {
      if (cardOf(event) !== null) event.preventDefault();
    };
    stage.addEventListener("click", pick, true);
    stage.addEventListener("mousedown", noTextSelection);
    const follow = () => {
      if (stage.clientWidth > 0) setWidth(stage.clientWidth); // 0 is a page not laid out (hidden, or no layout engine)
    };
    follow();
    const watcher = new ResizeObserver(follow);
    watcher.observe(stage);
    return () => {
      watcher.disconnect();
      stage.removeEventListener("click", pick, true);
      stage.removeEventListener("mousedown", noTextSelection);
    };
  }, [stage, setWidth]);
  if (cards.length === 0 && adder === undefined) return null;
  return (
    <>
      <ul ref={setStage} aria-label="Cards" className="gap-4" style={{ columns: chosen === null && choosable ? "18rem" : count }}>
        {adder !== undefined && <li className="mb-4 break-inside-avoid rounded-lg border-2 border-dashed border-border text-card-foreground">{adder}</li>}
        {cards.map((card) => {
          const isPicked = card.kind === "item" && picked.has(card.key);
          return (
            <li
              key={card.key}
              data-item-key={card.kind === "item" ? card.key : undefined}
              className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-lg border bg-card text-card-foreground ${isPicked ? "border-ring ring-2 ring-ring" : "border-border"}`}
            >
              <Body card={card} onView={(from) => { opener.current = from; setViewing(card.key); }} />
              {isPicked && (
                <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                  <Check className="size-4" />
                </span>
              )}
              {card.kind === "item" && <DeleteItem slug={brand.slug} item={card.item} onDeleted={onChanged} />}
            </li>
          );
        })}
      </ul>
      {!none && (
        <output aria-label="Selection" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-md">
          <span>{selection.length} selected</span>
          <button type="button" onClick={() => setAsking(true)} className="rounded-md border border-destructive px-3 py-1 text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-ring">
            Delete {selection.length}
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            Clear
          </button>
        </output>
      )}
      {asking && !none && <ConfirmDelete slug={brand.slug} items={selection} onDeleted={onChanged} onClose={() => setAsking(false)} />}
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
