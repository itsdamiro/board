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

## 2. Recipes

None yet.
