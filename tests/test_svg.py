"""Tests for board/svg.py: which SVG icons are kept untouched and which are refused (ADR 008, amendment of 2026-10-17, decision 3).

The files are written out here; none is a real site's.
"""

import unittest

from board import images, svg

NS = "http://www.w3.org/2000/svg"


def doc(inner="", attrs="", prolog=""):
    return f'{prolog}<svg xmlns="{NS}" xmlns:xlink="http://www.w3.org/1999/xlink" {attrs}>{inner}</svg>'.encode()


class AcceptedTest(unittest.TestCase):
    def test_common_shapes_are_accepted(self):
        for name, data in {
            "plain": doc('<path d="M0 0h10v10z"/>', 'viewBox="0 0 24 24"'),
            "gradient": doc('<defs><linearGradient id="a"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#a)" width="4" height="4"/>'),
            "local use": doc('<symbol id="s"><circle r="2"/></symbol><use xlink:href="#s"/><use href="#s"/>'),
            "clip and filter": doc('<clipPath id="c"><rect width="1" height="1"/></clipPath><g clip-path="url( \'#c\' )" filter="url(#f)"/>'),
            "style": doc("<style>.a{fill:url(#g);stroke:red}</style><path class='a'/>"),
            "editor": doc('<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata><sodipodi:namedview xmlns:sodipodi="urn:x"/>'),
            "declaration and comments": doc("<path/>", prolog='<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: a tool -->\n'),
            "byte-order mark": b"\xef\xbb\xbf" + doc("<path/>"),
            "text": doc("<text>é</text>"),
        }.items():
            with self.subTest(name=name):
                svg.check(data)

    def test_the_file_is_not_changed_by_looking_at_it(self):
        data = doc("<path/>")
        svg.check(data)
        self.assertEqual(data, doc("<path/>"))


class SizeTest(unittest.TestCase):
    def test_the_size_is_the_width_and_height_else_the_view_box_else_32(self):
        self.assertEqual(svg.check(doc(attrs='width="48" height="40px" viewBox="0 0 10 10"')), (48, 40))
        self.assertEqual(svg.check(doc(attrs='viewBox="0 0 24 20"')), (24, 20))
        self.assertEqual(svg.check(doc(attrs='viewBox="0,0,24.4,20"')), (24, 20))
        self.assertEqual(svg.check(doc(attrs='width="50%" height="1em" viewBox="0 0 8 9"')), (8, 9))
        self.assertEqual(svg.check(doc(attrs='width="16"')), (32, 32))
        for bad in ('viewBox="0 0 0 5"', 'viewBox="a b c d"', 'viewBox="1 2"', 'viewBox="0 0 -3 4"'):
            with self.subTest(view_box=bad):
                self.assertEqual(svg.check(doc(attrs=bad)), (32, 32))


class RefusedTest(unittest.TestCase):
    def refused(self, data, reason=None):
        with self.assertRaises(svg.SvgRefused) as caught:
            svg.check(data)
        if reason:
            self.assertIn(reason, str(caught.exception))

    def test_it_is_an_image_refused_so_the_callers_that_catch_those_catch_it(self):
        self.assertTrue(issubclass(svg.SvgRefused, images.ImageRefused))

    def test_not_an_svg(self):
        for data in (b"", b"hello", b"<html></html>", b"\x89PNG\r\n\x1a\n", b"<?xml version='1.0'?><html/>", b"<svgx/>", b"<!-- <svg/> -->"):
            with self.subTest(data=data[:12]):
                self.refused(data, "not an SVG")

    def test_a_root_that_is_not_in_the_svg_namespace(self):
        self.refused(b"<svg><path/></svg>", "root")
        self.refused(b'<svg xmlns="http://www.w3.org/1999/xhtml"/>', "root")

    def test_not_well_formed_or_not_utf8(self):
        self.refused(b'<svg xmlns="http://www.w3.org/2000/svg"><g></svg>', "well-formed")
        self.refused(doc("<text>caf\xe9</text>".encode("latin-1").decode("latin-1")).replace("é".encode(), b"\xe9"), "UTF-8")

    def test_a_document_type_an_entity_or_a_processing_instruction(self):
        for prolog in (
            '<!DOCTYPE svg SYSTEM "x.dtd">', '<!doctype svg>', '<!DOCTYPE svg [<!ENTITY a "b">]>', '<?xml-stylesheet href="http://x/s.css"?>',
            '<?xml version="1.0"?><?xml-stylesheet href="http://x/s.css"?>',
        ):
            with self.subTest(prolog=prolog):
                self.refused(doc(prolog=prolog))
        self.refused(doc("<g><?pi data?></g>"), "processing instruction")
        self.refused(doc("<!ENTITY a 'b'>"), "entity")

    def test_elements_that_run_or_load_something(self):
        for element in (
            "<script>alert(1)</script>", "<script href='#x'/>", "<foreignObject><div/></foreignObject>", "<image href='#a'/>", "<a href='#x'><path/></a>",
            "<animate attributeName='x'/>", "<animateMotion/>", "<animateTransform/>", "<set attributeName='x' to='1'/>", "<handler/>", "<listener/>",
            "<iframe/>", "<object/>", "<embed/>", "<h:script xmlns:h='urn:x'/>", "<h:html xmlns:h='http://www.w3.org/1999/xhtml'/>",
        ):
            with self.subTest(element=element):
                self.refused(doc(element), "element")

    def test_an_event_handler(self):
        for name in ("onload", "onclick", "ONLOAD", "onbegin"):
            with self.subTest(name=name):
                self.refused(doc(attrs=f'{name}="alert(1)"'), "event handler")
        self.refused(doc('<path onmouseover="x()"/>'), "event handler")

    def test_a_reference_to_anything_but_the_file_itself(self):
        for value in ("http://x.test/a", "//x.test/a", "data:image/png;base64,AA", "javascript:alert(1)", "file.svg#a", "", " https://x", " #a"):
            for attr in ("href", "xlink:href"):
                with self.subTest(attr=attr, value=value):
                    self.refused(doc(f'<use {attr}="{value}"/>'), "outside")

    def test_a_url_to_anything_but_the_file_itself(self):
        for value in ("url(http://x.test/a)", "url('https://x.test/a')", "url( '//x.test/a' )", "url(data:image/svg+xml;base64,AA)", "URL(x.png)", "url(a.svg#b)", "url()"):
            with self.subTest(value=value):
                self.refused(doc(f'<path fill="{value}"/>'), "outside")
                self.refused(doc(f'<path style="fill:{value}"/>'), "outside")
                self.refused(doc(f"<style>.a{{fill:{value}}}</style>"), "outside")

    def test_style_with_an_import_an_escape_or_a_script(self):
        for css in ("@import 'http://x.test/a.css';", "@IMPORT url(#a);", ".a{fill:u\\72l(http://x.test)}", ".a{width:expression(alert(1))}", ".a{background:javascript:x}"):
            with self.subTest(css=css):
                self.refused(doc(f"<style>{css}</style>"), "style")
        self.refused(doc('<path style="fill:u\\72l(http://x.test)"/>'), "style")
        self.refused(doc('<path fill="u\\72l(http://x.test)"/>'), "style")

    def test_the_limits_are_exact(self):
        head = doc("<g/>")
        pad = svg.MAX_BYTES - len(head)
        svg.check(doc(f"<g/><!-- {'x' * (pad - 9)} -->"))
        self.assertEqual(len(doc(f"<g/><!-- {'x' * (pad - 9)} -->")), svg.MAX_BYTES)
        self.refused(doc(f"<g/><!-- {'x' * (pad - 8)} -->"), "too big")
        svg.check(doc("<g/>" * (svg.MAX_ELEMENTS - 1)))
        self.refused(doc("<g/>" * svg.MAX_ELEMENTS), "too many")

    def test_deep_nesting_is_not_a_way_around_the_count(self):
        self.refused(doc("<g>" * 100 + "</g>" * 100 + "<g/>" * svg.MAX_ELEMENTS), "too many")


if __name__ == "__main__":
    unittest.main()
