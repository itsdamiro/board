#!/usr/bin/env python3
"""Keep the owner's private material out of a public repository (ADR 003, decision 3). Reads files only; it fixes nothing.

Usage: python3 scripts/private_check.py [--root .] [--terms .private-terms]

Looks at every tracked file (`git ls-files`), its path and its text, and fails on:
  - a home-directory path (a macOS, Linux or Windows user folder);
  - any term listed in the private-terms file, one per line, matched anywhere and ignoring case (blank lines and lines
    starting with # are skipped). The file is the owner's and gitignored; if it is missing the terms check is skipped
    and says so, so a fresh clone still passes. If it is tracked, that is a failure: it would publish the list.
A report names the file, the line and which kind of problem; it never prints the term or the path it matched, so the
output can go into a log. Exit 1 on any problem, 2 on a usage error.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

HOME_PATH = re.compile(r"(?<![\w.~-])/(?:Users|home)/[^/\s'\"`]+/|[A-Za-z]:[\\/]Users[\\/][^\\/\s'\"`]+[\\/]")


def tracked_files(root: str) -> list[str]:
    result = subprocess.run(["git", "-C", root, "ls-files", "-z"], capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"{root} is not a git repository: {result.stderr.decode(errors='replace').strip()}")
    return [p for p in result.stdout.decode("utf-8", errors="surrogateescape").split("\0") if p]


def read_terms(path: str) -> list[tuple[int, str]]:
    """(line number, lower-cased term) for each term in the file."""
    with open(path, encoding="utf-8-sig") as f:
        return [(n, line.strip().lower()) for n, line in enumerate(f, 1) if line.strip() and not line.lstrip().startswith("#")]


def check(root: str, terms_path: str) -> tuple[list[str], str]:
    """(problems, note). A note says a check could not run, and is not a problem."""
    found, note = [], ""
    files = tracked_files(root)
    terms_name = os.path.relpath(os.path.join(root, terms_path), root)
    terms: list[tuple[int, str]] = []
    if os.path.exists(os.path.join(root, terms_path)):
        terms = read_terms(os.path.join(root, terms_path))
        if terms_name in files:
            found.append(f"{terms_name}: the private-terms file is tracked, which publishes the list: `git rm --cached` it")
    else:
        note = f"no {terms_name}: the private-terms check was skipped (list one term per line to turn it on)"

    def hits(text: str) -> list[str]:
        lowered = text.lower()
        return [f"matches line {n} of {terms_name}" for n, term in terms if term in lowered]

    for name in files:
        found += [f"{name}: the file's path {why}" for why in hits(name)]
        full = os.path.join(root, name)
        if os.path.islink(full):  # git publishes the link's target path, not what it points at
            text = os.readlink(full)
        elif os.path.isfile(full):
            with open(full, "rb") as f:
                text = f.read().decode("utf-8", errors="replace")
        else:
            continue
        for number, line in enumerate(text.split("\n"), 1):
            if HOME_PATH.search(line):
                found.append(f"{name}:{number}: a home-directory path")
            found += [f"{name}:{number}: text {why}" for why in hits(line)]
    return found, note


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Fail on private material in tracked files (ADR 003, decision 3).")
    parser.add_argument("--root", default=".")
    parser.add_argument("--terms", default=".private-terms", help="the private-terms file, relative to --root")
    args = parser.parse_args(argv)
    try:
        found, note = check(args.root, args.terms)
    except (RuntimeError, OSError) as err:
        print(err, file=sys.stderr)
        return 2
    for line in found:
        print(line)
    if note:
        print(note)
    print(f"{len(found)} problem(s)" if found else "no private material in tracked files")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
