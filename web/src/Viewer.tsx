import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Item } from "./api";

// An image shown large at the centre of the window over the blurred page, with arrows to the previous and next image (ADR 002,
// amendment of 2026-10-16 on the viewer). It shows the original, not the thumbnail. The words and the address are text, as on a
// card; the address is a link only because the server wrote it as one.

const ARROW =
  "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-card-foreground shadow-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-card";

export default function Viewer({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: Item[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const item = images[index];
  if (item === undefined || item.image === null) return null;
  const label = item.description !== "" ? item.description : "Image";
  const go = (to: number) => {
    if (to >= 0 && to < images.length) onIndex(to);
  };
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") go(index - 1);
    else if (event.key === "ArrowRight") go(index + 1);
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onKeyDown={onKeyDown}>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <figure className="relative flex max-h-full max-w-full flex-col items-center gap-3 p-16">
          <img src={item.image} alt={label} className="max-h-[75vh] max-w-full rounded-md border border-border object-contain shadow-lg" />
          <figcaption className="flex max-w-prose flex-col items-center gap-1 text-center text-sm">
            {item.description !== "" && <p className="whitespace-pre-wrap">{item.description}</p>}
            {item.source !== null && (
              <a href={item.source} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs text-muted-foreground underline focus-visible:outline-2 focus-visible:outline-ring">
                {item.source}
              </a>
            )}
            <span className="text-xs text-muted-foreground">
              {index + 1} of {images.length}
            </span>
          </figcaption>
        </figure>
        <button type="button" aria-label="Previous image" disabled={index === 0} onClick={() => go(index - 1)} className={`${ARROW} left-4`}>
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>
        <button type="button" aria-label="Next image" disabled={index === images.length - 1} onClick={() => go(index + 1)} className={`${ARROW} right-4`}>
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
