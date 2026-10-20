# Vault layout: what the app reads and writes

The vault is a folder of Markdown notes (Obsidian-style). This page is the contract between the app and the vault, written so that a user does not need another repository to follow it. It is copied from workflow ADR 018 (the `workflow` repository, `docs/decisions/018-brands-and-the-board-in-the-vault.md`); when the two disagree, ADR 018 wins and this page is fixed. The names below (`example-brand`) are made up.

## Folders and notes

```
<vault>/
  Brands/
    example-brand/
      example-brand.md                  the hub note
      example-brand - Positioning.md    any "<slug> - <Title>.md" note
      example-brand - Moodboard.md      the list of items
  Board/
    example-brand/
      2026-10-15-1432-a3f9.png          an image (original, as pasted)
      thumbs/
        2026-10-15-1432-a3f9.png        its thumbnail
      links/
        0123456789abcdef.json           what the app looked up for an address
        0123456789abcdef.jpg            the thumbnail of that page's icon
    _unsorted/                          items added before a brand was chosen
```

- **The slug** is the folder name under `Brands/`, in your own spelling. The folder under `Board/` has the same name. It is the only key that joins a brand's notes to its images.
- **The hub note** `<slug>.md` has frontmatter `status` (for example `active` or `draft`) and an optional `client: <name>`; the first paragraph of its body is shown as the summary line.
- **Other notes** are `<slug> - <Title>.md`. Each is shown as a read-only text panel titled by the part after ` - `. `Positioning`, `Voice`, `Visual identity`, `Rejected ideas` and `Moodboard` come first in that order; any other title is allowed and follows alphabetically. A note's frontmatter `created` (`YYYY-MM-DD`, optionally with `HH:MM`, and seconds or a zone after it, which are ignored) is what the page orders its cards by; a note without one comes last.
- **Images** live in `Board/`, a normal folder (not a dot-folder, so Obsidian embeds resolve). It holds image files, and under `links/` the small JSON files and thumbnails of address lookups (below). Keep it out of git (add `Board/` to your vault's `.gitignore`) if your vault is pushed anywhere. An image id is a sortable timestamp with a short suffix, for example `2026-10-15-1432-a3f9`.

## The Moodboard note

`<slug> - Moodboard.md` lists items as blocks separated by a blank line. A block is, in order:

1. An optional embed line, alone on its line: `![[<id>.<ext>]]`.
2. The description: one or more lines of your own text.
3. An optional last line: `[source](<url>)`.

```
![[2026-10-15-1432-a3f9.png]]
A quiet layout with a lot of space around the heading.
[source](https://example.com/page)

A color combination to try for the footer.
```

A reader takes a first line that starts with `![[` as the image, a last line that matches `[source](…)` as the link, and everything between as the description. The second block above has no image and no address. The frontmatter is skipped. A heading (a line starting with `#` and a space) and the lines under it, up to the next blank line, are not an item, so leave a blank line after a heading. A `[source](...)` line whose address is not http or https stays part of the description.

## Special cards: colours, titled text and type

Three shapes of block, with no image and no address, are shown by the app as cards of their own; in a note they are ordinary text. The app writes them from its Add card menu, and reads them wherever it finds them.

```
**Primary**              colours: an optional bold title, then 1 to 12 lines of a hex value (3 or 6 digits)
#1A2B3C Deep ink         and an optional name after a space; the app writes the hex in capitals
#F5E9D3 Paper

**Mission**              text: a bold title alone on the first line, then your words (no blank line)
To make it quiet.

Font: Fauna One          type: "Font: " and a name (letters, digits, spaces, hyphens; 60 at most), then notes
Headings
```

A block that fits none of these is an ordinary item. A hex line with other words (`#fff is too harsh`) is a palette of one colour named by the words. The editing of these blocks is the exception to "never edits a block": the pencil on a card replaces that block by a card of the same kind, only if the block's text is unchanged since the page showed it, and nothing else in the note changes (ADR 009, decision 4). Workflow ADR 018 still says the app never edits a block; it needs a matching amendment, which is not written yet.

## Address lookups

When you add an address with no picture, the app fetches that page once (unless you untick the lookup for that item) and keeps its title and icon in `Board/<slug>/links/`. The files are named by the first 16 hex characters of the SHA-256 of the exact address: `<hash>.json` holds `{title, preview, fetched}`, and `<hash>.<ext>` is the icon's thumbnail, always a PNG for an ICO file (the original is not kept; an SVG icon is the one exception: it is kept as `<hash>.svg`, byte for byte as the site sent it, after a check that refuses scripts and references to anything outside the file (ADR 008, amendment of 2026-10-17), so a tool that opens it shows what the site sent; a thumbnail kept before ADR 008's amendment of 2026-10-17 is a larger `og:image`). Nothing is written into the Moodboard note: a page's title is another person's text, so it is shown by the app and never becomes your description. Deleting an item removes these files too, unless another block in that Moodboard has the same address. Any tool that reads `Board/` must tolerate this folder.

## What the app may write

- It appends a block at the end of a Moodboard note and writes files under `Board/<slug>/` (including `links/`). To delete a block it rewrites the note through a hidden temporary file (`.board-<random>.tmp`) in the same folder, renamed over the note, or removed if anything fails.
- It never edits another note, and never edits a block except the one exception of ADR 009 below: the owner's click on the pencil of a special card. If you edit a block by hand, it is shown as it stands.
- It moves a block: when you drag a card by its grip, or press the arrow keys on it, the app rewrites the note, by the same temporary file, with that one block just before another block or at the end. The block's own text is not changed, and neither is anything else in the note but the blank line at the two places. The page shows the note's blocks last to first, so the order of the grid is the order of the note, and a block you move by hand in Obsidian or Sympose moves in the grid too (ADR 001, amendment of 2026-10-20). Workflow ADR 018 still says the app only appends, edits a card and deletes; it needs a matching amendment, which is not written yet.
- Deleting an item in the app removes its block and the image files its embed names, and nothing else. It does so only when you click delete on that block, and only if the block's text is unchanged since the page showed it. This applies to a block you wrote by hand as well, since the format has no marker for who wrote a block.
- The description is the text you typed; the app writes no text of its own into a note.

## Privacy note for client work

A description or address in a Moodboard is text in your notes, and if your vault is pushed to a remote, that text goes with it. The images do not, because `Board/` is kept out of git. Write descriptions with that in mind.
