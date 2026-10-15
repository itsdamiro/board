"""Tests for scripts/private_check.py, each on a throwaway git repository with synthetic names."""

import contextlib
import io
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import private_check  # noqa: E402

# Built from pieces so that this tracked file does not itself contain a home-directory path.
MAC_PATH = "/" + "Users" + "/someone/project/file.md"
LINUX_PATH = "/" + "home" + "/someone/project/file.md"
WINDOWS_PATH = "C:" + "\\" + "Users" + "\\" + "someone" + "\\" + "file.md"


class PrivateCheckTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = self._tmp.name
        self.git("init", "-q")

    def git(self, *args):
        subprocess.run(["git", "-C", self.root, *args], check=True, capture_output=True)

    def add(self, name, text, track=True):
        path = os.path.join(self.root, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        if track:
            self.git("add", name)

    def terms(self, *lines, name=".private-terms"):
        self.add(name, "\n".join(lines) + "\n", track=False)

    def run_check(self):
        return private_check.check(self.root, ".private-terms")

    def test_clean_repository_passes(self):
        self.add("a.md", "Nothing private here, only ~/relative notes and /usr/local/bin.\n")
        self.terms("acmecorp")
        self.assertEqual(self.run_check(), ([], ""))

    def test_home_paths_fail_on_each_platform(self):
        for text in (MAC_PATH, LINUX_PATH, WINDOWS_PATH):
            with self.subTest(text=text):
                self.add("a.md", f"first line\nsee {text}\n")
                found, _ = self.run_check()
                self.assertEqual(found, ["a.md:2: a home-directory path"])

    def test_tilde_and_bare_folder_names_are_not_home_paths(self):
        self.add("a.md", "~/Development/x, a folder called Users/ and a /Users link\n")
        self.assertEqual(self.run_check()[0], [])

    def test_term_in_text_fails_ignoring_case_and_the_term_is_not_printed(self):
        self.add("a.md", "line one\nWe worked with AcmeCorp last year\n")
        self.terms("# the owner's list", "", "acmecorp")
        found, _ = self.run_check()
        self.assertEqual(found, ["a.md:2: text matches line 3 of .private-terms"])
        self.assertNotIn("acme", " ".join(found).lower())

    def test_a_term_written_with_capitals_still_matches(self):
        self.add("a.md", "we worked with acmecorp\n")
        self.terms("AcmeCorp")
        self.assertEqual(self.run_check()[0], ["a.md:1: text matches line 1 of .private-terms"])

    def test_a_commented_out_term_matches_nothing(self):
        self.add("a.md", "a line that says # acmecorp literally\n")
        self.terms("# acmecorp")
        self.assertEqual(self.run_check()[0], [])

    def test_a_tracked_file_deleted_from_the_working_tree_is_skipped(self):
        self.add("gone.md", "text\n")
        os.remove(os.path.join(self.root, "gone.md"))
        self.assertEqual(self.run_check()[0], [])

    def test_a_folder_named_home_inside_a_relative_path_is_not_a_home_path(self):
        self.add("web/src/home/page/index.tsx", "import x from 'app/home/page/x'\n")
        self.assertEqual(self.run_check()[0], [])

    def test_a_symlink_is_judged_by_its_target_path(self):
        os.symlink(MAC_PATH, os.path.join(self.root, "link"))
        os.symlink(self.root, os.path.join(self.root, "dirlink"))  # to a folder: must not crash
        self.git("add", "link", "dirlink")
        self.assertEqual(self.run_check()[0], ["link:1: a home-directory path"])

    def test_term_in_a_path_fails(self):
        self.add("docs/acmecorp-notes.md", "harmless\n")
        self.terms("acmecorp")
        self.assertEqual(self.run_check()[0], ["docs/acmecorp-notes.md: the file's path matches line 1 of .private-terms"])

    def test_untracked_files_are_not_scanned(self):
        self.add("a.md", "fine\n")
        self.add("draft.md", f"{MAC_PATH} and acmecorp\n", track=False)
        self.terms("acmecorp")
        self.assertEqual(self.run_check()[0], [])

    def test_missing_terms_file_is_skipped_with_a_note_but_home_paths_still_fail(self):
        self.add("a.md", f"{MAC_PATH}\n")
        found, note = self.run_check()
        self.assertEqual(found, ["a.md:1: a home-directory path"])
        self.assertIn("skipped", note)

    def test_tracked_terms_file_fails(self):
        self.add(".private-terms", "acmecorp\n")
        found, _ = self.run_check()
        self.assertTrue(any("is tracked" in p for p in found), found)

    def test_empty_terms_file_matches_nothing(self):
        self.add("a.md", "anything at all\n")
        self.terms("# only a comment", "")
        self.assertEqual(self.run_check()[0], [])

    def test_binary_file_is_scanned_without_crashing(self):
        path = os.path.join(self.root, "b.bin")
        with open(path, "wb") as f:
            f.write(b"\xff\xfe\x00 acmecorp \x00")
        self.git("add", "b.bin")
        self.terms("acmecorp")
        self.assertEqual(self.run_check()[0], ["b.bin:1: text matches line 1 of .private-terms"])

    def test_not_a_git_repository_is_a_usage_error(self):
        with tempfile.TemporaryDirectory() as bare, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(private_check.main(["--root", bare]), 2)

    def test_main_exit_codes(self):
        self.add("a.md", "fine\n")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(private_check.main(["--root", self.root]), 0)
            self.add("a.md", f"{MAC_PATH}\n")
            self.assertEqual(private_check.main(["--root", self.root]), 1)


if __name__ == "__main__":
    unittest.main()
