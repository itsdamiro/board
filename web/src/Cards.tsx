import { Check } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { itemCards, type Card, type PlacedItem } from "./cardOrder";
import type { Columns } from "./useColumns";
import { ConfirmDelete, DeleteButton } from "./DeleteItem";
import { keyIsTaken } from "./keys";
import Viewer from "./Viewer";
import { itemWords, type Brand, type Item, type Panel } from "./api";

// The brand as cards in columns, as many as the stage's width has room for, each card keeping its own proportions
// (ADR 001, decision 4; ADR 002, amendment on the cards). Every text on a card is shown as text (ADR 002, decision 7);
// an address is a link only because the server wrote it as one.

const LINK = "focus-visible:outline-2 focus-visible:outline-ring";

function ItemCard({ item, onView }: { item: Item; onView: (opener: HTMLElement) => void }) {
  const words = item.description !== "" ? item.description : item.source === null && item.image === null ? item.text : "";
  const icon = item.image === null ? item.preview : null;
  return (
    <>
      {item.thumb !== null && item.image !== null && (
        <button type="button" aria-label={`View ${itemWords(item)}`} onClick={(event) => onView(event.currentTarget)} className={`block w-full cursor-zoom-in ${LINK}`}>
          <img
            src={item.thumb}
            alt={itemWords(item)}
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
          {/* Another person's text, so muted and apart from the owner's words (ADR 002, amendment of 2026-10-17). The page's icon
              (ADR 008) is served by the app, small, not opened by the viewer, and no link. */}
          {(item.title !== null || icon !== null) && (
            <div className="flex items-center gap-2">
              {icon !== null && (
                <img src={icon.url} alt={item.title !== null ? "" : "Site icon"} width={32} height={32} loading="lazy" className="size-8 shrink-0 rounded-sm object-contain" />
              )}
              {item.title !== null && <p className="text-xs text-muted-foreground">{item.title}</p>}
            </div>
          )}
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

/**
 * `adder` is the box that takes a pasted or dropped image; it is the first card, before the brand's own. `cards` are in the order
 * `orderCards` gives. `onChanged` is told after a delete was tried, so the page reads the brand again.
 */
export default function Cards({ slug, cards, adder, columns, onChanged }: { slug: string; cards: Card[]; adder?: ReactNode; columns: Columns; onChanged: () => void }) {
  // The viewer steps through the images in the order of the cards, so previous and next are the neighbours the owner sees.
  const placed = itemCards(cards);
  const gallery = placed.filter((entry) => entry.item.image !== null);
  const [viewing, setViewing] = useState<string | null>(null);
  // Cards picked with shift-click, to delete together. A key of an item no longer in the brand is ignored, and one that was just removed is dropped.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<PlacedItem[] | null>(null); // the items the open question is about: one card's, or the picked ones
  const selection = placed.filter((entry) => picked.has(entry.key));
  const none = selection.length === 0;
  useEffect(() => {
    if (none) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !keyIsTaken(event.target)) setPicked(new Set());
    };
    document.addEventListener("keydown", clear);
    return () => document.removeEventListener("keydown", clear);
  }, [none]);
  const opener = useRef<HTMLElement | null>(null);
  const { watchStage, count } = columns;
  const viewed = gallery.findIndex((entry) => entry.key === viewing);

  // A click with Shift held on an item card picks it instead of doing what the click would. It is caught in the capture phase, so
  // the picture's own click never runs; the dialogs are outside the list, so a click in them is left alone.
  function shiftPick(key: string) {
    return {
      onClickCapture(event: MouseEvent) {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        setPicked((now) => {
          const next = new Set(now);
          if (!next.delete(key)) next.add(key);
          return next;
        });
      },
      onMouseDown(event: MouseEvent) {
        if (event.shiftKey) event.preventDefault(); // no text selection
      },
    };
  }

  function done(removed: string[]) {
    setPicked((now) => new Set([...now].filter((key) => !removed.includes(key))));
    onChanged();
  }

  if (cards.length === 0 && adder === undefined) return null;
  return (
    <>
      <ul ref={watchStage} aria-label="Cards" className="gap-4" style={{ columns: count }}>
        {adder !== undefined && <li className="mb-4 break-inside-avoid rounded-lg border-2 border-dashed border-border text-card-foreground">{adder}</li>}
        {cards.map((card) => {
          const isPicked = card.kind === "item" && picked.has(card.key);
          return (
            <li
              key={card.key}
              {...(card.kind === "item" ? shiftPick(card.key) : {})}
              className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-lg border bg-card text-card-foreground ${isPicked ? "border-ring ring-2 ring-ring" : "border-border"}`}
            >
              <Body card={card} onView={(from) => { opener.current = from; setViewing(card.key); }} />
              {isPicked && (
                <span aria-hidden="true" className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                  <Check className="size-4" />
                </span>
              )}
              {card.kind === "item" && <DeleteButton item={card.item} onAsk={() => setDeleting([{ key: card.key, item: card.item }])} />}
            </li>
          );
        })}
      </ul>
      {!none && (
        <output aria-label="Selection" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-md">
          <span>{selection.length} selected</span>
          <button type="button" onClick={() => setDeleting(selection)} className="rounded-md border border-destructive px-3 py-1 text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-ring">
            Delete {selection.length}
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            Clear
          </button>
        </output>
      )}
      {deleting !== null && <ConfirmDelete slug={slug} items={deleting} onDone={done} onClose={() => setDeleting(null)} />}
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
