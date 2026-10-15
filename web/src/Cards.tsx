import { useEffect, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { orderCards, type Card } from "./cardOrder";
import { autoColumns, MAX_COLUMNS, MIN_COLUMNS, readColumns, writeColumns } from "./columns";
import type { Brand, Item, Panel } from "./api";

// The brand as cards in columns, as many as the window's width has room for, each card keeping its own proportions
// (ADR 001, decision 4; ADR 002, amendment on the cards). Every text on a card is shown as text (ADR 002, decision 7);
// an address is a link only because the server wrote it as one.

const LINK = "focus-visible:outline-2 focus-visible:outline-ring";

function ItemCard({ item }: { item: Item }) {
  const words = item.description !== "" ? item.description : item.source === null && item.image === null ? item.text : "";
  return (
    <>
      {item.thumb !== null && item.image !== null && (
        <a href={item.image} target="_blank" rel="noopener noreferrer" className={`block ${LINK}`}>
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

function Body({ card }: { card: Card }) {
  if (card.kind === "hub") return <HubCard brand={card.brand} />;
  if (card.kind === "note") return <NoteCard panel={card.panel} />;
  return <ItemCard item={card.item} />;
}

function ColumnButtons({ value, onChange }: { value: number; onChange: (count: number) => void }) {
  const button =
    "flex size-7 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <fieldset className="fixed right-4 bottom-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-md">
      <legend className="sr-only">Columns</legend>
      <button type="button" aria-label="Fewer columns" disabled={value <= MIN_COLUMNS} onClick={() => onChange(value - 1)} className={button}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" aria-label="Columns shown" className="w-4 text-center tabular-nums">
        {value}
      </output>
      <button type="button" aria-label="More columns" disabled={value >= MAX_COLUMNS} onClick={() => onChange(value + 1)} className={button}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </fieldset>
  );
}

/** `adder` is the box that takes a pasted or dropped image; it is the first card, before the brand's own. */
export default function Cards({ brand, adder }: { brand: Brand; adder?: ReactNode }) {
  const cards = orderCards(brand);
  const [chosen, setChosen] = useState<number | null>(() => readColumns());
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const follow = () => setWidth(window.innerWidth);
    window.addEventListener("resize", follow);
    return () => window.removeEventListener("resize", follow);
  }, []);
  if (cards.length === 0 && adder === undefined) return null;
  const count = chosen ?? autoColumns(width);
  return (
    <>
      <ul aria-label="Cards" className="gap-4" style={{ columns: chosen ?? "18rem" }}>
        {adder !== undefined && <li className="mb-4 break-inside-avoid rounded-lg border-2 border-dashed border-border text-card-foreground">{adder}</li>}
        {cards.map((card) => (
          <li key={card.key} className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
            <Body card={card} />
          </li>
        ))}
      </ul>
      {cards.length > 0 && (
        <ColumnButtons
          value={count}
          onChange={(next) => {
            setChosen(next);
            writeColumns(next);
          }}
        />
      )}
    </>
  );
}
