---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Interface stack]
amends: []
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/web-app, topic/data-safety]
---

# 006 — Playwright tests the milestone flow in a real browser against a sample vault

> **Summary.** One end-to-end suite, in Playwright with Chromium, runs the milestone flow (pick a brand, paste, describe, Enter, see it, delete it) in light and dark against the real Python server and a generated sample vault, never the owner's. It costs a browser download, a dev dependency and a slower gate.

Accepted by the owner on 2026-10-15: decisions 1 to 8, including Chromium only and the paste simulated in the page; the items under "Open" stay open for later slices.

## Context

ADR 002 left open whether end-to-end tests run the milestone flow; the handoff recommended Playwright, as in Stylo.

- `docs/CODE_QUALITY_STANDARDS.md`, section 7, says a screen is not done until the page has been loaded and clicked through in both themes. Vitest with Testing Library (ADR 002, decision 8) runs in a simulated page and cannot check layout, the clipboard path, themes as the browser applies them, or the Content-Security-Policy.
- Stylo has `@playwright/test` ^1.63.0 and a `test:browser` script (`package.json`, read 2026-10-15), so the owner already runs this tool.
- The milestone (handoff): with a sample vault, the owner picks a brand, pastes a screenshot with a description, presses Enter, and the item shows in the grid and as a block at the end of that brand's Moodboard.
- A search of `board/server.py` (2026-10-15) finds no route that serves `web/dist/`; ADR 002 says the server will, and that is a 3b task this record depends on.
- `CLAUDE.md`: no vault path, brand name, client name or image in the repository; tests use synthetic names and generated images. The server writes to the vault, and its tests already note that concurrent requests can reset or fail (`docs/reference/GOTCHAS.md`).
- Playwright's browsers are not in the npm package; they are downloaded once, to a cache outside the repository, by `npx playwright install`.

## Decision

1. **Tool.** `@playwright/test`, a dev dependency in `web/`, at the same minor as Stylo's (1.63) and pinned by the lockfile. Chromium only at first.
2. **The browser download is a separate step,** `npx playwright install chromium`, run by the owner or with their go-ahead, never from `npm ci` or a gate. A gate that finds no browser fails with that command in its message.
3. **What runs against what.** The suite builds nothing itself. It starts the Python server (`.venv/bin/python -m board --vault <sample> --port <free port>`) on a free port and loads the built `web/dist/`, so it tests what production serves, with the real origin and host checks and without the dev proxy of ADR 004.
4. **A sample vault, generated.** A script in `scripts/` creates a fresh vault in the system temporary folder for each test: a few synthetic brands with a Moodboard note each, and images drawn by Pillow. Brand names are obviously made up. The owner's vault is never read or written, and the vault path is passed in, never written in the repository.
5. **What it checks, and no more.** The milestone flow exactly: pick a brand; paste a generated image; type a description; press Enter; the item is in the grid; the Moodboard file on disk ends with the block and the image file exists; delete it; the block and files are gone. Each run in light and in dark, the second set by the page's switch and the first by the browser's colour-scheme setting. Any console error or Content-Security-Policy violation fails the test. No pixel-comparison baselines.
6. **The paste is simulated in the page,** by dispatching a paste event carrying a generated image, because the system clipboard is not reliable in a headless browser. This does not test the browser's own clipboard; the owner's click-through by hand does, once per slice.
7. **One worker,** and one fresh sample vault per test, so tests cannot step on each other's files.
8. **Gate.** One line in `scripts/gates.conf`, `e2e`, run in `web/` after the build, added with the scaffold as ADR 002 decision 8 does for the others.

## Consequences

The one flow the app exists for is checked in a real browser in both themes on every gate run, and a break in the origin check, the Content-Security-Policy or the paste path shows up as a failing test instead of a surprise.

The costs: a browser of a few hundred megabytes in a cache folder, a dev dependency tree larger by Playwright's, a gate that takes tens of seconds longer, and a test that proves the page's paste handler but not the real clipboard. Chromium only means Safari and Firefox behaviour is unchecked.

Open: which browser the owner uses day to day (WebKit would then be added); whether the gate list needs a quick and a full tier if `e2e` makes `scripts/gates` too slow to run before each commit; whether a mutation tool covers the page's logic (carried over from ADR 002).

## Alternatives rejected

- **Vitest and Testing Library only.** Already decided and fast, but it cannot see layout, themes as applied, or the Content-Security-Policy, and a simulated page can pass while the real one fails. Would be right if the page stayed at one screen with no paste handling.
- **Click-through by hand only.** Required in any case, and free. But it is not repeatable and depends on the reviewer remembering both themes. Would be right if the page were thrown away after a demo.
- **Cypress or Selenium.** Work, but the owner already has Playwright in Stylo, and what is learned there carries over. Would be right if Playwright ever dropped macOS support or a needed feature.
- **Running the suite against the Vite dev server and its proxy.** Tests ADR 004's proxy for free, but ties the milestone check to a development convenience and hides what production serves. Would be right if the proxy grew logic worth testing in a browser.
- **The owner's real vault, read-only.** Closer to life, but puts brand names and client images in the test's reach and in its failure output, against `CLAUDE.md`. Never right here.
- **All three browsers from the start.** Wider cover, three times the download and runtime. Would be right once the owner uses Safari or Firefox for the app.

## Amendment (2026-10-15): the e2e gate arrives with the first end-to-end test

Decision 8 said the `e2e` gate is added with the scaffold. The scaffold has no flow to test yet, so a gate then could not fail, and it also needs the server to serve `web/dist/` first. The gate (and the sample-vault script of decision 4) is added with the first end-to-end test, in slice 3b after the server serves the built page. Nothing else in the decision changes.
