# Board

A small local web app for brand work. It shows a brand's notes from your Markdown vault next to a grid of its images, and takes new screenshots, page addresses and one-line descriptions by paste.

## Status

Design stage: the code that reads and writes a Moodboard's blocks exists and is tested (`board/moodboard.py`, `board/vault_io.py`); there is no server and no page yet. The design is in [`docs/decisions/`](docs/decisions/): the app and its server ([001](docs/decisions/001-a-small-local-app-over-the-vault.md)), the page ([002](docs/decisions/002-the-page-is-a-react-single-page-app.md)) and this repository's public terms ([003](docs/decisions/003-the-repository-is-public-under-mit.md)). This page describes what the app is designed to do; it will say "does" only for what has tests.

## What it will do

- Pick a brand from the folders under `Brands/` in your vault.
- Show the brand's notes as read-only text panels, and its images as a grid that keeps each picture's own proportions.
- Add an item: paste a screenshot (or drop an image file), optionally paste a page address, type a one-line description, press Enter.
- Store the image under `Board/<brand>/` in your vault with a thumbnail, and add the description as a block at the end of the brand's Moodboard note.

All text on screen comes from your notes. The app does not generate or rewrite text: a description is your own words.

## What it writes

It writes in two places only, both inside the vault you point it at:

- Image files and thumbnails under `Board/<brand>/`.
- Blocks it created, at the end of `Brands/<brand>/<brand> - Moodboard.md`.

It never edits another note and never edits a block. Deleting an item removes only the block you click delete on, and only if its text is unchanged since the page showed it; that includes a block you wrote by hand, because the format cannot tell who wrote a block. The exact layout and block format are in [`docs/reference/VAULT_LAYOUT.md`](docs/reference/VAULT_LAYOUT.md).

**Back up your vault, and the `Board/` folder, before first use.** `Board/` is meant to be kept out of git, so nothing else holds a copy of your images. The software is provided as is, with no warranty (see the licence).

## Requirements (planned)

- Python 3 (the server and the vault code), with [Pillow](https://python-pillow.org/) for thumbnails.
- Node and npm, to build the page (React, TypeScript, Vite, Tailwind). Not needed to run a copy that is already built.
- A vault that follows the layout above. The vault path is given as an argument or an environment variable; it is never stored in the code.

## Security

The server listens on `127.0.0.1` only and refuses requests from other origins. See [`SECURITY.md`](SECURITY.md) for what it promises and how to report a problem.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the repository's rules and [`docs/CODE_QUALITY_STANDARDS.md`](docs/CODE_QUALITY_STANDARDS.md) for how the work is done. Whether outside pull requests are accepted is not decided yet (ADR 003).

## Licence

[MIT](LICENSE).
