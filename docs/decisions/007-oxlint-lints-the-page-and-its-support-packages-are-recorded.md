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

## Amendment (2026-10-18): a formatter, and type-aware lint rules

**Drafted on the owner's go-ahead of 2026-10-18 ("ok lets do that", taking the formatter and type-aware lint the handoff recommended first). The choice of Oxfmt, the line width of 160 and the rule set are mine, not the owner's, and wait for the owner to read them.**

Context: the "Open" paragraph of this record left two things undecided, a formatter and `oxlint-tsgolint` for type-aware rules. Checked on 2026-10-18 with `npm view` and a run over the page's code:

- `oxfmt` 0.73.0 (MIT, same project as Oxlint; peers are optional: `svelte`, `vite-plus`, `@astrojs/compiler-rs`; about 9 MB unpacked, a native binary per platform) and `oxlint-tsgolint` 7.0.2004 (MIT, 16 KB, a launcher for the type-aware engine; Oxlint 1.88.0 names it as an optional peer, `>=7.0.2003`). Both install beside TypeScript 7.0.2 and Oxlint 1.88.0 without a conflict; the install reported 0 vulnerabilities.
- The page's code had been formatted by hand, with lines up to 400 characters (mostly Tailwind class strings, which no formatter breaks). With the formatter's default width of 100, nearly every file would change; at 160, 12 of the 33 source files changed, about 370 lines, mostly objects and call chains that were over one line long.
- `oxlint --type-aware` over the page found 9 errors in the `correctness` category and none in the page's own components: five `no-base-to-string` (a `String(input)` of a `RequestInfo | URL` in the fake server and the tests), three `unbound-method` (`expect(URL.revokeObjectURL)`) and one `no-implied-eval` (the test that runs `public/theme-init.js` with `new Function`). With `no-floating-promises` and `await-thenable` added there were none more; `no-misused-promises` reported two, the async handlers given to `onSubmit` and `onClick` in `Composer.tsx` and `DeleteItem.tsx`, which is how a React handler is written here.

Decisions 1 to 3 and the "Open" paragraph change in these places, and nothing else:

1. **Oxfmt is the formatter,** a dev dependency pinned to an exact version (0.73.0), configured in `web/.oxfmtrc.json` with `printWidth` 160 and its other defaults. `npm run format` rewrites `src`, `public`, `e2e` and the `vite.*` and Playwright config files; `npm run format:check` lists what it would change and fails if there is any.
2. **The gate** `web-format` in `scripts/gates.conf` runs `npm run format:check`, so a file the formatter would change fails the gate like a lint error. It could fail: before the first format the check reported 27 files at the default width and 12 at 160.
3. **Type-aware rules are on.** `oxlint-tsgolint` is a dev dependency pinned to 7.0.2004, and `npm run lint` runs Oxlint with `--type-aware`. The `correctness` category stays as errors, and `typescript/no-floating-promises` and `typescript/await-thenable` are added by name. `no-misused-promises` is not added: it flags every async React handler, which is the normal way to write one.
4. **The probe covers a type-aware rule.** `web/lint-probe/floating.ts` is a floating promise, `lint-probe/check.mjs` runs Oxlint with `--type-aware` and now fails unless five rules report (`no-floating-promises` added to the four).
5. **The nine findings are fixed** with the gate: a `requestPath` helper in `fakeServer.ts` replaces `String(input)`; the tests keep the mock for `URL.revokeObjectURL` in a variable; the one `new Function` in `theme-init.test.ts` carries a disable comment with its reason (the page's own script is run the way the browser runs it).
6. **The first format is its own commit,** apart from the change that adds the tool, so a reader of the history can skip it.

Consequences: a diff in the page is about what changed and not about where a line broke, and a promise that nothing waits for is caught before a test is. The costs are another native binary in the dev tree (a supply-chain surface of the kind this record already names), a type-aware run that is slower than the plain one (a few seconds on this page), and a formatter whose output is the only style: the owner's hand-set line breaks in long expressions are gone. Oxfmt is at 0.x, so its output may change between versions; the version is pinned and a bump is a format commit of its own.

Tests: this is tooling, so the evidence is the gates: `npm run format:check` passes on the formatted tree and failed before it; `npm run lint:probe` fails if any of the five rules goes silent; `npm run lint`, `typecheck` and `test` pass after the format.

Alternatives rejected:

- **Prettier.** The standard, and it runs everywhere, but it is a second toolchain beside Oxlint, much slower and with its own plugins; Oxfmt aims at Prettier's output. It becomes right if Oxfmt's output proves unstable between versions.
- **Biome for both lint and format.** One tool, but it replaces the gate and the probe that this record built, and its React rules were not checked here. It becomes right if Oxfmt or Oxlint stalls.
- **The default width of 100.** Closer to common practice, but it rewrites nearly every file and breaks the long expectations in the tests across many lines. It becomes right if the owner finds 160 too wide to read side by side.
- **Enabling `no-misused-promises`.** It would catch a handler that returns a promise where nothing handles its failure, but here it flags every async handler; those handlers catch their own errors. It becomes right with a configuration that exempts event handlers (`checksVoidReturn.attributes: false`), if Oxlint takes one.
