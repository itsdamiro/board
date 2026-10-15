"""Shared by the tests of the images, the items and the server: a throwaway vault and generated images."""

import io
import os
import tempfile
import unittest

from PIL import Image

NOTE = "---\ntype: moodboard\n---\n\n"
FORMATS = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP", "gif": "GIF"}


def make_image(ext="png", size=(40, 30), exif_orientation=None):
    """The bytes of a generated image: a gradient, so it is not a flat colour that any codec would shrink to nothing."""
    image = Image.new("RGB", size)
    image.putdata([(x * 255 // max(size[0], 1), y * 255 // max(size[1], 1), 90) for y in range(size[1]) for x in range(size[0])])
    out = io.BytesIO()
    extra = {}
    if exif_orientation:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        extra["exif"] = exif
    image.save(out, FORMATS[ext], **extra)
    return out.getvalue()


class VaultCase(unittest.TestCase):
    """A vault with one brand, `alpha`, that has a hub note and an empty Moodboard note."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.vault = os.path.join(os.path.realpath(self._tmp.name), "vault")
        self.brand = self.make_brand("alpha")

    def make_brand(self, slug, moodboard=NOTE):
        folder = os.path.join(self.vault, "Brands", slug)
        os.makedirs(folder)
        with open(os.path.join(folder, f"{slug}.md"), "w", encoding="utf-8") as f:
            f.write("---\nstatus: active\n---\n\nA summary.\n")
        if moodboard is not None:
            with open(os.path.join(folder, f"{slug} - Moodboard.md"), "w", encoding="utf-8", newline="") as f:
                f.write(moodboard)
        return folder

    def moodboard_text(self, slug="alpha"):
        with open(os.path.join(self.vault, "Brands", slug, f"{slug} - Moodboard.md"), encoding="utf-8", newline="") as f:
            return f.read()

    def board_files(self, slug="alpha"):
        """Every file under Board/<slug>, as paths relative to it; empty if there is no such folder."""
        root = os.path.join(self.vault, "Board", slug)
        return sorted(os.path.relpath(os.path.join(d, n), root) for d, _, names in os.walk(root) for n in names)
