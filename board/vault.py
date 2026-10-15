"""Where things are in the vault, and the read side: the brand list, a brand's hub badges and summary, and its text panels.

The vault path is never in the code: it comes from `--vault` or the `BOARD_VAULT` environment variable (find_vault).
Every other function takes that checked path and a brand's slug, and refuses a slug that is not exactly a folder name
listed under `Brands/`, so `..`, a separator, a hidden folder, a different spelling of the same folder on a case-insensitive
disk, and a folder that is a symbolic link all fail the same way (BrandNotFound). A note must resolve to a regular file
inside its brand's own folder; one that does not (a link pointing elsewhere, a named pipe) is shown as a panel with a
`problem` and its text is never read. Nothing here writes; moodboard_path gives slice 3 the one checked path it may write.

The text returned is plain text: the frontmatter removed, line endings made "\\n", `[[a|b]]` turned into `b` and `[[a]]`
into `a`. It is not escaped; the page shows it as text (ADR 001, amendment on plain text). An embed `![[x.png]]` is kept as written.
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass

ENV_VAR = "BOARD_VAULT"
FIRST_PANELS = ("Positioning", "Voice", "Visual identity", "Rejected ideas", "Moodboard")  # ADR 001, decision 3

_FIRST_FOLDED = tuple(t.casefold() for t in FIRST_PANELS)
_WIKILINK = re.compile(r"(?<!!)\[\[(?P<target>[^\[\]|]*)(?:\|(?P<shown>[^\[\]]*))?\]\]")
_HEADING = re.compile(r"#{1,6}(?:\s|$)")
_DATE = re.compile(r"(?P<day>\d{4}-\d{2}-\d{2})(?:[T ](?P<time>\d{2}:\d{2}))?")


class VaultError(ValueError):
    """The vault path is missing or is not a vault, or a path would leave the folder it must stay in."""


class BrandNotFound(VaultError):
    """No folder under `Brands/` has exactly this name (or it is a link, which is not followed)."""


@dataclass(frozen=True)
class Panel:
    title: str  # the part of the file name after "<slug> - "
    text: str  # plain text; empty if `problem` is set
    problem: str | None  # why the note could not be shown, or None
    date: str | None = None  # the frontmatter's `created`, as `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`; None if missing or not a date


@dataclass(frozen=True)
class Brand:
    slug: str
    status: str | None  # from the hub note's frontmatter
    client: str | None
    summary: str  # the hub's first paragraph, on one line; empty if there is none
    hub_problem: str | None  # why the hub note could not be read, if it exists but could not
    panels: list[Panel]


def find_vault(arg: str | None, environ: Mapping[str, str]) -> str:
    """The real path of the vault: `arg` if given, else the environment variable. It must hold a `Brands` folder."""
    given = arg or environ.get(ENV_VAR)
    if not given:
        raise VaultError(f"give the vault's folder with --vault or the {ENV_VAR} environment variable")
    vault = os.path.realpath(os.path.expanduser(given))
    if not os.path.isdir(os.path.join(vault, "Brands")):
        raise VaultError("that folder has no `Brands` folder, so it is not the vault")
    return vault


def _inside(folder: str, path: str) -> bool:
    return os.path.realpath(path).startswith(os.path.realpath(folder) + os.sep)


def _is_brand_folder(brands: str, name: str) -> bool:
    """`name`, which `os.listdir(brands)` returned, is a real folder (not a hidden one, not a link) of its own."""
    path = os.path.join(brands, name)
    return not name.startswith(".") and os.path.isdir(path) and os.path.realpath(path) == os.path.join(os.path.realpath(brands), name)


def _brand_dir(vault: str, slug: str) -> str:
    brands = os.path.join(vault, "Brands")
    if slug not in os.listdir(brands) or not _is_brand_folder(brands, slug):
        raise BrandNotFound("no brand has this name")
    return os.path.join(brands, slug)


def list_brands(vault: str) -> list[str]:
    """The names of the brand folders under `Brands/`, in alphabetical order; each one passes the check read_brand makes."""
    brands = os.path.join(vault, "Brands")
    return sorted((n for n in os.listdir(brands) if _is_brand_folder(brands, n)), key=str.casefold)


def moodboard_path(vault: str, slug: str) -> str:
    """The path of `<slug> - Moodboard.md` for vault_io. It need not exist yet (vault_io then raises FileNotFoundError);
    if it does, it must be that very file and not a link to another one, or VaultError is raised: vault_io follows a link,
    and the app must never write into any note but this one."""
    folder = _brand_dir(vault, slug)
    path = os.path.join(folder, f"{slug} - Moodboard.md")
    if os.path.realpath(path) != os.path.join(os.path.realpath(folder), os.path.basename(path)):
        raise VaultError("the Moodboard note is a link to another file, so the app will not write to it")
    return path


def _plain(text: str) -> str:
    """Line endings made "\\n", the leading byte-order mark dropped, wiki links turned into their shown text."""
    text = text.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    return _WIKILINK.sub(lambda m: m["shown"] or m["target"], text)


def _unquoted(value: str) -> str:
    """`value` without one pair of matching quotes around it; a lone apostrophe, as in `Dunkin'`, is part of the value."""
    return value[1:-1] if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'" else value


def _frontmatter(text: str) -> tuple[dict[str, str], str]:
    """The `key: value` pairs between a leading `---` pair, and the text after it. An unclosed one is not frontmatter."""
    lines = text.split("\n")
    if lines[0].rstrip() != "---":
        return {}, text
    for i in range(1, len(lines)):
        if lines[i].rstrip() == "---":
            pairs = {}
            for line in lines[1:i]:
                key, colon, value = line.partition(":")
                if colon and key.strip() and not key[0].isspace():
                    pairs[key.strip()] = _unquoted(value.strip())
            return pairs, "\n".join(lines[i + 1:])
    return {}, text


def _read_note(folder: str, name: str) -> tuple[dict[str, str], str, str | None]:
    """(frontmatter, plain body, problem) of one note in a brand's folder; the file is opened only if it is safe to."""
    path = os.path.join(folder, name)
    if not _inside(folder, path):
        return {}, "", "this note is a link that leaves the brand's folder"
    if not os.path.isfile(path):
        return {}, "", "this note is not a regular file"
    try:
        with open(path, "rb") as f:
            text = f.read().decode("utf-8")
    except UnicodeDecodeError:
        return {}, "", "this note is not UTF-8 text"
    except OSError as err:
        return {}, "", f"this note could not be read ({err.strerror})"
    front, body = _frontmatter(_plain(text))
    return front, body.strip("\n").rstrip(), None


def note_date(front: Mapping[str, str]) -> str | None:
    """The note's `created` as a sortable text, or None. The shape is checked, not the calendar: it only orders cards."""
    found = _DATE.fullmatch(front.get("created", ""))
    return None if found is None else found["day"] + (f"T{found['time']}" if found["time"] else "")


def _summary(body: str) -> str:
    """The first run of lines that are neither blank nor headings, joined by spaces."""
    run = []
    for line in body.split("\n"):
        if line.strip() and not _HEADING.match(line):
            run.append(line.strip())
        elif run:
            break
    return " ".join(run)


def _panel_order(panel: Panel) -> tuple[int, str]:
    title = panel.title.casefold()
    return (_FIRST_FOLDED.index(title) if title in _FIRST_FOLDED else len(_FIRST_FOLDED)), title


def read_brand(vault: str, slug: str) -> Brand:
    """A brand's badges, summary and panels. Raises BrandNotFound; a note that cannot be shown becomes a panel with a problem."""
    folder = _brand_dir(vault, slug)
    names = os.listdir(folder)
    status = client = hub_problem = None
    summary = ""
    if f"{slug}.md" in names:
        front, body, hub_problem = _read_note(folder, f"{slug}.md")
        status, client, summary = front.get("status") or None, front.get("client") or None, _summary(body)
    panels = []
    prefix = f"{slug} - "
    for name in names:
        title = name[len(prefix):-len(".md")].strip() if name.startswith(prefix) and name.endswith(".md") else ""
        if title:
            front, body, problem = _read_note(folder, name)
            panels.append(Panel(title, body, problem, note_date(front)))
    return Brand(slug, status, client, summary, hub_problem, sorted(panels, key=_panel_order))
