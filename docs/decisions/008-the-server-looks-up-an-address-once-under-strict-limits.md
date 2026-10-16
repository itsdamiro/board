---
type: decision
status: accepted
date: 2026-10-16
projects: [board]
concepts: [Safe file handling]
amends: [001]
supersedes: []
tags: [type/decision, status/accepted, project/board, topic/privacy, topic/data-safety]
---

# 008 — The server looks up an address's title and preview once, under strict limits, and keeps the result beside the images, never in a note

> **Summary.** When the owner adds an address with no picture, the server fetches that page once, reads its title and preview image, and keeps both under `Board/<slug>/links/`. The fetch refuses every address that is not on the public internet and is bounded in time and size. It costs the first outbound requests the app makes, a small extension of the vault's folder contract, and a lookup the owner can switch off per item.

Accepted by the owner on 2026-10-16, taking all four recommendations under "Decided". The code waits for the owner to approve the matching amendment to workflow ADR 018 (decision 11).

## Context

- ADR 001, decision 7, says: "The server tries once to fetch the page's title and preview image and keeps what it gets; a failure is silent and the item stays a bare link. The app never takes a screenshot of a page by itself." Its amendment on slice 3a left the fetch out because it "needs its own care about what the server may fetch". This record is that care.
- Today the server makes no outbound request at all. The page's policy is `default-src 'self'; img-src 'self' blob:` (ADR 002, decision 6), so the browser never contacts another site either.
- A server that fetches an address chosen by someone else can be turned against the machine it runs on: to reach services that listen on `127.0.0.1` or the local network, a cloud metadata address such as `169.254.169.254`, or the router. This is called server-side request forgery. Here the address comes from the owner's own paste, but a pasted address can be a short link that redirects, or a name whose DNS answer changes between the check and the connection, so the checks have to hold for every hop.
- The Moodboard format has three parts: an optional embed, the owner's description, an optional source line. `docs/reference/VAULT_LAYOUT.md` promises "the description is the text you typed; the app writes no text of its own into a note" and "`Board/` holds only image files". A page's title is another person's text, and a title saved as the description would pass as the owner's own words.
- Addresses saved for client work may sit behind a login, so what a fetch returns can be a sign-in page. A fetch also tells the site, and anyone watching the connection, that this computer asked for that page.
- Python's standard library has what is needed (`http.client`, `ssl`, `socket`, `ipaddress`, `html.parser`), and Pillow already decodes and re-encodes images (ADR 001, decision 11).

## Decision

1. **When.** Only when an item is added through `POST /api/brands/<slug>/items` with an address and no image, and the lookup is not switched off. Never when the page loads or a brand is opened, never for an item that has its own picture, never again for an address already looked up (the stored result is reused), and never a retry after a failure. The API takes an optional `lookup` (true by default); the page shows a checkbox "Look up the page's title and preview" next to the address, checked, and remembers the choice.
2. **What is asked.** One `GET` for the address and, if the page names a preview image, one `GET` for that image. No cookies, no credentials, no `Referer`, `Accept-Encoding: identity`, a fixed `User-Agent` that names the app and no version of anything else. Nothing about the vault, the brand or the description is ever sent.
3. **Where it may go.** Only `http` and `https`, only ports 80 and 443. The host name is resolved by the server and every address the name gives must be a public one (`ipaddress` `is_global`, and not multicast); loopback, private, link-local (including `169.254.0.0/16`), carrier-grade (`100.64.0.0/10`), unique-local IPv6 and an IPv4 address inside an IPv6 one are refused, and an address given as a number or with credentials in it (`user@`) is refused. The connection is then made to the address that was checked, not to the name again, with the name sent as `Host` and, for https, as the server name the certificate is verified against, so a changed DNS answer cannot redirect it.
4. **Redirects.** At most three, each one checked by decision 3 from the start. https never falls back to http.
5. **Bounds.** Five seconds to connect and read each request and eight seconds for the whole lookup, so an add never waits longer than that. At most 512 KB of the page is read, and reading stops at `</head>`. The page must say it is `text/html` or `application/xhtml+xml`. A preview image is at most 5 MB, must be a PNG, JPEG, WebP or GIF by its first bytes (`images.sniff`), and passes Pillow's size limits (`MAX_PIXELS`) before it is decoded. SVG and anything else is ignored.
6. **What is read.** With `html.parser`, no script run: the title is `og:title`, else `<title>`; the preview is `og:image`, else none. Whitespace is collapsed; control and direction-control characters are removed; the title is cut at 200 characters. The preview address is resolved against the page's and goes through decisions 3 to 5 as well.
7. **What is kept.** In `Board/<slug>/links/`, named by the first 16 hex characters of the SHA-256 of the exact address: `<hash>.json` with `{title, preview, fetched}` and, if there is a preview, only its thumbnail (re-encoded by Pillow, about 640 px wide, `<hash>.<ext>`). The original image is not kept. Nothing is written to the Moodboard note by the lookup: the block is the same one the app writes today (the description the owner typed, if any, and the source line).
8. **What the API shows.** An item with an address gains `title` (text or null) and `preview` (an API address and its width and height, or null). Both are plain text and an image served by the app, so the browser still loads nothing from any other site and the policy of ADR 002 does not change. The page shows the title as text and the preview picture on the card of an item that has no picture of its own; the viewer does not open it.
9. **Failure.** Any error, refusal or limit gives no title and no preview, and the item is added as it is today. The server logs the kind of failure and never the address. The add still returns 201.
10. **Delete.** Deleting an item also removes `links/<hash>.*` when no other block in that Moodboard has the same address; if the files cannot be removed the answer is the 200 with a warning of ADR 001's amendment of 2026-10-16. An address left over from a block removed by hand stays and is never shown.
11. **The vault contract.** `Board/` now also holds `<slug>/links/`. Workflow ADR 018 and `docs/reference/VAULT_LAYOUT.md` say `Board/` holds only image files, so both need an amendment, and ADR 018's is the owner's to approve in the workflow repository. This record does not change what the app writes into a note, and the safety claims in `README.md` and `SECURITY.md` change from "makes no network request" to what decisions 1 to 6 say.
12. **Tests.** On synthetic pages from a local test server, with the name resolution and the check of decision 3 replaceable only in the test (the strict check is the one in the code the server runs): every refused kind of address and every redirect to one, a changed DNS answer between check and connection, each size and time bound, a page that is not HTML, an image that is not an image or too large, an `og:title` with markup, entities and control characters, the delete rule, and a failed lookup that still adds the item. Each rule is checked against a weakened version with `scripts/mutate.py` (ADR 001, decision 10). No test reaches the real internet.
13. **Dependencies.** None added.

## Consequences

An address with no picture becomes a card with a title and a picture without the owner writing anything, and nothing in a note changes, so Sympose and Obsidian show the notes as before. The owner's description stays their own words.

The app now contacts other sites from the owner's computer. That is visible to those sites, and a bug in decision 3 would be a way into the local network, so that decision and its tests are the part to review hardest. A saved address that needs a login gives a sign-in page's title; the checkbox is how to avoid that for client work.

Adding an address can take up to eight seconds, during which the page already shows it is busy. The vault's folder contract grows by one folder, which another tool reading `Board/` must tolerate. A title or picture is a snapshot and never refreshed.

## Decided

Asked of the owner on 2026-10-16, who took all four recommendations ("Take all four recommendations: store in Board/<slug>/links/, lookup on by default with a checkbox, the add waits up to eight seconds, only ports 80 and 443"):

- **Where the result is kept:** beside the images in `Board/<slug>/links/` (decision 7), with the amendment to workflow ADR 018 of decision 11. The alternative, fetching again at every view, writes nothing and changes no contract, but contacts the sites on every view and loses the title when the page is gone.
- **Default:** on, with the checkbox (decision 1). The cautious choice, off by default so no site is contacted unless the owner ticks it for that item, stays open to the owner by the checkbox's remembered state.
- **The eight seconds:** the add waits (decision 5). Looking up in the background so the card gets its title a few seconds later avoids the wait and costs a second state to test; it becomes right if the wait annoys.
- **Ports 80 and 443 only** (decision 3). A link to a development server is on a private address and refused anyway.

## Alternatives rejected

- **The preview as the item's own image, embedded in the block.** It would show in Sympose and Obsidian, but a cookie banner or a logo would then sit in the note and the vault as if the owner had pasted it, and the app would write more into the note than the owner typed. It becomes right if the owner wants previews to survive outside this app.
- **A fetch every time the page shows the item.** No stored file, but every opening of a brand contacts every saved site, which is slow and reveals what the owner keeps. It becomes right only if the app must write nothing new.
- **The title as the description when the owner left it empty.** The description is the owner's words (`CLAUDE.md`); a title is another person's text under the owner's name. Right if the owner decides a lookup title may count as their note.
- **A headless browser to capture the page.** Runs the page's script and is the "screenshot of a page by itself" that decision 7 rules out. It becomes right for the optional page-capture button listed as a later item, with its own record.
- **A link-preview service such as a hosted API.** It sends every saved address to a third party. Never for client work.
- **A third-party fetching or parsing library.** The standard library is enough, and each dependency needs its own record (ADR 001, decision 11). It becomes right if parsing real pages proves too brittle with `html.parser`.

## Amendment (2026-10-17): a NAT64 address is public when the IPv4 address inside it is

**Accepted by the owner on 2026-10-17, as drafted ("Accepted as drafted").**

Context: the owner's first two real lookups on 2026-10-17 both failed with "address that is not on the public internet". The owner's network answers name lookups with DNS64: next to a site's IPv4 address it adds a synthesized IPv6 address in `64:ff9b::/96` (the well-known NAT64 prefix, RFC 6052), whose last 32 bits are that same IPv4 address. Ordinary public sites such as github.com resolve this way, checked on 2026-10-17 with the same `getaddrinfo` call the server uses. Decision 3 refuses the whole prefix, because an IPv4 address hides inside it and `64:ff9b::7f00:1` would otherwise reach loopback through a translator, and it requires every address a name gives to be public. So on this network every site that has an IPv4 address fails, and the feature never works.

Decision 3 changes in one place:

1. **A NAT64 address is judged by the IPv4 address inside it.** An address in `64:ff9b::/96` is public when its last 32 bits, read as an IPv4 address, pass the check IPv4 addresses already pass (global, not multicast, not carrier-grade, and so on). `64:ff9b::808:808` is accepted; `64:ff9b::7f00:1` (loopback), `64:ff9b::a00:1` (private), `64:ff9b::a9fe:a9fe` (the metadata address) and the rest of the refused IPv4 ranges stay refused when written this way.
2. **Everything else in decision 3 stands.** Every address the name gives must still be public, so one non-public address in an answer still refuses the lookup. The IPv4-compatible form (`::/96`), 6to4 (`2002::/16`), Teredo, the local-use NAT64 prefix (`64:ff9b:1::/48`), IPv4-mapped addresses and the rest stay refused. The connection is still made to the address that was checked, with the name as `Host` and the certificate's name, so nothing about redirects, bounds, ports or what is read changes. The code change is the one function that judges an address, and no dependency.

Consequences: a lookup works on a network that translates IPv6 to IPv4 and on a plain one alike. The machine's connection to a NAT64 address goes through the network's own translator, which forwards to the checked IPv4 address; a translator can reach what the network lets it, but decision 3 has already required that address to be public, so the app asks it for nothing private. A hostile DNS server could answer with a NAT64 address whose IPv4 part is public, which it could equally do with any public address, so it gains nothing new. On a network with no translator the address does not connect and the next one is tried, as today.

Tests: `tests/test_lookup.py` moves `64:ff9b::808:808` from the refused list to the accepted one, and adds the refused embedded forms above and `64:ff9b:1::1`, a mixed answer (one NAT64 address with a public IPv4 part and one private) that is refused, and a changed DNS answer between the check and the connection that still cannot redirect it. The rule is checked against a weakened version with `scripts/mutate.py` (decision 12): a version that accepts the whole prefix must fail a test. No test reaches the real internet. `docs/reference/GOTCHAS.md` gets an entry saying that a lookup refused as "not on the public internet" on a network with DNS64 was this.

Alternatives rejected:

- **Keep refusing the prefix, and ask only for IPv4 addresses.** Resolving with `AF_INET` would skip the synthesized address, is a smaller change and cannot reach anything through a translator. It fails for a site or a network that has only IPv6, and the app would then be silent about why. It becomes right if reading the embedded address proves brittle, or if IPv6-only is never wanted.
- **Drop the non-public addresses and use the public ones left.** It makes a mixed answer work, but it was the rule "every address must be public" that makes a name that answers with both a private and a public address refuse. It becomes right only if real sites are found to answer that way.
- **A setting that allows the whole prefix.** The owner would carry a switch that reopens loopback and the local network through a translator. Never.
