"""Tests for board/__main__.py: the start-up messages, not the serving (test_server.py does that)."""

import contextlib
import io
import os
import socket
import sys
import tempfile
import unittest
from unittest import mock

from board import __main__ as entry
from board import server
from tests.helpers import VaultCase


class MainTest(VaultCase):
    def run_main(self, *args, env=None):
        err = io.StringIO()
        with mock.patch.object(sys, "argv", ["board", *args]), mock.patch.dict(os.environ, env or {}, clear=False), contextlib.redirect_stderr(err):
            return entry.main(), err.getvalue()

    def test_no_vault_is_exit_2_with_a_message_saying_how_to_give_one(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("BOARD_VAULT", None)
            code, err = self.run_main()
        self.assertEqual(code, 2)
        self.assertIn("--vault", err)

    def test_a_port_already_in_use_is_exit_2_with_one_line(self):
        with socket.socket() as taken:
            taken.bind(("127.0.0.1", 0))
            taken.listen()
            code, err = self.run_main("--vault", self.vault, "--port", str(taken.getsockname()[1]))
        self.assertEqual(code, 2)
        self.assertEqual(len(err.strip().splitlines()), 1)
        self.assertNotIn("Traceback", err)

    def test_a_port_out_of_range_is_exit_2(self):
        code, err = self.run_main("--vault", self.vault, "--port", "99999")
        self.assertEqual((code, "Traceback" in err), (2, False))

    def test_it_serves_on_loopback_until_interrupted(self):
        with mock.patch.object(entry.BoardServer, "serve_forever", side_effect=KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()) as out:
            code, _ = self.run_main("--vault", self.vault, "--port", "0")
        self.assertEqual(code, 0)
        self.assertIn("http://127.0.0.1:", out.getvalue())

    def test_it_says_when_the_page_is_not_built_and_stays_quiet_when_it_is(self):
        with tempfile.TemporaryDirectory() as web:
            for built, expect in ((False, True), (True, False)):
                if built:
                    with open(os.path.join(web, "index.html"), "w", encoding="utf-8") as f:
                        f.write("<!doctype html>")
                with self.subTest(built=built), mock.patch.object(server, "WEB_DIR", web), mock.patch.object(entry.BoardServer, "serve_forever", side_effect=KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
                    code, err = self.run_main("--vault", self.vault, "--port", "0")
                    self.assertEqual((code, "not built" in err), (0, expect))


if __name__ == "__main__":
    unittest.main()
