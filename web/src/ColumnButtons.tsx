import { Minus, Plus } from "lucide-react";
import type { Columns } from "./useColumns";

// Plus and minus for the number of columns, a small pill in the header beside the theme toggle, which is dressed like it (ADR 002,
// amendment of 2026-10-16). Not shown on a phone, where there is one column.

const BUTTON =
  "flex size-7 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent";

export default function ColumnButtons({ columns }: { columns: Columns }) {
  const { count, range, choose } = columns;
  return (
    <fieldset className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-card-foreground shadow-md">
      <legend className="sr-only">Columns</legend>
      <button type="button" aria-label="Fewer columns" disabled={count <= range.min} onClick={() => choose(count - 1)} className={BUTTON}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" aria-label="Columns shown" className="w-4 text-center tabular-nums">
        {count}
      </output>
      <button type="button" aria-label="More columns" disabled={count >= range.max} onClick={() => choose(count + 1)} className={BUTTON}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </fieldset>
  );
}
