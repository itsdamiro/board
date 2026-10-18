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

## Amendment (2026-10-17): addresses are tried IPv4 first, each for at most two seconds

**Accepted by the owner on 2026-10-17, as drafted ("ok its accepted").**

Context: after the NAT64 amendment, the owner's lookups still showed no preview. Checked on 2026-10-17 with the server's own code on the owner's connection: the page fetch of a large public site worked and found its preview picture, but the picture's host (a content-delivery network) gives eight IPv6 addresses and then four IPv4 ones, and seven of the eight IPv6 addresses time out after four seconds each while the IPv4 ones connect in about a tenth of a second. Decision 3 connects to "the first checked address that answers", in the order the name gave them, and decision 5 allows eight seconds in all, so the budget ends on the second dead IPv6 address and the IPv4 ones are never tried. The same happens to a page whose own host lists IPv6 first. Decision 9 then drops the picture and keeps the title, which is what the owner saw.

Decision 3's order and decision 5's connect bound change, and nothing else:

1. **IPv4 addresses are tried before IPv6 ones**, each group in the order the name gave them. Every address is still checked first, by decision 3 and its NAT64 amendment, before any connection is made.
2. **Each connection attempt gets at most two seconds** (it was five) and never more than the time left of the eight. Reading is still five seconds per read, and the whole lookup is still eight seconds.

Consequences: a site is reached over IPv4 when the connection has a working IPv4 route, which is nearly everywhere, and over IPv6 or NAT64 when it does not, because a missing IPv4 route fails at once instead of waiting. On a connection where IPv4 is the dead one, each IPv4 address costs two seconds before IPv6 is tried, so a name with four dead IPv4 addresses spends the whole budget; that is rare and gives a bare item as today. A site that is slow to accept a connection, over two seconds, no longer gets a preview, where five seconds would have let it through.

Tests: in `tests/test_lookup.py`, a name that gives IPv6 addresses before IPv4 ones is connected to over IPv4 first, with every address still checked and a refused one still refusing the name; an IPv4 address that does not answer is followed by the IPv6 one; each attempt's timeout is two seconds, or the time left if that is less; the order inside each family is the name's. Each rule is checked against a weakened version with `scripts/mutate.py` (decision 12). No test reaches the real internet. `docs/reference/GOTCHAS.md` gets an entry for a title that comes without its picture on a connection whose IPv6 addresses time out.

Alternatives rejected:

- **Racing the addresses at once (happy eyeballs, RFC 8305).** The best behaviour for the user and the standard for browsers, but it opens several connections and needs threads, a second state to test and to bound. It becomes right if ordering and two seconds prove too slow or too brittle.
- **Asking the system for IPv4 addresses only.** Smaller, but it fails for a site or a network that has only IPv6, including the NAT64 networks the first amendment serves. It becomes right if IPv6-only is never wanted.
- **Keeping the order and raising the eight seconds.** The add would wait longer for every dead address, and the owner is waiting on the page meanwhile. Never.

## Amendment (2026-10-17): the picture is the site's icon, not its `og:image`

**Accepted by the owner on 2026-10-17, after asking for it in chat ("might as well use the favicon, not just a fallback") and accepting the draft ("Accepted").**

Context: the owner's first real lookups on 2026-10-17 kept a title and no picture. Checked with the server's own code: one site's `og:image` is an SVG, which decision 5 ignores, and another's is served by an image host that answered 429 (a rate limit that lasts fifteen minutes); an earlier lookup of a large site took 6.2 s of the eight, nearly all of it the picture. The `og:image` is the part of a lookup that fails most, takes longest and cannot be predicted: it can be a banner, a photograph, a logo or a text on a colour, any size, and the card has to be built for all of them. A site's icon is small, fast, nearly always there and always the same kind of thing, so a card can be built for it.

Decisions 5, 6 and 7 change in these places, and nothing else:

1. **The picture is the page's icon.** `og:image` is no longer read or fetched. The candidates are, in this order: the page's `<link rel="apple-touch-icon">` (and `apple-touch-icon-precomposed`), then its `<link rel="icon">` (and `shortcut icon`, `alternate icon`), each group in the page's order, then `/favicon.ico` on the page's final address. A candidate whose `type` is `image/svg+xml` or whose path ends in `.svg` is skipped. The first candidate that gives an image is kept; at most three candidates are asked for, one request each, each through decisions 3 to 5 from the start (so each is resolved, checked and bounded like the page). Only `<link>` tags in the head are read, as before.
2. **What counts as an icon.** PNG, JPEG, WebP and GIF as before, by the first bytes, and now also ICO (a `.ico` file, `00 00 01 00`), which Pillow decodes; its largest image is taken. The bytes are at most 1 MB (it was 5 MB for a preview), and the pixel limit of decision 5 applies before decoding. An ICO is kept as a PNG thumbnail; the others as before, never enlarged. The original is not kept.
3. **What the API and the vault keep** does not change in shape: `preview` in the item and `preview` in `links/<hash>.json` now hold the icon, and `<hash>.<ext>` is its thumbnail. A lookup kept before this amendment holds an `og:image` thumbnail; it is shown as it is, in the new small place, until the item is deleted.
4. **The page shows it small** (ADR 002, amendment of the same date), not as the picture of the card.
5. **The log** says the HTTP status when a candidate is refused for it (for example `answer other than 200 (429)`), and still never the address.

Consequences: a card gets the site's own mark next to its title instead of a picture that may be a banner or nothing. A lookup is faster, since an icon is small and the 5 MB download is gone, and it fails less. A site with no icon gets the title alone. An icon is a logo, so it is less informative than a screenshot; a page capture stays a later, separate decision (decision 4 of the alternatives, and ADR 001, decision 7). Up to three more requests are made per lookup than with one `og:image` (the same host usually, so at most one more name lookup), still inside the eight seconds.

Tests: `tests/test_lookup.py` replaces the `og:image` cases with the icon cases: the order of the candidates; an SVG skipped for the next; `/favicon.ico` asked for last, after the links; at most three asked for; an ICO taken as a PNG, its largest image; the 1 MB limit exact; the pixel limit; a candidate on another host or through a redirect to a non-public address checked and refused; `og:image` no longer asked for; the status in the log. Each rule is checked against a weakened version with `scripts/mutate.py` (decision 12). No test reaches the real internet. `docs/reference/GOTCHAS.md` gets an entry for a card with a title and no icon.

Alternatives rejected:

- **`og:image`, with the icon as a fallback.** Keeps the larger picture where it works, but the card then has to be built for any size and shape, and the part that fails most stays. It becomes right if the owner wants the banner where a site has one.
- **Both, the icon small and the `og:image` large.** Two pictures to fetch, store and lay out. Never for now.
- **Rendering an SVG icon.** Needs a renderer (a new dependency with its own record) and runs a file's own markup. Sites that give only an SVG get the title alone.
- **A screenshot of the page.** Needs a browser that runs the page; see the alternatives above and ADR 001, decision 7.

## Amendment (2026-10-17): the lookup is a call of its own, so an add never waits for it

**Accepted by the owner on 2026-10-17, after asking for it in chat ("instead of waiting for image to load, it should go ahead and accept the enter key") and accepting the draft ("Accepted. Build it.").**

Context: decision 5 has the add wait for the lookup, up to eight seconds, and the page locks its box meanwhile (`busy`), so the owner cannot press Enter again or paste the next address until it is done. A large site takes four to six of those seconds (checked 2026-10-17: github.com, 4.6 to 6.2 s on three runs, and once a page timeout). The first version of this record named the fix: "Looking up in the background so the card gets its title a few seconds later avoids the wait and costs a second state to test; it becomes right if the wait annoys." The owner says it does. The description stays required, as before.

Decisions 1 and 5 change in these places, and nothing else:

1. **The add does not look anything up.** `POST /api/brands/<slug>/items` writes the item and answers at once, with `title` and `preview` null. The `lookup` field is removed from it; a body that still has one is accepted and the field is ignored.
2. **A new call does the lookup:** `POST /api/brands/<slug>/items/<key>/lookup`, with the key the add's answer gave. It answers 200 with the item as the brand view shows it, after at most eight seconds. It is for an item that has an address and no image of its own (anything else is 422), and the item must still be in the note, unchanged (otherwise 409, as for a delete); a text added twice has one key and one address, so one lookup serves both copies. An address already looked up in that brand is not fetched again (decision 1): the answer is the item as it is. A failure is silent, as decision 9 says: 200, `title` and `preview` null.
3. **Nothing is kept for an item that has gone.** Once the answer is in, the server takes the lock a delete and an add take, checks that the item is still in the note and unchanged, and keeps the lookup under that same lock; a delete cannot fall between the check and the keeping. If the item went or changed, nothing is kept and the call answers 409. Two lookups of one address that overlap keep it once. (The first draft of this amendment kept first and checked after, leaving a window; the lock closes it.)
4. **The page asks for the lookup after the add, without waiting.** If the checkbox is checked and the item has an address and no picture, the page sends the call once the add's answer is in, and the box is free at once for the next item. The card shows a small "Looking up the page…" line (ADR 002, amendment of the same date) until the call answers, then takes the title and icon. If the page is closed first, the server still finishes the lookup and keeps it; the page shows it the next time the brand is opened. If the add's own answer already shows a title or icon (the address was kept before), the page sends nothing. If the call fails, the item stays as it was added.
5. **Everything else in decision 5 stands:** five seconds a read, two seconds a connection attempt, eight seconds in all, the size limits and the refusal of any address that is not public.

Consequences: Enter is accepted at once and the owner can add the next item while earlier ones are still being looked up; a card may be bare for a few seconds and then gain its title and icon. The server stays stateless: no background thread, no queue, nothing to lose at a restart (a lookup in flight when the server stops is not made, and the item stays as added). A second client, such as the extension, can add without waiting and look up later, or never. The cost is one more route and one more state on the page, both tested.

Tests: in `tests/test_items.py` and `tests/test_server.py`, an add makes no request (a lookup function that fails the test if called); the lookup call keeps a title and icon and returns the item; an address already kept is not fetched again; an item with an image, or with no address, is 422; a changed or missing key is 409; an item deleted while the fetch is in flight keeps no files; a failed lookup is 200 with nulls; a body with `lookup` still adds. In the page tests, Enter clears the box before the lookup answers, two adds can have lookups in flight together, and a card shows the waiting line and then its title. The end-to-end test keeps a lookup against the local test server without reaching the internet. Each rule is checked against a weakened version with `scripts/mutate.py` (decision 12). `docs/reference/API.md` and the handoff are updated.

Alternatives rejected:

- **A thread in the server that looks up after the add.** The add answers at once with no second call, but the server holds state (what is pending, what to do at a restart, who is told when it is done), and the page would have to poll. It becomes right if a client other than the page needs lookups it did not ask for.
- **The page keeps the add's request open and only frees the box.** No server change, but the eight seconds still hold a request and the card is not in the list until it ends; a closed page loses the item. Never.
- **Looking up when a brand is opened, for every bare item.** Decision 1 says never, and it would send many requests the owner did not start.

## Amendment (2026-10-17): an SVG icon is taken, untouched, if it passes a strict check, and is only ever shown through an `<img>`

**Asked for by the owner on 2026-10-17 ("Yes: draft an ADR 008 amendment to show SVG icons, then implement it. Prefer showing the SVG untouched through an img tag if that is safe; tell me the risks first"). The risks were given in chat before the build; this draft is built on that go-ahead and waits for the owner to read it.**

Context: the owner's lookup of a game's site on 2026-10-17 kept a title and no icon. Checked with the server's own code: the page's only icon link is an SVG (`<link rel="icon" href="….svg">`, served as `image/svg+xml`, 2.4 KB) and `/favicon.ico` on that site answers 404, so the earlier amendment of the same date, which skips every SVG candidate, left nothing. SVG is how many current sites ship their icon. The earlier amendment rejected "rendering an SVG icon" because it needs a renderer and "runs a file's own markup"; this one needs no renderer, since the browser draws it, and the markup is not run but checked before it is kept and never given the chance to run when it is shown.

Decisions 5 and 6, and the earlier amendment's rule 1 and 2, change in these places, and nothing else:

1. **An SVG is a candidate like any other.** The skip of a `type="image/svg+xml"` link and of a path ending in `.svg` is removed. The order of the candidates, the limit of three and the checks of decisions 3 to 5 for every request are unchanged. The `Accept` of the request gains `image/svg+xml`.
2. **An SVG is known by its content, not by what the site says.** After an optional byte-order mark, white space, an XML declaration and comments, the file must start with `<svg`. The file is at most 100 KB (`svg.MAX_BYTES`), valid UTF-8 and well-formed XML.
3. **It is kept only if it passes this check, and is then kept byte for byte** as `links/<hash>.svg`, not rewritten and not re-encoded. A file that fails is refused whole, as any other bad icon is: the next candidate is tried, and the item gets the title alone if none works. The check refuses the forms below. It is a list of what is refused, so a form of markup nobody thought of is not refused by it; it is the second of two layers, and decision 4 is the first.
   - a document type, an entity declaration or any processing instruction other than the XML declaration (this closes entity expansion and `xml-stylesheet`);
   - a root that is not `svg` in the SVG namespace, and more than 5,000 elements;
   - any element named `script`, `foreignObject`, `image`, `a`, `animate`, `animateMotion`, `animateTransform`, `set`, `handler`, `listener`, `iframe`, `object` or `embed`, in any namespace, and any element in the XHTML namespace;
   - any attribute whose name starts with `on`;
   - any `href` or `xlink:href` whose value does not start with `#` (a leading space counts against it), so a file can point only inside itself;
   - in any attribute value and in a `<style>` element (a presentation attribute is read as CSS): `@import`, a backslash (CSS escapes), `expression(`, `javascript:`, and any `url(` whose argument does not start with `#`.
4. **It is only ever shown as an image.** The page draws it with `<img>`, where a browser runs no script, loads nothing outside the file and takes no input; the card does not change (ADR 002, amendment of the same date, 32 px). The route that serves it answers with `Content-Type: image/svg+xml`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`, instead of the page's policy. So a person who opens the address directly in a tab gets a document with an opaque origin that cannot run script, load anything or reach the API; without that header, a script in an SVG opened as a page would run on the app's own origin. The viewer does not open it (decision 8).
5. **What the API and the vault keep** do not change in shape. `preview.width` and `preview.height` of an SVG come from its `width` and `height` in pixels or unitless, else its `viewBox`, else 32. `links/<hash>.json` may now hold `"preview": "svg"`. What is read back from `links/` is still treated as untrusted: an SVG file in it is checked again when its size is read, and one that fails is as good as missing. A pasted or dropped image is still never an SVG (`images.sniff` is unchanged; ADR 001, decision 9 keeps vector assets for an Assets section).
6. **The log** names the kind of refusal for an SVG ("an SVG that is not taken: a script") and never the address.

Consequences: a card gets the mark of a site that gives only an SVG. The vault now holds a file written by someone else's server, as it already holds their title and a thumbnail of their picture, but this one is not re-encoded, so a tool that opens `Board/<slug>/links/*.svg` shows exactly what the site sent; the check keeps that file free of script and of references to anything outside it, which also covers a viewer outside the app that ignores the headers. A site can send a complex or misleading drawing within 100 KB and 5,000 elements; it is drawn at 32 px in a tab that can stop it. Items already kept with a title and no icon are not looked up again (decision 1): delete and add them again. A dark logo on the dark theme can be hard to see, as a dark PNG already can.

Tests: `tests/test_svg.py` checks each refused form above on its own, one passing icon of each common shape (a plain one, one with a gradient and `url(#id)`, an editor's with a `metadata` block and extra namespaces, one with an XML declaration and comments, one with a byte-order mark) and the limits exact (100 KB, 5,000 elements); `tests/test_lookup.py` takes an SVG by its content whatever the `Content-Type`, refuses a script-bearing one for the next candidate, and keeps the file untouched; `tests/test_links.py` stores, reads and removes an SVG and ignores one that was edited by hand to fail the check; `tests/test_server.py` serves it with the three headers above and still refuses an SVG as a pasted image. Each rule is checked against a weakened version with `scripts/mutate.py` (decision 12). No test reaches the real internet. `docs/reference/GOTCHAS.md` and `docs/reference/API.md` are updated.

Alternatives rejected:

- **Rewriting the SVG with a sanitizer.** It would keep more files, but it needs a dependency (ADR 001, decision 11) or a hand-written one, changes the file the site sent, and a sanitizer that misses a form is a script in the vault. Refusing what the check does not accept is smaller and the file stays the site's.
- **Drawing the SVG into a PNG on the server.** Needs a renderer such as cairo (a dependency with its own record) and runs the file's markup on the server. Never for an icon.
- **Taking an SVG and trusting `<img>` alone.** It is safe in the page, but the file also sits in the vault and has its own address on the server; the check and the sandbox header cover those two places. Either layer alone would be one bug from a hole.
- **Preferring a PNG icon over an SVG one when a page gives both.** A raster icon is re-encoded by Pillow, so it is the safer file, but it changes the order that the earlier amendment fixed and costs a request when the SVG is the better icon. It becomes right if an SVG icon is found to draw badly at 32 px.

## Amendment (2026-10-18): four findings of the review are closed

**Drafted on the owner's go-ahead of 2026-10-18 ("ok lets do that", taking the order the handoff recommended). The choice in rule 4 (a version in the icon's address) was mine, not the owner's, and waits for the owner to read it.**

Context: the high-effort review of 2026-10-18 left five findings open. Four belong to this record. Checked with the code and Python 3.14 on 2026-10-18: `ipaddress.ip_address("fec0::1").is_global` is `True`, so a site-local IPv6 address passes decision 3; a page that names its encoding only in `<meta charset>` is read as UTF-8 (`_read_head` looks at the header alone); `links.store` opens every file with mode `"x"`, so one stray `<hash>.json` or `<hash>.<ext>` makes every later keep of that address raise `FileExistsError`, which `_keep` logs and swallows, and `links.has` is false for such a file, so the lookup is asked for again each time and fails each time; and the icon's address is `links/<hash>.<ext>` served as `private, max-age=31536000, immutable`, which is right for an image named by its own id and wrong for an icon named by the address alone, because a deleted and re-added address is the same URL with different bytes. A first answer to this finding (an `ETag` and a 304 on each use) was dropped after review: a browser that already holds an immutable answer never asks again, so it would not have reached the icons the owner's browser has already cached.

Decisions 3 and 6 and the amendment of 2026-10-17 on SVG change in these places, and nothing else:

1. **Site-local IPv6 is not public.** `fec0::/10` is added to the ranges decision 3 refuses (the list that already holds `::/96`). The rest of decision 3 stands.
2. **The page's own charset is read.** The encoding is, in this order: the `charset` of the `Content-Type` header, if Python knows the name; else the `charset` attribute of a `<meta>` tag, or the charset in the `content` of a `<meta http-equiv="content-type">`, within the first 1,024 bytes of the page (read as attributes by `html.parser`, so a `charset=` in the text of some other meta tag is not taken); else UTF-8. A meta tag that says UTF-16 or UTF-32 is read as UTF-8, as browsers do, because the tag itself had to be read as ASCII. A name Python does not know is skipped. Nothing is run or fetched to find it.
3. **A leftover file does not block a keep.** When `links.store` is asked to keep an address that has no valid record (`links.has` is false), it first removes any `<hash>.json` and `<hash>.<ext>` that are there (they are not a record this module reads, so they are as good as missing) and then writes the two files as before, each opened with `"x"`. It still never writes over a valid record: with one present it writes nothing and returns False. It only ever touches the sixteen-character names that `name_of` makes for the address being kept.
4. **A link icon's address carries a version.** `preview.url` becomes `/api/brands/<slug>/links/<hash>-<version>.<ext>`, where `<version>` is the thumbnail file's modification time in nanoseconds, in hex. A file kept again for the same address is a new file with a new time, so it is a new address for the browser, and the old immutable answers in the browser's cache are never asked for again. The route accepts the version (1 to 20 hex characters) and does not read it: any version serves the file, and gets the year's cache; the old form without one still serves the file, with `Cache-Control: private, no-cache`, so a hand-typed or remembered address never goes stale. Nothing on disk changes: the file is still `<hash>.<ext>`, and no kept lookup needs a migration.

Consequences: a failed keep that used to repeat for ever now mends itself on the next lookup, at the price of deleting a stray file the owner may have put there by hand under a name only this app makes. A re-added address shows its new icon on the next load, also in a browser that has cached the old one, and no icon is asked for twice. The brand view stats each icon file (it already opened it to read its size). A copy of the vault that loses modification times (a restore that sets them all to one value) keeps the addresses stable, which is the old behaviour. A page in a legacy encoding with no header gets its title right.

Tests: `tests/test_lookup.py` (`fec0::1` and the ends of the range refused; a meta charset in both forms read, the header winning over the meta, a meta after 1,024 bytes ignored, UTF-16 and UTF-32 read as UTF-8, a `charset=` in another meta tag's text not taken, an unknown header charset leaving the meta to decide); `tests/test_links.py` (a stray picture, a stray record and an invalid record are replaced and the address is kept; a valid record is never replaced and nothing is written; no file of another address is touched; the version is the file's time and changes when the file is kept again); `tests/test_server.py` and `tests/test_items.py` (a versioned address is served with the year's cache, any version gets the file, one without gets `no-cache`, a bad version is 404, a re-kept icon is at another address and the old one is 404). Each rule is checked against a weakened version with `scripts/mutate.py` (decision 12). `docs/reference/API.md` and `docs/reference/GOTCHAS.md` are updated.

Alternatives rejected:

- **`no-cache` with an `ETag` and a 304 on each use.** Built first and dropped after review: it asks again for every icon whenever a brand is opened, and it does not reach an icon the browser already holds as immutable. It becomes right if modification times cannot be trusted.
- **The hash of the file's bytes as the version.** Exact, but it means reading every thumbnail on each brand view. Right if a modification time proves not to change when a file is replaced.
- **A shorter `max-age`.** One line, but it still shows the old icon for that time after a re-add. Never.
- **Deleting the leftovers when a delete runs, not when a keep runs.** A stray file would still block until the owner deleted something. Never.
- **Sniffing the encoding with a library.** Handles more pages, adds a dependency (ADR 001, decision 11) for what a header and a meta cover.
