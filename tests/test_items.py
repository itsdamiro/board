"""Tests for board/items.py, on throwaway vaults and generated images."""

import os
import unittest
from unittest import mock

from board import images, items, moodboard, vault, vault_io
from board.moodboard import MoodboardError
from tests.helpers import NOTE, VaultCase, make_image


class AddItemTest(VaultCase):
    def add(self, description="a thought", source=None, image=None, slug="alpha"):
        return items.add_item(self.vault, slug, description, source, image)

    def test_an_image_with_a_description_and_an_address_is_stored_and_appended(self):
        data = make_image("png", (1200, 600))
        item = self.add("a quiet layout", "https://example.com/page", data)
        (block,) = moodboard.parse(self.moodboard_text())
        self.assertEqual((block.description, block.source, block.ext), ("a quiet layout", "https://example.com/page", "png"))
        self.assertEqual(item["key"], block.key)
        self.assertEqual(item["image"], f"/api/brands/alpha/images/{block.image_id}.png")
        self.assertEqual(item["thumb"], f"/api/brands/alpha/thumbs/{block.image_id}.png")
        self.assertEqual(self.board_files(), sorted([f"{block.image_id}.png", f"thumbs/{block.image_id}.png"]))

    def test_the_original_is_kept_byte_for_byte(self):
        data = make_image("jpg", (900, 300), exif_orientation=6)
        item = self.add(image=data)
        with open(os.path.join(self.vault, "Board", "alpha", os.path.basename(item["image"])), "rb") as f:
            self.assertEqual(f.read(), data)

    def test_the_note_before_the_new_block_is_kept_exactly(self):
        before = self.moodboard_text()
        self.add("one")
        self.add("two", "https://example.com")
        self.assertTrue(self.moodboard_text().startswith(before))

    def test_a_description_alone_and_an_address_alone_are_items(self):
        self.assertIsNone(self.add("just words")["image"])
        self.assertEqual(self.add("", "https://example.com")["source"], "https://example.com")
        self.assertEqual(self.board_files(), [])

    def test_a_description_of_exactly_the_longest_size_is_taken(self):
        self.assertEqual(len(self.add("x" * items.MAX_TEXT)["description"]), items.MAX_TEXT)

    def test_an_image_alone_is_an_item(self):
        self.assertEqual(self.add("", None, make_image("webp"))["description"], "")

    def test_text_is_trimmed_and_a_blank_address_is_none(self):
        item = self.add("  padded  ", "   ")
        self.assertEqual((item["description"], item["source"]), ("padded", None))

    def test_nothing_at_all_is_refused(self):
        with self.assertRaises(MoodboardError):
            self.add("", None, None)
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_every_refusal_writes_nothing(self):
        good = make_image("png")
        cases = [
            ("a bad address", dict(source="javascript:alert(1)", image=good)),
            ("an address with a space", dict(source="https://example.com/a b", image=good)),
            ("an address that is not a web address", dict(source="ftp://example.com/x", image=good)),
            ("a multi-line description", dict(description="one\ntwo", image=good)),
            ("a description that is a heading", dict(description="# title")),
            ("not an image", dict(image=b"%PDF-1.4 not an image")),
            ("a broken image", dict(image=good[:30])),
            ("a text over the limit", dict(description="x" * (items.MAX_TEXT + 1), image=good)),
            ("an address over the limit", dict(source="https://e.com/" + "x" * items.MAX_TEXT, image=good)),
        ]
        for name, kwargs in cases:
            with self.subTest(name), self.assertRaises(ValueError):
                self.add(**kwargs)
            self.assertEqual(self.moodboard_text(), NOTE, name)
            self.assertFalse(os.path.exists(os.path.join(self.vault, "Board")), name)

    def test_an_address_that_is_not_one_is_refused_and_not_kept_in_the_description_as_text(self):
        with self.assertRaises(MoodboardError):
            self.add("words", "not a web address")
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_a_brand_without_a_moodboard_note_is_refused_and_none_is_created(self):
        self.make_brand("beta", moodboard=None)
        with self.assertRaises(items.MissingMoodboard):
            self.add("x", image=make_image(), slug="beta")
        self.assertEqual(sorted(os.listdir(os.path.join(self.vault, "Brands", "beta"))), ["beta.md"])
        self.assertFalse(os.path.exists(os.path.join(self.vault, "Board")))

    def test_an_unknown_brand_or_a_path_instead_of_a_brand_is_refused(self):
        for slug in ("nobody", "../alpha", "alpha/..", ".", "", "ALPHA"):
            with self.subTest(slug=slug), self.assertRaises(vault.VaultError):
                self.add(slug=slug)

    def test_a_moodboard_that_is_a_link_to_another_file_is_never_written(self):
        target = os.path.join(self.vault, "Brands", "alpha", "alpha.md")
        moodboard_path = os.path.join(self.vault, "Brands", "alpha", "alpha - Moodboard.md")
        os.unlink(moodboard_path)
        os.symlink(target, moodboard_path)
        with open(target, "rb") as f:
            before = f.read()
        with self.assertRaises(vault.VaultError):
            self.add("x", image=make_image())
        with open(target, "rb") as f:
            self.assertEqual(f.read(), before)

    def test_when_the_note_cannot_be_written_the_image_files_are_taken_back(self):
        with mock.patch.object(vault_io, "append_block", side_effect=MoodboardError("changed")), self.assertRaises(MoodboardError):
            self.add("x", image=make_image())
        self.assertEqual(self.board_files(), [])
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_a_note_with_unclosed_frontmatter_is_refused_and_the_files_are_taken_back(self):
        self.make_brand("beta", moodboard="---\ntype: moodboard\n")
        with self.assertRaises(MoodboardError):
            self.add("x", image=make_image(), slug="beta")
        self.assertEqual(self.board_files("beta"), [])

    def test_a_note_with_windows_line_endings_keeps_them(self):
        self.make_brand("beta", moodboard="---\r\ntype: moodboard\r\n---\r\n\r\nold\r\n")
        self.add("new", slug="beta")
        self.assertEqual(self.moodboard_text("beta"), "---\r\ntype: moodboard\r\n---\r\n\r\nold\r\n\r\nnew\r\n")


class BrandViewTest(VaultCase):
    def test_a_brand_with_an_empty_moodboard(self):
        view = items.brand_view(self.vault, "alpha")
        self.assertEqual(view["slug"], "alpha")
        self.assertEqual((view["status"], view["summary"]), ("active", "A summary."))
        self.assertEqual(view["moodboard"], {"exists": True, "problem": None, "items": []})

    def test_items_come_newest_first_with_their_urls(self):
        first = items.add_item(self.vault, "alpha", "first", None, make_image())
        second = items.add_item(self.vault, "alpha", "second", "https://example.com", None)
        listed = items.brand_view(self.vault, "alpha")["moodboard"]["items"]
        self.assertEqual([i["description"] for i in listed], ["second", "first"])
        self.assertEqual(listed[1], first)
        self.assertEqual(listed[0], {**second, "date": first["date"]})  # an item with no image takes the date before it, in the list only
        self.assertEqual(set(listed[0]), {"key", "text", "description", "source", "image", "thumb", "width", "height", "date"})

    def test_an_item_has_the_date_of_its_image_id_and_one_without_takes_the_one_before_it(self):
        text = NOTE + "![[2026-10-14-0900-aaaa.png]]\nfirst\n\nno image, no date of its own\n\n![[2026-10-15-1432-bbbb.png]]\nthird\n\nlast, no image\n"
        self.make_brand("beta", text)
        listed = items.brand_view(self.vault, "beta")["moodboard"]["items"]
        self.assertEqual(
            [(i["description"] or i["text"], i["date"]) for i in listed],
            [("last, no image", "2026-10-15T14:32"), ("third", "2026-10-15T14:32"), ("no image, no date of its own", "2026-10-14T09:00"), ("first", "2026-10-14T09:00")],
        )

    def test_items_before_any_dated_one_have_no_date(self):
        self.make_brand("beta", NOTE + "plain words\n\n![[2026-10-15-1432-bbbb.png]]\nwith image\n")
        listed = items.brand_view(self.vault, "beta")["moodboard"]["items"]
        self.assertEqual([i["date"] for i in listed], ["2026-10-15T14:32", None])

    def test_an_item_with_an_image_carries_its_thumbnail_size_and_one_without_has_none(self):
        added = items.add_item(self.vault, "alpha", "wide", None, make_image("png", (1200, 600)))
        plain = items.add_item(self.vault, "alpha", "plain", None, None)
        self.assertEqual((added["width"], added["height"]), (640, 320))
        self.assertEqual((plain["width"], plain["height"]), (None, None))
        listed = items.brand_view(self.vault, "alpha")["moodboard"]["items"]
        self.assertEqual([(i["width"], i["height"]) for i in listed], [(None, None), (640, 320)])

    def test_an_item_whose_thumbnail_is_gone_is_still_listed_with_no_size(self):
        added = items.add_item(self.vault, "alpha", "wide", None, make_image("png", (1200, 600)))
        os.unlink(os.path.join(self.vault, "Board", "alpha", "thumbs", os.path.basename(added["thumb"])))
        (listed,) = items.brand_view(self.vault, "alpha")["moodboard"]["items"]
        self.assertEqual((listed["image"] is not None, listed["width"], listed["height"]), (True, None, None))

    def test_an_unreadable_thumbnail_gives_no_size_and_does_not_break_the_brand(self):
        added = items.add_item(self.vault, "alpha", "wide", None, make_image("png", (1200, 600)))
        with open(os.path.join(self.vault, "Board", "alpha", "thumbs", os.path.basename(added["thumb"])), "wb") as f:
            f.write(b"not an image")
        (listed,) = items.brand_view(self.vault, "alpha")["moodboard"]["items"]
        self.assertEqual((listed["width"], listed["height"]), (None, None))

    def test_a_slug_with_unusual_characters_is_quoted_in_urls(self):
        self.make_brand("it's café")
        item = items.add_item(self.vault, "it's café", "x", None, make_image())
        self.assertEqual(item["image"].split("/")[3], "it%27s%20caf%C3%A9")

    def test_a_block_written_by_hand_is_shown_without_an_image_url(self):
        self.make_brand("beta", moodboard=NOTE + "![[photo.png]]\nmine\n\nplain\n")
        listed = items.brand_view(self.vault, "beta")["moodboard"]["items"]
        self.assertEqual([(i["description"], i["image"], i["thumb"]) for i in listed], [("plain", None, None), ("mine", None, None)])

    def test_a_missing_moodboard_is_reported_not_raised(self):
        self.make_brand("beta", moodboard=None)
        self.assertEqual(items.brand_view(self.vault, "beta")["moodboard"], {"exists": False, "problem": None, "items": []})

    def test_a_moodboard_that_cannot_be_read_is_reported_with_no_items(self):
        self.make_brand("beta", moodboard="---\nnever closed\n")
        view = items.brand_view(self.vault, "beta")["moodboard"]
        self.assertEqual((view["exists"], view["items"]), (True, []))
        self.assertIn("frontmatter", view["problem"])

    def test_a_moodboard_that_is_not_text_is_reported_without_a_path(self):
        self.make_brand("beta", moodboard=None)
        with open(os.path.join(self.vault, "Brands", "beta", "beta - Moodboard.md"), "wb") as f:
            f.write(b"\xff\xfe\x00bad")
        problem = items.brand_view(self.vault, "beta")["moodboard"]["problem"]
        self.assertIn("UTF-8", problem)
        self.assertNotIn(self.vault, problem)

    def test_a_moodboard_that_cannot_be_opened_is_reported_without_a_path(self):
        with mock.patch.object(vault_io, "read_blocks", side_effect=PermissionError(13, "Permission denied", self.vault)):
            problem = items.brand_view(self.vault, "alpha")["moodboard"]["problem"]
        self.assertEqual(problem, "the Moodboard note could not be read")

    def test_an_unknown_brand_is_refused(self):
        with self.assertRaises(vault.BrandNotFound):
            items.brand_view(self.vault, "nobody")


class DeleteItemTest(VaultCase):
    def setUp(self):
        super().setUp()
        self.keep = items.add_item(self.vault, "alpha", "keep me", None, make_image("jpg"))
        self.drop = items.add_item(self.vault, "alpha", "drop me", "https://example.com", make_image("png"))

    def test_the_block_and_its_files_are_removed_and_nothing_else(self):
        items.delete_item(self.vault, "alpha", self.drop["key"])
        self.assertEqual([b.description for b in moodboard.parse(self.moodboard_text())], ["keep me"])
        self.assertEqual([os.path.basename(f) for f in self.board_files()], [os.path.basename(self.keep["image"])] * 2)

    def test_a_block_with_no_image_is_removed_and_files_are_left_alone(self):
        text = items.add_item(self.vault, "alpha", "words only", None, None)
        items.delete_item(self.vault, "alpha", text["key"])
        self.assertEqual(len(self.board_files()), 4)

    def test_a_block_with_no_image_asks_for_no_file_to_be_removed(self):
        text = items.add_item(self.vault, "alpha", "words only", None, None)
        with mock.patch.object(images, "remove") as remove:
            items.delete_item(self.vault, "alpha", text["key"])
        remove.assert_not_called()

    def test_a_block_that_was_edited_since_it_was_shown_is_refused_and_keeps_its_files(self):
        with open(os.path.join(self.vault, "Brands", "alpha", "alpha - Moodboard.md"), "a", encoding="utf-8") as f:
            f.write("\n")
        text = self.moodboard_text().replace("drop me", "drop me, edited")
        with open(os.path.join(self.vault, "Brands", "alpha", "alpha - Moodboard.md"), "w", encoding="utf-8") as f:
            f.write(text)
        with self.assertRaises(moodboard.BlockNotFound):
            items.delete_item(self.vault, "alpha", self.drop["key"])
        self.assertEqual(len(self.board_files()), 4)

    def test_an_image_another_block_still_embeds_is_kept(self):
        embed = moodboard.parse(self.moodboard_text())[1].embed  # the second block, "drop me", has the png
        with open(os.path.join(self.vault, "Brands", "alpha", "alpha - Moodboard.md"), "a", encoding="utf-8") as f:
            f.write(f"\n{embed}\nthe same picture, another caption\n")
        items.delete_item(self.vault, "alpha", self.drop["key"])
        self.assertEqual(len(self.board_files()), 4)
        again = next(b.key for b in moodboard.parse(self.moodboard_text()) if b.description.startswith("the same"))
        items.delete_item(self.vault, "alpha", again)  # now nothing embeds it
        self.assertEqual(len(self.board_files()), 2)

    def test_a_block_with_a_hand_written_embed_removes_no_file(self):
        folder = os.path.join(self.vault, "Board", "alpha")
        with open(os.path.join(folder, "photo.png"), "wb") as f:
            f.write(b"mine")
        with open(os.path.join(self.vault, "Brands", "alpha", "alpha - Moodboard.md"), "a", encoding="utf-8") as f:
            f.write("\n![[photo.png]]\nby hand\n")
        key = next(b.key for b in moodboard.parse(self.moodboard_text()) if b.description == "by hand")
        items.delete_item(self.vault, "alpha", key)
        self.assertTrue(os.path.isfile(os.path.join(folder, "photo.png")))

    def test_files_that_are_already_gone_do_not_stop_the_delete(self):
        for path in self.board_files():
            os.unlink(os.path.join(self.vault, "Board", "alpha", path))
        items.delete_item(self.vault, "alpha", self.drop["key"])
        self.assertNotIn("drop me", self.moodboard_text())

    def test_when_the_files_cannot_be_removed_the_block_is_gone_and_the_error_says_so(self):
        with mock.patch.object(images, "remove", side_effect=PermissionError(13, "denied", self.vault)):
            with self.assertRaises(items.FilesLeft) as raised:
                items.delete_item(self.vault, "alpha", self.drop["key"])
        self.assertNotIn(self.vault, str(raised.exception))
        self.assertNotIn("drop me", self.moodboard_text())

    def test_a_brand_folder_under_board_that_is_a_link_is_reported_and_nothing_follows_it(self):
        real = os.path.join(self.vault, "Board", "alpha")
        moved = os.path.join(self.vault, "Board", "moved")
        os.rename(real, moved)
        os.symlink(moved, real)
        with self.assertRaises(items.FilesLeft):
            items.delete_item(self.vault, "alpha", self.drop["key"])
        self.assertEqual(len(os.listdir(moved)), 3)  # two originals, thumbs

    def test_two_identical_blocks_are_not_guessed_between(self):
        with open(os.path.join(self.vault, "Brands", "alpha", "alpha - Moodboard.md"), "a", encoding="utf-8") as f:
            f.write("\ntwin\n\ntwin\n")
        key = next(b.key for b in moodboard.parse(self.moodboard_text()) if b.description == "twin")
        with self.assertRaises(moodboard.AmbiguousBlock):
            items.delete_item(self.vault, "alpha", key)

    def test_a_missing_moodboard_and_an_unknown_brand_are_refused(self):
        self.make_brand("beta", moodboard=None)
        with self.assertRaises(items.MissingMoodboard):
            items.delete_item(self.vault, "beta", "0" * 64)
        with self.assertRaises(vault.BrandNotFound):
            items.delete_item(self.vault, "nobody", "0" * 64)


if __name__ == "__main__":
    unittest.main()
