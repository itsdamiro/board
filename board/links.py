"""What an address lookup kept: the title and the preview thumbnail, in `Board/<slug>/links/` (ADR 008, decisions 7, 8 and 10).

An address is named by the first 16 hex characters of the SHA-256 of its exact text. `<hash>.json` holds
`{"title", "preview", "fetched"}` (`preview` is the icon's extension or null) and `<hash>.<ext>` is the icon's thumbnail, or the SVG itself. Nothing
here touches a note. What is read back is treated as untrusted: the folder may be edited by hand, so a file that is not
what this module writes is as good as missing, and a link is never followed.
"""

from __future__ import annotations

import contextlib
import dataclasses
import datetime
import hashlib
import json
import os
from urllib.parse import quote

from PIL import Image

from board import images, lookup, svg
from board.vault import VaultError

ICON_TYPES = {**images.CONTENT_TYPES, "svg": "image/svg+xml"}  # what a lookup may keep; a pasted image is never an SVG
MAX_JSON = 4096  # a title of 200 characters is under 2 KB even escaped; more than this is not ours


@dataclasses.dataclass(frozen=True)
class Link:
    """A stored lookup: the page's title, and the preview as an API address with the thumbnail's size, each None if not kept."""

    title: str | None
    preview: str | None
    width: int | None
    height: int | None


def name_of(address: str) -> str:
    return hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]


def _read_json(folder: str, name: str) -> dict | None:
    path = os.path.join(folder, f"{name}.json")
    if os.path.islink(path) or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            raw = f.read(MAX_JSON + 1)
        data = json.loads(raw) if len(raw) <= MAX_JSON else None
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    title, preview = data.get("title"), data.get("preview")
    if not (title is None or (isinstance(title, str) and len(title) <= lookup.TITLE_CHARS)) or preview not in (None, *ICON_TYPES):
        return None
    return {"title": title, "preview": preview}


def _folder(vault: str, slug: str) -> str | None:
    """The `links` folder to read from, or None if there is none or it is not a real folder (then nothing in it is read)."""
    try:
        return images.links_folder(vault, slug, create=False)
    except VaultError:
        return None


def has(vault: str, slug: str, address: str) -> bool:
    """Whether a lookup of this address is already kept (so it is not asked for again)."""
    folder = _folder(vault, slug)
    return folder is not None and _read_json(folder, name_of(address)) is not None


def read(vault: str, slug: str, address: str) -> Link | None:
    """What is kept for this address, or None if nothing usable is."""
    folder = _folder(vault, slug)
    data = _read_json(folder, name_of(address)) if folder else None
    if data is None or (data["title"] is None and data["preview"] is None):
        return None
    if data["preview"] is None:
        return Link(data["title"], None, None, None)
    name = name_of(address)
    path = os.path.join(folder, f"{name}.{data['preview']}")
    size = _size(path, data["preview"]) if os.path.isfile(path) and not os.path.islink(path) else None
    if size is None:  # the picture is gone or unreadable: the title still shows
        return Link(data["title"], None, None, None) if data["title"] else None
    return Link(data["title"], f"/api/brands/{quote(slug, safe='')}/links/{name}.{data['preview']}", size[0], size[1])


def _size(path: str, ext: str) -> tuple[int, int] | None:
    """The size of a kept icon, or None if it is unreadable (an SVG is checked again: the folder may have been edited by hand)."""
    try:
        if ext == "svg":
            with open(path, "rb") as f:
                return svg.check(f.read(svg.MAX_BYTES + 1))
        with Image.open(path) as image:
            return image.size
    except (OSError, ValueError):  # ImageRefused, which SvgRefused is, is a ValueError
        return None


def path_of(vault: str, slug: str, name: str, ext: str) -> str | None:
    """The thumbnail file to serve for a stored lookup, or None if it is not there as a regular file."""
    folder = _folder(vault, slug)
    path = os.path.join(folder, f"{name}.{ext}") if folder else ""
    return path if path and os.path.isfile(path) and not os.path.islink(path) else None


def store(vault: str, slug: str, address: str, found: lookup.Found, now: datetime.datetime | None = None) -> bool:
    """Keep a lookup that got something. False, and nothing written, if it got nothing; True once the files are written."""
    if found.title is None and found.preview is None:
        return False
    folder = images.links_folder(vault, slug, create=True)
    assert folder
    name = name_of(address)
    record = {
        "title": found.title,
        "preview": found.preview_ext if found.preview else None,
        "fetched": (now or datetime.datetime.now()).strftime("%Y-%m-%dT%H:%M"),
    }
    created: list[str] = []
    try:
        if found.preview:  # the picture first, so a record never names a picture that is not there
            with open(os.path.join(folder, f"{name}.{record['preview']}"), "xb") as f:  # "x": never over a file that exists
                created.append(f.name)
                f.write(found.preview)
        with open(os.path.join(folder, f"{name}.json"), "x", encoding="utf-8") as f:
            created.append(f.name)
            json.dump(record, f, ensure_ascii=False)
    except BaseException:
        for path in created:
            with contextlib.suppress(OSError):
                os.unlink(path)
        raise
    return True


def remove(vault: str, slug: str, address: str) -> None:
    """Delete every file kept for this address. Missing is fine; a `links` folder that is not a real one raises VaultError."""
    folder = images.links_folder(vault, slug, create=False)
    if not folder:
        return
    name = name_of(address)
    for ext in ("json", *ICON_TYPES):
        with contextlib.suppress(FileNotFoundError):
            os.unlink(os.path.join(folder, f"{name}.{ext}"))
