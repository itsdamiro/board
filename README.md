# Board

A small local web app for brand work. It shows a brand's notes from your Markdown vault next to a grid of its images, and takes new screenshots, page addresses and one-line descriptions by paste.

## Status

Work in progress: the code that reads a vault and reads and writes a Moodboard's blocks, the image intake with thumbnails, and the local API all exist and are tested (`board/`, listed in [`docs/reference/API.md`](docs/reference/API.md)); the page (`web/`, which the server serves once built) lists the brands, shows a brand's notes and its grid of images, and adds an item from a pasted or dropped image, a pasted address and a description, in light and dark; an item can be deleted after a confirmation, one at a time or several picked with a shift-click. The design is in [`docs/decisions/`](docs/decisions/): the app and its server ([001](docs/decisions/001-a-small-local-app-over-the-vault.md)), the page ([002](docs/decisions/002-the-page-is-a-react-single-page-app.md)) and this repository's public terms ([003](docs/decisions/003-the-repository-is-public-under-mit.md)). This page describes what the app is designed to do; it will say "does" only for what has tests.

## What it will do

- Pick a brand from the folders under `Brands/` in your vault, from the menu that is the page's title.
- Show the brand's notes and its images together as cards, newest first by the note's `created` date or the image's date, in as many columns as the stage has room for (or the number you set with the buttons in the header, or the + and - keys: 3 to 8 on a large screen, 2 to 8 on a tablet, one column and no buttons on a phone), each picture keeping its own proportions.
- Add an item: paste a screenshot (or drop an image file) onto the dashed box that is the first card, optionally paste a page address, type a one-line description, press Enter.
- Store the image under `Board/<brand>/` in your vault with a thumbnail, and add the description as a block at the end of the brand's Moodboard note.

All text on screen comes from your notes. The app does not generate or rewrite text: a description is your own words.

## What it writes

It writes in two places only, both inside the vault you point it at:

- Image files and thumbnails under `Board/<brand>/`, and, for an address you add with no picture, the page's title and a thumbnail of its icon under `Board/<brand>/links/` (the server fetches the page once; see [`SECURITY.md`](SECURITY.md) for what it may reach). The title is never written into your note.
- Blocks it created, at the end of `Brands/<brand>/<brand> - Moodboard.md`.

It never edits another note and never edits a block. Deleting an item removes only the block you click delete on, and only if its text is unchanged since the page showed it; that includes a block you wrote by hand, because the format cannot tell who wrote a block. The exact layout and block format are in [`docs/reference/VAULT_LAYOUT.md`](docs/reference/VAULT_LAYOUT.md).

**Back up your vault, and the `Board/` folder, before first use.** `Board/` is meant to be kept out of git, so nothing else holds a copy of your images. The software is provided as is, with no warranty (see the licence).

## Run the server

```
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m board --vault /path/to/your/vault    # or set BOARD_VAULT; --port N, default 8765
```

It answers only on `127.0.0.1`, and serves the built page from `web/dist/` at the same address (build it first: `cd web && npm run build`; without it the API still works). Back up your vault first (see above).

## Work on the page

```
nvm use                  # Node 24 from .nvmrc
cd web && npm ci
npm run dev              # http://127.0.0.1:5173, with /api sent on to the server below (BOARD_PORT, default 8765)
npm run typecheck && npm run lint && npm test && npm run build
```

Start the server first (`python -m board --vault ...`). The dev server refuses a request that does not come from its own page before it forwards anything (ADR 004).

## Requirements

- Python 3.11 or newer (the server and the vault code), with [Pillow](https://python-pillow.org/) for thumbnails (`requirements.txt`).
- For the page: Node 24 and npm, to build it (React, TypeScript, Vite, Tailwind; ADR 005). `nvm install` reads `.nvmrc`; then `cd web && npm ci`. Not needed to run a copy that is already built.
- A vault that follows the layout above. The vault path is given as an argument or an environment variable; it is never stored in the code.

## Security

The server listens on `127.0.0.1` only and refuses requests from other origins. See [`SECURITY.md`](SECURITY.md) for what it promises and how to report a problem.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the repository's rules and [`docs/CODE_QUALITY_STANDARDS.md`](docs/CODE_QUALITY_STANDARDS.md) for how the work is done. Outside pull requests are not accepted for now (ADR 003).

## Licence

[MIT](LICENSE).
