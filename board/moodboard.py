"""The Moodboard note's block format, as text in and text out (workflow ADR 018 decision 5; docs/reference/VAULT_LAYOUT.md).

A note lists items as blocks separated by a blank line. A block is an optional embed line (`![[<id>.<ext>]]`), the
description (any number of lines), and an optional last line `[source](<url>)`. This module reads blocks, builds one,
and returns a note's new text for an append or a removal. It touches no file: vault_io.py does that.

What it promises, each with a test:
- append only adds text after the existing text, never changes what is already there;
- remove deletes the lines of one block, plus at most one blank line, and nothing else;
- replace swaps the lines of one block for the lines of another and changes nothing else (ADR 009, the card's edit);
- move puts one block's lines just before another block's, or at the end, and changes no byte of any block (ADR 001, amendment of 2026-10-20);
- a block is found by the hash of its exact text, so a block edited since it was shown is refused;
- a text it cannot place safely (frontmatter never closed) is refused, not guessed at.
A heading block and the frontmatter are not items; a heading block is a first line starting with `#` and every line under
it up to the next blank line, so an item typed directly under a heading is hidden with it. A `[source](...)` line that is not an
http or https address is left in the description as text, so the page never turns it into a link.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

ID_PATTERN = r"[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9a-f]{4}"  # 2026-10-15-1432-a3f9: the only embed id the app makes or deletes files for
EXTENSIONS = ("png", "jpg", "jpeg", "webp", "gif")

_EMBED = re.compile(rf"!\[\[(?P<name>[^\]|#]+?)\.(?P<ext>{'|'.join(EXTENSIONS)})(?:\|[^\]]*)?\]\]\s*", re.I)
_SOURCE = re.compile(r"\[source\]\((?P<url>[^()\s]+)\)\s*")
_ID = re.compile(ID_PATTERN)
_HEADING = re.compile(r"#{1,6}(?:\s|$)")


class MoodboardError(ValueError):
    """The text cannot be read or changed safely, or the input cannot be written as a block."""


class BlockNotFound(MoodboardError):
    """No block has this key now: it was changed or removed since it was shown."""


class AmbiguousBlock(MoodboardError):
    """More than one block has this exact text, so one cannot be picked."""


@dataclass(frozen=True)
class Block:
    start: int  # index of the first line, in text.split("\n")
    end: int  # index after the last line
    text: str  # the block's lines joined with "\n", without carriage returns
    key: str  # sha256 of text
    embed: str | None  # the embed line as written, if the first line starts with `![[`
    image_id: str | None  # the id inside the embed, only if it is one this app makes
    ext: str | None
    description: str
    source: str | None


def _blank(line: str) -> bool:
    return not line.strip()


def _web_address(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:  # a hand-written address such as http://[x
        return False
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def _first_line(lines: list[str]) -> int:
    """Index of the first line after the frontmatter. Raises MoodboardError if the frontmatter is never closed."""
    if not lines or lines[0].lstrip("\ufeff").rstrip() != "---":
        return 0
    for i in range(1, len(lines)):
        if lines[i].rstrip() == "---":
            return i + 1
    raise MoodboardError("the note's frontmatter is never closed, so where the items start is unknown")


def _block(lines: list[str], start: int, end: int) -> Block:
    own = [line.rstrip("\r") for line in lines[start:end]]
    text = "\n".join(own)
    embed = image_id = ext = None
    body = own
    if own[0].startswith("![["):
        embed, body = own[0], own[1:]
        found = _EMBED.fullmatch(embed)
        if found and _ID.fullmatch(found["name"]):
            image_id, ext = found["name"], found["ext"].lower()
    source = None
    found = _SOURCE.fullmatch(body[-1]) if body else None
    if found and _web_address(found["url"]):
        source, body = found["url"], body[:-1]
    return Block(start, end, text, hashlib.sha256(text.encode()).hexdigest(), embed, image_id, ext, "\n".join(body), source)


def parse(text: str) -> list[Block]:
    """The items of a note, in file order. Raises MoodboardError if the frontmatter is never closed."""
    lines = text.split("\n")
    blocks, i = [], _first_line(lines)
    while i < len(lines):
        if _blank(lines[i]):
            i += 1
            continue
        j = i
        while j < len(lines) and not _blank(lines[j]):
            j += 1
        if not _HEADING.match(lines[i]):
            blocks.append(_block(lines, i, j))
        i = j
    return blocks


def format_block(description: str, image_id: str | None = None, ext: str | None = None, source: str | None = None) -> str:
    """One block as text, lines joined with "\\n". It is only returned if `parse` reads it back as exactly the item given.

    Raises MoodboardError otherwise: a description of several lines, one that starts with # or ![[ or is a [source](...)
    line, an id or extension this app does not make, an address that is not http or https or has spaces, or nothing at all.
    """
    description = description.strip()
    if "\n" in description or "\r" in description:
        raise MoodboardError("a description is one line")
    lines = [f"![[{image_id}.{ext}]]"] if image_id is not None or ext is not None else []
    if description:
        lines.append(description)
    if source is not None:
        source = source.strip().replace("(", "%28").replace(")", "%29")
        lines.append(f"[source]({source})")
    text = "\n".join(lines)
    try:
        (item,) = parse(text)
        reads_back = (item.image_id, item.ext, item.description) == (image_id, ext, description)  # a source that does not read back stays in the description
    except ValueError:  # no item or several, or frontmatter that never closes
        reads_back = False
    if not reads_back:
        raise MoodboardError(
            "this would not be read back as the item given: an item needs an image, a description or an address; "
            "a description cannot start with # or ![[ or be a [source](...) line; an image needs an id made here and "
            "a png, jpg, jpeg, webp or gif extension; an address is http or https with no spaces")
    return text


def append(text: str, block: str) -> str:
    """`text` followed by a blank line and `block`; every byte of `text` is kept. Uses the note's own line ending."""
    _first_line(text.split("\n"))
    if "\r" in block or any(_blank(line) for line in block.split("\n")):
        raise MoodboardError("a block has no blank line and no carriage return; use format_block")
    eol = "\r\n" if "\r\n" in text and text.count("\r\n") == text.count("\n") else "\n"
    out = text if not text or text.endswith("\n") else text + eol
    lines = out.split("\n")[:-1]
    if lines and not _blank(lines[-1]):
        out += eol
    return out + block.replace("\n", eol) + eol


NOT_FOUND = "no block has this text now: it was changed or removed since it was shown"


def remove(text: str, key: str) -> tuple[str, Block]:
    """`text` without the one block whose key this is, and that block. Raises BlockNotFound or AmbiguousBlock."""
    found = [b for b in parse(text) if b.key == key]
    if not found:
        raise BlockNotFound(NOT_FOUND)
    if len(found) > 1:
        raise AmbiguousBlock(f"{len(found)} blocks have exactly this text; remove the extra copies by hand first")
    block = found[0]
    lines = text.split("\n")
    del lines[block.start:block.end]
    if block.start < len(lines) and (block.start == 0 or _blank(lines[block.start - 1])):  # the line now at `start` is blank
        # At the end of the note that line is only the empty piece after the last line ending; the blank line before it is the one to drop,
        # or a note with Windows line endings would end in a lone carriage return.
        at_end = 0 < block.start == len(lines) - 1 and lines[block.start] == ""
        del lines[block.start - 1 if at_end else block.start]
    return "\n".join(lines), block


def replace(text: str, key: str, block: str) -> tuple[str, Block]:
    """`text` with the one block whose key this is replaced by `block` (from format_block or cards.format_card), and the old block.

    Everything else in the note is kept byte for byte, the new block gets the line ending of the first line it replaces.
    Raises BlockNotFound or AmbiguousBlock. Only ADR 009's edit of a card uses it (it is the one place a block is changed).
    """
    found = [b for b in parse(text) if b.key == key]
    if not found:
        raise BlockNotFound(NOT_FOUND)
    if len(found) > 1:
        raise AmbiguousBlock(f"{len(found)} blocks have exactly this text; remove the extra copies by hand first")
    old = found[0]
    if "\r" in block or any(_blank(line) for line in block.split("\n")):
        raise MoodboardError("a block has no blank line and no carriage return")
    lines = text.split("\n")
    cr = "\r" if lines[old.start].endswith("\r") else ""
    lines[old.start:old.end] = [line + cr for line in block.split("\n")]
    return "\n".join(lines), old


def move(text: str, key: str, before: str | None) -> tuple[str, Block]:
    """`text` with the one block whose key this is moved to just before the block whose key is `before`, or to the end if `before` is None;
    and the block. The block's own lines are kept byte for byte (including their line endings), and so is everything else but the blank
    lines at the two places. A move that leaves the order as it is returns `text` itself.

    Raises BlockNotFound or AmbiguousBlock for either key, and MoodboardError for a block moved before itself.
    """
    blocks = parse(text)

    def find(wanted: str) -> int:
        found = [i for i, b in enumerate(blocks) if b.key == wanted]
        if not found:
            raise BlockNotFound(NOT_FOUND)
        if len(found) > 1:
            raise AmbiguousBlock(f"{len(found)} blocks have exactly this text; remove the extra copies by hand first")
        return found[0]

    at = find(key)
    anchor = None if before is None else find(before)
    if anchor == at:
        raise MoodboardError("a block cannot be moved before itself")
    block = blocks[at]
    if (blocks[at + 1] if at + 1 < len(blocks) else None) is (None if anchor is None else blocks[anchor]):
        return text, block  # already there
    lines = text.split("\n")
    moved = lines[block.start:block.end]
    cr = "\r" if moved[0].endswith("\r") else ""  # the blank lines we add use the block's own line ending
    rest = remove(text, key)[0].split("\n")
    if anchor is None:
        if rest[-1] != "":  # the note did not end with a line ending: it does now, as an append makes it
            rest.append("")
        body = rest[:-1]
        if body and not _blank(body[-1]):
            body.append(cr)
        rest = body + moved + [""]
    else:
        target = next(b for b in parse("\n".join(rest)) if b.key == blocks[anchor].key)
        rest[target.start:target.start] = moved + [cr]
    return "\n".join(rest), block
