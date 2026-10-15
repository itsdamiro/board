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
