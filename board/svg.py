"""A site's SVG icon, checked before it is kept and kept untouched (ADR 008, amendment of 2026-10-17, decisions 2 and 3).

`check(data)` returns the icon's size or raises `SvgRefused` with the reason. It reads text with the standard library's XML parser,
which runs nothing, after refusing the forms that parser would expand (a document type, an entity). It is a list of what is refused:
the second layer, after the icon being shown only through `<img>` and served with a sandbox policy (`server.SVG_CSP`).
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from board import images

MAX_BYTES = 100 * 1024
MAX_ELEMENTS = 5000
DEFAULT_SIZE = 32
_SVG = "http://www.w3.org/2000/svg"
_XHTML = "http://www.w3.org/1999/xhtml"
_REFUSED_ELEMENTS = frozenset(
    {"script", "foreignObject", "image", "a", "animate", "animateMotion", "animateTransform", "set", "handler", "listener", "iframe", "object", "embed"}
)
_DECLARATION = rb"(\xef\xbb\xbf)?\s*(<\?xml\s[^>]*\?>\s*)?"
_START = re.compile(_DECLARATION + rb"(<!--.*?-->\s*)*<svg[\s>/]", re.DOTALL)
_URL = re.compile(r"url\(\s*['\"]?\s*(.?)", re.IGNORECASE)  # group 1: the first character of what the url names
_CSS_REFUSED = re.compile(r"@import|\\|expression\(|javascript:", re.IGNORECASE)
_LENGTH = re.compile(r"\s*(\d+(\.\d+)?)(px)?\s*$")


class SvgRefused(images.ImageRefused):
    """An SVG that is not taken, with the reason (never the address)."""


def looks_like(data: bytes) -> bool:
    """Whether a file starts like an SVG: an optional byte-order mark, an XML declaration and comments, then `<svg`."""
    return _START.match(data[:4096]) is not None


def _name(qualified: str) -> str:
    return qualified.rsplit("}", 1)[-1]


def _css_problem(text: str) -> str | None:
    if _CSS_REFUSED.search(text):
        return "style with an import, an escape or a script"
    if any(url.group(1) != "#" for url in _URL.finditer(text)):
        return "a reference to something outside the file"
    return None


def _length(value: str | None) -> int | None:
    match = _LENGTH.match(value or "")
    return max(1, round(float(match.group(1)))) if match else None


def _viewbox(value: str | None) -> tuple[int, int] | None:
    parts = (value or "").replace(",", " ").split()
    try:
        width, height = float(parts[2]), float(parts[3])
    except (IndexError, ValueError):
        return None
    return (max(1, round(width)), max(1, round(height))) if width > 0 and height > 0 else None


def check(data: bytes) -> tuple[int, int]:
    """(width, height) of an SVG that is safe to keep as it is, or raise SvgRefused."""
    if len(data) > MAX_BYTES:
        raise SvgRefused("an SVG that is too big")
    if not looks_like(data):
        raise SvgRefused("not an SVG")
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as err:
        raise SvgRefused("an SVG that is not UTF-8") from err
    lowered = data.lower()
    declared = re.match(_DECLARATION, data).group(2) is not None  # the one processing instruction allowed
    if b"<!doctype" in lowered or b"<!entity" in lowered or lowered.count(b"<?") > declared:
        raise SvgRefused("an SVG with a document type, an entity or a processing instruction")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as err:
        raise SvgRefused("an SVG that is not well-formed") from err
    if root.tag != f"{{{_SVG}}}svg":
        raise SvgRefused("an SVG whose root is not an svg in the SVG namespace")
    count = 0
    for element in root.iter():
        count += 1
        if count > MAX_ELEMENTS:
            raise SvgRefused("an SVG with too many elements")
        if not isinstance(element.tag, str):  # a comment or processing instruction node
            continue
        if _name(element.tag) in _REFUSED_ELEMENTS or element.tag.startswith(f"{{{_XHTML}}}"):
            raise SvgRefused(f"an SVG with a {_name(element.tag)} element")
        if _name(element.tag) == "style" and (problem := _css_problem("".join(element.itertext()))):
            raise SvgRefused(f"an SVG with {problem}")
        for name, value in element.attrib.items():
            local = _name(name).lower()
            if local.startswith("on"):
                raise SvgRefused("an SVG with an event handler")
            if local == "href" and not value.startswith("#"):
                raise SvgRefused("an SVG with a reference to something outside the file")
            if problem := _css_problem(value):  # a presentation attribute is read as CSS too
                raise SvgRefused(f"an SVG with {problem}")
    width, height = _length(root.get("width")), _length(root.get("height"))
    if width is None or height is None:
        width, height = _viewbox(root.get("viewBox")) or (DEFAULT_SIZE, DEFAULT_SIZE)
    return width, height
