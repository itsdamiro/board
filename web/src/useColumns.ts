import { useState } from "react";
import { autoColumns, clampColumns, columnRange, PAGE_PADDING, readColumns, writeColumns } from "./columns";

// The page's column count, held where both the header's buttons and the cards can reach it (ADR 002, amendment of 2026-10-16).
// `width` is the stage's, set by the cards once they are laid out.

export function useColumns() {
  const [chosen, setChosen] = useState<number | null>(() => readColumns());
  const [width, setWidth] = useState(() => window.innerWidth - PAGE_PADDING); // a guess until the stage is measured
  const range = columnRange(width);
  return {
    width,
    setWidth,
    range,
    chosen,
    count: chosen === null ? autoColumns(width) : clampColumns(chosen, range), // the choice is kept, only shown within the range
    choosable: range.min < range.max, // a phone has one column and no buttons
    choose(next: number) {
      setChosen(next);
      writeColumns(next);
    },
  };
}

export type Columns = ReturnType<typeof useColumns>;
