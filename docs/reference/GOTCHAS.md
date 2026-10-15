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

## 2. Recipes

None yet.
