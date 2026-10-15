# Security

## Status

No server or page is built yet, so there is nothing to attack over the network; only the code that edits a Moodboard's text exists. The promises below are the design (ADR 001, decisions 1, 6 and 8; ADR 002, decisions 6 and 7). Each will have a test that fails when it is broken before this page says "does" for it.

## What the app is designed to promise

- **Local only.** The server binds to `127.0.0.1` and no other address, and refuses a request whose `Origin` is not its own page. Running it bound elsewhere, or behind a proxy that rewrites the origin, is outside what it promises.
- **Narrow writes.** It writes only under `Board/<brand>/` and at the end of a brand's Moodboard note, and deletes only the one block you click delete on, if its text is unchanged since it was shown, with the image files that block names, going through a hidden temporary file beside the note (see `docs/reference/VAULT_LAYOUT.md`).
- **Images are checked by content.** Only PNG, JPEG, WebP and GIF are accepted, judged by the file's first bytes and not its name, and a file over 25 MB is refused.
- **Text is text.** Note text, descriptions and addresses are shown as text, never as HTML, and the page loads nothing from another host.
- **No telemetry.** The app sends nothing to the author or any service. The one exception is a single fetch of a page address you paste, to read its title and preview image (ADR 001, decision 7); a failure is silent and the item stays a bare link.

## Reporting a problem

Please report a vulnerability privately, not in a public issue: on the repository's GitHub page, open **Security**, then **Report a vulnerability**. Say what you did, what you expected and what happened, and the version or commit. There is no promised response time; this is a personal project.

A report about the vault layout or about a note being changed that should not have been counts as a security report: the app writes into your notes, so a wrong write is a serious bug.
