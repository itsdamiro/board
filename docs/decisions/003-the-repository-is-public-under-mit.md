---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Safe file handling]
amends: []
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/privacy, topic/data-safety]
---

# 003 — The repository is public under the MIT licence, and its documents tell a stranger what the app writes

> **Summary.** The repository is public on GitHub so that other people can use the app, under the MIT licence, with a README, a description of the vault layout the app expects and a security policy. Only tracked files are shared, and none may carry the owner's private material. It costs a stricter bar on what is committed, on what the app may write into a stranger's notes, and on keeping the public documents true.

Accepted by the owner on 2026-10-15: decisions 1 to 6, including the public repository under the MIT licence; the items under "Open" stay open (outside pull requests, private vulnerability reporting, the private-terms gate, how general the app is).

## Context

- The repository is already public on GitHub and empty (checked 2026-10-15). ADR 001 had said it "may be public". The owner then decided, in their words (paraphrased), to make it entirely public so that people can use it, being careful about which files are shared; their vault is private anyway.
- The sibling repositories `workflow`, `stylo` and `sympose` are public and the owner's vault repository is private (checked 2026-10-15). Stylo is MIT licensed.
- Without a licence, code is all rights reserved and nobody may use it. The repository had no `LICENSE`, no README and no security policy.
- The 20 tracked files at that date were documents and scripts only. A scan found no vault path, brand name, client name or image. Local-only files (`CLAUDE.md`, `docs/HANDOFF.md`, assistant folders) are in `.gitignore`.
- The app writes into a user's notes (ADR 001, decision 8), so a bug in a public tool can damage strangers' data, and the app serves files on a local port, so the origin check and loopback binding (ADR 001, decision 1) matter to strangers too.
- Workflow ADR 018 fixes the vault layout the app reads. It lives in the workflow repository, which is public, but a user should not have to read a decision record to learn the format.
- `CONTRIBUTING.md` says every commit is authored by the repository owner. That fits one author and not outside contributors.

## Decision

1. **Public.** The repository stays public. The owner's go-ahead is still needed for every push (`CLAUDE.md`).
2. **Licence.** MIT, in a `LICENSE` file, "Copyright (c) 2026 damiro", the same as Stylo. Each dependency's licence is checked when it is added, and any that is not permissive (MIT, BSD, Apache-2.0, ISC, HPND or the SIL Open Font License) needs its own record.
3. **What is shared.** Tracked files only. They carry no vault path, no home-directory path, no brand or client name and no image from the owner's work; tests and examples use synthetic names and generated images. Local-only files stay in `.gitignore`. A check for this is a gate added before the first push (`docs/CODE_QUALITY_STANDARDS.md`, section 12: a leak into a public history is irreversible): it fails on a home-directory path in a tracked file and on any term listed in a local-only, gitignored file of private terms the owner keeps.
4. **Public documents.** `README.md` (what the app is and does, its status, what it needs, how to run it once there is code, what it writes, where the licence and the security policy are); `docs/reference/VAULT_LAYOUT.md` (the folders, notes and block format the app reads and writes, copied from workflow ADR 018 so that a user does not need that record; when the two disagree, ADR 018 wins and the page is fixed); `SECURITY.md` (what the app promises, and how to report a problem privately through GitHub's private vulnerability reporting). The README says what exists today and does not describe a feature that is not built.
5. **A promise only if tested.** A safety claim in the README, the layout page or `SECURITY.md` (it writes only under `Board/<slug>/` and at the end of a Moodboard note; it binds to `127.0.0.1`; it refuses a foreign `Origin`; it accepts only four image types by their first bytes) has a test that fails when the claim is broken. Until the code and its tests exist, the documents say "designed to" and not "does".
6. **Back up first.** The README tells a user to back up their vault and `Board/` before first use. The app does not back anything up.

## Consequences

Anyone can read, use and fork the app, and the design history (the records, including the rejected alternatives) is public and shows how the app came to be. The owner's own setup stays out of the repository by rule and, from the first push, by a gate.

The cost is a higher bar: a writer that edits a stranger's notes needs thorough tests, the README and `SECURITY.md` must not outrun the code, and public issues and reports need an answer. The MIT licence gives users no warranty, which the README says plainly.

Open:

- Whether the repository takes outside pull requests. `CONTRIBUTING.md`'s rule that every commit is authored by the owner does not fit contributors; it is rewritten when the owner decides, in a record of its own.
- Whether to turn on GitHub's private vulnerability reporting in the repository settings, which `SECURITY.md` relies on. Only the owner can do that.
- The private-terms gate (decision 3) is written, late: see the second amendment. The owner still has to create the private-terms file, which the gate skips with a note while it is missing.
- Whether the app is described as general (any vault with this layout) or as the owner's setup made public. Decision 4 documents the layout; a settings option for other layouts is a later record.

## Alternatives rejected

- **Private until there is code worth showing.** The assistant's first recommendation: nothing is lost by waiting and a leak is impossible. Would be right if the repository held anything the owner would not publish, or if public issues were unwelcome.
- **A different licence.** Apache-2.0 adds an explicit patent grant and is longer; the GPL family requires derived works to stay open, which would deter reuse. Would be right if patents became a concern (Apache-2.0) or if the owner wanted every fork to stay open (GPL or AGPL).
- **No licence, or a "source available" statement.** Lets people read but not use, against the aim. Would be right if the owner wanted to share the design without the code being reused.
- **Public documents only in the README.** Less to keep true, but the vault format and the safety promises are long enough to bury it, and the format is a contract. Would be right if the layout were a single sentence.
- **Pointing users to workflow ADR 018 for the format.** No copy to drift. But a stranger should not have to read a decision record in another repository to run the app. Would be right if the format moved into its own public specification.

## Amendment (2026-10-15): the first push came before the gate

Decision 3 says the private-terms check is a gate added before the first push. The first push happened the same day, on the owner's instruction, before the gate was written. The assistant scanned the whole history by hand first, for home-directory paths, the vault's name and attribution trailers, and found only rule text that names them. The decision is unchanged: the gate is still due, it is the next piece of work, and any later push goes through it. Until it exists, a push needs the same manual scan.

## Amendment (2026-10-15): the gate is written

The gate is `scripts/private_check.py`, the gates `private` and `tests` in `scripts/gates.conf`, and the private-terms file is `.private-terms` at the repository root, gitignored. It checks the path and text of every tracked file (a new file counts once it is added to the index), for a home-directory path and for any term in the file, ignoring case, and it never prints the term. It fails if `.private-terms` is itself tracked. With no `.private-terms` the terms check is skipped with a visible note, so a fresh clone passes; the check protects the owner only once the owner has listed their terms. It does not scan history: a term or path in an earlier commit is not found, which is why a push that follows a history rewrite or a first publication still needs the manual scan.

## Amendment (2026-10-16): the open items decided

The owner accepted the assistant's recommendations on 2026-10-16.

1. **Outside pull requests are not accepted for now.** `CONTRIBUTING.md` says so and keeps its rule that every commit is the owner's. Taking them later needs `CONTRIBUTING.md` rewritten first, in a record of its own.
2. **Private vulnerability reporting is to be turned on** in the repository's settings (Settings, Code security), which only the owner can do. `SECURITY.md` relies on it; until it is on, its "Report a vulnerability" path does not exist.
3. **The app is described as general:** any vault with the documented layout (`docs/reference/VAULT_LAYOUT.md`), not the owner's setup made public. A setting for other layouts is still a later record.
4. **The concept `Safe file handling` stays** in the frontmatter.
5. **Still open:** the owner has to create `.private-terms` (decision 3 and the second amendment above); the assistant cannot invent the terms.
