"""What the API does with items: show a brand with its items, add one, delete one (ADR 001, decisions 3, 4, 5, 8).

Every function takes the vault path `find_vault` checked and a slug, and gets the Moodboard's path from
vault.moodboard_path, which refuses any slug that is not a brand folder and any Moodboard that is a link. The Moodboard note
must already exist: the app writes no text of its own into a note, so it does not create one (MissingMoodboard).
An add validates everything, makes the thumbnail, and only then writes: the files first, then the block, and the files are
taken back if the block cannot be written. A delete removes the block first (the one write that decides), then its files.
"""

from __future__ import annotations

import dataclasses
import os
from urllib.parse import quote

from board import images, moodboard, vault, vault_io
from board.moodboard import Block, MoodboardError

MAX_TEXT = 4000  # characters of a description or an address; far more than a line a person types


class ItemError(ValueError):
    """The request cannot be done as asked; the message says why and holds no path."""


class MissingMoodboard(ItemError):
    """The brand has no Moodboard note, and the app does not create one."""


class FilesLeft(ItemError):
    """The block was removed but its image files could not be."""


def _url(slug: str, kind: str, block: Block) -> str:
    return f"/api/brands/{quote(slug, safe='')}/{kind}/{block.image_id}.{block.ext}"


def item_view(vault_path: str, slug: str, block: Block) -> dict:
    size = images.thumb_size(vault_path, slug, block.image_id, block.ext) if block.image_id else None
    return {
        "key": block.key,
        "text": block.text,
        "description": block.description,
        "source": block.source,
        "image": _url(slug, "images", block) if block.image_id else None,
        "thumb": _url(slug, "thumbs", block) if block.image_id else None,
        "width": size[0] if size else None,  # of the thumbnail, so the page can reserve the space before it loads
        "height": size[1] if size else None,
    }


def brand_view(vault_path: str, slug: str) -> dict:
    """The brand's badges, summary, panels and Moodboard items (newest first) as plain data for JSON."""
    brand = vault.read_brand(vault_path, slug)
    path = vault.moodboard_path(vault_path, slug)
    moodboard_view: dict = {"exists": os.path.isfile(path), "problem": None, "items": []}
    if moodboard_view["exists"]:
        try:
            moodboard_view["items"] = [item_view(vault_path, slug, b) for b in reversed(vault_io.read_blocks(path))]
        except (MoodboardError, OSError) as err:
            moodboard_view["problem"] = str(err) if isinstance(err, MoodboardError) else "the Moodboard note could not be read"
    return {**dataclasses.asdict(brand), "moodboard": moodboard_view}


def _existing_moodboard(vault_path: str, slug: str) -> str:
    path = vault.moodboard_path(vault_path, slug)
    if not os.path.isfile(path):
        raise MissingMoodboard("this brand has no Moodboard note; create one in the vault and the app will add to it")
    return path


def add_item(vault_path: str, slug: str, description: str, source: str | None, image: bytes | None) -> dict:
    """Add an item at the end of the brand's Moodboard and return its view. Raises ItemError, ImageRefused, MoodboardError."""
    path = _existing_moodboard(vault_path, slug)
    description, source = description.strip(), (source or "").strip() or None
    if len(description) > MAX_TEXT or len(source or "") > MAX_TEXT:
        raise ItemError("the description or the address is too long")
    ext = images.sniff(image) if image is not None else None
    placeholder = "2000-01-01-0000-0000" if image is not None else None
    moodboard.format_block(description, placeholder, ext, source)  # validates before anything is written: it refuses a bad address
    image_id = None
    if image is not None:
        image_id = images.store(vault_path, slug, image, ext, images.thumbnail(image, ext))
    try:
        block = moodboard.format_block(description, image_id, ext, source)
        vault_io.append_block(path, block)
    except BaseException:
        if image_id:
            images.remove(vault_path, slug, image_id, ext)
        raise
    return item_view(vault_path, slug, moodboard.parse(block)[0])


def delete_item(vault_path: str, slug: str, key: str) -> None:
    """Remove the block with this key (it must be unchanged since shown) and its image files."""
    path = _existing_moodboard(vault_path, slug)
    block = vault_io.delete_block(path, key)
    if block.image_id and not any(b.image_id == block.image_id and b.ext == block.ext for b in vault_io.read_blocks(path)):  # one image, two blocks
        try:
            images.remove(vault_path, slug, block.image_id, block.ext)
        except (OSError, vault.VaultError) as err:
            raise FilesLeft("the item was removed from the note but its image files could not be removed") from err
