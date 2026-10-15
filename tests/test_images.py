"""Tests for board/images.py, on generated images and throwaway vaults."""

import io
import os
import struct
import time
import unittest
from unittest import mock

from PIL import Image

from board import images, moodboard
from board.vault import VaultError
from tests.helpers import FORMATS, VaultCase, make_image


class SniffTest(unittest.TestCase):
    def test_each_format_is_known_by_its_first_bytes(self):
        for ext in FORMATS:
            with self.subTest(ext=ext):
                self.assertEqual(images.sniff(make_image(ext)), ext)

    def test_both_gif_versions_are_known(self):
        for header in (b"GIF87a", b"GIF89a"):
            self.assertEqual(images.sniff(header + b"rest"), "gif")

    def test_a_riff_file_that_is_not_webp_is_refused(self):
        with self.assertRaises(images.ImageRefused):
            images.sniff(b"RIFF\x00\x00\x00\x00WAVEfmt ")

    def test_other_content_is_refused(self):
        for data in (b"\x89PNG but not the whole signature", b"GIF88a", b"GIF", b"", b"hello", b"<svg xmlns='http://www.w3.org/2000/svg'/>", b"%PDF-1.7", b"\xff\xd8", b"BM" + b"\0" * 20):
            with self.subTest(data=data[:12]), self.assertRaises(images.ImageRefused):
                images.sniff(data)

    def test_a_file_over_the_limit_is_refused_even_if_it_starts_like_a_png(self):
        with self.assertRaisesRegex(images.ImageRefused, "25 MB"):
            images.sniff(b"\x89PNG\r\n\x1a\n" + b"\0" * images.MAX_BYTES)

    def test_a_file_exactly_at_the_limit_is_taken(self):
        self.assertEqual(images.sniff(b"\x89PNG\r\n\x1a\n" + b"\0" * (images.MAX_BYTES - 8)), "png")


class ThumbnailTest(unittest.TestCase):
    def shape(self, data):
        with Image.open(io.BytesIO(data)) as image:
            return image.format, image.size

    def test_a_wide_image_is_scaled_to_640_and_keeps_its_proportions(self):
        for ext, fmt in FORMATS.items():
            with self.subTest(ext=ext):
                self.assertEqual(self.shape(images.thumbnail(make_image(ext, (1600, 800)), ext)), (fmt, (640, 320)))

    def test_a_small_image_is_not_enlarged(self):
        self.assertEqual(self.shape(images.thumbnail(make_image("png", (100, 50)), "png"))[1], (100, 50))

    def test_a_tall_image_is_scaled_by_its_width(self):
        self.assertEqual(self.shape(images.thumbnail(make_image("png", (800, 3000)), "png"))[1], (640, 2400))

    def test_the_exif_rotation_is_applied(self):
        data = make_image("jpg", (800, 400), exif_orientation=6)  # displayed rotated: 400 wide, 800 high
        self.assertEqual(self.shape(images.thumbnail(data, "jpg"))[1], (400, 800))

    def test_a_truncated_image_is_refused(self):
        data = make_image("png", (300, 300))
        with self.assertRaises(images.ImageRefused):
            images.thumbnail(data[: len(data) // 2], "png")

    def test_bytes_that_only_start_like_an_image_are_refused(self):
        for ext, head in (("png", b"\x89PNG\r\n\x1a\n"), ("jpg", b"\xff\xd8\xff\xe0"), ("gif", b"GIF89a"), ("webp", b"RIFF\0\0\0\0WEBP")):
            with self.subTest(ext=ext), self.assertRaises(images.ImageRefused):
                images.thumbnail(head + b"junk" * 10, ext)

    def test_an_image_with_too_many_pixels_is_refused_and_one_at_the_limit_is_not(self):
        data = make_image("png", (20, 20))  # 400 pixels
        for limit in (399, 100, 1):
            with self.subTest(limit=limit), mock.patch.object(images, "MAX_PIXELS", limit), self.assertRaisesRegex(images.ImageRefused, "pixels"):
                images.thumbnail(data, "png")
        with mock.patch.object(images, "MAX_PIXELS", 400):
            images.thumbnail(data, "png")

    def test_the_librarys_own_pixel_limit_is_off_because_ours_is_checked_first(self):
        self.assertIsNone(Image.MAX_IMAGE_PIXELS)

    def test_any_failure_inside_a_decoder_is_a_refusal_not_a_crash(self):
        for error in (EOFError("x"), struct.error("x"), KeyError("x"), ZeroDivisionError("x")):
            with self.subTest(error=type(error).__name__), mock.patch.object(images.ImageOps, "exif_transpose", side_effect=error):
                with self.assertRaises(images.ImageRefused):
                    images.thumbnail(make_image("png"), "png")


class NewIdTest(unittest.TestCase):
    def test_an_id_is_what_the_moodboard_reader_accepts(self):
        for _ in range(20):
            self.assertRegex(images.new_id(), f"^{moodboard.ID_PATTERN}$")

    def test_the_timestamp_is_the_given_time_in_local_time(self):
        with mock.patch.dict(os.environ, {"TZ": "UTC"}):
            time.tzset()
            self.assertTrue(images.new_id(1_760_000_000).startswith("2025-10-09-0853-"))
        time.tzset()

    def test_ids_made_in_one_minute_differ(self):
        self.assertGreater(len({images.new_id(1_760_000_000) for _ in range(50)}), 40)

    def test_ids_sort_by_time(self):
        self.assertLess(images.new_id(1_760_000_000), images.new_id(1_760_000_000 + 3600))


class StoreTest(VaultCase):
    def test_the_original_is_kept_unchanged_and_the_thumbnail_beside_it(self):
        data, thumb = make_image("png"), make_image("png", (10, 10))
        image_id = images.store(self.vault, "alpha", data, "png", thumb)
        self.assertRegex(image_id, f"^{moodboard.ID_PATTERN}$")
        self.assertEqual(self.board_files(), sorted([f"{image_id}.png", f"thumbs/{image_id}.png"]))
        with open(os.path.join(self.vault, "Board", "alpha", f"{image_id}.png"), "rb") as f:
            self.assertEqual(f.read(), data)
        with open(os.path.join(self.vault, "Board", "alpha", "thumbs", f"{image_id}.png"), "rb") as f:
            self.assertEqual(f.read(), thumb)

    def test_a_taken_id_is_never_overwritten_and_another_is_tried(self):
        first = images.store(self.vault, "alpha", b"one", "png", b"t1")
        with mock.patch.object(images, "new_id", side_effect=[first, first, "2000-01-01-0000-aaaa"]):
            second = images.store(self.vault, "alpha", b"two", "png", b"t2")
        self.assertEqual(second, "2000-01-01-0000-aaaa")
        with open(os.path.join(self.vault, "Board", "alpha", f"{first}.png"), "rb") as f:
            self.assertEqual(f.read(), b"one")

    def test_a_thumbnail_name_already_taken_undoes_the_original_and_tries_another_id(self):
        os.makedirs(os.path.join(self.vault, "Board", "alpha", "thumbs"))
        taken = os.path.join(self.vault, "Board", "alpha", "thumbs", "2000-01-01-0000-aaaa.png")
        with open(taken, "wb") as f:
            f.write(b"hand-made")
        with mock.patch.object(images, "new_id", side_effect=["2000-01-01-0000-aaaa", "2000-01-01-0000-bbbb"]):
            self.assertEqual(images.store(self.vault, "alpha", b"x", "png", b"t"), "2000-01-01-0000-bbbb")
        self.assertEqual(self.board_files(), ["2000-01-01-0000-bbbb.png", "thumbs/2000-01-01-0000-aaaa.png", "thumbs/2000-01-01-0000-bbbb.png"])
        with open(taken, "rb") as f:
            self.assertEqual(f.read(), b"hand-made")

    def test_gives_up_when_no_id_is_free(self):
        with mock.patch.object(images, "new_id", return_value="2000-01-01-0000-aaaa"):
            images.store(self.vault, "alpha", b"x", "png", b"t")
            with self.assertRaises(OSError):
                images.store(self.vault, "alpha", b"y", "png", b"t")

    def test_a_failed_write_leaves_no_file_behind(self):
        with self.assertRaises(TypeError):  # the original is written, then the thumbnail's write fails
            images.store(self.vault, "alpha", b"x", "png", object())
        self.assertEqual(self.board_files(), [])

    def test_board_may_itself_be_a_link_to_another_folder(self):
        elsewhere = os.path.join(os.path.dirname(self.vault), "disk")
        os.makedirs(elsewhere)
        os.symlink(elsewhere, os.path.join(self.vault, "Board"))
        image_id = images.store(self.vault, "alpha", b"x", "png", b"t")
        self.assertTrue(os.path.isfile(os.path.join(elsewhere, "alpha", f"{image_id}.png")))

    def test_a_brand_folder_under_board_that_is_a_link_is_refused(self):
        elsewhere = os.path.join(os.path.dirname(self.vault), "elsewhere")
        os.makedirs(elsewhere)
        os.makedirs(os.path.join(self.vault, "Board"))
        os.symlink(elsewhere, os.path.join(self.vault, "Board", "alpha"))
        with self.assertRaises(VaultError):
            images.store(self.vault, "alpha", b"x", "png", b"t")
        self.assertEqual(os.listdir(elsewhere), [])

    def test_a_folder_made_by_another_request_a_moment_ago_is_used(self):
        real_mkdir = os.mkdir

        def racing(path, *args):
            real_mkdir(path, *args)  # the other request got there first
            raise FileExistsError(17, "File exists", path)

        with mock.patch("os.mkdir", racing):
            image_id = images.store(self.vault, "alpha", b"x", "png", b"t")
        self.assertIn(f"{image_id}.png", self.board_files())

    def test_a_thumbs_folder_that_is_a_link_is_refused(self):
        elsewhere = os.path.join(os.path.dirname(self.vault), "elsewhere")
        os.makedirs(elsewhere)
        os.makedirs(os.path.join(self.vault, "Board", "alpha"))
        os.symlink(elsewhere, os.path.join(self.vault, "Board", "alpha", "thumbs"))
        with self.assertRaises(VaultError):
            images.store(self.vault, "alpha", b"x", "png", b"t")
        self.assertEqual(os.listdir(elsewhere), [])
        self.assertEqual(self.board_files(), [])

    def test_a_brand_folder_that_is_a_plain_file_is_refused(self):
        os.makedirs(os.path.join(self.vault, "Board"))
        with open(os.path.join(self.vault, "Board", "alpha"), "wb") as f:
            f.write(b"a file")
        with self.assertRaises(VaultError):
            images.store(self.vault, "alpha", b"x", "png", b"t")


class RemoveAndPathTest(VaultCase):
    def setUp(self):
        super().setUp()
        self.id = images.store(self.vault, "alpha", b"orig", "png", b"thumb")
        self.other = images.store(self.vault, "alpha", b"other", "jpg", b"thumb2")

    def test_remove_deletes_both_files_and_only_them(self):
        images.remove(self.vault, "alpha", self.id, "png")
        self.assertEqual(self.board_files(), sorted([f"{self.other}.jpg", f"thumbs/{self.other}.jpg"]))

    def test_remove_does_not_touch_a_file_with_the_same_id_and_another_extension(self):
        images.remove(self.vault, "alpha", self.id, "jpg")
        self.assertEqual(len(self.board_files()), 4)

    def test_remove_of_files_that_are_already_gone_is_fine(self):
        images.remove(self.vault, "alpha", self.id, "png")
        images.remove(self.vault, "alpha", self.id, "png")

    def test_remove_works_when_the_thumbnail_is_missing(self):
        os.unlink(os.path.join(self.vault, "Board", "alpha", "thumbs", f"{self.id}.png"))
        images.remove(self.vault, "alpha", self.id, "png")
        self.assertNotIn(f"{self.id}.png", self.board_files())

    def test_remove_with_no_board_folder_does_nothing(self):
        images.remove(self.vault, "beta", self.id, "png")

    def test_remove_refuses_a_brand_folder_that_is_a_link(self):
        real = os.path.join(self.vault, "Board", "alpha")
        moved = os.path.join(self.vault, "Board", "moved")
        os.rename(real, moved)
        os.symlink(moved, real)
        with self.assertRaises(VaultError):
            images.remove(self.vault, "alpha", self.id, "png")
        self.assertTrue(os.path.isfile(os.path.join(moved, f"{self.id}.png")))

    def test_path_of_gives_the_original_or_the_thumbnail(self):
        self.assertTrue(images.path_of(self.vault, "alpha", self.id, "png", thumb=False).endswith(f"alpha/{self.id}.png"))
        self.assertTrue(images.path_of(self.vault, "alpha", self.id, "png", thumb=True).endswith(f"thumbs/{self.id}.png"))

    def test_path_of_is_none_for_a_missing_file_or_folder(self):
        self.assertIsNone(images.path_of(self.vault, "alpha", "2000-01-01-0000-aaaa", "png", thumb=False))
        self.assertIsNone(images.path_of(self.vault, "alpha", self.id, "gif", thumb=True))
        self.assertIsNone(images.path_of(self.vault, "beta", self.id, "png", thumb=False))

    def test_path_of_is_none_for_a_file_that_is_a_link(self):
        target = os.path.join(self.vault, "Brands", "alpha", "alpha.md")
        link = os.path.join(self.vault, "Board", "alpha", "2000-01-01-0000-aaaa.png")
        os.symlink(target, link)
        self.assertIsNone(images.path_of(self.vault, "alpha", "2000-01-01-0000-aaaa", "png", thumb=False))


if __name__ == "__main__":
    unittest.main()
