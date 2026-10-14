# Code Review Standards

> Read when the task changes or reviews code. The always-read part is `docs/CODE_QUALITY_STANDARDS.md`; section numbers here are the old ones, so a citation such as "§5" still finds its text.

## 0. Code rules (the rest of §0 is in `CODE_QUALITY_STANDARDS.md`)

- **Single Responsibility + a real file-size cap.** "Keep files small" is an unenforced platitude until it's an actual number. Pick one appropriate to the language and project (Sympose uses 200 LOC per file for its Python package) and hold to it. For a library, keep the public entry point a thin barrel — re-exports and types only, no logic — so consumers have one obvious place to see the whole surface area.
- **Config/runtime knobs declared once.** A setting lives in exactly one canonical place (a schema file, a constants module — whatever the project's equivalent is). Never re-declare its default as a literal at each call site; every call site reads the one canonical value.
- **Directory / path-boundary safety.** Any code that accepts a path derived from user input or external data must validate it stays within its intended root *before* touching the filesystem — resolve to a real (canonical, symlink-resolved) path first, then check containment against the allowed root. A string-prefix check alone is not enough.
- **Thread safety & process lifecycles.** Shared mutable state touched from more than one thread, request, or instance needs explicit synchronization or per-instance isolation — this is exactly the `SlackDaemon` bug this audit found: three caches declared at class level that should have been per-instance, so every persona silently shared one cache instead of having its own. Any background process/subprocess the app spawns needs explicit cleanup (an `atexit` handler or equivalent) so it doesn't outlive the app.

## 1. Tooling: real dev dependencies, not ad hoc

- Install a real linter / formatter / type-checker as a **declared dev dependency** (`package.json` devDependencies, `pyproject.toml`'s `[project.optional-dependencies].dev`, or the language's equivalent) — not something run once from a global install and forgotten.
- Persist its configuration **in the repo** (`eslint.config.js`, `pyproject.toml`'s `[tool.ruff]`, `tsconfig.json`, etc.) so a fresh clone reproduces the exact same checks. A check that only lives in someone's shell history isn't a standard — it's a one-off.
- Typical stack: TypeScript + ESLint for JS/TS frontends; `ruff` for Python backends. Pick whatever is idiomatic for the language, but always both a *linter* (style/correctness patterns) and, where the language supports it, a *type checker* — they catch different things.

## 2. Start narrow. Earn every rule category.

- Don't flip on a big default/preset rule set on day one. Enable a category, run it, and actually read what it flags before deciding it's worth keeping on.
- If a category surfaces a wall of pre-existing, unreviewed findings on an established codebase: either fix them all before adopting it as a standing rule, or leave it off for now — and write down why (see §9).
- Explicitly record what you *deliberately did not* enable, and why. That list is as valuable as the enabled list — it's what stops someone later "helpfully" turning on everything and burying the signal in noise nobody asked for.

## 3. Three distinct tiers of review — don't let one substitute for another

1. **Architecture / design review** — does the system's shape make sense. Judgment call, no tool does this for you.
2. **Automated tooling** — style, known-bad patterns, security anti-patterns, type mismatches. Fast and mechanical; it catches a class of problem a human gets bored of checking by hand, and nothing more.
3. **Manual correctness / algorithm review** — does the logic actually do what it's supposed to, on the inputs that matter. A linter does not check this. Scope it deliberately (§5) instead of trying to read an entire codebase end to end.

If someone asks "have we really checked everything," the honest answer names which of these three actually happened, not just "yes."

## 4. Triage findings by what they're worth, not by how many there are

- **Mechanical / auto-fixable** (formatting, unused imports, simple renames): batch-fix, re-run the test suite, move on. Low judgment needed, low risk.
- **"This pattern is often a bug" findings** (broad exception catches, complexity flags, etc.): read each one and trace what actually happens. On the Sympose audit, ~110 broad `except Exception` catches turned out to already be correct (deliberately broad, or re-raised), while a smaller, different set of 35 were genuinely silent failures worth fixing. The true-positive rate differs wildly by category — never blanket-apply one fix pattern across a whole rule category without actually checking each hit.
- Use a complexity/hotspot signal (cyclomatic complexity, file churn, file size) to **scope** a manual review — it means "worth a careful read," not "confirmed bug."

## 5. How to run the correctness / algorithm review

- Scope it to the highest-complexity or most tightly-coupled functions/files first, not the whole tree.
- Read each one fully. Trace the actual control flow against real inputs, including edge cases the code visibly hasn't considered.
- **Try to disprove your own finding before reporting it.** Trace the surrounding code to check whether the apparent problem is already handled somewhere else. Report only what survives that check — this is what keeps a review's findings trustworthy instead of a pile of maybes.
- For a security-relevant finding: report the mechanism and a concrete, plausible failure scenario. Don't construct or run a working exploit unless explicitly asked to — describing the risk doesn't require weaponizing it.
- When a detection mechanism is fundamentally fuzzy (e.g., a regex that can't fully disambiguate an edge case), prefer a small fail-closed hardening (reject the ambiguous case outright) over trying to perfect the fuzzy mechanism itself.
- Verify every fix against the existing test suite, and add a manual sanity check for anything behaviorally subtle the suite doesn't already cover.

## 6. Type safety (TypeScript, or any statically typed language)

- No blind escape hatches (`any`, unchecked casts, un-narrowed `unknown`) used just to make the compiler stop complaining. If a library exports generics for a data shape (e.g. a graph/rendering library's `NodeObject<T>`), use them instead of re-inventing or widening to `any`.
- Build the smallest, most accurate local type that reflects what the code actually does at runtime — including fields a third-party library mutates onto an object after the fact — rather than the broadest type that happens to compile.
- After a typing pass, verify **both** the linter and the type checker. A change can be lint-clean and still fail type-checking, or vice versa; neither substitutes for the other.
- When removing a cast or an `any`, re-derive the actually-correct type. Don't stop the moment the red squiggly disappears — a wrong-but-quiet type is worse than an honest, visible `any`.
