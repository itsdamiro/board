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
    _unsorted/                          items added before a brand was chosen
```

- **The slug** is the folder name under `Brands/`, in your own spelling. The folder under `Board/` has the same name. It is the only key that joins a brand's notes to its images.
- **The hub note** `<slug>.md` has frontmatter `status` (for example `active` or `draft`) and an optional `client: <name>`; the first paragraph of its body is shown as the summary line.
- **Other notes** are `<slug> - <Title>.md`. Each is shown as a read-only text panel titled by the part after ` - `. `Positioning`, `Voice`, `Visual identity`, `Rejected ideas` and `Moodboard` come first in that order; any other title is allowed and follows alphabetically.
- **Images** live in `Board/`, a normal folder (not a dot-folder, so Obsidian embeds resolve). It holds only image files. Keep it out of git (add `Board/` to your vault's `.gitignore`) if your vault is pushed anywhere. An image id is a sortable timestamp with a short suffix, for example `2026-10-15-1432-a3f9`.

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

## What the app may write

- It appends a block at the end of a Moodboard note and writes files under `Board/<slug>/`. To delete a block it rewrites the note through a hidden temporary file (`.board-<random>.tmp`) in the same folder, renamed over the note, or removed if anything fails.
- It never edits a block and never edits any other note. If you edit a block by hand, it is shown as it stands.
- Deleting an item in the app removes its block and the image files its embed names, and nothing else. It does so only when you click delete on that block, and only if the block's text is unchanged since the page showed it. This applies to a block you wrote by hand as well, since the format has no marker for who wrote a block.
- The description is the text you typed; the app writes no text of its own into a note.

## Privacy note for client work

A description or address in a Moodboard is text in your notes, and if your vault is pushed to a remote, that text goes with it. The images do not, because `Board/` is kept out of git. Write descriptions with that in mind.
