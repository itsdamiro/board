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

## 2. Recipes

None yet.
