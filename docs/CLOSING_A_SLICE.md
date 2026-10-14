# Closing a slice

> A slice is one shippable step of a plan (one decision record's worth). Copy this checklist into the working notes and tick it as you go. The "return to" lines are part of it: a check that fails sends the work back, it does not get noted and carried on.

## Contents
1. The checklist
2. Why each step is there

## 1. The checklist

- [ ] **1. Decision first.** The choice is written down (an ADR, or the project's equivalent) *before* the code, with the owner's word on anything that was theirs to decide. *If a real choice turns up mid-slice, stop and return to 1.*
- [ ] **2. Tests with the code.** Every behaviour has a test; every new test has been seen to fail (mutation check: `python3 scripts/mutate.py mutants.json`). A survivor gets a test, or one line saying why it is an equivalent change. *If a mutant survives and the code is wrong, return to 2.*
- [ ] **3. Gates.** `scripts/gates` passes in full. Do not pipe a gate through `tail` or `head` (it hides the exit code). *If a gate fails, fix the cause and return to 3; never skip or loosen the gate.*
- [ ] **4. The real thing.** Anything a mock cannot judge (layout, drag and drop, a real server, a real model) is checked in the real environment, driven by a script, not by eye. *If it disagrees with the mocked tests, the tests were wrong: return to 2.*
- [ ] **5. Review, two lenses.** Both run over the whole diff of the slice, by readers who did not write it. Subagents may be used for either, briefed per `CODE_QUALITY_STANDARDS.md` §13; one focused agent, not several, unless the level warrants it.
      - **5a. Correctness: `/code-review`**, at `high` by default; `xhigh` or `max` only for a slice that touches data, links, permissions or a real user's files and where `high` leaves doubt. Say the level before running it: higher levels and subagents cost more tokens. It is required for a slice that changes code you will rely on (`/handoff full` runs it); a slice that changes only prose may skip it, and the report says so. A subagent never replaces it. (`ultra`, the billed cloud review, is the owner's to launch.)
      - **5b. Over-engineering:** is every new thing earning its place? Look for duplicated logic that could be one function, walks or requests done twice, options nothing uses, abstractions with one caller, defensive code for a case that cannot happen, a new file where an edit would do (`/simplify`, or a subagent with that brief). *Every real finding returns to 2, then 3 again; a finding you decline gets one line saying why. A simplification is a change like any other: tests first, gates after, and behaviour the tests pin must not move.*
- [ ] **6. Generated output.** Anything built from source (a bundle, a lockfile, a vendored build) is rebuilt and committed as **its own commit**, after the source commits. Never stage a directory that mixes source and output.
- [ ] **7. Commits.** One commit per item (the owner says "split" or "you call"); authored as the owner, no trailer. Commit and push only on the owner's go-ahead.
- [ ] **8. Stale-statement sweep.** `grep` the repo's docs for each claim this slice made false ("not built", "not remapped", the old behaviour) and fix every hit, including the decision record's own Status and index line. Include what ships to users or is read by the product itself (a help or reference library the assistant quotes, user-facing messages): a stale line there is repeated to users as fact.
- [ ] **9. Handoff.** Rewrite `docs/HANDOFF.md` (volatile facts only), move anything durable to `docs/reference/` or a decision record, and, for a `/handoff full` close, run the handoff check. *If the check fails, fix the handoff and run it again.*

## 2. Why each step is there

- **1 and 8** keep the written record true. A record that disagrees with the code is worse than none.
- **2** catches tests that cannot fail, which is the commonest way a green suite lies.
- **3** is the only evidence that "done" means done (`CODE_QUALITY_STANDARDS.md` §7).
- **4** exists because mocks pass while the real page or process shows something else.
- **5** finds what the author cannot see; budget for a round of fixes after it. Correctness and simplicity are different questions and a reader holding one tends to miss the other, so they are asked separately.
- **6** keeps reviewable diffs reviewable.
- **9** is how the next session, possibly with no memory of this one, starts in the right place.
