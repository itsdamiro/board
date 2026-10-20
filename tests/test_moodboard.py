"""Tests for board/moodboard.py, on synthetic text only."""

import unittest

from board import moodboard as m

ID = "2026-10-15-1432-a3f9"
ID2 = "2026-10-15-1500-00ff"
FULL = f"![[{ID}.png]]\nA quiet layout with a lot of space.\n[source](https://example.com/page)"
BARE = "A color combination to try for the footer."
FM = "---\ntype: moodboard\n---\n"


def keys(text):
    return [b.key for b in m.parse(text)]


class ParseTest(unittest.TestCase):
    def test_a_full_block(self):
        (b,) = m.parse(FULL + "\n")
        self.assertEqual((b.embed, b.image_id, b.ext), (f"![[{ID}.png]]", ID, "png"))
        self.assertEqual((b.description, b.source), ("A quiet layout with a lot of space.", "https://example.com/page"))
        self.assertEqual((b.start, b.end, b.text), (0, 3, FULL))

    def test_a_block_with_no_image(self):
        (b,) = m.parse(BARE + "\n[source](https://example.com)\n")
        self.assertEqual((b.embed, b.image_id, b.description, b.source), (None, None, BARE, "https://example.com"))

    def test_a_block_with_no_address(self):
        (b,) = m.parse(f"![[{ID}.webp]]\nonly words\n")
        self.assertEqual((b.image_id, b.ext, b.description, b.source), (ID, "webp", "only words", None))

    def test_a_block_with_extra_lines_keeps_them_in_the_description(self):
        (b,) = m.parse(f"![[{ID}.gif]]\nline one\nline two\nline three\n[source](http://a.b)\n")
        self.assertEqual(b.description, "line one\nline two\nline three")

    def test_an_image_alone_and_an_address_alone(self):
        image, address = m.parse(f"![[{ID}.jpg]]\n\n[source](https://a.b/c)\n")
        self.assertEqual((image.image_id, image.description, image.source), (ID, "", None))
        self.assertEqual((address.embed, address.description, address.source), (None, "", "https://a.b/c"))

    def test_blocks_come_in_file_order_with_their_line_spans(self):
        a, b = m.parse(f"{FULL}\n\n  \n{BARE}\n")
        self.assertEqual(((a.start, a.end), (b.start, b.end)), ((0, 3), (5, 6)))

    def test_frontmatter_and_headings_are_not_items(self):
        blocks = m.parse(f"{FM}# Moodboard\n\n## Later\n\n{BARE}\n")
        self.assertEqual([b.description for b in blocks], [BARE])

    def test_a_hashtag_is_not_a_heading(self):
        self.assertEqual([b.description for b in m.parse("#inspiration for later\n")], ["#inspiration for later"])

    def test_a_note_with_a_byte_order_mark_still_has_its_frontmatter_skipped(self):
        self.assertEqual([b.description for b in m.parse("\ufeff" + FM + "\n" + BARE + "\n")], [BARE])

    def test_frontmatter_that_never_closes_is_refused(self):
        with self.assertRaises(m.MoodboardError):
            m.parse("---\ntype: moodboard\n" + BARE + "\n")

    def test_carriage_returns_do_not_change_a_block_or_its_key(self):
        lf, crlf = m.parse(FULL + "\n")[0], m.parse(FULL.replace("\n", "\r\n") + "\r\n")[0]
        self.assertEqual((lf.key, lf.text, crlf.description), (crlf.key, crlf.text, lf.description))

    def test_an_address_that_is_not_http_stays_in_the_description(self):
        for line in ("[source](javascript:alert1)", "[source](ftp://a.b/c)", "[source](http://[x)", "[source](//a.b)"):
            with self.subTest(line=line):
                (b,) = m.parse(f"words\n{line}\n")
                self.assertEqual((b.source, b.description), (None, f"words\n{line}"))

    def test_an_embed_that_is_not_an_id_made_here_names_no_image(self):
        for name in ("photo.png", "../../etc/passwd.png", "Board/x/" + ID + ".png", "note"):
            with self.subTest(name=name):
                (b,) = m.parse(f"![[{name}]]\nwords\n")
                self.assertEqual((b.image_id, b.ext, b.embed, b.description), (None, None, f"![[{name}]]", "words"))

    def test_digits_of_another_script_do_not_make_an_id(self):
        positions = [i for i, c in enumerate(ID) if c.isdigit()]
        for i in positions:  # one digit at a time, so every group of the pattern is checked
            other = ID[:i] + chr(0x660 + int(ID[i])) + ID[i + 1:]
            with self.subTest(position=i):
                self.assertIsNone(m.parse(f"![[{other}.png]]\nx\n")[0].image_id)
                with self.assertRaises(m.MoodboardError):
                    m.format_block("x", other, "png")

    def test_the_id_suffix_is_four_lowercase_hex_digits(self):
        for bad in ("2026-10-15-1432-a3g9", "2026-10-15-1432-A3F9", "2026-10-15-1432-a3f", "2026-10-15-1432-a3f90", "2026-10-15-1432"):
            with self.subTest(id=bad):
                self.assertIsNone(m.parse(f"![[{bad}.png]]\nx\n")[0].image_id)

    def test_an_item_under_a_heading_with_no_blank_line_is_part_of_the_heading(self):
        self.assertEqual(m.parse(f"# Ideas\n![[{ID}.png]]\nwords\n\n{BARE}\n")[0].description, BARE)

    def test_an_embed_with_a_size_or_a_capital_extension_still_names_its_image(self):
        self.assertEqual(m.parse(f"![[{ID}.png|300]]\nx\n")[0].image_id, ID)
        self.assertEqual(m.parse(f"![[{ID}.PNG]]\nx\n")[0].ext, "png")

    def test_text_after_an_embed_or_a_source_on_the_same_line_means_it_is_neither(self):
        (a,) = m.parse(f"![[{ID}.png]] and more\nwords\n")
        self.assertEqual((a.image_id, a.embed, a.description), (None, f"![[{ID}.png]] and more", "words"))
        (b,) = m.parse("words\n[source](https://a.b) and more\n")
        self.assertEqual((b.source, b.description), (None, "words\n[source](https://a.b) and more"))

    def test_a_change_of_spaces_alone_changes_the_key(self):
        for before, after in (("words", "words "), ("words", " words"), ("two words", "two  words")):
            with self.subTest(before=before):
                self.assertNotEqual(m.parse(before)[0].key, m.parse(after)[0].key)
                with self.assertRaises(m.BlockNotFound):
                    m.remove(after + "\n", m.parse(before)[0].key)

    def test_key_is_the_hash_of_the_exact_text(self):
        a, b = m.parse(FULL + "\n\n" + FULL.replace("quiet", "loud") + "\n")
        self.assertNotEqual(a.key, b.key)
        self.assertEqual(len(a.key), 64)


class FormatTest(unittest.TestCase):
    def test_each_shape_of_item(self):
        self.assertEqual(m.format_block("words", ID, "png", "https://example.com/p"),
                         f"![[{ID}.png]]\nwords\n[source](https://example.com/p)")
        self.assertEqual(m.format_block("words"), "words")
        self.assertEqual(m.format_block("", ID, "gif"), f"![[{ID}.gif]]")
        self.assertEqual(m.format_block("", source="https://a.b"), "[source](https://a.b)")

    def test_what_is_written_reads_back_the_same(self):
        for image in (None, (ID, "jpeg")):
            for description in ("", "some words, with #tag and (parens)"):
                for source in (None, "https://a.b/c?d=1&e=2#f"):
                    if not (image or description or source):
                        continue
                    with self.subTest(image=image, description=description, source=source):
                        text = m.format_block(description, *(image or (None, None)), source) + "\n"
                        (b,) = m.parse(text)
                        self.assertEqual((b.image_id, b.ext, b.description, b.source),
                                         (image[0] if image else None, image[1] if image else None, description, source))

    def test_surrounding_spaces_are_dropped(self):
        self.assertEqual(m.format_block("  words \t", source=" https://a.b "), "words\n[source](https://a.b)")

    def test_brackets_in_an_address_are_made_safe_and_still_read_back(self):
        block = m.format_block("x", source="https://a.b/(c)")
        self.assertEqual(block, "x\n[source](https://a.b/%28c%29)")
        self.assertEqual(m.parse(block)[0].source, "https://a.b/%28c%29")

    def test_input_the_reader_would_misread_is_refused(self):
        bad = [
            dict(description="two\nlines"), dict(description="a\rb"), dict(description="# a heading"),
            dict(description="###### six"), dict(description="#"), dict(description="![[x.png]]"),
            dict(description="[source](https://a.b)"), dict(description="---"),
            dict(description=""), dict(description="   "),
            dict(description="x", image_id="photo", ext="png"), dict(description="x", image_id=ID, ext="svg"),
            dict(description="x", image_id=ID, ext="PNG"), dict(description="x", image_id=ID),
            dict(description="x", ext="png"), dict(description="x", image_id="../" + ID, ext="png"),
            dict(description="x", source="javascript:alert(1)"), dict(description="x", source="ftp://a.b"),
            dict(description="x", source="https://a b"), dict(description="x", source="https://"),
            dict(description="x", source="http://[x"), dict(description="x", source=""),
        ]
        for kwargs in bad:
            with self.subTest(**kwargs), self.assertRaises(m.MoodboardError):
                m.format_block(**kwargs)

    def test_a_tag_that_is_not_a_heading_is_accepted(self):
        self.assertEqual(m.format_block("#inspiration"), "#inspiration")


class AppendTest(unittest.TestCase):
    NEW = m.format_block("the new one", ID2, "png")

    def appended(self, text):
        out = m.append(text, self.NEW)
        self.assertTrue(out.startswith(text), "append changed existing text")
        self.assertEqual(m.parse(out)[-1].text, self.NEW)
        return out

    def test_after_a_blank_line_at_the_end(self):
        self.assertEqual(self.appended(f"{FM}\n{FULL}\n"), f"{FM}\n{FULL}\n\n{self.NEW}\n")

    def test_every_shape_of_ending_gets_one_blank_line_before_the_block(self):
        cases = {"": "\n\n", "\n": "\n\n", "\n\n": "\n\n", "\n\n\n": "\n\n\n", "\n  \n": "\n  \n", "\n ": "\n \n", " ": " \n\n"}
        for tail, kept in cases.items():
            with self.subTest(tail=tail):
                self.assertEqual(self.appended(BARE + tail), f"{BARE}{kept}{self.NEW}\n")

    def test_an_empty_note_and_a_frontmatter_only_note(self):
        self.assertEqual(self.appended(""), self.NEW + "\n")
        self.assertEqual(self.appended("\n"), "\n" + self.NEW + "\n")
        self.assertEqual(self.appended(FM), f"{FM}\n{self.NEW}\n")

    def test_a_note_that_uses_carriage_returns_keeps_using_them(self):
        text = f"{FM}\n{FULL}\n".replace("\n", "\r\n")
        out = self.appended(text)
        self.assertEqual(out.count("\n"), out.count("\r\n"))
        self.assertTrue(out.endswith(self.NEW.replace("\n", "\r\n") + "\r\n"))

    def test_a_note_with_mixed_line_endings_gets_plain_ones(self):
        self.assertEqual(self.appended("a\r\nb\n"), f"a\r\nb\n\n{self.NEW}\n")

    def test_text_after_the_items_is_not_moved(self):
        text = f"{BARE}\n\n## Notes\nsomething the owner wrote\n"
        self.assertEqual(self.appended(text), f"{text}\n{self.NEW}\n")

    def test_frontmatter_that_never_closes_is_refused(self):
        with self.assertRaises(m.MoodboardError):
            m.append("---\ntype: x\n", self.NEW)

    def test_a_block_that_is_not_one_block_is_refused(self):
        for block in ("one\n\ntwo", "", "  ", "a\r\nb", "a\n \nb"):
            with self.subTest(block=block), self.assertRaises(m.MoodboardError):
                m.append("x\n", block)


class RemoveTest(unittest.TestCase):
    A, B, C = FULL, BARE, "third"

    def three(self, tail="\n"):
        return f"{FM}\n{self.A}\n\n{self.B}\n\n{self.C}{tail}"

    def remove(self, text, index):
        return m.remove(text, m.parse(text)[index].key)

    def test_the_first_the_middle_and_the_last_block(self):
        self.assertEqual(self.remove(self.three(), 0)[0], f"{FM}\n{self.B}\n\n{self.C}\n")
        self.assertEqual(self.remove(self.three(), 1)[0], f"{FM}\n{self.A}\n\n{self.C}\n")
        self.assertEqual(self.remove(self.three(), 2)[0], f"{FM}\n{self.A}\n\n{self.B}\n")

    def test_the_last_block_with_no_newline_at_the_end(self):
        self.assertEqual(self.remove(self.three(""), 2)[0], f"{FM}\n{self.A}\n\n{self.B}\n")

    def test_the_only_block_and_a_block_with_no_blank_line_before_it(self):
        self.assertEqual(self.remove(f"{FM}\n{self.A}\n", 0)[0], FM)
        self.assertEqual(self.remove(f"{FM}{self.A}\n\n{self.B}\n", 0)[0], f"{FM}\n{self.B}\n")

    def test_the_first_line_of_a_note_leaves_no_blank_line_at_the_top(self):
        self.assertEqual(self.remove(f"{self.A}\n\n{self.B}\n", 0)[0], f"{self.B}\n")

    def test_the_first_block_of_a_note_with_no_newline_at_the_end(self):
        self.assertEqual(self.remove(f"{self.A}\n\n{self.B}", 0)[0], self.B)

    def test_it_returns_the_block_it_removed(self):
        text = self.three()
        block = m.parse(text)[0]
        self.assertEqual(m.remove(text, block.key)[1], block)

    def test_nothing_but_that_block_goes(self):
        text = f"{FM}# Title\n\n{self.A}\n\nintro that is an item\n\n## Heading\n\n{self.C}\n"
        blocks = m.parse(text)
        for i, gone in enumerate(blocks):
            with self.subTest(removed=gone.text):
                out, _ = m.remove(text, gone.key)
                self.assertEqual([b.text for b in m.parse(out)], [b.text for j, b in enumerate(blocks) if j != i])
                for line in ("# Title", "## Heading", "type: moodboard"):
                    self.assertIn(line, out)
                self.assertNotIn("\n\n\n", out)

    def test_carriage_returns_in_the_rest_of_the_note_are_kept(self):
        text = self.three().replace("\n", "\r\n")
        out, _ = self.remove(text, 1)
        self.assertEqual(out, f"{FM}\n{self.A}\n\n{self.C}\n".replace("\n", "\r\n"))

    def test_the_last_block_of_a_note_with_windows_line_endings_leaves_no_lone_carriage_return(self):
        text = self.three().replace("\n", "\r\n")
        self.assertEqual(self.remove(text, 2)[0], f"{FM}\n{self.A}\n\n{self.B}\n".replace("\n", "\r\n"))
        self.assertEqual(self.remove(self.three(), 2)[0], f"{FM}\n{self.A}\n\n{self.B}\n")

    def test_a_block_changed_since_it_was_shown_is_refused(self):
        shown = m.parse(self.three())[1].key
        with self.assertRaises(m.BlockNotFound):
            m.remove(self.three().replace(self.B, self.B + " edited"), shown)
        with self.assertRaises(m.BlockNotFound):
            m.remove(self.three(), "0" * 64)

    def test_two_blocks_with_the_same_text_are_not_guessed_between(self):
        text = f"{self.B}\n\n{self.C}\n\n{self.B}\n"
        with self.assertRaises(m.AmbiguousBlock):
            m.remove(text, m.parse(text)[0].key)

    def test_frontmatter_that_never_closes_is_refused(self):
        with self.assertRaises(m.MoodboardError):
            m.remove("---\nx\n" + self.B + "\n", "0" * 64)


class MoveTest(unittest.TestCase):
    A, B, C = FULL, BARE, "third"

    def three(self, tail="\n"):
        return f"{FM}\n{self.A}\n\n{self.B}\n\n{self.C}{tail}"

    def move(self, text, index, before):
        blocks = m.parse(text)
        return m.move(text, blocks[index].key, None if before is None else blocks[before].key)

    def test_a_block_goes_before_another_and_the_rest_is_kept_byte_for_byte(self):
        self.assertEqual(self.move(self.three(), 2, 0)[0], f"{FM}\n{self.C}\n\n{self.A}\n\n{self.B}\n")
        self.assertEqual(self.move(self.three(), 2, 1)[0], f"{FM}\n{self.A}\n\n{self.C}\n\n{self.B}\n")
        self.assertEqual(self.move(self.three(), 0, 2)[0], f"{FM}\n{self.B}\n\n{self.A}\n\n{self.C}\n")

    def test_a_block_goes_to_the_end_with_none(self):
        self.assertEqual(self.move(self.three(), 0, None)[0], f"{FM}\n{self.B}\n\n{self.C}\n\n{self.A}\n")
        self.assertEqual(self.move(self.three(), 1, None)[0], f"{FM}\n{self.A}\n\n{self.C}\n\n{self.B}\n")

    def test_a_note_that_does_not_end_with_a_line_ending_gets_one(self):
        self.assertEqual(self.move(self.three(""), 0, None)[0], f"{FM}\n{self.B}\n\n{self.C}\n\n{self.A}\n")
        self.assertEqual(self.move(self.three(""), 2, 0)[0], f"{FM}\n{self.C}\n\n{self.A}\n\n{self.B}\n")

    def test_the_moved_block_is_returned_and_keeps_its_key(self):
        text = self.three()
        out, block = self.move(text, 0, None)
        self.assertEqual(block, m.parse(text)[0])
        self.assertEqual(keys(out), [m.parse(text)[i].key for i in (1, 2, 0)])

    def test_a_move_that_changes_nothing_returns_the_text_itself(self):
        text = self.three()
        self.assertIs(self.move(text, 0, 1)[0], text)  # before the next one
        self.assertIs(self.move(text, 2, None)[0], text)  # the last one to the end
        odd = f"{FM}\n{self.A}\n\n\n\n{self.B}\n"  # spacing that a real move would tidy is left alone when there is nothing to move
        self.assertIs(self.move(odd, 0, 1)[0], odd)

    def test_a_note_with_windows_line_endings_keeps_them_and_the_block_keeps_its_own(self):
        text = self.three().replace("\n", "\r\n")
        self.assertEqual(self.move(text, 2, 0)[0], f"{FM}\n{self.C}\n\n{self.A}\n\n{self.B}\n".replace("\n", "\r\n"))
        self.assertEqual(self.move(text, 0, None)[0], f"{FM}\n{self.B}\n\n{self.C}\n\n{self.A}\n".replace("\n", "\r\n"))
        mixed = f"{FM}\n{self.A}\n\n{self.B}\r\n\r\n{self.C}\n"  # only the middle block uses them
        self.assertEqual(self.move(mixed, 1, 0)[0], f"{FM}\n{self.B}\r\n\r\n{self.A}\n\n{self.C}\n")

    def test_a_heading_block_the_frontmatter_and_text_between_blocks_stay_where_they_are(self):
        text = f"{FM}\n# Notes\nunder it\n\n{self.A}\n\n{self.B}\n\n{self.C}\n"
        self.assertEqual(self.move(text, 2, 0)[0], f"{FM}\n# Notes\nunder it\n\n{self.C}\n\n{self.A}\n\n{self.B}\n")
        self.assertEqual(self.move(text, 0, None)[0], f"{FM}\n# Notes\nunder it\n\n{self.B}\n\n{self.C}\n\n{self.A}\n")

    def test_a_note_with_no_frontmatter_works_too(self):
        text = f"{self.A}\n\n{self.B}\n"
        self.assertEqual(self.move(text, 1, 0)[0], f"{self.B}\n\n{self.A}\n")

    def test_a_block_that_changed_or_is_not_there_is_refused_for_either_key(self):
        text = self.three()
        shown = keys(text)
        edited = text.replace(self.B, self.B + " edited")
        with self.assertRaises(m.BlockNotFound):
            m.move(edited, shown[1], shown[0])
        with self.assertRaises(m.BlockNotFound):
            m.move(edited, shown[0], shown[1])
        with self.assertRaises(m.BlockNotFound):
            m.move(text, "0" * 64, None)

    def test_two_identical_blocks_are_not_guessed_between(self):
        text = f"{FM}\n{self.B}\n\n{self.B}\n\n{self.C}\n"
        same, last = keys(text)[0], keys(text)[2]
        with self.assertRaises(m.AmbiguousBlock):
            m.move(text, same, None)
        with self.assertRaises(m.AmbiguousBlock):
            m.move(text, last, same)

    def test_a_block_cannot_go_before_itself(self):
        text = self.three()
        with self.assertRaises(m.MoodboardError):
            m.move(text, keys(text)[1], keys(text)[1])

    def test_a_note_whose_frontmatter_never_closes_is_refused(self):
        with self.assertRaises(m.MoodboardError):
            m.move("---\na\n\nb\n", "0" * 64, None)


if __name__ == "__main__":
    unittest.main()


class ReplaceTest(unittest.TestCase):
    A, B, C = FULL, BARE, "third"

    def three(self, tail="\n"):
        return f"{FM}\n{self.A}\n\n{self.B}\n\n{self.C}{tail}"

    def replace(self, text, index, block):
        return m.replace(text, m.parse(text)[index].key, block)

    def test_one_block_is_swapped_and_everything_else_is_kept_byte_for_byte(self):
        self.assertEqual(self.replace(self.three(), 1, "new\nlines")[0], f"{FM}\n{self.A}\n\nnew\nlines\n\n{self.C}\n")
        self.assertEqual(self.replace(self.three(), 0, "x")[0], f"{FM}\nx\n\n{self.B}\n\n{self.C}\n")
        self.assertEqual(self.replace(self.three(""), 2, "x")[0], f"{FM}\n{self.A}\n\n{self.B}\n\nx")
        self.assertEqual(self.replace(self.three(), 1, "x")[1], m.parse(self.three())[1])

    def test_a_note_with_windows_line_endings_keeps_them(self):
        text = self.three().replace("\n", "\r\n")
        self.assertEqual(self.replace(text, 1, "a\nb")[0], f"{FM}\n{self.A}\n\na\nb\n\n{self.C}\n".replace("\n", "\r\n"))

    def test_a_block_that_changed_or_is_not_there_is_refused(self):
        shown = m.parse(self.three())[1].key
        with self.assertRaises(m.BlockNotFound):
            m.replace(self.three().replace(self.B, self.B + " edited"), shown, "x")
        with self.assertRaises(m.BlockNotFound):
            m.replace(self.three(), "0" * 64, "x")

    def test_two_identical_blocks_are_not_guessed_between(self):
        text = f"{FM}\n{self.B}\n\n{self.B}\n"
        with self.assertRaises(m.AmbiguousBlock):
            m.replace(text, m.parse(text)[0].key, "x")

    def test_a_new_block_with_a_blank_line_or_a_carriage_return_is_refused(self):
        for block in ("a\n\nb", "a\r\nb", "", "a\n \nb"):
            with self.subTest(block=block), self.assertRaises(m.MoodboardError):
                self.replace(self.three(), 1, block)


class CopyKeyTest(unittest.TestCase):
    """A text that two blocks share is told apart by a copy number after the hash (ADR 001, amendment of 2026-10-20)."""

    A, B = "twin", "other"

    def note(self):
        return f"{FM}\n{self.A}\n\n{self.B}\n\n{self.A}\n\n{self.A}\n"

    def test_a_block_has_its_hash_and_a_block_with_company_has_a_copy_number_in_the_note_order(self):
        blocks = m.parse(self.note())
        twin, other = blocks[0].key, blocks[1].key
        self.assertEqual(m.refs(blocks), [f"{twin}-0", other, f"{twin}-1", f"{twin}-2"])
        self.assertEqual(m.refs(m.parse(f"{FM}\n{self.A}\n\n{self.B}\n")), [m.parse(self.note())[0].key, other])

    def test_locate_finds_the_copy_a_key_names(self):
        blocks = m.parse(self.note())
        for ref, index in zip(m.refs(blocks), range(4)):
            self.assertEqual(m.locate(blocks, ref), index)
        self.assertEqual(m.locate(blocks, blocks[1].key), 1)

    def test_a_bare_hash_that_two_blocks_share_is_not_guessed_and_a_copy_that_is_not_there_is_not_found(self):
        blocks = m.parse(self.note())
        with self.assertRaises(m.AmbiguousBlock):
            m.locate(blocks, blocks[0].key)
        for ref in (f"{blocks[0].key}-3", f"{blocks[1].key}-1", "0" * 64, "0" * 64 + "-0", "nonsense", blocks[0].key + "-"):
            with self.subTest(ref=ref), self.assertRaises(m.BlockNotFound):
                m.locate(blocks, ref)

    def test_remove_takes_only_the_copy_named_and_keeps_the_others_in_place(self):
        refs = m.refs(m.parse(self.note()))
        self.assertEqual(m.remove(self.note(), refs[0])[0], f"{FM}\n{self.B}\n\n{self.A}\n\n{self.A}\n")
        self.assertEqual(m.remove(self.note(), refs[2])[0], f"{FM}\n{self.A}\n\n{self.B}\n\n{self.A}\n")
        self.assertEqual(m.remove(self.note(), refs[3])[0], f"{FM}\n{self.A}\n\n{self.B}\n\n{self.A}\n")

    def test_the_copies_go_from_the_last_to_the_first_without_their_keys_going_stale(self):
        text, refs = self.note(), m.refs(m.parse(self.note()))
        for ref in (refs[3], refs[2], refs[0]):  # the page lists the last block first
            text = m.remove(text, ref)[0]
        self.assertEqual(text, f"{FM}\n{self.B}\n")

    def test_replace_changes_only_the_copy_named(self):
        refs = m.refs(m.parse(self.note()))
        self.assertEqual(m.replace(self.note(), refs[2], "changed")[0], f"{FM}\n{self.A}\n\n{self.B}\n\nchanged\n\n{self.A}\n")

    def test_move_takes_a_copy_and_goes_before_a_copy(self):
        refs = m.refs(m.parse(self.note()))
        self.assertEqual(m.move(self.note(), refs[3], refs[0])[0], f"{FM}\n{self.A}\n\n{self.A}\n\n{self.B}\n\n{self.A}\n")  # the same text, so only the other block's place shows
        self.assertEqual(m.move(self.note(), refs[1], refs[3])[0], f"{FM}\n{self.A}\n\n{self.A}\n\n{self.B}\n\n{self.A}\n")
        self.assertEqual(m.move(self.note(), refs[0], None)[0], f"{FM}\n{self.B}\n\n{self.A}\n\n{self.A}\n\n{self.A}\n")

    def test_a_move_before_a_later_copy_lands_before_that_one_and_not_the_first_of_them(self):
        text = f"{FM}\n{self.A}\n\n{self.B}\n\n{self.A}\n\nlast\n"
        refs = m.refs(m.parse(text))
        self.assertEqual(m.move(text, refs[3], refs[2])[0], f"{FM}\n{self.A}\n\n{self.B}\n\nlast\n\n{self.A}\n")
        self.assertEqual(m.move(text, refs[1], refs[2])[0], text)  # already just before it
