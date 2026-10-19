"""What the API does with items: show a brand with its items, add one, look an address up, delete one (ADR 001, decisions 3, 4, 5, 8) and the special cards (ADR 009).

Every function takes the vault path `find_vault` checked and a slug, and gets the Moodboard's path from
vault.moodboard_path, which refuses any slug that is not a brand folder and any Moodboard that is a link. The Moodboard note
must already exist: the app writes no text of its own into a note, so it does not create one (MissingMoodboard).
An add validates everything, makes the thumbnail, and only then writes: the files first, then the block, and the files are
taken back if the block cannot be written. An add never looks anything up: an address with no image is looked up by a call of its
own (ADR 008, amendment of 2026-10-17) and what is found is kept beside the images, never in the note; a failed lookup or a
failed keeping only means the item stays as it was added. A delete removes the block first (the one write that decides), then its files.
"""

from __future__ import annotations

import dataclasses
import logging
import os
from urllib.parse import quote

from board import cards, images, links, lookup, moodboard, vault, vault_io
from board.moodboard import Block, MoodboardError

log = logging.getLogger("board.items")

MAX_TEXT = 4000  # characters of a description or an address; far more than a line a person types


class ItemError(ValueError):
    """The request cannot be done as asked; the message says why and holds no path."""


class MissingMoodboard(ItemError):
    """The brand has no Moodboard note, and the app does not create one."""


def _url(slug: str, kind: str, block: Block) -> str:
    return f"/api/brands/{quote(slug, safe='')}/{kind}/{block.image_id}.{block.ext}"


def _id_date(image_id: str | None) -> str | None:
    """`2026-10-15T14:32` from an id like 2026-10-15-1432-a3f9, or None for an item with no image the app made."""
    return None if image_id is None else f"{image_id[:10]}T{image_id[11:13]}:{image_id[13:15]}"


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
        "card": _card(block),
        "date": _id_date(block.image_id),  # brand_view gives an item with no date of its own the one before it
        **_link_fields(vault_path, slug, block),
    }


def _card(block: Block) -> dict | None:
    """The special card (ADR 009) a block is, or None: only a block with no embed and no address can be one."""
    return None if block.embed is not None or block.source is not None else cards.read(block.description)


def _link_fields(vault_path: str, slug: str, block: Block) -> dict:
    """`title` and `preview` (ADR 008, decision 8): only for an address with no picture of its own, and null when none is kept."""
    kept = links.read(vault_path, slug, block.source) if block.source and not block.image_id else None
    preview = {"url": kept.preview, "width": kept.width, "height": kept.height} if kept and kept.preview else None
    return {"title": kept.title if kept else None, "preview": preview}


def brand_view(vault_path: str, slug: str) -> dict:
    """The brand's badges, summary, panels and Moodboard items (newest first) as plain data for JSON."""
    brand = vault.read_brand(vault_path, slug)
    path = vault.moodboard_path(vault_path, slug)
    moodboard_view: dict = {"exists": os.path.isfile(path), "problem": None, "items": []}
    if moodboard_view["exists"]:
        try:
            blocks = vault_io.read_blocks(path)
            views, date = [], None
            for block in blocks:  # in file order, which is the order they were added: an item with no date of its own takes the one before it
                view = item_view(vault_path, slug, block)
                view["date"] = date = view["date"] or date
                views.append(view)
            moodboard_view["items"] = views[::-1]
        except (MoodboardError, OSError) as err:
            moodboard_view["problem"] = str(err) if isinstance(err, MoodboardError) else "the Moodboard note could not be read"
    return {**dataclasses.asdict(brand), "moodboard": moodboard_view}


def _existing_moodboard(vault_path: str, slug: str) -> str:
    path = vault.moodboard_path(vault_path, slug)
    if not os.path.isfile(path):
        raise MissingMoodboard("this brand has no Moodboard note; create one in the vault and the app will add to it")
    return path


def add_item(vault_path: str, slug: str, description: str, source: str | None, image: bytes | None) -> dict:
    """Add an item at the end of the brand's Moodboard and return its view. Raises ItemError, ImageRefused, MoodboardError.

    It looks nothing up (ADR 008, amendment of 2026-10-17): `look_up_item` does that, and the add answers at once.
    """
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


def add_card(vault_path: str, slug: str, card: object) -> dict:
    """Add a special card (ADR 009) at the end of the brand's Moodboard and return its view. Raises ItemError, MoodboardError."""
    path = _existing_moodboard(vault_path, slug)
    block = cards.format_card(card)  # validates before anything is written
    vault_io.append_block(path, block)
    return item_view(vault_path, slug, moodboard.parse(block)[0])


def edit_card(vault_path: str, slug: str, key: str, card: object) -> dict:
    """Replace the special card with this key (unchanged since shown) by a card of the same kind and return its view (ADR 009, decision 4).

    Refused if the block is not a card, or the new card is of another kind: nothing else is ever edited.
    """
    path = _existing_moodboard(vault_path, slug)
    block = cards.format_card(card)
    kind = cards.read("\n".join(block.split("\n")))["kind"]  # format_card has checked that it reads back

    def accept(old: Block) -> None:
        was = _card(old)
        if was is None:
            raise ItemError("only a colors, text or type card can be edited")
        if was["kind"] != kind:
            raise ItemError("a card keeps its kind when it is edited")

    vault_io.replace_block(path, key, block, accept)
    return item_view(vault_path, slug, moodboard.parse(block)[0])


def look_up_item(vault_path: str, slug: str, key: str) -> dict:
    """Ask for the title and preview of an item's address, keep what comes, and return the item's view (ADR 008, amendment of 2026-10-17).

    Only for an item with an address and no picture of its own, still in the note and unchanged. An address already kept is not
    asked for again. It can wait up to the lookup's eight seconds and never fails on what the site does. What is found is kept
    only if the item is still there once the answer is in: the check and the keeping happen under the lock a delete takes.
    """
    path = _existing_moodboard(vault_path, slug)
    block = vault_io.block_with_key(path, key)
    if not block.source or block.image_id:
        raise ItemError("only an item with an address and no picture of its own can be looked up")
    if not links.has(vault_path, slug, block.source):
        found = lookup.lookup(block.source)
        with vault_io.hold_block(path, key) as block:  # the item went or changed while the page was asked: nothing is kept
            _keep(vault_path, slug, block.source, found)
    return item_view(vault_path, slug, block)


def _keep(vault_path: str, slug: str, address: str, found: lookup.Found) -> None:
    """Keep what a lookup found, unless another lookup of the address got there first."""
    try:
        links.store(vault_path, slug, address, found)  # which writes nothing if the address is already kept
    except (OSError, vault.VaultError) as err:  # decision 9: the item stays as it is; the kind of failure only, never a path
        log.warning("keeping an address lookup failed: %s", type(err).__name__)


FILES_LEFT = "the item was removed from the note but its image files could not be removed"


def delete_item(vault_path: str, slug: str, key: str) -> str | None:
    """Remove the block with this key (it must be unchanged since shown) and its image files. Returns a warning, never a path, if the block went but the files stayed."""
    path = _existing_moodboard(vault_path, slug)
    block = vault_io.delete_block(path, key)
    left = vault_io.read_blocks(path) if block.image_id or block.source else []
    failed = False
    if block.image_id and not any(b.image_id == block.image_id and b.ext == block.ext for b in left):  # one image, two blocks
        failed |= _attempt(images.remove, vault_path, slug, block.image_id, block.ext)
    if block.source and not any(b.source == block.source for b in left):  # one address, two blocks (ADR 008, decision 10)
        failed |= _attempt(links.remove, vault_path, slug, block.source)
    return FILES_LEFT if failed else None


def _attempt(remove, *args) -> bool:
    """Run a file removal; True if it failed. Both removals are tried even if the first fails."""
    try:
        remove(*args)
    except (OSError, vault.VaultError):
        return True
    return False
