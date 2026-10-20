# UI standards

The rules for the page in `web/`, from ADR 002. Read this when a task adds or changes a screen or a component.

## Look

- Tailwind with the zinc palette. Use the theme tokens (`bg-background`, `text-foreground`, `border-border` and the like), never a raw colour value or a Tailwind colour such as `zinc-500` inside a component. Colours are defined once, in the theme file, for light and for dark.
- Fonts: Fauna One for headings only, Inter for everything else, Roboto Mono for addresses, file names, ids and code. Fauna One is believed to ship in one weight (confirm when the package is added), so headings are not set bold: a synthesised bold looks wrong.
- Every screen works in light and in dark. Text has at least a 4.5 to 1 contrast against its background in both. Check both before calling a screen done.

## Components

- A shadcn component is added when a screen uses it, not in advance, and lives in `web/src/components/ui/`. Changing one beyond its tokens is noted in a comment saying why.
- Dialogs, menus, selects and comboboxes come from Radix through shadcn, never written by hand.
- No other component or icon library. Icons are from `lucide-react`. The favicon (`web/public/favicon.svg`) is the one copied icon, with its licence in a comment (ADR 002, amendment of 2026-10-20).
- An item's card has a grip in its top left corner (ADR 001, amendment of 2026-10-20), shown and sized like the trash button, which is the only thing that starts a drag; a card is dropped on the upper or lower half of another item card, and the Up and Down arrow keys on the grip move it one place with the focus kept. The hub, the notes and the add box take no drop. The order is the note's, not the page's: see the amendment before changing it.
- The special cards (colours, text, type) and their forms are in ADR 009: the header's Add card menu, a dialog form that is also the edit, a stripe that copies its hex on a click, and a pencil beside the trash button that follows its rules. A colour is set through the element's style property, never a `style=` attribute in markup.

## Accessibility

- Everything works from the keyboard, with a visible focus ring. Every control has a label; an icon-only button has an accessible name.
- An image's alt text is its description, or "Image" when it has none. Motion respects `prefers-reduced-motion`.
- The grid keeps each image's own proportions (ADR 001, decision 4): give each thumbnail its width and height so the layout does not jump as images load, and load them lazily.

## Safety and privacy

- Text from a note, a description or an address is shown as text. `dangerouslySetInnerHTML` is forbidden; a lint rule enforces it.
- The page requests only its own origin: no CDN, no font service, no analytics. The server's Content-Security-Policy enforces this, so a request to anything else shows up as a failure and is fixed in the code, not by loosening the policy.
- The server is the source of truth. The page does not keep a copy of vault state that can drift; after a change it asks the API again.
- The theme choice in local storage is read and written inside a try and catch, and the page renders without it.

## Done means

- The gates in `web/` pass: typecheck, lint, tests and a production build.
- The page was loaded and used in the real browser, in both themes, and the console had no errors. If it could not be, say so (`docs/CODE_QUALITY_STANDARDS.md`, section 7).
