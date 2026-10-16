import { useCallback, useState } from "react";
import { autoColumns, clampColumns, columnRange, PAGE_PADDING, readColumns, writeColumns } from "./columns";

// The page's column count, held where both the header's buttons and the cards can reach it (ADR 002, amendment of 2026-10-16).
// The width is the stage's, measured from the element given to `watchStage` once it is laid out; the count is always worked out
// here and handed to the cards, so the number the pill shows is the number of columns drawn.

export function useColumns() {
  const [chosen, setChosen] = useState<number | null>(() => readColumns());
  const [width, setWidth] = useState(() => window.innerWidth - PAGE_PADDING); // a guess until the stage is measured
  const range = columnRange(width);

  const watchStage = useCallback((stage: HTMLElement | null) => {
    if (stage === null) return;
    const follow = () => {
      if (stage.clientWidth > 0) setWidth(stage.clientWidth); // 0 is a page not laid out (hidden, or no layout engine)
    };
    follow();
    const watcher = new ResizeObserver(follow);
    watcher.observe(stage);
    return () => watcher.disconnect();
  }, []);

  const choose = useCallback((next: number) => {
    setChosen(next);
    writeColumns(next);
  }, []);

  return {
    watchStage,
    range,
    count: chosen === null ? autoColumns(width) : clampColumns(chosen, range), // the choice is kept, only shown within the range
    choosable: range.min < range.max, // a phone has one column and no buttons
    choose,
  };
}

export type Columns = ReturnType<typeof useColumns>;
