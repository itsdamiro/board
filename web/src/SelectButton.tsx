import { ListChecks } from "lucide-react";

// Turns the select mode on and off (ADR 002, amendment of 2026-10-18): in the mode every item card has a checkbox and a tap or click
// picks it, so cards can be picked and deleted by touch or from the keyboard. A round button dressed like the theme toggle, before the
// column pill; pressed, it is filled.

export default function SelectButton({ selecting, onToggle }: { selecting: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selecting}
      aria-label="Select cards"
      title="Select cards to delete"
      className={`flex items-center justify-center rounded-full border border-border p-2 shadow-md pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-ring ${selecting ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"}`}
    >
      <ListChecks aria-hidden="true" className="size-5" />
    </button>
  );
}
