"""Tests for board/vault.py, on throwaway vaults with synthetic names and text."""

import os
import tempfile
import threading
import unittest
from unittest import mock

from board import vault
from board.vault import BrandNotFound, VaultError

HUB = "---\nstatus: active\nclient: \"Example Client\"\n---\n\n# Example\n\nA short summary\nover two lines.\n\nLater text.\n"


class VaultTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = os.path.realpath(self._tmp.name)
        self.vault = os.path.join(self.root, "vault")
        os.makedirs(os.path.join(self.vault, "Brands"))

    def brand(self, slug="alpha", hub=HUB):
        folder = os.path.join(self.vault, "Brands", slug)
        os.makedirs(folder, exist_ok=True)
        if hub is not None:
            self.note(slug, f"{slug}.md", hub)
        return folder

    def note(self, slug, name, text):
        data = text if isinstance(text, bytes) else text.encode("utf-8")
        with open(os.path.join(self.vault, "Brands", slug, name), "wb") as f:
            f.write(data)

    def read(self, slug="alpha"):
        return vault.read_brand(self.vault, slug)


class FindVaultTest(VaultTestCase):
    def test_the_argument_wins_over_the_environment(self):
        other = os.path.join(self.root, "other")
        os.makedirs(os.path.join(other, "Brands"))
        self.assertEqual(vault.find_vault(self.vault, {vault.ENV_VAR: other}), self.vault)

    def test_the_environment_is_used_without_an_argument(self):
        self.assertEqual(vault.find_vault(None, {vault.ENV_VAR: self.vault}), self.vault)

    def test_an_empty_argument_falls_back_to_the_environment(self):
        self.assertEqual(vault.find_vault("", {vault.ENV_VAR: self.vault}), self.vault)

    def test_no_path_at_all_is_refused_and_says_how_to_give_one(self):
        with self.assertRaisesRegex(VaultError, "--vault"):
            vault.find_vault(None, {})

    def test_a_folder_without_brands_is_not_a_vault(self):
        with self.assertRaisesRegex(VaultError, "Brands"):
            vault.find_vault(self.root, {})

    def test_a_missing_folder_is_refused(self):
        with self.assertRaises(VaultError):
            vault.find_vault(os.path.join(self.root, "nope"), {})

    def test_the_path_is_made_real(self):
        link = os.path.join(self.root, "link")
        os.symlink(self.vault, link)
        self.assertEqual(vault.find_vault(link, {}), self.vault)

    def test_a_home_shortcut_is_expanded(self):
        with mock.patch.dict(os.environ, {"HOME": self.root}):
            self.assertEqual(vault.find_vault("~/vault", {}), self.vault)


class ListBrandsTest(VaultTestCase):
    def test_folders_only_sorted_without_regard_to_case(self):
        for slug in ("beta", "Alpha", "gamma"):
            self.brand(slug)
        with open(os.path.join(self.vault, "Brands", "Brands.md"), "w") as f:
            f.write("an index note, not a brand")
        self.assertEqual(vault.list_brands(self.vault), ["Alpha", "beta", "gamma"])

    def test_the_order_ignores_case_in_both_directions(self):
        for slug in ("Beta", "alpha"):
            self.brand(slug)
        self.assertEqual(vault.list_brands(self.vault), ["alpha", "Beta"])

    def test_a_hidden_folder_is_not_a_brand(self):
        self.brand("alpha")
        os.makedirs(os.path.join(self.vault, "Brands", ".hidden"))
        self.assertEqual(vault.list_brands(self.vault), ["alpha"])

    def test_a_linked_folder_is_not_listed(self):
        self.brand("alpha")
        os.symlink(os.path.join(self.vault, "Brands", "alpha"), os.path.join(self.vault, "Brands", "alias"))
        outside = os.path.join(self.root, "outside")
        os.makedirs(outside)
        os.symlink(outside, os.path.join(self.vault, "Brands", "escape"))
        self.assertEqual(vault.list_brands(self.vault), ["alpha"])

    def test_every_listed_brand_can_be_read(self):
        for slug in ("alpha", "beta"):
            self.brand(slug)
        for slug in vault.list_brands(self.vault):
            self.assertEqual(self.read(slug).slug, slug)

    def test_no_brands_is_an_empty_list(self):
        self.assertEqual(vault.list_brands(self.vault), [])


class SlugCheckTest(VaultTestCase):
    def setUp(self):
        super().setUp()
        self.brand("alpha")
        self.secret = os.path.join(self.root, "secret")
        os.makedirs(self.secret)
        with open(os.path.join(self.secret, "secret.md"), "w") as f:
            f.write("outside the vault")

    def test_names_that_are_not_a_listed_folder_are_refused(self):
        for slug in ("", ".", "..", "../vault/Brands/alpha", "alpha/", "alpha/..", "/etc", "nope", "alpha\0", ".hidden"):
            with self.subTest(slug=slug), self.assertRaises(BrandNotFound):
                self.read(slug)
            with self.subTest(slug=slug, call="moodboard_path"), self.assertRaises(BrandNotFound):
                vault.moodboard_path(self.vault, slug)

    def test_a_brand_folder_that_is_a_link_is_refused_inside_or_out(self):
        os.symlink(self.secret, os.path.join(self.vault, "Brands", "escape"))
        os.symlink(os.path.join(self.vault, "Brands", "alpha"), os.path.join(self.vault, "Brands", "alias"))
        for slug in ("escape", "alias"):
            with self.subTest(slug=slug), self.assertRaises(BrandNotFound):
                self.read(slug)

    def test_a_file_in_brands_is_not_a_brand(self):
        with open(os.path.join(self.vault, "Brands", "Brands.md"), "w") as f:
            f.write("x")
        with self.assertRaises(BrandNotFound):
            self.read("Brands.md")

    def test_another_spelling_of_a_folder_is_refused(self):
        with self.assertRaises(BrandNotFound):
            self.read("ALPHA")


class HubTest(VaultTestCase):
    def test_badges_and_a_one_line_summary(self):
        self.brand()
        b = self.read()
        self.assertEqual((b.slug, b.status, b.client, b.hub_problem), ("alpha", "active", "Example Client", None))
        self.assertEqual(b.summary, "A short summary over two lines.")

    def test_no_hub_note_gives_no_badges_and_no_summary(self):
        self.brand(hub=None)
        b = self.read()
        self.assertEqual((b.status, b.client, b.summary, b.hub_problem, b.panels), (None, None, "", None, []))

    def test_no_frontmatter_still_gives_a_summary(self):
        self.brand(hub="First paragraph.\n\nSecond.\n")
        b = self.read()
        self.assertEqual((b.status, b.client, b.summary), (None, None, "First paragraph."))

    def test_only_a_matching_pair_of_quotes_is_removed_from_a_badge(self):
        for raw, shown in (('"Example Client"', "Example Client"), ("'Example Client'", "Example Client"),
                           ("Dunkin'", "Dunkin'"), ("\"half", "\"half"), ("\"mixed'", "\"mixed'"), ("'", "'"),
                           ("\"It's\"", "It's"), ("''", ""), ("dad", "dad")):
            with self.subTest(raw=raw):
                self.brand(hub=f"---\nclient: {raw}\n---\nText.\n")
                self.assertEqual(self.read().client, shown or None)

    def test_an_empty_value_is_no_badge(self):
        self.brand(hub="---\nstatus:\nclient:   \n---\nText.\n")
        b = self.read()
        self.assertEqual((b.status, b.client), (None, None))

    def test_frontmatter_that_never_closes_is_text_not_badges(self):
        self.brand(hub="---\nstatus: active\n\nText.\n")
        b = self.read()
        self.assertEqual((b.status, b.client), (None, None))
        self.assertEqual(b.summary, "--- status: active")

    def test_a_note_with_only_headings_has_an_empty_summary(self):
        self.brand(hub="# One\n\n## Two\n")
        self.assertEqual(self.read().summary, "")

    def test_a_heading_ends_the_summary_even_without_a_blank_line(self):
        self.brand(hub="Words here.\n## Next\nMore.\n")
        self.assertEqual(self.read().summary, "Words here.")

    def test_a_wiki_link_in_a_badge_or_summary_shows_its_text(self):
        self.brand(hub="---\nclient: [[Some Client|Shown]]\n---\nSee [[Other Note]] now.\n")
        b = self.read()
        self.assertEqual((b.client, b.summary), ("Shown", "See Other Note now."))

    def test_windows_line_endings_and_a_byte_order_mark_are_handled(self):
        self.brand(hub=b"\xef\xbb\xbf---\r\nstatus: draft\r\n---\r\nText one\r\ntext two\r\n\r\nNext.\r\n")
        b = self.read()
        self.assertEqual((b.status, b.summary), ("draft", "Text one text two"))

    def test_an_old_style_lone_carriage_return_is_a_line_break(self):
        self.brand(hub="---\rstatus: draft\r---\rOne\rtwo\r")
        b = self.read()
        self.assertEqual((b.status, b.summary), ("draft", "One two"))

    def test_trailing_spaces_after_the_frontmatter_fences_are_allowed(self):
        self.brand(hub="---  \nstatus: active\n---  \nText.\n")
        b = self.read()
        self.assertEqual((b.status, b.summary), ("active", "Text."))

    def test_an_indented_line_or_one_with_no_key_is_not_a_badge(self):
        self.brand(hub="---\nstatus: active\n  client: Nested\n: orphan\nno colon here\n---\nText.\n")
        b = self.read()
        self.assertEqual((b.status, b.client), ("active", None))

    def test_summary_lines_are_trimmed(self):
        self.brand(hub="  indented  \nnext line  \n")
        self.assertEqual(self.read().summary, "indented next line")

    def test_an_empty_alias_falls_back_to_the_link_target(self):
        self.brand(hub="See [[Target|]] now.\n")
        self.assertEqual(self.read().summary, "See Target now.")

    def test_a_hub_that_cannot_be_read_is_reported_and_the_brand_still_opens(self):
        self.brand(hub=b"\xff\xfe not utf-8")
        self.note("alpha", "alpha - Voice.md", "Plain.")
        b = self.read()
        self.assertEqual((b.status, b.summary), (None, ""))
        self.assertIn("UTF-8", b.hub_problem)
        self.assertEqual([p.title for p in b.panels], ["Voice"])


class PanelsTest(VaultTestCase):
    def setUp(self):
        super().setUp()
        self.brand()

    def titles(self):
        return [p.title for p in self.read().panels]

    def test_fixed_titles_first_in_their_order_then_the_rest_alphabetically(self):
        for title in ("Zebra", "Moodboard", "apple", "Voice", "Rejected ideas", "Positioning", "Visual identity", "Mango"):
            self.note("alpha", f"alpha - {title}.md", title)
        self.assertEqual(self.titles(), ["Positioning", "Voice", "Visual identity", "Rejected ideas", "Moodboard",
                                         "apple", "Mango", "Zebra"])

    def test_only_files_named_for_this_brand_and_ending_in_md_are_panels(self):
        self.note("alpha", "alpha - Voice.md", "v")
        self.note("alpha", "alpha - Voice.txt", "no")
        self.note("alpha", "beta - Voice.md", "no")
        self.note("alpha", "alpha -Voice.md", "no")
        self.note("alpha", "alpha - .md", "no")
        self.note("alpha", "alpha -  .md", "no")
        self.note("alpha", "._alpha - Voice.md", "no")
        self.note("alpha", ".board-abc.tmp", "no")
        os.makedirs(os.path.join(self.vault, "Brands", "alpha", "sub"))
        self.note("alpha", os.path.join("sub", "alpha - Deep.md"), "no")
        self.assertEqual(self.titles(), ["Voice"])

    def test_a_fixed_title_matches_without_regard_to_case(self):
        for title in ("moodboard", "Zebra", "VOICE", "Visual Identity", "apple"):
            self.note("alpha", f"alpha - {title}.md", title)
        self.assertEqual(self.titles(), ["VOICE", "Visual Identity", "moodboard", "apple", "Zebra"])

    def test_the_hub_is_not_a_panel(self):
        self.assertEqual(self.titles(), [])

    def test_the_text_has_no_frontmatter_no_carriage_returns_and_flat_links(self):
        self.note("alpha", "alpha - Voice.md", b"---\r\ntype: voice\r\n---\r\n\r\nWe say [[Plain Words|plain words]].\r\nSee [[Other]].\r\n\r\n\r\n")
        (p,) = self.read().panels
        self.assertEqual((p.text, p.problem), ("We say plain words.\nSee Other.", None))

    def test_trailing_spaces_and_blank_lines_are_dropped_but_leading_indentation_is_kept(self):
        self.note("alpha", "alpha - Voice.md", "\n\n    indented code\nlast line   \n\n")
        self.assertEqual(self.read().panels[0].text, "    indented code\nlast line")

    def test_text_is_returned_as_written_not_escaped(self):
        self.note("alpha", "alpha - Voice.md", "Fish & <b>chips</b> \"quoted\"\n")
        self.assertEqual(self.read().panels[0].text, "Fish & <b>chips</b> \"quoted\"")

    def test_an_embed_is_kept_as_written(self):
        self.note("alpha", "alpha - Moodboard.md", "![[2026-10-15-1432-a3f9.png]]\nWords [[Link]]\n")
        self.assertEqual(self.read().panels[0].text, "![[2026-10-15-1432-a3f9.png]]\nWords Link")

    def test_a_link_with_a_heading_target_shows_the_whole_target(self):
        self.note("alpha", "alpha - Voice.md", "[[Note#Part]] and [[Note#Part|alias]] and [[]] end\n")
        self.assertEqual(self.read().panels[0].text, "Note#Part and alias and  end")

    def test_a_note_that_is_not_utf8_is_a_panel_with_a_problem_and_no_text(self):
        self.note("alpha", "alpha - Voice.md", b"\xff\xfe\x00bad")
        self.note("alpha", "alpha - Tone.md", "fine")
        by = {p.title: p for p in self.read().panels}
        self.assertEqual((by["Voice"].text, by["Voice"].problem), ("", "this note is not UTF-8 text"))
        self.assertEqual((by["Tone"].text, by["Tone"].problem), ("fine", None))

    def test_an_empty_note_is_an_empty_panel(self):
        self.note("alpha", "alpha - Voice.md", "")
        self.assertEqual(self.read().panels[0], vault.Panel("Voice", "", None))

    def test_a_panel_has_the_date_from_its_created_frontmatter_or_none(self):
        for title, created in (("A", "2026-10-15"), ("B", "2026-10-15 14:32"), ("C", '"2026-10-15T14:32"'), ("D", "last week"), ("E", "2026-10-15T14:32:10"), ("G", "2026-10-15T14:32:10.5Z"), ("H", "2026-10-15 14:32:10+02:00"), ("I", "2026-10-15T14:32-0500"), ("J", "2026-10-15T14")):
            self.note("alpha", f"alpha - {title}.md", f"---\ncreated: {created}\n---\nbody")
        self.note("alpha", "alpha - F.md", "no frontmatter")
        by = {p.title: p.date for p in self.read().panels}
        shown = "2026-10-15T14:32"  # seconds and a zone are accepted and dropped: the date only orders cards
        self.assertEqual(by, {"A": "2026-10-15", "B": shown, "C": shown, "D": None, "E": shown, "F": None, "G": shown, "H": shown, "I": shown, "J": None})

    def test_a_link_leaving_the_brand_folder_is_a_problem_and_is_never_read(self):
        outside = os.path.join(self.root, "outside.md")
        with open(outside, "w") as f:
            f.write("TOP SECRET")
        os.symlink(outside, os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md"))
        (p,) = self.read().panels
        self.assertEqual(p.text, "")
        self.assertIn("leaves the brand's folder", p.problem)

    def test_a_link_to_a_note_in_another_brand_is_also_refused(self):
        self.brand("beta")
        self.note("beta", "beta - Voice.md", "beta text")
        os.symlink(os.path.join(self.vault, "Brands", "beta", "beta - Voice.md"),
                   os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md"))
        (p,) = self.read().panels
        self.assertEqual((p.text, bool(p.problem)), ("", True))

    def test_a_link_to_a_folder_whose_name_starts_like_this_brand_is_refused(self):
        self.brand("alpha2")
        self.note("alpha2", "alpha2 - Voice.md", "sibling text")
        os.symlink(os.path.join(self.vault, "Brands", "alpha2", "alpha2 - Voice.md"),
                   os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md"))
        (p,) = self.read().panels
        self.assertEqual((p.text, bool(p.problem)), ("", True))

    def test_a_link_to_a_note_in_the_same_folder_is_followed(self):
        self.note("alpha", "real.md", "real text")
        os.symlink(os.path.join(self.vault, "Brands", "alpha", "real.md"),
                   os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md"))
        self.assertEqual(self.read().panels[0].text, "real text")

    def test_a_folder_named_like_a_note_is_a_problem_not_a_crash(self):
        os.makedirs(os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md"))
        (p,) = self.read().panels
        self.assertEqual((p.text, p.problem), ("", "this note is not a regular file"))

    @unittest.skipUnless(hasattr(os, "mkfifo"), "needs named pipes")
    def test_a_named_pipe_is_never_opened(self):
        path = os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md")
        os.mkfifo(path)
        # Opening a pipe to read blocks until something opens it to write. This thread does that, so that code which
        # wrongly opens it fails the assertion below instead of hanging the run; with correct code it waits until released.
        opener = threading.Thread(target=lambda: os.close(os.open(path, os.O_WRONLY)), daemon=True)
        opener.start()
        (p,) = self.read().panels
        os.close(os.open(path, os.O_RDONLY | os.O_NONBLOCK))  # lets the thread finish if nothing opened the pipe
        opener.join(5)
        self.assertEqual(p.problem, "this note is not a regular file")

    def test_a_note_that_cannot_be_opened_is_a_problem(self):
        path = os.path.join(self.vault, "Brands", "alpha", "alpha - Voice.md")
        self.note("alpha", "alpha - Voice.md", "x")
        os.chmod(path, 0)
        self.addCleanup(os.chmod, path, 0o600)
        if os.access(path, os.R_OK):
            self.skipTest("this user can read a file with no permissions")
        (p,) = self.read().panels
        self.assertEqual(p.text, "")
        self.assertIn("could not be read", p.problem)


class MoodboardPathTest(VaultTestCase):
    def setUp(self):
        super().setUp()
        self.folder = self.brand()

    def test_the_path_is_returned_even_if_the_note_is_missing(self):
        self.assertEqual(vault.moodboard_path(self.vault, "alpha"), os.path.join(self.folder, "alpha - Moodboard.md"))

    def test_an_existing_note_is_returned(self):
        self.note("alpha", "alpha - Moodboard.md", "x")
        self.assertEqual(vault.moodboard_path(self.vault, "alpha"), os.path.join(self.folder, "alpha - Moodboard.md"))

    def test_a_link_leaving_the_folder_is_refused(self):
        outside = os.path.join(self.root, "outside.md")
        with open(outside, "w") as f:
            f.write("x")
        os.symlink(outside, os.path.join(self.folder, "alpha - Moodboard.md"))
        with self.assertRaises(VaultError):
            vault.moodboard_path(self.vault, "alpha")

    def test_a_link_to_a_sibling_folder_with_a_longer_name_is_refused(self):
        self.brand("alpha2")
        self.note("alpha2", "x.md", "x")
        os.symlink(os.path.join(self.vault, "Brands", "alpha2", "x.md"), os.path.join(self.folder, "alpha - Moodboard.md"))
        with self.assertRaises(VaultError):
            vault.moodboard_path(self.vault, "alpha")

    def test_a_dangling_link_leaving_the_folder_is_refused(self):
        os.symlink(os.path.join(self.root, "not-there.md"), os.path.join(self.folder, "alpha - Moodboard.md"))
        with self.assertRaises(VaultError):
            vault.moodboard_path(self.vault, "alpha")

    def test_a_link_to_another_note_in_the_same_folder_is_refused_so_nothing_else_is_written(self):
        for target in ("alpha - Voice.md", "alpha.md", "real.md"):
            with self.subTest(target=target):
                self.note("alpha", target, "x")
                link = os.path.join(self.folder, "alpha - Moodboard.md")
                os.symlink(os.path.join(self.folder, target), link)
                with self.assertRaisesRegex(VaultError, "link"):
                    vault.moodboard_path(self.vault, "alpha")
                os.unlink(link)


if __name__ == "__main__":
    unittest.main()
