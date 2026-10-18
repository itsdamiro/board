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


6. **The plus and minus buttons move to the header**, just before the theme toggle. They keep their pill (a border, the card background and a shadow, with the count between the buttons) but it sits in the row instead of floating in the corner, and the theme toggle is dressed to match: a round button with the same border, background and shadow, the same height as the pill. This replaces decision 7 of the amendment on the cards only in where the pill is; the page loses its extra bottom padding with it. The pill is shown only when there is a choice (not on a phone) and the brand has cards.

## Amendment (2026-10-16): a delete button on the cards

The owner asked for this in chat on 2026-10-16: "a delete button on the cards which is only available once the cursor is over the card". It replaces decision 8 of the first record ("Delete is not in this slice"); the server side has had delete since ADR 001's amendment of 2026-10-15.

1. **An item's card has a round icon button** (the trash of `lucide-react`) in its top right corner, named "Delete <the item's words>". It is invisible until the pointer is over the card, and also shows when it has the keyboard's focus, so it stays reachable without a pointer. The hub and note cards have none; they are not items.
2. **A click asks first.** A dialog (the viewer's shadcn `Dialog`) says "Delete this item?", shows the item's words, and says it is removed from the Moodboard note with its image files and cannot be undone. Cancel, Escape and a click on the backdrop close it and remove nothing. The dialog is the confirmation ADR 001's "explicit click" and the earlier "delete confirmation to come" ask for; no new dependency.
3. **Confirming sends `DELETE /api/brands/<slug>/items/<key>`** and then asks the API for the brand again, as after an add. A refusal (the block changed since it was shown, or its image files could not be removed) is shown in the dialog in the server's words and the item stays.
4. **A known cost, taken knowingly:** a touch screen has no hover, so on a phone or a tablet used by touch there is no way to delete from the page. The owner asked for hover only.
5. **Workflow ADR 018's matching amendment** (decision 6 lists only appending) is still the owner's to approve; this change ships the control, not that approval.

## Amendment (2026-10-16): shift-click picks several cards to delete

The owner asked in chat on 2026-10-16: "can we do a shift press to select multiple items to delete?". It extends the amendment above on the delete button; the rest of it stands.

1. **A click with Shift held on an item card picks it, or lets it go if it was picked.** The click does nothing else: a shift-click on a picture does not open the viewer. A picked card has a ring and a check mark on its left corner. Every item card can be picked; the hub and note cards cannot. It is caught on the cards list in the capture phase, so a click in the confirmation dialog, which is outside the list, is left alone, and pressing the mouse with Shift held does not select text.
2. **A bar appears at the bottom of the window while anything is picked**, saying how many ("3 selected"), with "Delete 3" and "Clear". Escape also clears the picks. Choosing another brand drops them, as the cards go; a picked card that is gone after a reload is dropped from the count.
3. **"Delete 3" asks once,** with the same dialog, titled "Delete 3 items?" and listing their words, then deletes the items one after the other with the same `DELETE` calls as a single delete (two writes to one note at once would only meet the server's 409). If the server refuses one, the dialog says how many went ("1 of 3 deleted") and the server's words; the page shows what is left, and the rest stay picked so that they can be tried again or cleared. The card's own trash button still deletes only its own item.
4. **A known cost, taken knowingly:** picking is by a shift-click, so there is no way to pick by keyboard alone and none by touch. The keyboard can still delete one item at a time by the card's button. Picking a range (shift-click from one card to another) is not built: the cards read down columns, so "between" would be unclear.

## Amendment (2026-10-16): keys for the column buttons

The owner asked in chat on 2026-10-16: "lets also put a key press shortcut to +/- buttons". It adds to decision 7 of the amendment on the cards.

1. **The keys `+` and `-` press the plus and minus buttons from anywhere on the page.** `=` and `_`, the same keys without Shift, do the same, so a keyboard where `+` needs Shift works with one key. The key does nothing past the ends of the range, as the disabled button does nothing, and it exists only where the pill does (not on a phone, not with no cards).
2. **Not while typing, and not as the browser's zoom.** A key typed into a field (the description, the address), a select or an editable element is the text's. With Ctrl, Cmd or Alt held, `+` and `-` stay the browser's zoom and the page does not take them.
3. **The buttons say so:** each has a tooltip ("More columns (+)") and `aria-keyshortcuts`. Their accessible names are unchanged.

## Amendment (2026-10-16): no mutation tool for the page's logic

The last open item of the list above is decided, on the owner's acceptance of the assistant's recommendation: a mutation tool does not cover the page's logic. The page stays thin, and Vitest and the e2e flow (ADR 006) test it. This is revisited if the page's logic grows beyond what those tests can reasonably check.

## Amendment (2026-10-16): changes from the review of the card layout

A review of the commits since the layout (xhigh, 13 findings) found these; the owner asked for them to be fixed. They change what the page does as follows, and nothing else in this record.

1. **The delete question belongs to the cards' list, not to a card, and the page always reads the brand again after a delete was tried.** The server can remove a block and still answer 500 when its image files could not be removed; the page used to count that as nothing deleted, kept the card and skipped the reload. Now the question stays up with the server's words while the list is read again, and the card goes if its block did.
2. **Picks are dropped as soon as their deletion went through**, not when the reload arrives, so "N selected" and its Delete button never name blocks that are gone. The ones that failed stay picked.
3. **A key the page takes from anywhere (Escape to drop the picks, + and - for the columns) is left alone while a field is being typed in or a dialog is open**, since the viewer and the delete question are not modal: closing the viewer with Escape no longer drops the picks, and + does not move the columns behind it.
4. **The column count is always set from the measured width** (`columns: <count>`), not left to the browser with `18rem` until a button is pressed, so the number in the pill is the number of columns drawn (with a larger root font size, or on a stage over about 2400 px, the two could differ).
5. **Smaller:** removing the picture that is being sent no longer drops the next queued one; the address field's blur no longer takes an address that Enter or Escape just closed; two identical blocks picked together no longer share a React key in the question; an item with no description is called "Image" everywhere (so the buttons read "View Image" and "Delete Image").
6. **Not changed, taken knowingly:** a pasted address is still taken as the item's address even while the description field has the focus; a note's `created` with seconds or a zone still counts as no date (the two shapes `docs/reference/API.md` documents).

## Amendment (2026-10-17): the address lookup on the page (ADR 008, step 3)

[ADR 008](008-the-server-looks-up-an-address-once-under-strict-limits.md), decisions 1 and 8, say the page shows a checkbox next to the address and shows the title and the preview on a card with no picture of its own. What they leave to the page is fixed here, before the code. No dependency is added.

1. **The checkbox "Look up the page's title and preview"** is in the input box, under the address, and is checked unless the owner unchecked it. It is shown only while an address is set and no image is queued, since the lookup is only made for an address with no picture of its own (ADR 008, decision 1); with a picture queued it would promise something that does not happen.
2. **It is remembered** in local storage under `board-lookup`, read and written in a try and catch like the theme. Only unchecking or checking it writes; a missing or unreadable value is "checked".
3. **The add says what was chosen.** When the box shows the checkbox, the request carries `lookup` as true or false; otherwise the request is the one it was.
4. **While the add waits** (up to eight seconds, ADR 008, decision 5) and the lookup is on, the box says "Looking up the page…" in a status region, so a slow site does not look like a stuck page.
5. **The card of an item with an address, no picture of its own and a kept lookup** shows the preview picture at the top, in its own proportions (its width and height from the API, lazy), with no link and no viewer (ADR 008, decision 8), then the owner's words if any, then the page's title as muted text above the address. The title is another person's text, so it is never in the weight or place of the owner's words. It is plain text, as every text on a card is. A lookup that got only a title, or only a preview, shows that one.
6. **A known cost, taken knowingly:** a preview picture is not opened by the viewer and has no alternative text beyond the page's title, or "Preview" when there is none.

## Amendment (2026-10-17): a looked-up icon is shown small, next to the title

**Accepted by the owner on 2026-10-17, after asking for it in chat ("maybe change the layout for the card") and accepting the draft ("Accepted").**

[ADR 008](008-the-server-looks-up-an-address-once-under-strict-limits.md), amendment of the same date, makes the looked-up picture a site's icon instead of its `og:image`. The amendment of 2026-10-17 above (point 5) put that picture at the top of the card at its own proportions; for an icon of 16 to 180 pixels that would be a blurred stamp as wide as the card. It changes in this one place:

1. **The icon is drawn at 32 by 32 CSS pixels** (`object-contain`, lazy), at the start of the text area, with the title beside it, and not at the top of the card. Its alternative text is empty when the title is shown (the title says it) and "Site icon" when there is no title.
2. **Without a title the icon sits above the address** in the same place. An item with a picture of its own still shows no icon (unchanged).
3. **Nothing else changes:** no link, no viewer, plain text for the title, the title muted and apart from the owner's words. The API's `preview.width` and `height` are still sent and are no longer used for the layout.

## Amendment (2026-10-17): the add does not wait for the lookup, and the card says it is looking

**Accepted by the owner on 2026-10-17, with the amendment to ADR 008 of the same date ("Accepted. Build it.").**

[ADR 008](008-the-server-looks-up-an-address-once-under-strict-limits.md), amendment of the same date, moves the lookup out of the add into a call of its own. Points 3 and 4 of the amendment "the address lookup on the page" change, and nothing else on the page:

1. **The add no longer carries `lookup`.** The box sends the item as it always did. If the checkbox is checked and the item has an address and no picture, the page then sends the lookup call for the new item's key, without waiting for it: the box is empty and ready for the next item as soon as the add is answered. If the add's answer already carries a title or an icon (the server keeps one for that address), the page sends no call.
2. **The card says it is looking.** While a lookup call is out for an item, its card shows "Looking up the page…" (muted, small, in a status region) between the owner's words and the address, in place of the line the box showed. When the call answers, the page reads the brand again and the card shows the title and icon. If the call fails, the line goes and the card stays as it was added, with no message: the item is not wrong, only bare.
3. **The page reads the brand again after both steps.** A read that a newer one overtakes (the add's, then the lookup's, or a change of brand) is let finish and its answer ignored, rather than cancelled, so the two reads never show as a failed request.
4. **Known cost:** the page remembers what it is looking up only until it is closed. A lookup the server was still making is finished and kept anyway (ADR 008, amendment), and the page shows it the next time the brand is opened.

## Amendment (2026-10-18): delete and picking work by touch and by keyboard

**Accepted by the owner on 2026-10-18, as drafted ("accepted. will also go with your recommendations"): the Select button sits before the column pill, and the touch targets are 44 px on a device that cannot hover.** The owner chose this item from the handoff's "Known, not fixed" ("Delete cannot be used by touch or picked by keyboard") and asked for the design as an amendment before any code. It removes the known costs in point 4 of "a delete button on the cards" and point 4 of "shift-click picks several cards to delete"; the rest of both stands.

What is wrong now (read in `web/src/Cards.tsx` and `DeleteItem.tsx` on 2026-10-18):

- The trash button is `opacity-0` until the card is hovered or the button has focus. A touch screen has no hover, so the button stays invisible; it is still there and a tap on that corner would press it unseen.
- Picking is a click with Shift held. Neither a finger nor the keyboard alone can do it. The keyboard can delete one item (Tab to the card's trash button), but not several.

Decision, in the order it would be built:

1. **The trash button is always shown where the main input cannot hover** (`@media (hover: none)`, a phone or a tablet used by touch). Where it can hover, nothing changes: it appears on hover or focus. A device with both a mouse and a touch screen is judged by its main input, as the browser reports it; the select mode below covers the other case.
2. **A "Select" button in the header**, just before the column pill (a round icon button of `lucide-react`, dressed like the theme toggle, `aria-pressed`), shown when the brand has at least one item card, on every screen size. Pressing it turns the select mode on or off. Its tooltip is "Select cards to delete".
3. **While the mode is on, each item card shows a checkbox in its top left corner**, a real button with `role="checkbox"` and `aria-checked`, named "Pick <the item's words>". It is reachable with Tab and toggled with Space or Enter, so the keyboard can pick any number of cards. The same check mark and ring show a picked card as now.
4. **In the mode, a tap or click anywhere on an item card picks or lets it go**, as a shift-click does now, and does not open the viewer. This is the same capture-phase handler, taking "Shift held or select mode on". Shift-click keeps working with the mode off, and the first pick that way also turns the mode on, so its checkboxes show.
5. **The trash buttons are hidden while the mode is on**, so a finger aimed at a card cannot press delete by mistake. Deleting is then the selection bar's "Delete N".
6. **The selection bar shows while the mode is on**, even with nothing picked ("0 selected", Delete disabled), with "Delete N" and "Done" (which clears the picks and leaves the mode; "Clear" drops the picks and stays). Escape does what "Done" does, under the same rules as now (not while typing or with a dialog open). Choosing another brand leaves the mode, as it drops the picks. The confirmation, the one-after-the-other deletes and the failure messages are unchanged.
7. **Touch targets are 44 by 44 CSS pixels** for the trash button, the checkbox and the Select button on a device that cannot hover (`@media (pointer: coarse)`), and 32 px as now elsewhere. No new dependency and no server change.
8. **The accessible name of the card's list does not change**, and a screen reader hears "N selected" from the bar's `output` as now.

Tests, when it is built: Vitest for the mode (the button turns it on and off, the checkbox picks by Space, a click picks and does not open the viewer, the trash buttons are hidden, Escape and Done leave it, a brand change leaves it); the e2e flow adds a run in a context with touch (`hasTouch` and `isMobile`, which reports no hover) that selects two cards with taps and deletes them, in both themes, with no console error. The page is looked at in the real browser at phone and tablet widths before it is called done.

Known costs, taken knowingly: at eight columns on a tablet the cards are 70 to 110 px wide and a 44 px button covers a good part of one (the owner set that range and the buttons let them stop sooner); a hybrid laptop with a touch screen and a mouse shows no trash until it is hovered, and uses the Select button for touch; the mode is one more control in a header that is one row on a phone.

Alternatives rejected:

- **A checkbox on every card at all times** (as a mail list has). Reaches touch and keyboard with no mode, but it puts a control on every card of every brand for a thing done rarely, and doubles the corner clutter beside an always-visible trash on touch. Would be right if the owner picked often.
- **Long-press to pick.** No visible control, so it cannot be found; it clashes with the browser's own long-press menu on a picture and on selected text, and a keyboard still has nothing. Would be right if a touch gesture were wanted in addition, after this one.
- **Always-visible trash on every device.** Fixes touch with the least code, but takes away the clean hover look the owner asked for ("only available once the cursor is over the card"). Rejected for mouse use; kept for touch in decision 1.
- **A swipe on a card to delete.** Discoverable only by accident, easy to trigger while scrolling, and it has no keyboard form. Would be right in an app made for the phone.
- **Picking a range (click one, shift-click another) and "Select all".** Still not built: the cards read down columns, so "between" is unclear (as the amendment of 2026-10-16 says), and nobody asked for select all. Would be right if brands grew to hundreds of items.

## Amendment (2026-10-18): no other site may frame the page, and the select mode ends when the last item goes

**Accepted by the owner on 2026-10-18 ("lets do 1-3"), as a result of the code review of `board/` and `web/src` the same day.** Two of the three fixes touch what this record decided; the third (a regular-expression fault in `board/svg.py`) does not and is not recorded here.

1. **The server forbids framing.** Decision 6 said what the page may load; it said nothing about who may load the page. Every answer now carries `frame-ancestors 'none'` in its `Content-Security-Policy` (the page's and the SVG icon's) and `X-Frame-Options: DENY`, for a browser that knows only the older header. The reason: the `Origin` check stops a forged request, but not a real click in a page that another site has framed invisibly under its own buttons, so a card's trash button and the confirmation behind it could be clicked without the owner meaning to. The policy otherwise does not change, and nothing the page loads changes with it. The test checks both headers on every kind of answer.
2. **The select mode ends when the last item goes, in the state and not only on the screen.** The amendment of 2026-10-18 on delete said so, but the page only hid the mode while the brand had no items: the flag stayed set, so an item added afterwards came up in select mode (a checkbox on its card, a tap picking it instead of opening it, no trash button). The page now clears the flag when the brand has no items. The test deletes the only item, adds another and finds no checkbox.

## Amendment (2026-10-18): an item of only typed words can be added from the page again

**Asked for by the owner on 2026-10-18 ("lets also do Text-only item from the page"). The button below was an icon; the owner tried it the same day and rule 1 was replaced by the amendment that follows (a worded button), which the owner has seen and kept.**

Context: the amendment of 2026-10-16 (decision 8) took a loss knowingly: the description field appears only once an image or an address is there, so a line of words alone could not be added from the page, though the API (`POST /items` with only a `description`) and the Moodboard format (ADR 001, decision 3) take one. The owner now wants it back.

Decision 4 and decision 8 of that amendment change in this place, and nothing else:

1. **(Replaced by the amendment that follows: a worded button.) The empty box gains one icon button,** under the words "paste / drop image here", named "Add text only" (an icon with that name and title, no visible text, so the box still reads "paste / drop image here"). It is a plain `lucide-react` icon button like the link button, 44 px on a coarse pointer.
2. **Pressing it shows the description field,** focused, as if an image had been pasted, with an "Cancel" icon beside it that goes back to the empty box. The link button for an address is there too, as for an image. Enter adds the item; there is no other button.
3. **An empty description with no image and no address is not sent.** The page says "Write something first." in the box's alert, as it says "Only image files can be added." today; the server's own refusal (422) stays as the second layer.
4. **After the add the box is empty again,** the mode is left, and a card shows the words as plain text, as a hand-written line does today (the card code already shows `text` for an item with no image and no address). Nothing about the API, the Moodboard or the vault changes: the app still writes only the description the owner typed (ADR 001, decision 3).

Consequences: the loss is undone at the cost of one button and one state. A line of words is a card with no picture, so the grid gets cards of very different heights; that was already true of the owner's hand-written lines. Where the pointer is coarse, the button is the only way to start a text item, since there is nothing to paste.

Tests: in `web/src/App.test.tsx`, the empty box still reads only "paste / drop image here" and has the button; pressing it shows the focused field and Cancel; Enter sends `{description, source: null, image: null}`, the box is empty again and the card shows the words; Cancel and an empty Enter send nothing; a pasted image while the mode is on keeps the mode's field and sends the image; the button is 44 px on a coarse pointer. The end-to-end test adds a text-only item against the sample vault. Each rule is checked against a weakened version with `scripts/mutate.py` (ADR 001, decision 10).

Alternatives rejected:

- **Typing straight into the empty box.** One fewer click, but the box would be a text field with a paste target in it, and a paste of an address or image would have to be told apart from a paste of words. It becomes right if the button is found to be in the way.
- **A keyboard shortcut only.** No new control, but a touch device could not start a text item, and nothing on the page says the shortcut exists. Never alone.
- **Showing the field always.** The empty box would no longer be the quiet "paste / drop image here" that the owner asked for on 2026-10-16.

## Amendment (2026-10-18): the text-only button is a worded button

**Asked for by the owner on 2026-10-18, after trying the button on the page: "the placement is kind suss.. can we put it on a corner? and i dont think the icon is effective, can we use a proper button with text on it." A corner was tried first; the owner then said "i think we can put it in the middle since its worded".** The wording is mine; the owner saw the result on the page on 2026-10-18 and kept it ("its good").

Rule 1 of the amendment above ("The empty box gains one icon button") changes in this place, and nothing else of it:

1. **The button has the visible words "Add text only"** and no icon. It is a small bordered button with the card's background, 44 px high where the main input is coarse.
2. **It stays in the middle of the box, under the words "paste / drop image here"**, as before. The corner was tried and left: with words on it the button reads as a button where it is, and a corner hid it from the person looking at the middle.
3. **Its name, and what it does, are unchanged:** pressing it shows the focused field, Cancel goes back, an empty Enter says "Write something first.".

Consequences: the box now reads "paste / drop image here" plus "Add text only" to a reader of its text, which the tests check. The icon-only version asked a person to guess; this one costs a few more pixels of height.

Alternatives rejected: an icon with text beside it (more width for no new information), and the top right corner (tried on 2026-10-18, see above).
