#!/usr/bin/env python3
"""Make a sample vault for the end-to-end tests (ADR 006, decision 4): made-up brands, each with an empty Moodboard.

Usage: python3 scripts/sample_vault.py <folder>
  The folder must not exist yet; it is made, with `Brands/<slug>/` for each sample brand: a hub note and a Moodboard note.
  Prints nothing; exits 2 with a message if the folder exists or cannot be made. Images are not made here: a test that
  needs one generates it (the server needs Pillow, this script does not).
"""

from __future__ import annotations

import os
import sys

MOODBOARD_HEAD = "---\ntype: moodboard\n---\n\n"
BRANDS = ("sample-one", "sample-two")


def _write(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def make(folder: str) -> str:
    """Create the sample vault at `folder` (which must not exist) and return its real path."""
    os.makedirs(folder)
    vault = os.path.realpath(folder)
    for slug in BRANDS:
        brand = os.path.join(vault, "Brands", slug)
        os.makedirs(brand)
        _write(os.path.join(brand, f"{slug}.md"), f"---\nstatus: active\n---\n\nA made-up brand called {slug}.\n")
        _write(os.path.join(brand, f"{slug} - Moodboard.md"), MOODBOARD_HEAD)
    return vault


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: sample_vault.py <folder>", file=sys.stderr)
        return 2
    try:
        make(argv[1])
    except OSError as err:
        print(f"sample_vault: cannot make {argv[1]}: {err.strerror or err}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
