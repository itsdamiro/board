import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { itemCards, type Card, type PlacedItem } from "./cardOrder";
import type { Columns } from "./useColumns";
import { ConfirmDelete, DeleteButton } from "./DeleteItem";
import { keyIsTaken } from "./keys";
import CardForm from "./CardForm";
import EditButton from "./EditButton";
import GripButton from "./GripButton";
import { moveRequest, stepRequest, type MoveRequest, type Side } from "./reorder";
import SpecialBody from "./SpecialCards";
import Viewer from "./Viewer";
import { itemWords, moveItem, type Brand, type Item, type Panel } from "./api";

// The brand as cards in columns, as many as the stage's width has room for, each card keeping its own proportions
// (ADR 001, decision 4; ADR 002, amendment on the cards). Every text on a card is shown as text (ADR 002, decision 7);
// an address is a link only because the server wrote it as one.

const LINK = "focus-visible:outline-2 focus-visible:outline-ring";
const DRAG_TYPE = "application/x-board-card"; // not text/plain, so a card dropped on a text box does not paste anything

function ItemCard({ item, pending, onView }: { item: Item; pending: boolean; onView: (opener: HTMLElement) => void }) {
  if (item.card !== null) return <SpecialBody card={item.card} />; // ADR 009: a colours, text or type card
  const words = item.description !== "" ? item.description : item.source === null && item.image === null ? item.text : "";
  const icon = item.image === null ? item.preview : null;
  return (
    <>
      {item.thumb !== null && item.image !== null && (
        <button
          type="button"
          aria-label={`View ${itemWords(item)}`}
          onClick={(event) => onView(event.currentTarget)}
          className={`block w-full cursor-zoom-in ${LINK}`}
        >
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
                <img
                  src={icon.url}
                  alt={item.title !== null ? "" : "Site icon"}
                  width={32}
                  height={32}
                  loading="lazy"
                  className="size-8 shrink-0 rounded-sm object-contain"
                />
              )}
              {item.title !== null && <p className="text-xs text-muted-foreground">{item.title}</p>}
            </div>
          )}
          {pending && <output className="text-xs text-muted-foreground">Looking up the page…</output>}
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
      {brand.hub_problem !== null && (
        <p role="alert" className="text-destructive">
          {brand.hub_problem}
        </p>
      )}
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

// The checkbox of the select mode, in the card's top left corner (ADR 002, amendment of 2026-10-18). It is a real button, so Tab and
// Space reach it; the click is handled by the card (`pickable`), which the capture phase makes first.
function PickBox({ item, picked }: { item: Item; picked: boolean }) {
  return (
    <button
      type="button"
      // A native input would fight the card's capture-phase click (it would flip and be flipped back) and cannot hold the check icon.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="checkbox"
      aria-checked={picked}
      aria-label={`Pick ${itemWords(item)}`}
      className={`absolute top-2 left-2 z-10 flex size-8 items-center justify-center rounded-full border shadow-md pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-ring ${picked ? "border-primary bg-primary text-primary-foreground" : "border-foreground/60 bg-card/80 text-transparent hover:bg-accent"}`}
    >
      <Check aria-hidden="true" className="size-4" />
    </button>
  );
}

function Body({ card, pending, onView }: { card: Card; pending: ReadonlySet<string>; onView: (opener: HTMLElement) => void }) {
  if (card.kind === "hub") return <HubCard brand={card.brand} />;
  if (card.kind === "note") return <NoteCard panel={card.panel} />;
  return <ItemCard item={card.item} pending={pending.has(card.item.key)} onView={onView} />;
}

/**
 * `adder` is the box that takes a pasted or dropped image; it is the first card, before the brand's own. `cards` are in the order
 * `orderCards` gives. `onChanged` is told after a delete was tried, so the page reads the brand again. `pending` holds the keys of
 * the items whose address is being looked up (ADR 008, amendment of 2026-10-17), which say so. `selecting` is the select mode of the
 * amendment of 2026-10-18, which the header's button turns on and off and `onSelecting` is told about.
 */
export default function Cards({
  slug,
  cards,
  adder,
  columns,
  pending,
  selecting,
  onSelecting,
  onChanged,
}: {
  slug: string;
  cards: Card[];
  adder?: ReactNode;
  columns: Columns;
  pending: ReadonlySet<string>;
  selecting: boolean;
  onSelecting: (on: boolean) => void;
  onChanged: () => void;
}) {
  // The viewer steps through the images in the order of the cards, so previous and next are the neighbours the owner sees.
  const placed = itemCards(cards);
  const gallery = placed.filter((entry) => entry.item.image !== null);
  const [viewing, setViewing] = useState<string | null>(null);
  // Cards picked with shift-click, to delete together. A key of an item no longer in the brand is ignored, and one that was just removed is dropped.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<PlacedItem | null>(null); // the special card whose form is open (ADR 009)
  const [deleting, setDeleting] = useState<PlacedItem[] | null>(null); // the items the open question is about: one card's, or the picked ones
  const selection = placed.filter((entry) => picked.has(entry.key));
  const none = selection.length === 0;
  const finish = useCallback(() => {
    setPicked(new Set());
    onSelecting(false);
  }, [onSelecting]);
  useEffect(() => {
    if (!selecting) return;
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !keyIsTaken(event.target)) finish();
    };
    document.addEventListener("keydown", leave);
    return () => document.removeEventListener("keydown", leave);
  }, [selecting, finish]);
  const opener = useRef<HTMLElement | null>(null);
  // The drag that moves a card (ADR 001, amendment of 2026-10-20): the card being dragged, and the card and half it would be dropped on.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; side: Side } | null>(null);
  const [moveProblem, setMoveProblem] = useState<string | null>(null);
  const moving = useRef(false); // a write at a time: two moves of one note at once would only meet the server's 409
  const dimming = useRef(0);
  const { watchStage, count } = columns;

  const viewed = gallery.findIndex((entry) => entry.key === viewing);

  // A click on an item card with Shift held, or in the select mode, picks it instead of doing what the click would; the first pick
  // by shift-click also turns the mode on. It is caught in the capture phase, so the picture's own click never runs, and so the
  // checkbox needs no handler of its own; the dialogs are outside the list, so a click in them is left alone.
  function pickable(key: string) {
    return {
      onClickCapture(event: MouseEvent) {
        if (!event.shiftKey && !selecting) return;
        event.preventDefault();
        event.stopPropagation();
        onSelecting(true);
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

  async function move(key: string, request: MoveRequest) {
    const entry = placed.find((one) => one.key === key);
    if (entry === undefined || moving.current) return;
    moving.current = true;
    setMoveProblem(null);
    try {
      await moveItem(slug, entry.item.key, request.before);
    } catch (failure) {
      setMoveProblem(failure instanceof Error ? failure.message : "Something went wrong.");
    } finally {
      moving.current = false;
      onChanged(); // whatever the answer was, the page asks the server again
    }
  }

  function endDrag() {
    window.clearTimeout(dimming.current);
    setDragging(null);
    setDropAt(null);
  }

  // The half of the card the pointer is in. Over the card itself, a hub or a note, or a card that is not an item, nothing is let drop.
  function overCard(card: Card, event: DragEvent<HTMLLIElement>) {
    if (dragging === null) return;
    if (card.kind !== "item" || card.key === dragging) {
      setDropAt(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const box = event.currentTarget.getBoundingClientRect();
    const side: Side = event.clientY < box.top + box.height / 2 ? "above" : "below";
    setDropAt((now) => (now?.key === card.key && now.side === side ? now : { key: card.key, side }));
  }

  function dropOn(card: Card, event: DragEvent<HTMLLIElement>) {
    if (dragging === null || card.kind !== "item") return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const request = moveRequest(placed, dragging, card.key, event.clientY < box.top + box.height / 2 ? "above" : "below");
    endDrag();
    if (request !== null) void move(dragging, request);
  }

  // The card's side of the drag, spread on the card like `pickable`: the card takes a drop, it is not itself a control.
  function dropTarget(card: Card) {
    return { onDragOver: (event: DragEvent<HTMLLIElement>) => overCard(card, event), onDrop: (event: DragEvent<HTMLLIElement>) => dropOn(card, event) };
  }

  if (cards.length === 0 && adder === undefined) return null;
  return (
    <>
      {moveProblem !== null && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {moveProblem}
        </p>
      )}
      <ul ref={watchStage} aria-label="Cards" className="gap-4" style={{ columns: count }}>
        {adder !== undefined && <li className="mb-4 break-inside-avoid rounded-lg border-2 border-dashed border-border text-card-foreground">{adder}</li>}
        {cards.map((card) => {
          const isPicked = card.kind === "item" && picked.has(card.key);
          return (
            <li
              key={card.key}
              {...(card.kind === "item" ? pickable(card.key) : {})}
              {...dropTarget(card)}
              className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-lg border bg-card text-card-foreground ${isPicked ? "border-ring ring-2 ring-ring" : "border-border"} ${selecting ? "select-none" : ""} ${dragging === card.key ? "opacity-50" : ""}`}
            >
              {dropAt?.key === card.key && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 z-20 h-1 bg-ring ${dropAt.side === "above" ? "top-0" : "bottom-0"}`}
                />
              )}
              <Body
                card={card}
                pending={pending}
                onView={(from) => {
                  opener.current = from;
                  setViewing(card.key);
                }}
              />
              {card.kind === "item" && selecting && <PickBox item={card.item} picked={isPicked} />}
              {card.kind === "item" && !selecting && (
                <GripButton
                  label={itemWords(card.item)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(DRAG_TYPE, card.key);
                    const own = event.currentTarget.closest("li");
                    if (own !== null) event.dataTransfer.setDragImage(own, 16, 16);
                    // dimmed a moment later, so the picture the browser takes of the card is not the dimmed one
                    dimming.current = window.setTimeout(() => setDragging(card.key), 0);
                  }}
                  onDragEnd={endDrag}
                  onStep={(direction) => {
                    const request = stepRequest(placed, card.key, direction);
                    if (request !== null) void move(card.key, request);
                  }}
                />
              )}
              {card.kind === "item" && !selecting && card.item.card !== null && (
                <EditButton label={itemWords(card.item)} onAsk={() => setEditing({ key: card.key, item: card.item })} />
              )}
              {card.kind === "item" && !selecting && <DeleteButton item={card.item} onAsk={() => setDeleting([{ key: card.key, item: card.item }])} />}
            </li>
          );
        })}
      </ul>
      {selecting && (
        <output
          aria-label="Selection"
          className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-md sm:gap-3 sm:px-4"
        >
          <span>{selection.length} selected</span>
          <button
            type="button"
            disabled={none}
            onClick={() => setDeleting(selection)}
            className="rounded-md border border-destructive px-3 py-1 text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:min-h-11"
          >
            Delete {selection.length}
          </button>
          <button
            type="button"
            disabled={none}
            onClick={() => setPicked(new Set())}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 pointer-coarse:min-h-11"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={finish}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
          >
            Done
          </button>
        </output>
      )}
      {editing?.item.card != null && (
        <CardForm
          slug={slug}
          kind={editing.item.card.kind}
          editing={{ key: editing.item.key, card: editing.item.card }}
          onSaved={() => onChanged()}
          onClose={() => setEditing(null)}
        />
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
