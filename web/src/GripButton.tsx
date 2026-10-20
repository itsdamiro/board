import { GripVertical } from "lucide-react";
import type { DragEvent, KeyboardEvent } from "react";
import { ROUND } from "./DeleteItem";

// The grip of an item's card, in its top left corner (ADR 001, amendment of 2026-10-20): the only thing that starts a drag, so a click
// on a picture, a link or the words, and a drag of selected text, are as they were. It is shown and sized by the rules of the trash
// button. From the keyboard the Up and Down arrow keys move the card past its neighbour; the grip keeps the focus when the page is
// read again, because React keeps the focus of a node it moves.
//
// It is an element with the button role and not a `button`, because a drag does not start from a native button in every browser
// (Firefox is the known one); it takes the focus and the keys itself.

export default function GripButton({
  label,
  onDragStart,
  onDragEnd,
  onStep,
}: {
  label: string;
  onDragStart: (event: DragEvent<HTMLSpanElement>) => void;
  onDragEnd: () => void;
  onStep: (direction: -1 | 1) => void;
}) {
  function keys(event: KeyboardEvent) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault(); // no scrolling of the page
    onStep(event.key === "ArrowUp" ? -1 : 1);
  }
  return (
    <span
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      tabIndex={0}
      draggable
      aria-label={`Move ${label}`}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title="Drag to move, or press the up and down arrow keys"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={keys}
      className={`absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing ${ROUND}`}
    >
      <GripVertical aria-hidden="true" className="size-4" />
    </span>
  );
}
