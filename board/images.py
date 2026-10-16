"""Image intake: what a file is (by its first bytes), its thumbnail, and where its files go (ADR 001, decision 6).

An image is stored as pasted, unchanged, in `<vault>/Board/<slug>/<id>.<ext>`, with a thumbnail about 640 pixels wide in
`thumbs/` under the same name. Only PNG, JPEG, WebP and GIF are accepted, recognised by the file's first bytes and never by
a name, and a file over 25 MB is refused. Nothing is written until the thumbnail has been made, so a file that only looks like
an image is refused whole. `Board/<slug>` and `thumbs` must be real folders inside `Board/` (the owner may link `Board/`
itself elsewhere, for example to another disk), and a file is never opened through a link.
"""

from __future__ import annotations

import contextlib
import io
import os
import secrets
import time

from PIL import Image, ImageOps

from board.vault import VaultError

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 50_000_000  # a screenshot of a 5K screen is under 15 million; more than this is refused before it is decoded
THUMB_WIDTH = 640
_FORMATS = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP", "gif": "GIF"}
CONTENT_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}

Image.MAX_IMAGE_PIXELS = None  # the limit is checked in thumbnail(): the library's own one only warns, through a process-wide filter


class ImageRefused(ValueError):
    """The bytes are not an image this app takes, or are too big."""


def sniff(data: bytes) -> str:
    """The extension (`png`, `jpg`, `webp` or `gif`) of what these bytes are. Raises ImageRefused."""
    if len(data) > MAX_BYTES:
        raise ImageRefused("the image is over 25 MB")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    raise ImageRefused("only PNG, JPEG, WebP and GIF images are taken")


def thumbnail(data: bytes, ext: str) -> bytes:
    """A copy of the image at most THUMB_WIDTH pixels wide, in the same format. Raises ImageRefused if it cannot be decoded."""
    try:
        image = Image.open(io.BytesIO(data))  # reads the header only
        if image.width * image.height > MAX_PIXELS:
            raise ImageRefused("the image has too many pixels")
        image = ImageOps.exif_transpose(image)
        image.thumbnail((THUMB_WIDTH, 100_000))  # never enlarges
        out = io.BytesIO()
        image.save(out, _FORMATS[ext])
    except ImageRefused:
        raise
    except Exception as err:  # noqa: BLE001  a decoder can fail in many ways (OSError, EOFError, struct.error, ...); all mean unusable
        raise ImageRefused("this file is not an image that can be read") from err
    return out.getvalue()


def new_id(now: float | None = None) -> str:
    """A sortable timestamp (local time, to the minute) and four random hex digits: 2026-10-15-1432-a3f9."""
    return f"{time.strftime('%Y-%m-%d-%H%M', time.localtime(now))}-{secrets.token_hex(2)}"


def _real_folder(parent: str, name: str, create: bool) -> str | None:
    """`parent/name` if it is a real folder (not a link, not elsewhere); None if it does not exist and `create` is false."""
    path = os.path.join(parent, name)
    if not os.path.lexists(path):
        if not create:
            return None
        with contextlib.suppress(FileExistsError):  # another request made it a moment ago; the check below still applies
            os.mkdir(path)
    if os.path.realpath(path) != os.path.join(os.path.realpath(parent), name) or not os.path.isdir(path):
        raise VaultError(f"{name} under Board is not a real folder, so the app will not write there")
    return path


def _folders(vault: str, slug: str, create: bool) -> tuple[str | None, str | None]:
    """(`Board/<slug>`, its `thumbs`) for a slug vault.moodboard_path has already accepted; None for one that is not there."""
    board = os.path.join(vault, "Board")
    if create:
        os.makedirs(board, exist_ok=True)
    folder = _real_folder(board, slug, create)
    return folder, (_real_folder(folder, "thumbs", create) if folder else None)


def links_folder(vault: str, slug: str, create: bool) -> str | None:
    """`Board/<slug>/links`, a real folder (ADR 008, decision 7), made if `create`; None if it is not there and `create` is false."""
    board = os.path.join(vault, "Board")
    if create:
        os.makedirs(board, exist_ok=True)
    folder = _real_folder(board, slug, create)
    return _real_folder(folder, "links", create) if folder else None


def store(vault: str, slug: str, data: bytes, ext: str, thumb: bytes) -> str:
    """Write the original and its thumbnail under a new id and return the id. Nothing is left behind if a write fails."""
    folder, thumbs = _folders(vault, slug, create=True)
    assert folder and thumbs
    for _ in range(20):
        image_id = new_id()
        created: list[str] = []
        try:
            for directory, content in ((folder, data), (thumbs, thumb)):
                path = os.path.join(directory, f"{image_id}.{ext}")
                with open(path, "xb") as f:  # "x": never over a file that exists
                    created.append(path)
                    f.write(content)
            return image_id
        except FileExistsError:  # this id is taken (by a file that is not ours, so only what we created is undone)
            _unlink_all(created)
        except BaseException:
            _unlink_all(created)
            raise
    raise OSError("could not find a free image id")


def _unlink_all(paths: list[str]) -> None:
    for path in paths:
        with contextlib.suppress(OSError):
            os.unlink(path)


def remove(vault: str, slug: str, image_id: str, ext: str) -> None:
    """Delete the original and the thumbnail of an id this app made (the caller took it from a parsed block). Missing is fine."""
    for folder in _folders(vault, slug, create=False):
        if folder:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(os.path.join(folder, f"{image_id}.{ext}"))


def path_of(vault: str, slug: str, image_id: str, ext: str, thumb: bool) -> str | None:
    """The file to serve for an image, or None if it is not there as a regular file."""
    folder = _folders(vault, slug, create=False)[1 if thumb else 0]
    path = os.path.join(folder, f"{image_id}.{ext}") if folder else ""
    return path if path and os.path.isfile(path) and not os.path.islink(path) else None


def thumb_size(vault: str, slug: str, image_id: str, ext: str) -> tuple[int, int] | None:
    """The width and height of an image's thumbnail, read from the file's header, or None if it is missing or unreadable."""
    path = path_of(vault, slug, image_id, ext, thumb=True)
    if path is None:
        return None
    try:
        with Image.open(path) as image:
            return image.size
    except (OSError, ValueError):  # not an image, or unreadable; the page then shows it without reserved space
        return None
