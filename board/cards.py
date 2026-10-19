"""The three special cards of ADR 009, as text in and data out: colours, titled text and type.

A card is an ordinary Moodboard block with no image and no address whose description has one of three shapes:

    Font: Fauna One            type: the first line, then the owner's notes
    Headings

    **Palette**                colours: an optional bold title, then one to 12 lines of a hex value and an optional name
    #1A2B3C Deep ink
    #FFF

    **Mission**                text: a bold title alone on the first line, then the owner's words

The test goes in that order (type, colours, text); anything else is not a card. This module touches no file. `read` takes
a description and returns the card or None; `format_card` takes the card's data and returns the block text, and only if
`read` reads that text back as the same card, so what is written is always what will be shown. It raises CardError otherwise.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote_plus

from board import moodboard
from board.moodboard import MoodboardError

MAX_COLORS = 12
MAX_TITLE = 80
MAX_NAME = 40  # of a colour
MAX_BODY = 4000  # characters of a text card's words, of a type card's notes

_TITLE = re.compile(r"\*\*(?P<title>[^*\n]+?)\*\*")
_COLOR = re.compile(r"(?P<hex>#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))(?: (?P<name>[^\n]+))?")
_FONT = re.compile(r"Font: (?P<name>[A-Za-z0-9][A-Za-z0-9 \-]{0,59})")
GOOGLE = "https://fonts.google.com/specimen/"


class CardError(MoodboardError):
    """The card cannot be written as a block that reads back as itself; the message says why and holds no path."""


def _title(line: str) -> str | None:
    found = _TITLE.fullmatch(line)
    title = found["title"].strip() if found else ""
    return title if title and len(title) <= MAX_TITLE else None


def read(description: str) -> dict | None:
    """The card a block's description is, or None for an ordinary item."""
    lines = description.split("\n")
    first = lines[0]
    font = _FONT.fullmatch(first)
    if font and font["name"] == font["name"].strip():
        name = font["name"]
        return {"kind": "type", "name": name, "notes": "\n".join(lines[1:]), "google": GOOGLE + quote_plus(name)}
    title = _title(first)
    rest = lines[1:] if title is not None else lines
    colors = [_COLOR.fullmatch(line) for line in rest]
    if rest and all(colors) and len(rest) <= MAX_COLORS and all(len(c["name"] or "") <= MAX_NAME and (c["name"] or "x") == (c["name"] or "x").strip() for c in colors if c):
        return {"kind": "colors", "title": title or "", "colors": [{"hex": c["hex"].upper(), "name": c["name"] or ""} for c in colors if c]}
    if title is not None and rest:
        return {"kind": "text", "title": title, "body": "\n".join(rest)}
    return None


def _clean(value: Any, what: str, limit: int, *, lines: bool = False) -> str:
    if not isinstance(value, str):
        raise CardError(f"the {what} must be text")
    value = value.replace("\r\n", "\n").strip()
    if len(value) > limit:
        raise CardError(f"the {what} is too long")
    if not lines and "\n" in value:
        raise CardError(f"the {what} is one line")
    if lines and any(not line.strip() for line in value.split("\n")):
        raise CardError(f"the {what} has a blank line, which would end the card; leave it out")
    return value


def format_card(card: Any) -> str:
    """The block text for a card given as `{kind, ...}`. Raises CardError (a MoodboardError) for anything that would not read back as it."""
    if not isinstance(card, dict) or card.get("kind") not in ("text", "colors", "type"):
        raise CardError("a card is text, colors or type")
    kind = card["kind"]
    if kind == "type":
        name = _clean(card.get("name", ""), "font name", 60)
        notes = _clean(card.get("notes", ""), "notes", MAX_BODY, lines=True) if card.get("notes") else ""
        if not _FONT.fullmatch(f"Font: {name}"):
            raise CardError("a font name is 1 to 60 letters, digits, spaces and hyphens")
        lines = [f"Font: {name}"] + ([notes] if notes else [])
    elif kind == "colors":
        title = _clean(card.get("title", ""), "title", MAX_TITLE) if card.get("title") else ""
        entries = card.get("colors")
        if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_COLORS:
            raise CardError(f"a palette has 1 to {MAX_COLORS} colors")
        lines = [f"**{title}**"] if title else []
        for entry in entries:
            if not isinstance(entry, dict):
                raise CardError("a color is a hex value and a name")
            hex_, name = _clean(entry.get("hex", ""), "hex value", 7), _clean(entry.get("name", ""), "color name", MAX_NAME) if entry.get("name") else ""
            if not re.fullmatch(r"#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})", hex_):
                raise CardError("a hex value is # and 3 or 6 digits, such as #1A2B3C")
            lines.append(f"{hex_.upper()} {name}" if name else hex_.upper())
    else:
        title = _clean(card.get("title", ""), "title", MAX_TITLE)
        body = _clean(card.get("body", ""), "words", MAX_BODY, lines=True)
        if not title or not body or "*" in title:
            raise CardError("a text card needs a title (without *) and some words")
        lines = [f"**{title}**", body]
    text = "\n".join(lines)
    found = moodboard.parse(text)
    ok = len(found) == 1 and found[0].image_id is None and found[0].source is None and (read(found[0].description) or {}).get("kind") == kind
    if not ok:
        raise CardError("this would not be read back as the card given: the last line of the words cannot be a [source](...) line, and nothing may start with # followed by a space")
    return text
