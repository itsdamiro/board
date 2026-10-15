---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Vault conventions]
amends: []
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/architecture, topic/privacy]
---

# 001 — The board is a small local web app that reads brand notes from the vault and writes images and Moodboard blocks into it

> **Summary.** A separate local web app, with its own repository, shows a brand's notes as read-only text next to a grid of its images, and takes new items by paste: a brand, a screenshot, an optional page address and a one-line description. It reads and writes the vault only as workflow ADR 018 fixes, through a small local API that the page and a later browser extension both call. It costs one more app to run and a dependency for thumbnails.

Accepted by the owner on 2026-10-15: decisions 1 to 11, including Python with Pillow and a standard-library server; the items under "Open" stay open for later slices.

## Context

The owner documents brands, personal and client, in the vault that Sympose reads, and wants a visual surface for the part that is images: screenshots of inspiration, with a note of what each is for. Workflow ADR 018 (accepted 2026-10-15) fixed what the vault holds: `Brands/<slug>/` notes, a `<slug> - Moodboard.md` note whose blocks are an optional embed line, a description and an optional `[source](url)` line, and a gitignored `Board/<slug>/` folder with image files and `thumbs/`. This record fixes the app. What was settled in chat the same day:

- It is a separate app, not a feature of Sympose, which is a vault companion that reads notes.
- All text on screen comes from the notes; the app does not render Markdown, it shows the text.
- The input is a paste: pick a brand from a list, paste a screenshot (a clipboard image), optionally paste a page address, type a short description, press Enter.
- A browser extension that sends the page address (and later the picture) is the likely second input, so the code is built toward it.
- It stays small; a headless browser for automatic page captures would outweigh the rest of the project.
- The workflow's rules apply: the repository may be public, so no real brand, client or vault path appears in it; a model never writes a claim into a note.

## Decision

1. **Shape.** A local web server and one page. The server binds to `127.0.0.1` only and refuses a request whose `Origin` is not its own page (or, later, the extension's). The page is the first client of the server's API; the extension would be the second, so nothing is done in the page that the API cannot do.
2. **Where the vault is.** The vault path is an argument or environment variable and is never written into the code or the repository.
3. **What is read.** The brand list is the folder names under `Brands/`. For a brand: the hub note's frontmatter (`status`, `client`) as badges, the first paragraph of the hub body as the summary line, and every other `<slug> - <Title>.md` as a text panel titled by the part after ` - `, in a fixed order for `Positioning`, `Voice`, `Visual identity`, `Rejected ideas` and `Moodboard`, then the rest alphabetically. A note is shown by removing the frontmatter, escaping the HTML, keeping line breaks and turning `[[a|b]]` into `b` and `[[a]]` into `a`. A new note title needs no change to the app.
4. **The grid.** It is built from the brand's Moodboard blocks, newest first, in a layout that keeps each image's own proportions (no cropping to a common ratio). Thumbnails are shown; the original opens on click.
5. **Adding an item.** One input box takes a pasted image or a pasted address, in either order, and a one-line description; Enter adds the item. The description and the address are optional. A brand is always chosen (the last one is remembered), or the item goes to `_unsorted`. Dropping image files onto the page does the same as pasting them, through the same API call and the same checks (decision 6). While taking several screenshots from one site, a switch keeps the last address for the next item.
6. **Images.** The original is stored as pasted, unchanged. A thumbnail about 640 pixels wide is made at the same time and kept in `thumbs/`; it can be rebuilt from the original. The server accepts only PNG, JPEG, WebP and GIF, checked by the file's first bytes and not its name, and refuses a file over 25 MB.
7. **An address with no picture.** The server tries once to fetch the page's title and preview image and keeps what it gets; a failure is silent and the item stays a bare link. The app never takes a screenshot of a page by itself.
8. **What it writes.** Only `Board/<slug>/` and the end of the brand's Moodboard note, in the block format of workflow ADR 018; never any other note, and never a block it did not write. Deleting an item removes its block and its files together. A block edited by hand in Sympose or Obsidian is shown as it stands.
9. **Not in the first version.** Editing note text in the app, copying descriptions anywhere else, a search, the extension, and automatic page capture. Also an Assets section for a brand's own logos and icons, including SVG: it needs its own record, because an SVG can carry script (shown only through `<img>`, served with `nosniff` and a sandbox policy), because it holds the brand's own deliverables apart from inspiration, because workflow ADR 018 says the vault holds no client assets (it would need an amendment saying `Board/` is local and never pushed), and because a copy here can drift from the master file. Small SVG source inline in a note is allowed by the owner for their own logos and icons, but no app in the owner's setup draws it from a note (Sympose does not; Obsidian does).
10. **Tests** cover the block reader and writer on synthetic text (a block, one with no image, one with no address, one with extra lines), the refusals in decision 6, and the origin check; each rule is checked against a weakened version with `scripts/mutate.py` once there is code.
11. **Language and dependencies.** Python, with a minimal server built on the standard library (`http.server`) and no web framework. The page is plain HTML, CSS and JavaScript served by that server and calls its API. Pillow is the one third-party dependency, used only to make thumbnails (decision 6) and to read an image's size; it is pinned in a requirements file added with the first code. Anything beyond it needs its own record (`docs/CODE_QUALITY_STANDARDS.md`, section 0). The owner chose this on 2026-10-15, taking the recommendation: "Python with Pillow and a minimal stdlib server". The reason behind it is that the vault's own scripts are Python, so the block reader and writer, the gates and the mutation check all run in one language, and the standard library already covers the server, the file handling and the tests.

## Consequences

The owner can drop a screenshot and a thought into a brand in a few keystrokes, and the text is searchable in Sympose because it lives in a note. The images stay out of git, as ADR 018 intends. Because the page uses only the API, the extension is a new client and not a rework.

The cost is that a local server that writes files is a target for any page in the browser, so the origin check and the loopback binding are part of the design and need their own tests. Thumbnails need an image library, which the standard library does not provide. `Board/` has no history or remote, so its backup is the owner's to arrange. A description written for a client brand reaches the private remote through the Moodboard note, as ADR 018 says.

Open: the Assets section (decision 9); the minimum Python version and how Pillow is installed (a virtual environment is likely; decision 11 fixes the language and the library, not these); where the server's own settings live; how a block is found again for deleting (by its embed's id is the likely key); whether Sympose renders `![[…png]]` in the Moodboard (an open question in the workflow's SPEC); how the extension is allowed through the origin check; a backup for `Board/`.

## Alternatives rejected

- **A feature inside Sympose.** One app to run and the vault path already known, but Sympose is a vault companion that reads notes, and a media board would inherit its constraints (it refuses paths outside the vault). Would be right if the board needed Sympose's search or its persona.
- **Automatic screenshots of a pasted address.** Saves the owner's own screenshot, but needs a headless browser, and the results are often cookie banners or login walls; the owner's crop is the point. Would be right as an optional button if the pasted-image flow proves too slow.
- **A bookmarklet as the second input.** Cheap, but sites with a strict content policy block it and Safari is stricter about reaching `localhost`. Would be right if the extension proved too heavy and the owner's browser allowed it.
- **Resizing in the browser page.** No server dependency, but the extension would have to do it again. Would be right if the page stayed the only client.
- **Shrinking the original on paste.** Saves disk, but cannot be undone; a screenshot cannot be retaken. Would be right if disk use grew past what the owner wants to keep, as a separate, explicit step.
- **A JavaScript stack (Node, with or without a UI framework).** Would match the UI of Stylo and Sympose, and the page is JavaScript anyway. But the vault scripts, gates and mutation check are Python, so the block logic would need a second toolchain and a second set of tests; Node's standard library has no image resizing, so thumbnails would bring in a native package (for example `sharp`) that is heavier than Pillow, and a framework would add more. Would be right if the app were to share code with Stylo or Sympose, or if the page grew into a real application.
- **A Python web framework (Flask, FastAPI or similar).** Routing and request parsing are less code to write. But each adds a dependency tree to cover what `http.server` already does for about five routes on one loopback address, and the origin check and the size limit (decisions 1 and 6) are code we write and test either way. Would be right if the API grew past a handful of routes, or if the standard-library server proved unsafe or too slow under real use.
- **Thumbnails with macOS `sips`, no Pillow.** Zero Python dependencies, but it shells out to a tool that exists only on macOS, handles file formats differently, and is harder to test with generated images. Would be right if the app were macOS-only for good and the one dependency became a burden.
- **A native Swift app.** A good fit for the Mac and for pasting from the clipboard, but it cannot share the API with a browser extension, and none of the vault tooling is Swift. Would be right if the owner wanted a menu-bar app and dropped the extension.
- **Cropping thumbnails to a fixed ratio.** A tidy grid, but the owner already chose the crop that matters. Would be right if the grid were only an index.
