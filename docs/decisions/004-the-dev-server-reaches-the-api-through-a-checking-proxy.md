---
type: decision
status: accepted
date: 2026-10-15
projects: [board]
concepts: [Interface stack]
amends: []
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/web-app, topic/privacy, topic/data-safety]
---

# 004 — The dev server reaches the API through a proxy that checks the origin itself

> **Summary.** While the page is developed, Vite's dev server proxies `/api` to the Python server, refuses any request whose `Origin` or `Host` is not the dev page's own, and only then presents the server's own origin; the Python server's checks stay exactly as ADR 001 fixes them. It costs a small piece of code in `web/` that must be tested like the server's own check.

Accepted by the owner on 2026-10-15: decisions 1 to 7, including that the proxy refuses a foreign `Origin` or `Host` before it presents the server's own; the items under "Open" stay open for the scaffold.

## Context

ADR 002 left one question open: how a dev server on a second port passes the origin check without weakening it. ADR 001, decision 1, makes weakening the check a decision of its own, so this is that record.

- The Python server accepts a request only if `Host` is `127.0.0.1:<port>` or `localhost:<port>`, and a request that changes anything only if `Origin` is `http://` plus one of those (`board/server.py`, function `refusal`, read 2026-10-15). It sends no CORS header, and it requires a JSON `Content-Type` on bodies.
- Vite's dev server runs on its own port (5173 by default), so a page served from it has an `Origin` the Python server refuses. The Python server's default port is 8765 (`board/__main__.py`).
- A proxy that simply overwrites `Origin` with the server's own makes the check useless: any web page that can reach the dev server's port could write to the vault through it, with the server believing the request came from its own page. The JSON `Content-Type` rule would still stop a plain form post, but that is a second line of defence, not the check.
- In production the Python server serves the built page from `web/dist/` (ADR 002, decision 1), so page and API share one origin and nothing here applies.
- The owner's wish, in ADR 001: the origin check and the loopback binding are part of the design and are never loosened for convenience.

## Decision

1. **Same origin for the page.** In development the page calls `/api/...` on the dev server, never the Python server's port, so the browser sees one origin and no CORS header is needed.
2. **The dev server listens on `127.0.0.1` only,** on a fixed port (`strictPort`), and keeps Vite's own `Host` allow-list (localhost and `127.0.0.1`) on.
3. **The proxy checks before it forwards.** A request is refused with 403 unless its `Host` is `127.0.0.1:<dev port>` or `localhost:<dev port>`, and its `Origin`, when present, is `http://` plus one of those. The check is a small pure function in `web/`, shared by the proxy and its tests.
4. **Then the proxy speaks as the page would in production:** it sets `Host` and `Origin` to the Python server's own (`127.0.0.1:<API port>`; the API port comes from an environment variable, default 8765) and forwards to `http://127.0.0.1:<API port>`.
5. **The Python server does not change.** No flag, environment variable or extra allowed origin is added for development. If a dev-only way in is ever wanted, it needs a new record that supersedes this one.
6. **Tests.** The check in decision 3 has Vitest cases (foreign `Origin`, foreign `Host`, a look-alike such as `http://127.0.0.1:5173.evil.test`, no `Origin`, the allowed forms) and is mutation-checked by hand: each condition is weakened once and a test must fail. The milestone's end-to-end test (ADR 006) runs against the Python server directly, so it does not depend on this proxy.
7. **The dev server is for the developer's own session:** started on request and stopped after, not left running.

## Consequences

Development gets hot reload and keeps the same refusals the Python server enforces, so a page open in another tab cannot use the dev server to write to the vault. The Python server's tests and mutation checks are untouched.

It costs a second copy of the origin rule, in TypeScript, which can drift from the Python one; the two are tied together only by their tests and by this record. The proxy's behaviour also depends on how Vite and its proxy library pass headers through, so a Vite upgrade needs its tests run and read, not only passed.

Open: the exact Vite option names (settled in the scaffold; the behaviour in decisions 3 and 4 is what counts), and whether the shared rule should be generated from one list of allowed names instead of written twice.

## Alternatives rejected

- **A development-only allowed origin in the Python server (an environment variable or flag).** Simple, and no proxy code. But it puts a way to weaken the check into the program that writes to the vault, one forgotten variable away from staying on. Would be right if the proxy's check proved too hard to keep correct, and then only with its own record and a test that production refuses it.
- **A proxy that just overwrites `Origin` and `Host`.** The usual recipe, shortest. Rejected because it turns the dev server into a bridge that defeats the check for any page in the browser (see Context). Never right here.
- **No dev server: `vite build --watch`, with the Python server serving `web/dist/`.** One origin, no proxy, no second copy of the rule, so the least exposure of any option. It loses hot reload and rebuilds on each save. Would be right if the proxy's maintenance cost outweighed the speed of hot reload, or after a Vite upgrade breaks the proxy's headers; it is the fallback.
- **CORS headers from the Python server for the dev origin.** Lets the page call the server's port directly. But ADR 001 says the server sends no CORS header, and a CORS header names who may read responses, which widens what a foreign page can do. Would be right if the app ever has a second, remote client.
