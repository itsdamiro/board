"""Tests for board/links.py: what an address lookup kept, on throwaway vaults and generated images (ADR 008, decisions 7 and 8)."""

import datetime
import hashlib
import json
import os
import unittest
from unittest import mock

from board import images, links, lookup, svg
from board.vault import VaultError
from tests.helpers import VaultCase, make_image

ADDRESS = "https://example.com/page"


def found(title="A title", ext="jpg", size=(30, 20)):
    return lookup.Found(title, make_image(ext, size) if ext else None, ext)


class LinksCase(VaultCase):
    def version(self, ext):
        """The version in an icon's address: the file's modification time in nanoseconds, in hex (ADR 008, amendment of 2026-10-18)."""
        return format(os.stat(os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.{ext}")).st_mtime_ns, "x")

    def folder(self):
        return os.path.join(self.vault, "Board", "alpha", "links")

    def write(self, name, content):
        os.makedirs(self.folder(), exist_ok=True)
        with open(os.path.join(self.folder(), name), "wb") as f:
            f.write(content if isinstance(content, bytes) else content.encode())


class NameTest(unittest.TestCase):
    def test_the_name_is_the_first_16_hex_of_the_sha256_of_the_exact_address(self):
        self.assertEqual(links.name_of(ADDRESS), hashlib.sha256(ADDRESS.encode()).hexdigest()[:16])
        self.assertEqual(len(links.name_of(ADDRESS)), 16)

    def test_a_different_spelling_is_a_different_name(self):
        self.assertNotEqual(links.name_of(ADDRESS), links.name_of(ADDRESS + "/"))
        self.assertNotEqual(links.name_of(ADDRESS), links.name_of(ADDRESS.upper()))


class StoreTest(LinksCase):
    def test_a_title_and_a_preview_are_kept_as_a_record_and_a_thumbnail(self):
        data = found()
        self.assertTrue(links.store(self.vault, "alpha", ADDRESS, data, datetime.datetime(2026, 10, 16, 9, 5)))
        name = links.name_of(ADDRESS)
        self.assertEqual(self.board_files(), [f"links/{name}.jpg", f"links/{name}.json"])
        with open(os.path.join(self.folder(), f"{name}.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"title": "A title", "preview": "jpg", "fetched": "2026-10-16T09:05"})
        with open(os.path.join(self.folder(), f"{name}.jpg"), "rb") as f:
            self.assertEqual(f.read(), data.preview)

    def test_a_title_alone_and_a_preview_alone_are_kept(self):
        self.assertTrue(links.store(self.vault, "alpha", "https://a.example", found(ext=None)))
        self.assertTrue(links.store(self.vault, "alpha", "https://b.example", found(title=None)))
        self.assertEqual(len(self.board_files()), 3)

    def test_a_lookup_that_got_nothing_writes_nothing_not_even_the_folder(self):
        self.assertFalse(links.store(self.vault, "alpha", ADDRESS, lookup.Found()))
        self.assertEqual(self.board_files(), [])
        self.assertFalse(os.path.exists(os.path.join(self.vault, "Board")))

    def test_the_title_is_written_as_it_is_including_non_ascii_text(self):
        links.store(self.vault, "alpha", ADDRESS, found("Café — ünï", None))
        self.assertEqual(links.read(self.vault, "alpha", ADDRESS).title, "Café — ünï")

    def test_the_record_is_readable_text_not_escapes(self):
        links.store(self.vault, "alpha", ADDRESS, found("Café", None))
        with open(os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.json"), encoding="utf-8") as f:
            self.assertIn("Café", f.read())

    def test_a_preview_without_a_picture_is_recorded_as_none(self):
        links.store(self.vault, "alpha", ADDRESS, lookup.Found("T", None, "jpg"))
        with open(os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.json"), encoding="utf-8") as f:
            self.assertIsNone(json.load(f)["preview"])

    def test_a_stray_picture_does_not_block_the_keep_and_is_replaced(self):
        name = links.name_of(ADDRESS)
        self.write(f"{name}.jpg", b"stray")
        self.assertTrue(links.store(self.vault, "alpha", ADDRESS, found()))
        self.assertEqual(sorted(self.board_files()), [f"links/{name}.jpg", f"links/{name}.json"])
        self.assertEqual(links.read(self.vault, "alpha", ADDRESS).title, "A title")

    def test_a_stray_picture_of_another_kind_is_removed_too(self):
        name = links.name_of(ADDRESS)
        self.write(f"{name}.png", b"stray")
        self.assertTrue(links.store(self.vault, "alpha", ADDRESS, found()))
        self.assertEqual(sorted(self.board_files()), [f"links/{name}.jpg", f"links/{name}.json"])

    def test_a_record_that_is_not_valid_does_not_block_the_keep_and_is_replaced(self):
        name = links.name_of(ADDRESS)
        for junk in (b"not json", b'{"title": 5}', b"[]", b'{"preview": "exe"}'):
            with self.subTest(junk=junk):
                self.write(f"{name}.json", junk)
                self.assertFalse(links.has(self.vault, "alpha", ADDRESS))
                self.assertTrue(links.store(self.vault, "alpha", ADDRESS, found("Mended", None)))
                self.assertEqual(links.read(self.vault, "alpha", ADDRESS).title, "Mended")
                links.remove(self.vault, "alpha", ADDRESS)

    def test_a_valid_record_is_never_written_over(self):
        name = links.name_of(ADDRESS)
        self.write(f"{name}.json", b'{"title": "Mine", "preview": null}')
        self.assertFalse(links.store(self.vault, "alpha", ADDRESS, found("Other")))
        with open(os.path.join(self.folder(), f"{name}.json"), "rb") as f:
            self.assertEqual(f.read(), b'{"title": "Mine", "preview": null}')
        self.assertEqual(self.board_files(), [f"links/{name}.json"])

    def test_the_files_of_another_address_are_not_touched(self):
        other = links.name_of("https://other.example")
        self.write(f"{other}.jpg", b"theirs")
        self.write(f"{other}.json", b"junk")
        self.assertTrue(links.store(self.vault, "alpha", ADDRESS, found()))
        for ext, content in (("jpg", b"theirs"), ("json", b"junk")):
            with open(os.path.join(self.folder(), f"{other}.{ext}"), "rb") as f:
                self.assertEqual(f.read(), content)

    def test_when_the_record_cannot_be_written_the_picture_is_taken_back(self):
        with mock.patch("board.links.json.dump", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                links.store(self.vault, "alpha", ADDRESS, found())
        self.assertEqual(self.board_files(), [])

    def test_a_links_folder_that_is_a_link_is_refused_and_nothing_follows_it(self):
        elsewhere = os.path.join(os.path.dirname(self.vault), "elsewhere")
        os.makedirs(elsewhere)
        os.makedirs(os.path.join(self.vault, "Board", "alpha"))
        os.symlink(elsewhere, self.folder())
        with self.assertRaises(VaultError):
            links.store(self.vault, "alpha", ADDRESS, found())
        self.assertEqual(os.listdir(elsewhere), [])

    def test_a_brand_folder_under_board_that_is_a_link_is_refused(self):
        elsewhere = os.path.join(os.path.dirname(self.vault), "elsewhere")
        os.makedirs(elsewhere)
        os.makedirs(os.path.join(self.vault, "Board"))
        os.symlink(elsewhere, os.path.join(self.vault, "Board", "alpha"))
        with self.assertRaises(VaultError):
            links.store(self.vault, "alpha", ADDRESS, found())
        self.assertEqual(os.listdir(elsewhere), [])


class ReadTest(LinksCase):
    def test_a_file_kept_again_for_the_same_address_has_a_new_address(self):
        links.store(self.vault, "alpha", ADDRESS, found())
        first = links.read(self.vault, "alpha", ADDRESS).preview
        links.remove(self.vault, "alpha", ADDRESS)
        links.store(self.vault, "alpha", ADDRESS, found())
        os.utime(os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.jpg"), ns=(1, 1))  # mtime is only as fine as the file system's
        self.assertNotEqual(links.read(self.vault, "alpha", ADDRESS).preview, first)
        self.assertTrue(links.read(self.vault, "alpha", ADDRESS).preview.endswith("-1.jpg"))

    def test_what_was_kept_is_read_back_with_the_thumbnails_address_and_size(self):
        links.store(self.vault, "alpha", ADDRESS, found("T", "png", (30, 20)))
        link = links.read(self.vault, "alpha", ADDRESS)
        self.assertEqual(link, links.Link("T", f"/api/brands/alpha/links/{links.name_of(ADDRESS)}-{self.version('png')}.png", 30, 20))
        self.assertTrue(links.has(self.vault, "alpha", ADDRESS))

    def test_the_slug_is_quoted_in_the_preview_address(self):
        self.make_brand("my brand")
        links.store(self.vault, "my brand", ADDRESS, found())
        self.assertIn("/api/brands/my%20brand/links/", links.read(self.vault, "my brand", ADDRESS).preview)

    def test_a_title_alone_has_no_preview(self):
        links.store(self.vault, "alpha", ADDRESS, found("Only", None))
        self.assertEqual(links.read(self.vault, "alpha", ADDRESS), links.Link("Only", None, None, None))

    def test_nothing_kept_reads_as_none_and_has_is_false(self):
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS))
        self.assertFalse(links.has(self.vault, "alpha", ADDRESS))

    def test_another_address_does_not_read_this_ones_record(self):
        links.store(self.vault, "alpha", ADDRESS, found())
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS + "x"))

    def test_another_brands_lookups_are_not_read(self):
        self.make_brand("beta")
        links.store(self.vault, "alpha", ADDRESS, found())
        self.assertIsNone(links.read(self.vault, "beta", ADDRESS))

    def test_a_lost_or_unreadable_picture_leaves_the_title(self):
        links.store(self.vault, "alpha", ADDRESS, found("Kept"))
        path = os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.jpg")
        os.unlink(path)
        self.assertEqual(links.read(self.vault, "alpha", ADDRESS), links.Link("Kept", None, None, None))
        self.write(os.path.basename(path), b"not an image")
        self.assertEqual(links.read(self.vault, "alpha", ADDRESS), links.Link("Kept", None, None, None))

    def test_a_lost_picture_with_no_title_is_nothing(self):
        links.store(self.vault, "alpha", ADDRESS, found(None))
        os.unlink(os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.jpg"))
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS))

    def test_a_record_that_is_not_what_the_app_writes_is_not_used(self):
        name = f"{links.name_of(ADDRESS)}.json"
        for content in (
            "not json", "[]", "null", '{"title": 5, "preview": null}', '{"title": null, "preview": "bmp"}',
            '{"title": null, "preview": ["jpg"]}', json.dumps({"title": "x" * (lookup.TITLE_CHARS + 1), "preview": None}),
            json.dumps({"title": "x", "preview": None, "pad": "y" * 5000}), b"\xff\xfe",
        ):
            with self.subTest(content=content[:30]):
                self.write(name, content)
                self.assertIsNone(links.read(self.vault, "alpha", ADDRESS))
                self.assertFalse(links.has(self.vault, "alpha", ADDRESS))

    def test_a_record_at_the_limits_is_used(self):
        self.write(f"{links.name_of(ADDRESS)}.json", json.dumps({"title": "x" * lookup.TITLE_CHARS, "preview": None}))
        self.assertEqual(len(links.read(self.vault, "alpha", ADDRESS).title), lookup.TITLE_CHARS)

    def test_a_record_of_exactly_the_size_limit_is_used_and_one_byte_more_is_not(self):
        base = json.dumps({"title": "x", "preview": None, "pad": ""})
        name = f"{links.name_of(ADDRESS)}.json"
        self.write(name, base[:-2] + "y" * (links.MAX_JSON - len(base)) + base[-2:])
        self.assertEqual(os.path.getsize(os.path.join(self.folder(), name)), links.MAX_JSON)
        self.assertTrue(links.has(self.vault, "alpha", ADDRESS))
        self.write(name, base[:-2] + "y" * (links.MAX_JSON + 1 - len(base)) + base[-2:])
        self.assertFalse(links.has(self.vault, "alpha", ADDRESS))

    def test_a_record_with_neither_title_nor_preview_is_nothing_but_counts_as_looked_up(self):
        self.write(f"{links.name_of(ADDRESS)}.json", '{"title": null, "preview": null}')
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS))
        self.assertTrue(links.has(self.vault, "alpha", ADDRESS))

    def test_a_record_or_picture_that_is_a_link_is_not_followed(self):
        links.store(self.vault, "alpha", ADDRESS, found())
        record = os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.json")
        moved = record + ".moved"
        os.rename(record, moved)
        os.symlink(moved, record)
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS))
        os.unlink(record)
        os.rename(moved, record)
        picture = os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.jpg")
        os.rename(picture, picture + ".moved")
        os.symlink(picture + ".moved", picture)
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS).preview)
        self.assertIsNone(links.path_of(self.vault, "alpha", links.name_of(ADDRESS), "jpg"))

    def test_a_links_folder_that_is_a_link_reads_as_nothing_kept(self):
        links.store(self.vault, "alpha", ADDRESS, found())
        moved = self.folder() + "-moved"
        os.rename(self.folder(), moved)
        os.symlink(moved, self.folder())
        self.assertIsNone(links.read(self.vault, "alpha", ADDRESS))
        self.assertFalse(links.has(self.vault, "alpha", ADDRESS))
        self.assertIsNone(links.path_of(self.vault, "alpha", links.name_of(ADDRESS), "jpg"))


class PathOfTest(LinksCase):
    def test_a_stored_thumbnail_is_found_and_a_missing_one_is_not(self):
        links.store(self.vault, "alpha", ADDRESS, found())
        name = links.name_of(ADDRESS)
        self.assertEqual(links.path_of(self.vault, "alpha", name, "jpg"), os.path.join(self.folder(), f"{name}.jpg"))
        self.assertIsNone(links.path_of(self.vault, "alpha", name, "png"))
        self.assertIsNone(links.path_of(self.vault, "alpha", "0" * 16, "jpg"))
        self.assertIsNone(links.path_of(self.vault, "beta-none", name, "jpg"))


class RemoveTest(LinksCase):
    def test_every_file_of_the_address_is_removed_and_no_other(self):
        links.store(self.vault, "alpha", ADDRESS, found())
        links.store(self.vault, "alpha", "https://other.example", found())
        links.remove(self.vault, "alpha", ADDRESS)
        self.assertEqual(self.board_files(), sorted(f"links/{links.name_of('https://other.example')}.{e}" for e in ("jpg", "json")))

    def test_each_kind_of_picture_is_removed(self):
        for ext in images.CONTENT_TYPES:
            with self.subTest(ext=ext):
                links.store(self.vault, "alpha", ADDRESS, found(ext=ext))
                links.remove(self.vault, "alpha", ADDRESS)
                self.assertEqual(self.board_files(), [])

    def test_nothing_kept_and_no_folder_are_fine(self):
        links.remove(self.vault, "alpha", ADDRESS)
        self.write("other.json", "{}")
        links.remove(self.vault, "alpha", ADDRESS)
        self.assertEqual(self.board_files(), ["links/other.json"])

    def test_a_links_folder_that_is_a_link_is_refused_and_nothing_follows_it(self):
        elsewhere = os.path.join(os.path.dirname(self.vault), "elsewhere")
        os.makedirs(elsewhere)
        with open(os.path.join(elsewhere, f"{links.name_of(ADDRESS)}.json"), "w", encoding="utf-8") as f:
            f.write("{}")
        os.makedirs(os.path.join(self.vault, "Board", "alpha"))
        os.symlink(elsewhere, self.folder())
        with self.assertRaises(VaultError):
            links.remove(self.vault, "alpha", ADDRESS)
        self.assertEqual(len(os.listdir(elsewhere)), 1)


if __name__ == "__main__":
    unittest.main()


SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 20"><path/></svg>'


class SvgIconTest(LinksCase):
    def keep(self, data=SVG):
        links.store(self.vault, "alpha", ADDRESS, lookup.Found("Kept", data, "svg"))
        return os.path.join(self.folder(), f"{links.name_of(ADDRESS)}.svg")

    def test_an_svg_is_stored_as_it_came_and_read_back_with_its_size(self):
        path = self.keep()
        with open(path, "rb") as f:
            self.assertEqual(f.read(), SVG)
        name = links.name_of(ADDRESS)
        self.assertEqual(links.read(self.vault, "alpha", ADDRESS), links.Link("Kept", f"/api/brands/alpha/links/{name}-{self.version('svg')}.svg", 24, 20))
        self.assertEqual(links.path_of(self.vault, "alpha", name, "svg"), path)

    def test_an_svg_edited_by_hand_to_fail_the_check_is_as_good_as_missing(self):
        path = self.keep()
        for data in (SVG.replace(b"<path/>", b"<script/>"), b"not svg", b"", SVG + b"x" * svg.MAX_BYTES):
            with self.subTest(data=data[:20]):
                with open(path, "wb") as f:
                    f.write(data)
                self.assertEqual(links.read(self.vault, "alpha", ADDRESS), links.Link("Kept", None, None, None))

    def test_remove_takes_the_svg_too(self):
        path = self.keep()
        links.remove(self.vault, "alpha", ADDRESS)
        self.assertEqual(os.listdir(self.folder()), [])
        self.assertFalse(os.path.exists(path))
