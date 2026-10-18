import { Minus, Plus } from "lucide-react";
import { useEffect } from "react";
import { keyIsTaken } from "./keys";
import type { Columns } from "./useColumns";

// Plus and minus for the number of columns, a small pill in the header beside the theme toggle, which is dressed like it (ADR 002,
// amendment of 2026-10-16). Not shown on a phone, where there is one column. The keys + and - (and = and _, the same keys without
// Shift) press them from anywhere on the page except a field being typed in or while a dialog is open; with Ctrl, Cmd or Alt they stay the browser's zoom.

const BUTTON =
  "flex size-7 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent";

const STEP: Record<string, number> = { "+": 1, "=": 1, "-": -1, _: -1 };

export default function ColumnButtons({ columns }: { columns: Columns }) {
  const { count, range, choose } = columns;
  const { min, max } = range;
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      const step = STEP[event.key];
      if (step === undefined || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || keyIsTaken(event.target)) return;
      const next = count + step;
      if (next < min || next > max) return;
      event.preventDefault();
      choose(next);
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
  }, [count, min, max, choose]);
  return (
    <fieldset className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-card-foreground shadow-md">
      <legend className="sr-only">Columns</legend>
      <button
        type="button"
        aria-label="Fewer columns"
        aria-keyshortcuts="-"
        title="Fewer columns (-)"
        disabled={count <= range.min}
        onClick={() => choose(count - 1)}
        className={BUTTON}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" aria-label="Columns shown" className="w-4 text-center tabular-nums">
        {count}
      </output>
      <button
        type="button"
        aria-label="More columns"
        aria-keyshortcuts="+"
        title="More columns (+)"
        disabled={count >= range.max}
        onClick={() => choose(count + 1)}
        className={BUTTON}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </fieldset>
  );
}
