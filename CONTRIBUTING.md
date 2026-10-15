# Contributing

## Outside contributions

Outside pull requests are not accepted for now (ADR 003). Issues and private security reports are welcome; the rules below are the owner's own and do not yet fit contributors. If that changes, this file is rewritten first, under a record of its own.

## Repository hygiene

These are strict, not aspirational.

- **Single author identity.** Every commit is authored and committed by the repository owner (`damiro <hello.damiro@gmail.com>`). No secondary identities, no aliases.
- **No trailers.** Commits carry no `Co-authored-by`, `Signed-off-by`, or tooling/attribution trailers of any kind.
- **Assistant and editor tooling is never committed.** `.agents/`, `.claude/`, `.gemini/`, `.cursor/`, `CLAUDE.md`, `GEMINI.md`, `.vscode/`, and the like are local-only. They're covered machine-wide by `core.excludesFile` and, belt-and-braces, by this repo's own `.gitignore`.
- **No private material.** No vault path, brand or client name, or image from the owner's work appears in this repository; examples and tests are synthetic.
