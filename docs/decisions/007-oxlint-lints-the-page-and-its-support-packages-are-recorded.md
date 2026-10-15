---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Interface stack]
amends: [002]
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/web-app, topic/architecture]
---

# 007 — Oxlint lints the page, and the page's support packages are recorded

> **Summary.** The page's lint gate runs Oxlint, pinned, with rules that forbid `dangerouslySetInnerHTML`, enforce the hooks rules and check accessibility; TypeScript stays at 7. The record also lists the support packages the accepted stack needs. It costs a native binary in the dev tree and no type-aware rules.

Accepted by the owner on 2026-10-15: decisions 1 to 7, including Oxlint as the linter with TypeScript 7 kept, and the support packages listed in decision 5; the items under "Open" stay open.

## Context

ADR 002, decision 8, requires a lint gate and, in decision 7, a lint rule against `dangerouslySetInnerHTML`; it names no tool. Decision 10 says each npm dependency beyond its set needs its own record. The scaffold (slice 3b) found the tool choice is not free:

- The page is on TypeScript 7.0.2, as Stylo is (`web/package.json`; Stylo's `package.json`, read 2026-10-15). typescript-eslint 8.71.2, the usual linter for TypeScript, declares `typescript >=4.8.4 <6.1.0` as a peer (`npm view`, 2026-10-15), so it does not support 7. Using it means pinning the page to TypeScript 6.0.x.
- Oxlint 1.88.0 (MIT, `npm view`, 2026-10-15) has no TypeScript peer; its only peers are optional (`vite-plus`, `oxlint-tsgolint`). It runs as a native binary, in a package of about 14 MB with no install script in its own `package.json` (checked 2026-10-15).
- Checked in a scratch project, outside the repository, on 2026-10-15, with the plugins `react`, `typescript` and `jsx-a11y` and the rules `react/no-danger`, `react/rules-of-hooks` and `react/exhaustive-deps`: Oxlint reported all four planted faults (a `dangerouslySetInnerHTML` use, a hook called conditionally, a missing `useEffect` dependency, an `<img>` with no `alt`), exited 1 on them and 0 on a clean file. Run over the scaffold's own code it found two things: an unused `catch` binding in `public/theme-init.js`, and `role="group"` on a `div` in `ThemeSwitch.tsx` where a `fieldset` is the native element.
- The scaffold also installed support packages that ADR 002 does not name but its stack needs: `@vitejs/plugin-react` (JSX transform and refresh for Vite), `jsdom` (the browser-like environment Vitest uses), `@testing-library/dom` (a required peer of Testing Library), and the type packages `@types/react`, `@types/react-dom` and `@types/node`.

## Decision

1. **Oxlint is the linter,** a dev dependency in `web/` pinned to an exact version (1.88.0 today), with its configuration in `web/.oxlintrc.json`: plugins `react`, `typescript` and `jsx-a11y`; the `correctness` category as errors; and `react/no-danger`, `react/rules-of-hooks` and `react/exhaustive-deps` as errors by name.
2. **The gate** is `web-lint` in `scripts/gates.conf`, running `npm run lint` in `web/`: Oxlint over `src`, `public` and the `vite.*` files with `--deny-warnings`, so a warning fails like an error.
3. **The gate must be able to fail.** `web/lint-probe/` holds the four faulty fixtures from the check above, and `npm run lint:probe` runs Oxlint on them and fails unless every one of the four rules reports. The gate runs both commands, so an upgrade or a config change that silences a rule shows at once.
4. **TypeScript stays at 7.** typescript-eslint is not used. This is revisited when it supports TypeScript 7 (decision 7 below).
5. **The support packages are accepted,** each a dev dependency pinned to an exact version and shipping nothing to the browser: `@vitejs/plugin-react`, `jsdom`, `@testing-library/dom`, `@types/react`, `@types/react-dom` and `@types/node`.
6. **The two findings are fixed** when the gate is added: an optional `catch` binding in `theme-init.js`, and a `fieldset` with a visually hidden `legend` for the theme switch.
7. **Revisit** when typescript-eslint supports TypeScript 7, or when a rule the page needs is not in Oxlint: a new record supersedes this one.

## Consequences

The page keeps TypeScript 7 and the owner's two apps stay on the same compiler. The security rule of ADR 002 is enforced by a gate, and the accessibility rules of `docs/reference/UI_STANDARDS.md` get a first automatic check, though they do not replace the keyboard and screen-reader check by hand.

The costs: Oxlint's rules are fewer than typescript-eslint's, and it reads no type information, so rules that need types (a floating promise, an unsafe `any`) are not checked. A native binary comes with the dev tree, per platform, as an optional dependency package, which is a supply-chain surface of a kind the Python side does not have; the lockfile is committed and the version is pinned. The probe's fixtures are code that must never be imported or built.

Open: a formatter (none is chosen); whether to add `oxlint-tsgolint` for type-aware rules, which is an optional peer that works with the TypeScript 7 compiler, once a rule needs it; whether `jsx-a11y` is noisy enough to turn individual rules off, decided by what it reports on real screens.

## Alternatives rejected

- **ESLint with typescript-eslint, TypeScript pinned to 6.0.x.** The usual stack, with more rules and type-aware checks. It costs the page the TypeScript 7 compiler, puts it on a different version from Stylo, and adds several packages (ESLint, typescript-eslint, a hooks plugin). Would be right if a rule the page needs is missing from Oxlint, or once typescript-eslint supports TypeScript 7 and the owner wants type-aware rules.
- **No linter, plus a test that searches the source for `dangerouslySetInnerHTML`.** One rule, no dependency. It would miss the hooks and accessibility rules, and a text search is easy to get around (an alias, a spread). Would be right if the page were a single screen with no hooks.
- **Biome.** One tool for lint and format. Not evaluated here beyond its name; would be right if the owner also wants a formatter from the same tool, after the same check that the rules in decision 1 exist and fail on the probe.
- **Wait for typescript-eslint to support TypeScript 7.** Keeps the standard stack and TypeScript 7, but leaves the lint gate and the `dangerouslySetInnerHTML` rule undone for an unknown time, against ADR 002. Would be right if the page's first screens could wait.
- **Accept the support packages implicitly, without a record.** Faster. Rejected because ADR 002, decision 10, asks for a record per dependency, and the list of what the page needs should be in one place. Never right while that rule stands.
