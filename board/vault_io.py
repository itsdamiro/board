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
from collections.abc import Iterator

from board import moodboard
from board.moodboard import Block, MoodboardError

class NoteChanged(MoodboardError):
    """The note changed while the app was writing, so nothing was written; trying again is right."""


_lock = threading.Lock()  # one write at a time in this process; another program's edit is caught by the checks below


def _read(path: str) -> tuple[bytes, str]:
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw, raw.decode("utf-8")
    except UnicodeDecodeError as err:
        raise MoodboardError(f"{os.path.basename(path)} is not UTF-8 text") from err


def read_blocks(path: str) -> list[Block]:
    """The items of the note in file order. FileNotFoundError if it is missing; MoodboardError if it cannot be read safely."""
    return moodboard.parse(_read(path)[1])


def block_with_key(path: str, key: str) -> Block:
    """The block of the note with this key. Raises BlockNotFound. A bare hash that two blocks share gives the first: they share an address, so one lookup serves them all."""
    blocks = read_blocks(path)
    try:
        return blocks[moodboard.locate(blocks, key)]
    except moodboard.AmbiguousBlock:
        return next(b for b in blocks if b.key == key)


@contextlib.contextmanager
def hold_block(path: str, key: str) -> Iterator[Block]:
    """Hold the write lock and give the block with this key, found again under it: an add or a delete in this process cannot change the note until the caller is done. Raises BlockNotFound."""
    with _lock:
        yield block_with_key(path, key)


def append_block(path: str, block: str) -> None:
    """Add `block` (from moodboard.format_block) after the note's last line. Only the new bytes are written."""
    with _lock:
        raw, text = _read(path)
        added = moodboard.append(text, block)[len(text):].encode("utf-8")
        with open(path, "ab") as f:
            if os.fstat(f.fileno()).st_size != len(raw):
                raise NoteChanged("the note changed while it was being written; nothing was written, try again")
            f.write(added)


def _rewrite(path: str, change, what: str):
    """Rewrite the note with `change(text)`, which returns (new text, block), through a hidden temporary file in its own folder that is
    renamed over it (or deleted on failure). Refused if the note changed meanwhile. Returns the block."""
    with _lock:
        raw, text = _read(path)
        new_text, block = change(text)
        if new_text == text:  # nothing to change, so nothing is written
            return block
        real = os.path.realpath(path)  # a symbolic link is replaced through, not by, the temporary file
        fd, temp = tempfile.mkstemp(dir=os.path.dirname(real), prefix=".board-", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(new_text.encode("utf-8"))
            shutil.copymode(real, temp)
            if _read(real)[0] != raw:
                raise NoteChanged(f"the note changed while it was being written; nothing was {what}, try again")
            os.replace(temp, real)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(temp)
            raise
        return block


def delete_block(path: str, key: str) -> Block:
    """Remove the block with this key from the note and return it, so the caller can remove its image files."""
    return _rewrite(path, lambda text: moodboard.remove(text, key), "removed")


def replace_block(path: str, key: str, block: str, accept=lambda old: True) -> Block:
    """Replace the block with this key by `block` and return the old one (ADR 009). `accept(old)` is asked under the lock and
    raises to refuse, so the check and the write are one step."""
    def change(text: str) -> tuple[str, Block]:
        new_text, old = moodboard.replace(text, key, block)
        accept(old)
        return new_text, old
    return _rewrite(path, change, "changed")


def move_block(path: str, key: str, before: str | None) -> Block:
    """Move the block with this key to just before the block with key `before`, or to the end if that is None (ADR 001, amendment of
    2026-10-20), and return it. Nothing is written if it would stay where it is."""
    return _rewrite(path, lambda text: moodboard.move(text, key, before), "moved")
