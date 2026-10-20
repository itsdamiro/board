---
type: decision
status: accepted
date: 2026-10-20
projects: [board]
concepts: [Interface stack, Vault conventions]
amends: [001, 002]
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/web-app, topic/data-safety]
---

# 009 — Three special cards (colours, titled text, type) are plain-text blocks the server recognises, added from a header button and edited in place

> **Summary.** A Moodboard block whose text has one of three shapes is shown as a colour palette with click-to-copy hex values, a titled text card, or a type card with a link to Google Fonts; a header button adds them and a pencil edits them. The note stays plain text and the block format does not change. It costs the first edit of a block the app has ever made, narrowed to these cards, and a matching amendment to workflow ADR 018.

Accepted by the owner on 2026-10-20 in chat: the three cards, a header button instead of a right-click ("or, maybe another button on top to add these special cards, lets drop the right click"), click to copy a hex value, an edit button for the hex value, and a link to Google Fonts for a type card. The wording of the three shapes, the limits and the narrowing of the edit are mine; the owner has not read them yet.

## Context

- The owner asked for the parts of a brand that are not pictures: its colours, its mission, vision, audience, positioning and voice with a title, and its fonts (a checklist searched on the web on 2026-10-20 gave logo, colour, typography, imagery, voice and tone, and a foundation of mission and values).
- The block of ADR 001 and workflow ADR 018 is an optional embed, the owner's description, and an optional `[source](…)` line. It has no title, no colour and no font. The notes `Positioning` and `Voice` are shown by the app as read-only panels, but the app never writes them (ADR 001, decision 8).
- ADR 001, decision 8, says "never an edit to a block". A colour needs an edit: a hex value is typed wrong or changed during the work, and delete and add again loses its place and its date.
- The page requests only its own origin (ADR 002, decision 6; UI_STANDARDS): it cannot load a font from Google Fonts, and a font name of a client brand should not be sent to a font service by merely opening the page.
- A block is one description with no blank line inside it (`format_block` refuses several lines today, though `parse` reads them).

## Decision

1. **Three shapes of a block with no image and no address.** The server reads them; the vault format does not change, and each is ordinary text in Obsidian.
   - **Type:** the first line is `Font: <name>` (the name is 1 to 60 letters, digits, spaces and hyphens); the other lines, if any, are the owner's notes on it (for example "Headings"). One font to a card.
   - **Colours:** an optional first line `**Title**`, then one to 12 lines, each a hex value of 3 or 6 digits (`#1A2B3C`) with an optional name after a space (`#1A2B3C Deep ink`, 40 characters at most). The app writes the hex in capitals. Every line must be one of these, so a note with any other line stays an ordinary card; a hand-written line that is only a hex value and some words ("#fff is too harsh") is a palette of one colour named "is too harsh", which is accepted: it still reads, and the owner can delete or edit it.
   - **Text:** a first line that is only a title in bold, `**Mission**` (80 characters at most), then one or more lines of the owner's words.
   - Anything else is an ordinary item, as today. The test is in this order: type, colours, text. A title with no lines under it is ordinary.
2. **The server gives each item a `card`** (null for an ordinary item): `{kind: "text", title, body}`, `{kind: "colors", title, colors: [{hex, name}]}` or `{kind: "type", name, notes, google}`. `google` is `https://fonts.google.com/specimen/<name with + for spaces>`, written by the server from the validated name, so the page never builds an address out of text (ADR 002, decision 7). The existing `text`, `description` and `key` stay as they are.
3. **Adding.** `POST /api/brands/<slug>/items` accepts `{card: {...}}` in place of `description`, `source` and `image` (all three must then be absent). The server builds the block text from the fields and refuses it, as `format_block` does, unless `parse` reads it back as the same card. A blank line in a body is refused with a message (a blank line would end the block); the app does not rewrite the owner's words.
4. **Editing, narrowly.** `PUT /api/brands/<slug>/items/<key>` with `{card: {...}}` replaces the block with this key by a block of the same kind. It is refused (409) if the block's text changed since it was shown, as a delete is, and (422) if the block is not one of these three cards or the new card is of another kind. It writes the note through a hidden temporary file renamed over it, like a delete. Nothing else is ever edited: not an image block, not a line of words, not another note. **This changes ADR 001, decision 8, and CLAUDE.md's rule, from "never an edit to a block" to "never an edit to a block except the card of this record, by the owner's click on its pencil, unchanged since shown".** Workflow ADR 018 said the app never edits a block; its amendment of 2026-10-20 (accepted that day, in the other repository) records this exception.
5. **The page.** A button in the header, "Add card", opens a menu of three items (Text, Colours, Type), a Radix `DropdownMenu` like the brand select, which works from the keyboard and on a touch screen; no new dependency. Each opens a dialog with a form: Text has a Title and the words; Colours has an optional Title and rows of a colour input, a hex field and a name, with add and remove; Type has the font name and notes. Enter or the dialog's Add button sends it; the dialog shows the server's refusal as it comes. The same dialog, filled in, is the edit.
6. **The cards.** Colours are vertical stripes side by side, each in its own colour with the hex (and the name) on it in a readable ink; a click or Enter copies the hex and says "Copied" for a moment (a refusal by the browser says "Could not copy"). Text is a heading with the words under it. Type shows the name set large and "Aa" in its own typeface if that font is installed on this computer (otherwise in the page's font), the notes, and a "Google Fonts" link that opens in a new tab with `rel="noopener noreferrer"`. Every card has the trash button of today and a pencil; the pencil follows the same rule as the trash (shown on hover or focus, always where there is no hover, 44 px on a coarse pointer). The colours are set through the element's style property, which the server's Content-Security-Policy allows, and not through an inline `style` attribute in the HTML, which it refuses.
7. **Order.** These cards sit among the items by date, like any other item; they are not pinned. Pinning them in a row of their own is left for a later record if the owner finds them lost between pictures.
8. **Tests.** The block reader and writer on synthetic text for each shape and for the near misses (a title alone, a hex line followed by a non-hex line, a 4-digit hex, 13 colours, a name with a slash), the edit's refusals (changed since shown, not a card, another kind, ambiguous), the route's statuses, the page's menu, forms, copy and edit, and the end-to-end flow in a real browser, each rule checked against a weakened version with `scripts/mutate.py`.

## Consequences

The owner can keep a palette, a mission and a font in the same list as the inspiration, in Obsidian-readable text, and fix a hex in place. The cost is one exception to a rule that was absolute: the app now rewrites a block, though only these cards and only when the owner clicks. The Moodboard format is unchanged, so another tool sees ordinary blocks; but ADR 018 and the copy of it in `VAULT_LAYOUT.md` should say that the three shapes mean something to this app. A type card shows its real typeface only if the font is installed here; the Google Fonts link is how the owner sees the rest.

Open: whether the cards should be pinned; a way to show a font that is not installed.

## Alternatives rejected

- **A right-click or long-press menu** (asked for first, then dropped by the owner on 2026-10-20 in favour of a header button). It needs a new Radix package and has no keyboard or discoverable path of its own; the button has all three.
- **Loading the font from Google Fonts in the card.** It would show the real typeface, but the page may reach only its own origin, and opening a brand would tell Google its fonts. It becomes right as a server-side step: the server fetches the font file once under the limits of ADR 008, keeps it under `Board/<slug>/`, and serves it from the app. That is the Assets section's work (ADR 001, decision 9).
- **A new block type in workflow ADR 018** (an explicit marker line). Clearer to any reader, but it changes the vault's format first, and these three shapes are already readable text. It becomes right if a fourth kind or a second tool needs to tell the cards apart without guessing.
- **Editing any block.** One rule instead of a list, but a block can be the owner's hand-written text, or an image block whose files the app owns; the narrow rule keeps both out of reach.
- **Storing the cards in their own note** (`<slug> - Palette.md`). Tidier, but the app writes only the end of a Moodboard (ADR 001, decision 8), and a note would be a second place for a brand's items.
