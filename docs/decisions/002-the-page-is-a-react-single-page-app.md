---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Interface stack]
amends: [001]
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/web-app, topic/architecture]
---

# 002 — The page is a React single-page app built with Vite and Tailwind, served by the Python server

> **Summary.** The page becomes a React and TypeScript single-page app (Vite, Tailwind with the zinc palette, shadcn components, light and dark themes, three self-hosted fonts); the Python server, the API and the vault code stay as ADR 001 fixes them. The owner expects the app to grow and wants a framework for it. It costs a second toolchain, an npm dependency tree and a build step in front of a small app.

Accepted by the owner on 2026-10-15: decisions 1 to 10, including React with TypeScript, Vite, Tailwind (zinc), shadcn, light and dark themes and the three self-hosted fonts; the items under "Open" stay open for later slices.

## Context

ADR 001 decision 11 chose Python with a standard-library server and a page of "plain HTML, CSS and JavaScript", and rejected a JavaScript stack because the vault tooling is Python and a second toolchain would duplicate the block logic and its tests. Later the same day the owner gave the UI preferences and a reason to revisit the page only:

- The look: Tailwind with the zinc palette, Fauna One for headers, Inter for body text, Roboto Mono for monospaced text, and a dark mode.
- The shape: in the owner's words (paraphrased), this is a single-page app and will probably scale, so a framework will help; React, with shadcn components.
- The owner's other apps already use React: Stylo's `package.json` (read 2026-10-15) has React 19.2, Vite 8, Vitest 4, TypeScript 7 and Playwright.
- The page is already the first client of a small API (ADR 001, decision 1), so the page and the server can change independently. This record changes only the page.
- Node 20.20 and npm 11.8 are installed on the owner's machine (checked 2026-10-15).
- shadcn is not a package: its CLI copies component source into the repository. The components lean on Radix primitives, which handle keyboard use, focus and screen readers for dialogs, menus and comboboxes, work that is easy to get wrong by hand.

## Decision

1. **Where it lives.** The page is in `web/`, a React and TypeScript app built with Vite. The Python server serves the built files from `web/dist/` and the API under `/api`. `web/dist/` is not committed; the gates build it, so the repository holds source only. A lockfile is committed and installs use `npm ci`.
2. **Styling.** Tailwind CSS with its Vite plugin. Colours come from theme tokens (CSS variables) on the zinc base, never from raw colour values in a component.
3. **Components.** shadcn components, added one at a time when a screen needs them and copied into `web/src/components/ui/`. No other component library. Radix packages are added only for the components in use, with `class-variance-authority`, `clsx`, `tailwind-merge` and `lucide-react` (icons) as shadcn's own helpers.
4. **Themes.** Light and dark, following the system setting by default, with a switch (system, light, dark) whose choice is remembered in the browser's local storage. The chosen theme class is set before the first paint so the page does not flash. The remembered choice is a convenience: the page works when storage is unavailable.
5. **Fonts.** Fauna One for headings, Inter for body text, Roboto Mono for monospaced text (addresses, file names, ids). They are self-hosted through `@fontsource` packages, so the page makes no request to a font service. The licence of each is checked and written down when the packages are added.
6. **Nothing leaves the machine.** The page loads scripts, styles, fonts and icons from its own origin only, and the server sends a `Content-Security-Policy` that allows its own origin and `blob:` images (for the preview of a pasted picture) and nothing else.
7. **Text is text.** Note text, descriptions and addresses are rendered as text by React and never as HTML (ADR 001, decision 3). `dangerouslySetInnerHTML` is forbidden and a lint rule fails on it.
8. **Gates.** Added with the scaffold, one line each in `scripts/gates.conf`, run in `web/`: typecheck, lint, tests (Vitest with Testing Library) and a production build. A component or screen is not done until the page has been loaded and clicked through in both themes (`docs/CODE_QUALITY_STANDARDS.md`, section 7).
9. **Rules for the work** are in `docs/reference/UI_STANDARDS.md`.
10. **ADR 001, decision 11** is amended to match: the page is this app; "no web framework" now means no Python web framework; each npm dependency beyond the set above needs its own record.

## Consequences

The page can grow screens, shared state and accessible dialogs without a rewrite, and it matches the owner's other apps, so what is learned there carries over. The API stays the only contract, so the browser extension is still a second client.

The cost is real. There are two toolchains, and the repository needs Node to build though not to run a built copy. An npm dependency tree is a larger supply-chain surface than one Python package, on a tool that holds client work, so the lockfile is committed, versions are pinned and the list stays short. `scripts/mutate.py` is Python-only; ADR 001 decision 10 still applies to the Python code, and the page keeps its logic thin and tested with Vitest. The first slice that touches the page grows by a scaffold.

Open:

- How the dev server (a second port) passes the origin check without weakening it: a proxy that sends the server's own origin, or a development-only allowed origin. Decision 1 of ADR 001 says weakening the check needs its own record, so this one is decided in the slice that needs it.
- The Node version to pin (an `.nvmrc` or an `engines` field).
- Whether end-to-end tests (Playwright, as in Stylo) run the milestone flow, and whether a mutation tool covers the page's logic.
- Whether slice 3 splits into the API and the page now that the page needs a scaffold.

## Alternatives rejected

- **Plain HTML, CSS and JavaScript (ADR 001's earlier choice).** No build step and no npm tree. Would be right again if the page stayed at three screens and the build or the dependency tree became a burden.
- **Tailwind's standalone CLI with hand-written components.** No Node, one binary. It was the first proposal today, and it fits the small app. Would be right if the owner dropped React.
- **Preact, or another small framework.** Lighter, but shadcn assumes React. Would be right if bundle size mattered, which it does not on a local app.
- **A meta-framework (Next.js and the like).** Server rendering and routing machinery the app does not need, behind a Python server. Would be right if the app were hosted and public.
- **Another component library (MUI, Mantine).** Larger and styled in its own way, against the owner's Tailwind look. Would be right if shadcn's copy-in approach became too much to maintain.
- **A JavaScript server as well.** The reasons for the Python server in ADR 001 stand: the vault code, the gates, the mutation check and Pillow are Python. Would be right if the vault tooling moved to JavaScript.
- **Tailwind's CDN script, or Google Fonts links.** Load code and fonts from other hosts on every visit, against decision 6, and the CDN script is meant for prototypes. Would be right for a throwaway page.
- **Committing `web/dist/`.** Runs without Node, but puts generated files in history, which `CLAUDE.md` warns against staging. Would be right if the owner wanted to run the app on a machine without Node.
- **Fonts as hand-downloaded files in the repository.** No packages, but a manual download and update. Would be right if the three font packages were ever refused as a dependency.

## Amendment (2026-10-15): three open items now decided

The dev server's origin check is decided in [ADR 004](004-the-dev-server-reaches-the-api-through-a-checking-proxy.md), the Node version in [ADR 005](005-node-24-is-the-pinned-node-version.md) (Node 24), and end-to-end tests in [ADR 006](006-playwright-tests-the-milestone-flow-against-a-sample-vault.md) (Playwright). The split of slice 3 was done as recommended. The lint tool and the page's support packages are decided in [ADR 007](007-oxlint-lints-the-page-and-its-support-packages-are-recorded.md) (Oxlint). The `e2e` gate of decision 8 is added later than the other page gates, as [ADR 006](006-playwright-tests-the-milestone-flow-against-a-sample-vault.md)'s amendment says. Still open: whether a mutation tool covers the page's logic.

## Amendment (2026-10-15): the screens of slice 3b

Decisions 3 to 5 of ADR 001 and decisions 2 to 7 above fix what the page shows and how it looks. What they leave to the implementer is fixed here, before the code, to be confirmed on review; none of it is a new dependency.

1. **No component package yet.** The screens need only what the platform has: a list of brands as buttons in a navigation (not a `select`, which `docs/reference/UI_STANDARDS.md` says comes from Radix), a form with a text input, and a plain link for the original image. So no shadcn component, Radix package or `lucide-react` is added in this slice; each comes with the first screen that needs it (a dialog for delete, for one).
2. **The layout.** A narrow column on the left lists the brands and holds the theme switch. The main area shows the brand's badges and summary, the input, and the grid; the notes (every panel except `Moodboard`, whose text the grid already shows as images and descriptions) sit beside it on a wide window and below it on a narrow one. Dropping ADR 001's `Moodboard` panel from the notes is a deviation from decision 3, taken because its text is the raw embeds and descriptions of the grid.
3. **The grid** is CSS columns, so each thumbnail keeps its own proportions (ADR 001, decision 4). A thumbnail has its width and height from the API (see 7), loads lazily, and is a link to the original in a new tab.
4. **The input** is one text field for the description, in a form. Pasting an image into the page, or dropping image files on it, queues each file; the first is previewed and Enter adds it with the description and the address, then the next one shows. Pasting a single web address (and nothing else) while no address is set becomes the item's address, shown as a chip with a remove button; any other pasted text goes into the field as usual. A switch keeps the address for the next item. With no image queued, Enter adds an item with only what was typed; the server refuses an item with nothing in it and its message is shown.
5. **The remembered brand** is the last one chosen, in local storage under `board-brand`, read and written in a try and catch like the theme. The page does not keep vault state of its own: after an add it asks the API for the brand again.
6. **Errors** from the API are shown in an alert region with the server's own words; a network failure says the server cannot be reached.
7. **The API gains `width` and `height`** on each item (of its thumbnail, null with no image), read from the thumbnail file, so the page can reserve the space. This is the one change to the API of ADR 001's amendment on slice 3a; `docs/reference/API.md` says so.
8. **Delete is not in this slice.** It needs the matching amendment of workflow ADR 018, which is the owner's to approve (handoff). The page has no delete control until then, and the end-to-end flow of ADR 006, decision 5, stops after the item is shown and written; its last step is added with delete.

## Amendment (2026-10-16): the page as cards under a one-row header

The owner reviewed the screens of the 2026-10-15 amendment on the running page and asked for the layout below, in chat on 2026-10-16. It replaces that amendment's decisions 1 (no component package yet) and 2 (the layout), and changes decision 3's column count and decision 4's input; the rest of that amendment stands.

1. **The header** is one full-width row. At its far left the brand's folder name replaces the title "Board", and is a dropdown that picks the brand. At its far right is one icon button that toggles light and dark. The window has no maximum width and no left column.
2. **The dropdown is a shadcn `DropdownMenu` with radio items**, which brings `@radix-ui/react-dropdown-menu`, and the icons come from `lucide-react` (the sun and moon of the toggle, the chevron, the check), as decision 3 above planned. Each is added with this screen and no other component is. Dependency records: `@radix-ui/react-dropdown-menu` for a menu that works from the keyboard and with a screen reader (UI_STANDARDS), used non-modal; `lucide-react` because UI_STANDARDS names it the only icon source. A shadcn `Select` was tried first and dropped: Radix's Select writes `<style>` elements, which the server's Content-Security-Policy refuses (the console showed two violations when it opened), and UI_STANDARDS says to fix that in the code, not by loosening the policy. The menu is non-modal for the same reason, since the modal one also writes a style element to lock the page's scroll.
3. **The theme control** is a toggle of light and dark. With nothing remembered the page follows the system's setting, as before, and the toggle flips from what is shown; there is no explicit "System" choice any more. A remembered choice of `system` from the three-way switch is read as "follow the system".
4. **The input** is a dashed-border box, the first card of the grid (before the brand's own card), one column wide like the rest. Empty, it holds only the words "paste / drop image here". Once an image is pasted or dropped, its thumbnail shows in the left part of the box and a description field appears beside it; Enter adds the item. There is no Add button and no hint line. A pasted address becomes a chip with a remove button and a "keep for the next item" switch inside the box, and shows the field even with no image, so an item can still be only an address. More images queued show as "1 of N" with a remove button, as before.
5. **The cards** are one flow of CSS columns whose count follows the window's width (a column is about 18 rem wide), each card keeping its own proportions. The cards are: the input box first, then the hub card (the brand's badges and summary), then every item and every note except the `Moodboard` note, newest first by date. An item's date is the one in its image id, and an item without one takes the date of the item before it in the Moodboard; a note's date is its frontmatter `created`; a note without one comes last. The API carries both (`docs/reference/API.md`). Ties between an item and a note go to the item. A note card shows its title as a heading and its text as plain text, as before.
6. **The merge is the page's work, in one tested function**, and the server stays the source of truth: the page sorts what the API returns and keeps no copy.
7. **Plus and minus buttons for the columns** sit in a small pill in the bottom right corner of the window, over the cards, with the count between them. The count runs from 1 to 8 and each button is disabled at its end. Until the owner presses one, the count follows the window's width (a column of about 18 rem) and the pill shows that count; once pressed, the chosen count is used whatever the width, and is remembered in local storage under `board-columns`, read and written in a try and catch like the theme. They are plain buttons with `lucide-react` icons, not a component package. (The owner first asked for a slider and, on seeing it, preferred buttons.)
8. **Two small losses, taken knowingly.** An item of only typed words can no longer be added from the page, because the field appears only once an image or an address is there (the API still accepts one). And with the left column gone, a brand that failed to load is retried with a "Try again" button next to the error, not by choosing the same brand again.

Consequences: the page gains two dependencies and a component folder; the input box scrolls away with the cards, and sits in one column's width, so a pasted image's preview is small in a narrow column; a note without `created` sinks to the end of the grid, so the owner's older notes are dated by adding that line; the reader sees the brand's notes in the same view as its images, at the cost of long notes making tall cards.

## Amendment (2026-10-16): the column count follows the stage

The owner asked, in chat on 2026-10-16, for the page to be responsive, with the number of columns depending on the width of the stage: "on large screens, 3 should be minimum and 8 is max. on phone, there's no +/- button so it's just 1 column. in tablet, 2 and 8 maybe". It changes decision 7 of the amendment above, where a chosen count of 1 to 8 was used whatever the width; the rest stands.

1. **The stage is the cards list's own width**, measured with a `ResizeObserver`, not the window's. The three sizes are by that width: a phone under 640 px, a tablet from 640 px, a large screen from 960 px (the stage is the window less 48 px of padding).
2. **The counts the buttons allow:** a phone has one column and no buttons; a tablet 2 to 8; a large screen 3 to 8. A count nobody has set is as many columns of about 18 rem as the stage has room for, held inside that range.
3. **The choice is kept, not changed, by the width.** A remembered count outside the range is shown as the nearest end of it; resizing never writes to local storage, so the chosen count comes back when the stage allows it. Only pressing a button writes it.
4. **A known cost, taken knowingly:** eight columns on a tablet or on a small large screen make narrow cards (about 70 to 110 px); the owner set the range, and the buttons let them stop sooner.

## Amendment (2026-10-16): the input box's layout, an address by hand, and an image viewer

The owner asked for these in chat on 2026-10-16, after trying the cards. They change decision 4 of the amendment on the cards (the input) and decision 3 of the 2026-10-15 amendment (a thumbnail is a link to the original in a new tab).

1. **The description field sits under the picture**, not beside it, since the box is one card wide. The picture fills the card's width.
2. **"Remove image" is an icon button** (the `X` of `lucide-react`) on the corner of the picture, with the same accessible name; "Remove address" is one too, for the same look. "Image 1 of N" moves onto the picture.
3. **A link icon button next to the field adds the address of the original by hand.** It opens a field; Enter takes the address if it is one web address (the same test as a pasted one), and Escape closes the field. Enter there does not add the item. A pasted address still works as before. Once an address is set the button gives way to the address with its remove button and the "Keep for the next item" switch.
4. **A click on a picture opens it in a viewer** at the centre of the window, over the page blurred behind it, instead of a new tab. It shows the original (not the thumbnail), the item's words, its address as a link that opens in a new tab, and "n of N". Left and right arrow buttons, and the left and right arrow keys, go to the previous and next image in the order of the cards, stopping at the ends; Escape, the close button and a click on the backdrop close it, and the focus returns to the picture that was clicked.
5. **The viewer is a shadcn `Dialog`, which brings `@radix-ui/react-dialog`** (a dialog that works from the keyboard and with a screen reader, as UI_STANDARDS asks; the same package serves the delete confirmation to come). It is non-modal for the reason the menu is (GOTCHAS: the modal mode writes a style element the policy refuses), so Radix draws no overlay and the dialog's content is itself the blurred, full-window backdrop. The e2e flow opens it and fails on a console error.
