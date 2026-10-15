"""Tests for scripts/sample_vault.py: the vault the end-to-end tests run against must be one the server accepts."""

import contextlib
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import sample_vault  # noqa: E402

from board import moodboard, vault  # noqa: E402


class SampleVaultTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.folder = os.path.join(self._tmp.name, "vault")

    def test_the_vault_is_one_the_server_accepts_and_lists_its_brands(self):
        path = sample_vault.make(self.folder)
        self.assertEqual(vault.find_vault(path, {}), path)
        self.assertEqual(sorted(vault.list_brands(path)), sorted(sample_vault.BRANDS))

    def test_each_brand_has_a_moodboard_with_no_items(self):
        path = sample_vault.make(self.folder)
        for slug in sample_vault.BRANDS:
            with open(vault.moodboard_path(path, slug), encoding="utf-8") as f:
                self.assertEqual(moodboard.parse(f.read()), [])

    def test_an_existing_folder_is_refused_with_exit_2_and_left_alone(self):
        os.makedirs(self.folder)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = sample_vault.main(["sample_vault.py", self.folder])
        self.assertEqual(code, 2)
        self.assertIn("cannot make", err.getvalue())
        self.assertEqual(os.listdir(self.folder), [])

    def test_the_command_line_makes_the_vault_and_prints_nothing(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = sample_vault.main(["sample_vault.py", self.folder])
        self.assertEqual((code, out.getvalue()), (0, ""))
        self.assertTrue(os.path.isdir(os.path.join(self.folder, "Brands")))

    def test_the_wrong_number_of_arguments_is_a_usage_error(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(sample_vault.main(["sample_vault.py"]), 2)
