# Gotchas and recipes

> Copy to `docs/reference/GOTCHAS.md`. The durable half of the handoff: traps that have already cost time, and the exact recipe for each recurring chore. One entry per trap, each with the symptom, the cause and the fix. When an entry stops being true, delete it.

## Contents
1. Traps
2. Recipes

## 1. Traps

### The mutation check hangs on a mutant that makes the code block
- **Symptom:** `scripts/mutate.py` prints nothing for minutes and the run never ends.
- **Cause:** the script has no timeout. A mutant that removes a guard can make the code wait forever, for example opening a named pipe for reading (`tests/test_vault.py`, `test_a_named_pipe_is_never_opened`).
- **Do this:** find the test process (`ps aux | grep unittest`) and kill that one process; the script then counts the mutant as caught and goes on. Never kill the script itself while it has a mutant applied: it puts the file back only when it finishes. A test that can block must fail instead of hanging (a helper thread opens the other end), as the pipe test does.

### A control character typed as an escape in a Python string can be written as the real character
- **Symptom:** a mutant on a line with `"\ufeff"` reports NOMATCH although the text looks identical, and `grep` shows an invisible character where the escape should be.
- **Cause:** the file-writing tool turned the escape into the actual character (U+FEFF, the byte-order mark).
- **Do this:** after writing code that holds such an escape, run `grep -c $'\xef\xbb\xbf' <file>`; it must print 0. Fix a hit with a short Python script that replaces the character with a backslash and `ufeff`.

### Several requests at once reset or fail
- **Symptom:** a test that adds eight items at the same time gets `Connection reset by peer`, or one of them a 500, on some runs only.
- **Cause:** two separate things. `socketserver`'s listen backlog is 5, and macOS resets the connections past it (fixed: `request_queue_size = 64` in `BoardServer`). And two requests creating `Board/<slug>` at once: the second `os.mkdir` raised `FileExistsError` (fixed in `images._real_folder`). The check after the mkdir still applies, so a folder made by someone else is still refused if it is a link.
- **Do this:** a test for concurrency has to run several times to show a flaw: `for i in 1 2 3 4 5 6; do .venv/bin/python -m unittest tests.test_server.AddTest.test_several_adds_at_once_all_land; done`.

### The tests need the virtual environment
- **Symptom:** `python3 -m unittest` fails on `import PIL` from a clean checkout.
- **Cause:** Pillow is installed only in `.venv` (ADR 001, amendment on slice 3a); the system `python3` has none.
- **Do this:** make `.venv` as the README says and run `.venv/bin/python -m unittest ...`; `scripts/gates.conf` already does.

### The page's gates and scripts run on whatever Node the shell has
- **Symptom:** `npm run build` or `scripts/gates` behaves oddly, or fails, in a fresh terminal, though `npm ci` once worked.
- **Cause:** a new shell starts on the nvm default, which on this machine is Node 20, not the pin (ADR 005). npm checks `engines` only when installing (`npm ci`), not when running a script, so the scripts start on the wrong Node without a word.
- **Do this:** run `nvm use` in the repository first (it reads `.nvmrc`); check with `node -v` (24.x). A shell without nvm loaded (a script, a tool) needs `. "$NVM_DIR/nvm.sh"` before `nvm use`.

### A page that works in the dev server can break under the real server's Content-Security-Policy
- **Symptom:** the page is fine on `npm run dev` and loses fonts, a script or its theme in the built page.
- **Cause:** the dev server sends no policy, and the Python server's is `default-src 'self'; img-src 'self' blob:` (ADR 002, decision 6): no inline script, no inline style attribute, no `data:` URI. Vite inlines small assets as `data:` by default (fonts included), and an inline `<script>` for the theme would be refused.
- **Do this:** keep `build.assetsInlineLimit: 0` in `web/vite.config.ts`, keep the theme script a file (`web/public/theme-init.js`), and set styles with classes or the style object in script, not a `style=` attribute in markup. Check a built page against the policy: run the real server (`python -m board --vault <a synthetic vault>`), open its address and read the console, which reports each violation as an error.

### The end-to-end gate tests the build that is there, not the source
- **Symptom:** `npm run e2e` passes or fails on a page that does not match the source you just edited.
- **Cause:** the suite builds nothing (ADR 006, decision 3); it serves whatever `web/dist/` holds. `scripts/gates` runs `web-build` before `e2e`, but `npm run e2e` alone does not. It also needs Chromium (`npx playwright install chromium` in `web/`, with the owner's go-ahead) and `.venv` for the server.
- **Do this:** run `npm run build` first, or `scripts/gates web-build e2e`. The suite stops with a message if `web/dist/index.html` or `.venv` is missing.

### A Radix Select, a modal menu or a modal dialog writes a style element, which the policy refuses
- **Symptom:** opening a shadcn `Select` logs "Applying inline style violates the following Content Security Policy directive" twice in the console, though the page looks right in `npm run dev`.
- **Cause:** Radix's Select writes a `<style>` element for its viewport, and its modal mode (and the modal menu's and the modal dialog's) another to lock the page's scroll; the server's policy has no `style-src`, so `default-src 'self'` blocks both.
- **Do this:** use `DropdownMenu` and `Dialog` with `modal={false}` (`web/src/components/ui/dropdown-menu.tsx`, `dialog.tsx`; a non-modal dialog draws no overlay, so its content is the backdrop), and open each new Radix component in the built page, with the console open, before trusting it. The e2e test of the brand menu fails on such an error.

### Tailwind 4's `columns-72` is 72 columns, not 18 rem
- **Symptom:** a card grid made with `columns-72` shows images collapsed to nothing.
- **Cause:** in Tailwind 4 a number after `columns-` is a column count; only the names (`columns-xs`) and brackets are widths.
- **Do this:** write the width as `columns-[18rem]`, or set `columns` in a style object, and look at the built CSS (`grep -o 'columns:[^;}]*' web/dist/assets/*.css`).

### On macOS `Cards.tsx` and `cards.ts` are one file name to TypeScript
- **Symptom:** `tsc` reports "Already included file name ... differs only in casing" and the default export is missing.
- **Cause:** the disk is case-insensitive, so an import of `./Cards` can resolve to either file.
- **Do this:** never give a component and a module the same name apart from case; this repository calls the module `cardOrder.ts`.

### Every lookup is refused as "not on the public internet" on a network with DNS64
- **Symptom:** an address is added but no title or preview comes, and the server prints `address lookup of the page failed: address that is not on the public internet`, for ordinary public sites.
- **Cause:** the network's DNS adds a synthesized IPv6 address in `64:ff9b::/96` (NAT64) next to a site's IPv4 address. Until ADR 008's amendment of 2026-10-17 the check refused that whole prefix, and one refused address refuses the name. Now such an address is judged by the IPv4 address in its last 32 bits (`_is_public` in `board/lookup.py`).
- **Do this:** to see what a name gives, run `.venv/bin/python -c "import socket; print([a[4][0] for a in socket.getaddrinfo('example.com', 443, type=socket.SOCK_STREAM)])"`; an address starting `64:ff9b::` is NAT64, and the last two groups are the IPv4 address in hex. If the lookup is still refused, one of the other addresses is not public, and that is the rule working.

### A title comes without its picture on a connection whose IPv6 addresses time out
- **Symptom:** an address is added with its title but no preview picture, and the server prints `address lookup of the preview failed: network or protocol error (TimeoutError)`, or the whole lookup fails with `took too long`, for sites that work in a browser.
- **Cause:** a name, often a content-delivery network's, gives several IPv6 addresses and then IPv4 ones. On a connection with no working IPv6 route each IPv6 address waits for its connect timeout, and the eight seconds of the lookup are gone before an IPv4 address is tried. Until ADR 008's second amendment of 2026-10-17 the addresses were tried in the order DNS gave them, each for five seconds; now IPv4 comes first and an attempt takes at most two seconds (`_open`, `ATTEMPT_TIMEOUT` in `board/lookup.py`).
- **Do this:** to see which addresses answer, run `.venv/bin/python -c "import socket,time; [print(a[4][0], time.time()) for a in socket.getaddrinfo('example.com', 443, type=socket.SOCK_STREAM)]"` and connect to each with `socket.create_connection((ip, 443), 4)`, timing it. If every address fails or the connect takes over two seconds, the network is the cause and the item stays bare, as ADR 008 decision 9 says.

### A card has a title and no icon
- **Symptom:** an address is added with its title and no small icon, and the server prints `address lookup of the preview failed: ...` (nothing is printed when the guessed `/favicon.ico` is simply missing, 404).
- **Cause:** since ADR 008's amendment of 2026-10-17 the picture is the page's icon, not its `og:image`. The candidates are the page's apple-touch-icon, then its icon links, then `/favicon.ico`, three tries at most, and an SVG icon is taken only if it passes `svg.check`. `answer other than 200 (429)` means the icon's host is rate limiting this computer (GitHub's asset host does, for fifteen minutes); `not an image that is taken` means the file is not a PNG, JPEG, WebP, GIF or ICO (or is over 1 MB); an SVG that fails the check logs `an SVG with a <thing> is not taken` (a `script`, `foreignObject`, `image` or `a` element, an `on…` attribute, a `href` or `url(` that leaves the file, a document type, more than 100 KB or 5,000 elements) and the next candidate is tried, so a site whose only icon is such an SVG gets the title alone. A site whose SVG is fine but whose card still shows no icon was looked up before the SVG amendment: delete the item and add it again.
- **Do this:** look at the page's head with `.venv/bin/python -c "import re,urllib.request as u; print(re.findall(r'<link[^>]*icon[^>]*>', u.urlopen('https://example.com').read(300000).decode('utf-8','replace'), re.I))"` (replace the address, and do not do it for an address behind a login), then fetch each candidate and read the status. An item that was kept without an icon is not looked up again (ADR 008, decision 1): delete it and add it again.

## 2. Recipes

None yet.
