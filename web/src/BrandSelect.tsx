import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// The brand's folder name as the page's title, and the menu that picks another brand (ADR 002, amendment on the cards).

interface Props {
  brands: string[];
  current: string | null;
  onChoose: (slug: string) => void;
}

export default function BrandSelect({ brands, current, onChoose }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={current === null ? "Brand" : `Brand: ${current}`}
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-left font-heading text-3xl hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {current ?? "Choose a brand"}
        <ChevronDown aria-hidden="true" className="size-5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={current ?? ""} onValueChange={onChoose}>
          {brands.map((slug) => (
            <DropdownMenuRadioItem key={slug} value={slug}>
              {slug}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
