---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Interface stack]
amends: []
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/web-app, topic/architecture]
---

# 005 — Node 24 is the pinned Node version, set in `.nvmrc` and checked by npm

> **Summary.** The page's toolchain is pinned to Node 24, the long-term-support line, in `.nvmrc` and in `web/package.json`, and npm refuses to install on another major. It costs installing Node 24 on the owner's machine, which has only Node 20, and a revisit when the next line becomes long-term support.

Accepted by the owner on 2026-10-15: decisions 1 to 6, including Node 24 as the pin; the item under "Open" stays open.

## Context

ADR 002 left the Node version open and the handoff recommended "the current LTS".

- The owner's machine has Node 20.20.0 and npm 11.8.0, with `nvm` installed and no other Node version under it (checked 2026-10-15).
- nodejs.org's release table (read 2026-10-15) lists Node 20 as end of life since 2026-03-24, Node 22 and Node 24 ("Krypton") as long-term support, and Node 26 as Current, not long-term support. The page does not say which phase each long-term line is in or when Node 26 changes status; Node's usual practice, from general knowledge and not from that page, is that an even-numbered line becomes long-term support in October.
- Vite 8, which Stylo uses and ADR 002 names, requires Node 20.19 or newer on the 20 line, or 22.12 or newer (vite.dev, read 2026-10-15), so Node 24 satisfies it.
- Stylo's `package.json` says only `"node": ">=18"` and has no `.nvmrc` (read 2026-10-15). The board holds client work (ADR 002, consequences), so a known toolchain matters more here.

## Decision

1. **The pin is Node 24,** the major only, so security patches within the line are taken. The file `.nvmrc` at the repository root holds `24`; `nvm install` and `nvm use` read it.
2. **npm enforces it.** `web/package.json` has `"engines": { "node": ">=24 <25" }` and `web/.npmrc` has `engine-strict=true`, so `npm ci` fails with a clear message on another major instead of installing quietly.
3. **The lockfile is written by the npm that ships with Node 24,** and `npm ci` is the only install command used (ADR 002, decision 1).
4. **The scaffold slice starts by installing it:** the owner runs `nvm install` in the repository (a download of Node, which is the owner's to approve), then the scaffold is made under Node 24. Until then no `web/` code is written.
5. **Revisit when Node 26 becomes long-term support:** a new record supersedes this one, changes the three places in decisions 1 and 2, and runs the gates. Not before, and not on a schedule.
6. **The Python side is unaffected;** its minimum stays Python 3.11 (ADR 001, amendment on plain text).

## Consequences

Every gate and every session builds with the same Node, and an out-of-date machine fails loudly. The pin is written in three small places (`.nvmrc`, `engines`, `.npmrc`) that must change together.

The machine needs a Node install it does not have, and Node 20 stays on it for other apps, so the owner switches versions per folder with `nvm`. A shell that does not run `nvm use` automatically will hit the engine check and must run it by hand; this is the intended failure.

Open: whether to add a continuous-integration check later; none exists yet.

## Alternatives rejected

- **Keep Node 20.** Already installed, and Vite 8 accepts 20.19 or newer. But it is end of life, receives no security fixes, and the board holds client work. Would be right only if the pin were a throwaway experiment.
- **Node 22.** Long-term support and accepted by Vite, but an older line than 24 with less time left. Would be right if a dependency in the lockfile did not yet support Node 24.
- **Node 26 (Current).** Newest, but not long-term support, and its status was not confirmed from the source read today. Would be right once it is long-term support, and then through a new record (decision 5).
- **`engines` alone, or `.nvmrc` alone.** Each is shorter, but `.nvmrc` is advice for `nvm` users and `engines` without `engine-strict` is a warning. Would be right if only one person ever used the repository and never forgot `nvm use`.
- **Pinning an exact version (`24.x.y`).** Fully reproducible, but forgoes patch releases and needs an edit for each. Would be right if a patch release ever broke the build and the owner wanted to hold back.
- **A version manager that switches by itself (Volta, fnm).** Removes the by-hand `nvm use`, but is another tool to install and trust. Would be right if the by-hand step caused repeated failures.
