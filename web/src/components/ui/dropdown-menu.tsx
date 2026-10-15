import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// shadcn's DropdownMenu (new-york), as copied by its CLI, with the radio group and its items only. Changed beyond its
// tokens: the popup uses the card tokens, because the theme has no popover tokens (UI_STANDARDS). Used in place of a Select
// because the Select writes <style> elements, which the server's Content-Security-Policy refuses (ADR 002, amendment on the cards).

const DropdownMenu = (props: ComponentProps<typeof MenuPrimitive.Root>) => <MenuPrimitive.Root modal={false} {...props} />;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

function DropdownMenuContent({ className, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align="start"
        sideOffset={4}
        className={cn("z-50 max-h-80 min-w-48 overflow-y-auto rounded-md border border-border bg-card p-1 text-card-foreground shadow-md", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <MenuPrimitive.ItemIndicator className="absolute right-2 flex items-center">
        <Check aria-hidden="true" className="size-4" />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger };
