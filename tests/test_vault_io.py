"""Tests for board/vault_io.py, on throwaway notes with synthetic text."""

import os
import stat
import tempfile
import threading
import time
import unittest
from unittest import mock

from board import moodboard, vault_io

ID = "2026-10-15-1432-a3f9"
NOTE = f"---\ntype: moodboard\n---\n\n![[{ID}.png]]\nfirst\n\nsecond\n"
NEW = moodboard.format_block("third", source="https://example.com")


class VaultIoTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = self._tmp.name
        self.path = self.write("note.md", NOTE.encode())

    def write(self, name, data):
        path = os.path.join(self.dir, name)
        with open(path, "wb") as f:
            f.write(data)
        return path

    def read(self, path=None):
        with open(path or self.path, "rb") as f:
            return f.read()

    def leftovers(self):
        return sorted(n for n in os.listdir(self.dir) if n.startswith(".board-"))

    def key_of(self, description):
        return next(b.key for b in moodboard.parse(self.read().decode()) if b.description == description)

    def changing_the_note_meanwhile(self, name):
        """Patch moodboard.<name> so the note gains a line after the function has read it, as another editor might."""
        real = getattr(moodboard, name)

        def wrapper(*args):
            result = real(*args)
            with open(self.path, "ab") as f:
                f.write(b"\nadded elsewhere\n")
            return result

        return mock.patch.object(moodboard, name, wrapper)

    # append_block

    def test_append_writes_only_new_bytes_after_the_old_ones(self):
        vault_io.append_block(self.path, NEW)
        self.assertEqual(self.read(), NOTE.encode() + b"\n" + NEW.encode() + b"\n")

    def test_append_keeps_a_non_ascii_note_and_bytes_intact(self):
        original = "café — 日本\n".encode()
        path = self.write("u.md", original)
        vault_io.append_block(path, NEW)
        self.assertTrue(self.read(path).startswith(original))

    def test_append_refuses_a_missing_note_and_creates_nothing(self):
        with self.assertRaises(FileNotFoundError):
            vault_io.append_block(os.path.join(self.dir, "none.md"), NEW)
        self.assertEqual(os.listdir(self.dir), ["note.md"])

    def test_a_note_that_is_not_utf8_is_refused_and_left_alone(self):
        path = self.write("bad.md", b"caf\xe9\n")
        for call in (lambda: vault_io.append_block(path, NEW), lambda: vault_io.delete_block(path, "0" * 64)):
            with self.assertRaises(moodboard.MoodboardError):
                call()
        self.assertEqual(self.read(path), b"caf\xe9\n")

    def test_append_refuses_when_the_note_changed_under_it(self):
        with self.changing_the_note_meanwhile("append"), self.assertRaises(moodboard.MoodboardError):
            vault_io.append_block(self.path, NEW)
        self.assertEqual(self.read(), NOTE.encode() + b"\nadded elsewhere\n")

    def test_simultaneous_appends_all_succeed_and_all_land(self):
        real = moodboard.append

        def slow(text, block):
            result = real(text, block)
            time.sleep(0.02)  # keep each call open long enough for the others to arrive
            return result

        errors = []

        def add(n):
            try:
                vault_io.append_block(self.path, moodboard.format_block(f"item {n}"))
            except Exception as err:  # noqa: BLE001 - collected and asserted on below
                errors.append(err)

        with mock.patch.object(moodboard, "append", slow):
            threads = [threading.Thread(target=add, args=(n,)) for n in range(8)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        self.assertEqual(errors, [])
        self.assertEqual(sorted(b.description for b in moodboard.parse(self.read().decode()) if b.description.startswith("item")),
                         sorted(f"item {n}" for n in range(8)))

    def test_simultaneous_deletes_all_succeed_and_all_go(self):
        self.write("note.md", ("\n\n".join(f"item {n}" for n in range(8)) + "\n").encode())
        found = {b.description: b.key for b in moodboard.parse(self.read().decode())}
        real = moodboard.remove

        def slow(text, key):
            result = real(text, key)
            time.sleep(0.02)
            return result

        errors = []

        def delete(key):
            try:
                vault_io.delete_block(self.path, key)
            except Exception as err:  # noqa: BLE001 - collected and asserted on below
                errors.append(err)

        with mock.patch.object(moodboard, "remove", slow):
            threads = [threading.Thread(target=delete, args=(key,)) for key in found.values()]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        self.assertEqual(errors, [])
        self.assertEqual(moodboard.parse(self.read().decode()), [])

    def test_a_note_with_carriage_returns_is_written_back_with_them(self):
        crlf = NOTE.replace("\n", "\r\n").encode()
        path = self.write("crlf.md", crlf)
        vault_io.append_block(path, NEW)
        appended = self.read(path)
        self.assertTrue(appended.startswith(crlf))
        self.assertEqual(appended.count(b"\n"), appended.count(b"\r\n"))
        vault_io.delete_block(path, next(b.key for b in moodboard.parse(appended.decode()) if b.description == "second"))
        after = self.read(path)
        self.assertEqual(after.count(b"\n"), after.count(b"\r\n"))
        self.assertNotIn(b"second", after)

    # delete_block

    def test_delete_removes_one_block_returns_it_and_leaves_no_temporary_file(self):
        block = vault_io.delete_block(self.path, self.key_of("first"))
        self.assertEqual((block.image_id, block.description), (ID, "first"))
        self.assertEqual(self.read(), b"---\ntype: moodboard\n---\n\nsecond\n")
        self.assertEqual(self.leftovers(), [])

    def test_delete_refuses_a_block_that_changed_and_writes_nothing(self):
        key = self.key_of("second")
        self.write("note.md", NOTE.replace("second", "second, edited").encode())
        with self.assertRaises(moodboard.BlockNotFound):
            vault_io.delete_block(self.path, key)
        self.assertEqual(self.read(), NOTE.replace("second", "second, edited").encode())
        self.assertEqual(self.leftovers(), [])

    def test_delete_refuses_when_the_note_changed_under_it_and_cleans_up(self):
        with self.changing_the_note_meanwhile("remove"), self.assertRaises(moodboard.MoodboardError):
            vault_io.delete_block(self.path, self.key_of("second"))
        self.assertEqual(self.read(), NOTE.encode() + b"\nadded elsewhere\n")
        self.assertEqual(self.leftovers(), [])

    def test_delete_keeps_the_notes_permissions(self):
        os.chmod(self.path, 0o640)
        vault_io.delete_block(self.path, self.key_of("second"))
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o640)

    def test_delete_through_a_symbolic_link_changes_the_target_and_keeps_the_link(self):
        link = os.path.join(self.dir, "link.md")
        os.symlink(self.path, link)
        vault_io.delete_block(link, self.key_of("second"))
        self.assertTrue(os.path.islink(link))
        self.assertNotIn(b"second", self.read())

    def test_delete_with_a_write_failure_leaves_the_note_and_no_temporary_file(self):
        before = self.read()
        with mock.patch("board.vault_io.os.replace", side_effect=OSError("disk full")), self.assertRaises(OSError):
            vault_io.delete_block(self.path, self.key_of("second"))
        self.assertEqual((self.read(), self.leftovers()), (before, []))


if __name__ == "__main__":
    unittest.main()
