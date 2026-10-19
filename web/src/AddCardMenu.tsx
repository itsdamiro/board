import { Palette, Plus, Type, TextQuote, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CardInput } from "./api";

// The header's Add card button and its menu (ADR 009, decision 5): the way to add a colours, text or type card, from the keyboard and by touch.

const CHOICES: { kind: CardInput["kind"]; label: string; Icon: LucideIcon }[] = [
  { kind: "text", label: "Text card", Icon: TextQuote },
  { kind: "colors", label: "Colours", Icon: Palette },
  { kind: "type", label: "Font", Icon: Type },
];

export default function AddCardMenu({ onChoose }: { onChoose: (kind: CardInput["kind"]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Add card"
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add card
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CHOICES.map(({ kind, label, Icon }) => (
          <DropdownMenuItem key={kind} onSelect={() => onChoose(kind)}>
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
