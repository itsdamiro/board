import { Pencil } from "lucide-react";
import { BUTTON } from "./DeleteItem";

// The edit control of a special card (ADR 009, decision 6): the trash button's twin, beside it, shown and sized by the same rules.

export default function EditButton({ label, onAsk }: { label: string; onAsk: () => void }) {
  return (
    <button type="button" aria-label={`Edit ${label}`} onClick={onAsk} className={`${BUTTON} right-12 pointer-coarse:right-16`}>
      <Pencil aria-hidden="true" className="size-4" />
    </button>
  );
}
