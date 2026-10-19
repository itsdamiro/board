"""Tests for board/cards.py (ADR 009), on synthetic text only."""

import unittest

from board import cards, moodboard
from board.cards import CardError, format_card, read

PALETTE = {"kind": "colors", "title": "Primary", "colors": [{"hex": "#1a2b3c", "name": "Deep ink"}, {"hex": "#fff", "name": ""}]}


class ReadTest(unittest.TestCase):
    def test_a_type_card_is_a_font_line_and_the_notes_under_it(self):
        self.assertEqual(read("Font: Fauna One\nHeadings\nand display"), {"kind": "type", "name": "Fauna One", "notes": "Headings\nand display", "google": "https://fonts.google.com/specimen/Fauna+One"})
        self.assertEqual(read("Font: Inter")["notes"], "")

    def test_a_colour_card_has_an_optional_title_and_hex_lines_in_capitals(self):
        self.assertEqual(read("**Primary**\n#1a2b3c Deep ink\n#FFF"), {"kind": "colors", "title": "Primary", "colors": [{"hex": "#1A2B3C", "name": "Deep ink"}, {"hex": "#FFF", "name": ""}]})
        self.assertEqual(read("#000000")["title"], "")

    def test_a_text_card_is_a_bold_title_and_words(self):
        self.assertEqual(read("**Mission**\nTo make it quiet.\nAnd kind."), {"kind": "text", "title": "Mission", "body": "To make it quiet.\nAnd kind."})

    def test_the_order_is_type_then_colours_then_text(self):
        self.assertEqual(read("Font: Inter\n#fff")["kind"], "type")
        self.assertEqual(read("**T**\n#fff")["kind"], "colors")  # a title over hex lines is a palette, not a text card
        self.assertEqual(read("**T**\n#fff\nwords")["kind"], "text")

    def test_near_misses_are_ordinary_items(self):
        for text in ("**Mission**", "Mission\nwords", "**Mission** and more\nwords", "#fff\nis too harsh", "#ffff", "#12345", "#1A2B3C  two spaces", "#fff \n#000",
                     "**a**b**\nwords", "****\nwords", "Font:Inter", "Font:  Inter", "Font: Inter/Bold", "Font: ", "Font: Inter ", "just words", "", "#fff\nwords",
                     "**" + "x" * 81 + "**\nwords", "\n".join(["#fff"] * 13), "#fff " + "n" * 41):
            with self.subTest(text=text):
                self.assertIsNone(read(text))

    def test_a_hex_and_some_words_is_a_palette_of_one_named_colour(self):
        self.assertEqual(read("#fff is too harsh")["colors"], [{"hex": "#FFF", "name": "is too harsh"}])

    def test_the_limits_themselves_are_taken(self):
        self.assertEqual(len(read("\n".join(["#fff"] * 12))["colors"]), 12)
        self.assertEqual(read("**" + "x" * 80 + "**\nwords")["kind"], "text")
        self.assertEqual(read("#fff " + "n" * 40)["kind"], "colors")
        self.assertEqual(read("Font: " + "A" * 60)["kind"], "type")
        self.assertIsNone(read("Font: " + "A" * 61))

    def test_the_google_address_is_made_from_the_checked_name_only(self):
        self.assertEqual(read("Font: Roboto Mono-Bold")["google"], "https://fonts.google.com/specimen/Roboto+Mono-Bold")


class FormatTest(unittest.TestCase):
    def test_each_kind_is_written_as_its_shape_and_reads_back(self):
        for card, text in ((PALETTE, "**Primary**\n#1A2B3C Deep ink\n#FFF"),
                           ({"kind": "colors", "colors": [{"hex": "#abc"}]}, "#ABC"),
                           ({"kind": "text", "title": "Mission", "body": "To make it quiet."}, "**Mission**\nTo make it quiet."),
                           ({"kind": "type", "name": "Inter", "notes": "Body"}, "Font: Inter\nBody"),
                           ({"kind": "type", "name": "Inter"}, "Font: Inter")):
            with self.subTest(text=text):
                self.assertEqual(format_card(card), text)
                (block,) = moodboard.parse(text)
                self.assertEqual((block.image_id, block.source, read(block.description)["kind"]), (None, None, card["kind"]))

    def test_what_would_not_read_back_is_refused(self):
        bad = [None, [], {}, {"kind": "image"}, {"kind": "text"}, {"kind": "text", "title": "", "body": "x"}, {"kind": "text", "title": "T", "body": ""},
               {"kind": "text", "title": "A*B", "body": "x"}, {"kind": "text", "title": "T\nU", "body": "x"}, {"kind": "text", "title": "T", "body": "a\n\nb"},
               {"kind": "text", "title": "T", "body": "a\n[source](https://example.com)"}, {"kind": "text", "title": "x" * 81, "body": "x"},
               {"kind": "text", "title": 3, "body": "x"}, {"kind": "text", "title": "T", "body": "x" * 4001},
               {"kind": "colors"}, {"kind": "colors", "colors": []}, {"kind": "colors", "colors": [{"hex": "#fff"}] * 13}, {"kind": "colors", "colors": ["#fff"]},
               {"kind": "colors", "colors": [{"hex": "fff"}]}, {"kind": "colors", "colors": [{"hex": "#ffff"}]}, {"kind": "colors", "colors": [{"hex": "#fff", "name": "a\nb"}]},
               {"kind": "colors", "colors": [{"hex": "#fff", "name": "n" * 41}]}, {"kind": "colors", "title": "x" * 81, "colors": [{"hex": "#fff"}]},
               {"kind": "type"}, {"kind": "type", "name": ""}, {"kind": "type", "name": "A/B"}, {"kind": "type", "name": "A" * 61}, {"kind": "type", "name": "Inter", "notes": "a\n\nb"},
               {"kind": "type", "name": "Inter", "notes": 5}]
        for card in bad:
            with self.subTest(card=card), self.assertRaises(CardError):
                format_card(card)

    def test_each_refusal_says_why(self):
        for card, why in (({"kind": "text", "title": "T", "body": "a\n\nb"}, "blank line"), ({"kind": "type", "name": "Inter", "notes": "a\n\nb"}, "blank line"),
                          ({"kind": "text", "title": "T\nU", "body": "x"}, "title is one line"), ({"kind": "type", "name": "A\nB"}, "font name is one line"),
                          ({"kind": "colors", "colors": [{"hex": "#fff", "name": "a\nb"}]}, "color name is one line"),
                          ({"kind": "text", "title": "A*B", "body": "x"}, "without \\*"),
                          ({"kind": "colors", "colors": [{"hex": "#fff"}] * 13}, "1 to 12 colors"), ({"kind": "colors", "colors": []}, "1 to 12 colors"),
                          ({"kind": "type", "name": "A/B"}, "letters, digits, spaces and hyphens"), ({"kind": "colors", "colors": [{"hex": "red"}]}, "# and 3 or 6 digits")):
            with self.subTest(why=why), self.assertRaisesRegex(CardError, why):
                format_card(card)

    def test_a_card_error_is_a_moodboard_error_so_the_server_answers_422(self):
        self.assertTrue(issubclass(CardError, moodboard.MoodboardError))

    def test_the_words_are_trimmed_and_windows_line_ends_become_new_lines(self):
        self.assertEqual(format_card({"kind": "text", "title": " T ", "body": " a\r\nb \n"}), "**T**\na\nb")

    def test_the_limit_of_twelve_colours_is_named_in_the_module(self):
        self.assertEqual(cards.MAX_COLORS, 12)
