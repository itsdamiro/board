"""Read and write one Moodboard note on disk, using the text functions of moodboard.py.

The caller decides which note: it must already have turned a brand's slug into a path and checked that the path stays
inside the vault's `Brands/<slug>/` folder (slice 3). Nothing here creates a note; a missing one is FileNotFoundError.
Both functions refuse if the file changed between their read and their write, so an edit made at the same moment in
Obsidian or Sympose is not lost; the check is not atomic, so a change in the instant between it and the write is not seen.
"""

from __future__ import annotations

import contextlib
import os
import shutil
import tempfile
import threading

from board import moodboard
from board.moodboard import Block, MoodboardError

_lock = threading.Lock()  # one write at a time in this process; another program's edit is caught by the checks below


def _read(path: str) -> tuple[bytes, str]:
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw, raw.decode("utf-8")
    except UnicodeDecodeError as err:
        raise MoodboardError(f"{os.path.basename(path)} is not UTF-8 text") from err


def append_block(path: str, block: str) -> None:
    """Add `block` (from moodboard.format_block) after the note's last line. Only the new bytes are written."""
    with _lock:
        raw, text = _read(path)
        added = moodboard.append(text, block)[len(text):].encode("utf-8")
        with open(path, "ab") as f:
            if os.fstat(f.fileno()).st_size != len(raw):
                raise MoodboardError("the note changed while it was being written; nothing was written, try again")
            f.write(added)


def delete_block(path: str, key: str) -> Block:
    """Remove the block with this key from the note and return it, so the caller can remove its image files.

    The note is rewritten through a hidden temporary file in its own folder, which is renamed over it (or deleted on failure).
    """
    with _lock:
        raw, text = _read(path)
        new_text, block = moodboard.remove(text, key)
        real = os.path.realpath(path)  # a symbolic link is replaced through, not by, the temporary file
        fd, temp = tempfile.mkstemp(dir=os.path.dirname(real), prefix=".board-", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(new_text.encode("utf-8"))
            shutil.copymode(real, temp)
            if _read(real)[0] != raw:
                raise MoodboardError("the note changed while it was being written; nothing was removed, try again")
            os.replace(temp, real)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(temp)
            raise
        return block
