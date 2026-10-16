"""Address lookup: one bounded fetch of a page's title and icon (ADR 008, decisions 2 to 6 and 9, and the amendment of 2026-10-17).

`lookup(address)` asks for the page once and then for its icon: the first of at most three candidates that gives an image
(the page's apple-touch-icon, its icon links, then `/favicon.ico`). It never raises: any refusal, error or limit gives a `Found`
with nothing in it, and only the kind of failure is logged, never the address. The icon is called the preview in the API.

What may be reached (decision 3): `http` and `https` on ports 80 and 443, by a host name or a plain IP address (not a number such
as `2130706433`, not with `user@`). The name is resolved here, every address it gives must be public, and the connection is
made to the address that was checked, never to the name again, so a DNS answer that changes in between cannot redirect it.
Each redirect (at most three, never https to http) is checked from the start. The bounds (decision 5): five seconds per
connect and per read, eight for the whole lookup, 512 KB of a page read up to `</head>`, 1 MB of an icon that must be a
PNG, JPEG, WebP, GIF or ICO, or an SVG that passes `svg.check`. A page is read with `html.parser`, which runs nothing.

`_resolve`, `_connect` and `_tls_context` are the only seams: the tests replace them, so nothing reaches the network, and the
checks around them are the ones the server runs.
"""

from __future__ import annotations

import contextlib
import dataclasses
import html.parser
import io
import http.client
import ipaddress
import logging
import re
import socket
import ssl
import threading
import time
import urllib.parse

from PIL import Image

from board import images, svg

log = logging.getLogger("board.lookup")

ALLOWED_PORTS = (80, 443)
MAX_REDIRECTS = 3
CONNECT_TIMEOUT = 5.0  # the secure handshake after a connection
ATTEMPT_TIMEOUT = 2.0  # one connection attempt to one address (ADR 008, amendment of 2026-10-17)
READ_TIMEOUT = 5.0
TOTAL_TIMEOUT = 8.0
PAGE_BYTES = 512 * 1024
PREVIEW_BYTES = 1024 * 1024  # an icon
MAX_ICON_TRIES = 3
TITLE_CHARS = 200
USER_AGENT = "Board (local moodboard app)"
_PAGE_TYPES = ("text/html", "application/xhtml+xml")
_PAGE_ACCEPT = "text/html,application/xhtml+xml"
_PREVIEW_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
_ICO = b"\x00\x00\x01\x00"
_REDIRECTS = (301, 302, 303, 307, 308)
_HOST = re.compile(r"[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?")
# Python calls this global, but an IPv4 address hides inside it (the old IPv4-compatible form). Carrier-grade, Teredo, 6to4 and the
# rest are already not global for it.
_NOT_PUBLIC = (ipaddress.ip_network("::/96"),)
# NAT64 (ADR 008, amendment of 2026-10-17): the network's translator forwards to the IPv4 address in the last 32 bits, so that address
# is the one judged.
_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_DIRECTION_CONTROLS = frozenset("؜‎‏‪‫‬‭‮⁦⁧⁨⁩")


@dataclasses.dataclass(frozen=True)
class Found:
    """What a lookup got: the title as plain text, and the preview as a thumbnail (bytes and extension); each None if not got."""

    title: str | None = None
    preview: bytes | None = None
    preview_ext: str | None = None


class _Failed(Exception):
    """A rule or a limit stopped the lookup. The message is a kind of failure and never contains the address."""


# --- the seams -------------------------------------------------------------------------------------------------------------


def _resolve(host: str, port: int) -> list[str]:
    """Every address the name gives, as text, without repeats."""
    return list(dict.fromkeys(info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)))


def _connect(ip: str, port: int, timeout: float) -> socket.socket:
    return socket.create_connection((ip, port), timeout)


def _tls_context() -> ssl.SSLContext:
    """The library's default: the certificate is checked against the host name and the chain against the system's authorities."""
    return ssl.create_default_context()


# --- the rules --------------------------------------------------------------------------------------------------------------


def _is_public(ip: str) -> bool:
    """Whether an address is on the public internet (decision 3). Anything that is not an address is not public."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.version == 6 and addr.ipv4_mapped is not None:
        return False
    if addr in _NAT64:
        return _is_public(str(ipaddress.IPv4Address(int(addr) & 0xFFFFFFFF)))
    return addr.is_global and not addr.is_multicast and not any(addr in net for net in _NOT_PUBLIC)


@dataclasses.dataclass(frozen=True)
class _Target:
    scheme: str
    host: str  # as it is sent in Host and checked in the certificate: ASCII, no brackets
    port: int
    path: str  # path and query, ready to put on the request line

    @property
    def host_header(self) -> str:
        host = f"[{self.host}]" if ":" in self.host else self.host
        return host if self.port == (443 if self.scheme == "https" else 80) else f"{host}:{self.port}"


def _parse(address: str) -> _Target:
    """The target of an address, or _Failed if decision 3 refuses it before any name is resolved."""
    if any(ord(c) <= 0x20 or ord(c) == 0x7F for c in address):
        raise _Failed("address with a space or control character")
    try:
        parts = urllib.parse.urlsplit(address)
        port = parts.port
    except ValueError as err:
        raise _Failed("address that cannot be read") from err
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        raise _Failed("not http or https")
    if "@" in parts.netloc:
        raise _Failed("address with credentials")
    host = parts.hostname or ""  # already in lower case
    if "%" in host:
        raise _Failed("address without a usable host")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        try:
            socket.inet_aton(host)
        except OSError:
            pass
        else:
            raise _Failed("host given as a number")
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError as err:
            raise _Failed("host that is not a valid name") from err
        if not _HOST.fullmatch(host):
            raise _Failed("host that is not a valid name")
    if port is None:
        port = 443 if scheme == "https" else 80
    if port not in ALLOWED_PORTS:
        raise _Failed("port other than 80 and 443")
    safe = "/%:@!$&'()*+,;=-._~"
    path = urllib.parse.quote(parts.path or "/", safe=safe)
    if parts.query:
        path += "?" + urllib.parse.quote(parts.query, safe=safe + "?")
    return _Target(scheme, host, port, path)


class _Budget:
    """The eight seconds of a whole lookup. A timer shuts down the socket in use when they run out, so a server that sends one
    byte at a time cannot hold the add longer, however each read is bounded."""

    def __enter__(self) -> _Budget:
        self.deadline = time.monotonic() + TOTAL_TIMEOUT
        self.expired = threading.Event()
        self.sock: socket.socket | None = None
        self._timer = threading.Timer(TOTAL_TIMEOUT, self._expire)
        self._timer.daemon = True
        self._timer.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self._timer.cancel()

    def _expire(self) -> None:
        self.expired.set()
        if self.sock is not None:
            try:
                self.sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def left(self) -> float:
        remaining = self.deadline - time.monotonic()
        if remaining <= 0 or self.expired.is_set():
            raise _Failed("took too long")
        return remaining

    def timeout(self, limit: float) -> float:
        return min(limit, self.left())


# --- the fetch --------------------------------------------------------------------------------------------------------------


def _addresses(target: _Target, budget: _Budget) -> list[str]:
    """The addresses of the host, every one public. The name lookup runs in a thread so that it can be given up on."""
    found: list[str] = []
    failed: list[BaseException] = []

    def work() -> None:
        try:
            found.extend(_resolve(target.host, target.port))
        except Exception as err:  # noqa: BLE001  any failure of the lookup means the name is not usable
            failed.append(err)

    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    thread.join(budget.left())
    if thread.is_alive():
        raise _Failed("name lookup took too long")
    if failed or not found:
        raise _Failed("name did not resolve")
    if not all(_is_public(ip) for ip in found):
        raise _Failed("address that is not on the public internet")
    return found


def _open(target: _Target, ips: list[str], budget: _Budget) -> socket.socket:
    """A connection to the first checked address that answers, secured for https against the host name. IPv4 addresses come first,
    each group in the name's order, and an attempt takes at most ATTEMPT_TIMEOUT, so dead IPv6 routes do not use up the whole limit."""
    for ip in sorted(ips, key=lambda ip: ":" in ip):
        try:
            sock = _connect(ip, target.port, budget.timeout(ATTEMPT_TIMEOUT))
        except OSError:
            continue
        try:
            if target.scheme == "https":
                sock.settimeout(budget.timeout(CONNECT_TIMEOUT))
                sock = _tls_context().wrap_socket(sock, server_hostname=target.host)
        except BaseException:
            sock.close()
            raise
        return sock
    raise _Failed("no connection")


def _read(response: http.client.HTTPResponse, sock: socket.socket, budget: _Budget, limit: int, until: bytes | None) -> bytes:
    """Up to `limit` bytes of the body, stopping early after `until` (compared without regard to case)."""
    body = bytearray()
    while len(body) < limit:
        sock.settimeout(budget.timeout(READ_TIMEOUT))
        chunk = response.read1(min(8192, limit - len(body)))
        if not chunk:
            break
        body += chunk
        if until is not None and until in bytes(body[-(len(chunk) + len(until)):]).lower():
            break
    return bytes(body)


def _fetch(address: str, budget: _Budget, accept: str, limit: int, *, types: tuple[str, ...] | None, until: bytes | None = None,
           refuse_longer: bool = False) -> tuple[str, str, bytes]:
    """(the final address, its content type, the body) after at most MAX_REDIRECTS redirects, each one checked from the start.

    A body longer than `limit` is cut, or refused when `refuse_longer`. A content type outside `types` is refused."""
    for _hop in range(MAX_REDIRECTS + 1):
        target = _parse(address)
        ips = _addresses(target, budget)
        try:
            sock = _open(target, ips, budget)
            budget.sock = sock
            with sock, contextlib.closing(http.client.HTTPResponse(sock, method="GET")) as response:  # closing it frees the socket's file
                budget.left()
                sock.settimeout(budget.timeout(READ_TIMEOUT))
                sock.sendall(
                    f"GET {target.path} HTTP/1.1\r\nHost: {target.host_header}\r\nUser-Agent: {USER_AGENT}\r\nAccept: {accept}\r\n"
                    "Accept-Encoding: identity\r\nConnection: close\r\n\r\n".encode("ascii")
                )
                response.begin()
                if response.status in _REDIRECTS:
                    location = response.getheader("Location")
                    if not location:
                        raise _Failed("redirect without a place to go")
                    nxt = urllib.parse.urljoin(address, location)
                    if target.scheme == "https" and not nxt.startswith("https:"):
                        raise _Failed("redirect from https to http")
                    address = nxt
                    continue
                if response.status != 200:
                    raise _Failed(f"answer other than 200 ({response.status})")
                content_type = (response.getheader("Content-Type") or "").strip()
                if types is not None and content_type.split(";")[0].strip().lower() not in types:
                    raise _Failed("not a kind of page that is read")
                length = response.getheader("Content-Length", "")
                if refuse_longer and length.isdigit() and int(length) > limit:
                    raise _Failed("too big")
                body = _read(response, sock, budget, limit + 1 if refuse_longer else limit, until)
                if refuse_longer and len(body) > limit:
                    raise _Failed("too big")
                return address, content_type, body
        except _Failed:
            raise
        except (OSError, http.client.HTTPException, ValueError) as err:
            raise _Failed(f"network or protocol error ({type(err).__name__})") from err
        finally:
            budget.sock = None
    raise _Failed("too many redirects")


# --- reading the page -------------------------------------------------------------------------------------------------------


class _Head(html.parser.HTMLParser):
    """Collects the title, `og:title` and icon links of a page's head. Reads text; runs and fetches nothing."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.og_title: str | None = None
        self.page_title: str | None = None
        self.touch_icons: list[str] = []
        self.icons: list[str] = []
        self._title_parts: list[str] | None = None
        self.done = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.done:
            return
        if tag == "meta":
            values = dict(attrs)
            name = (values.get("property") or values.get("name") or "").lower()
            content = values.get("content")
            if content and name == "og:title" and self.og_title is None:
                self.og_title = content
        elif tag == "link":
            self._link(dict(attrs))
        elif tag == "title" and self.page_title is None:
            self._title_parts = []

    def _link(self, values: dict[str, str | None]) -> None:
        rel = (values.get("rel") or "").lower().split()
        href = (values.get("href") or "").strip()
        if not href:
            return
        if "apple-touch-icon" in rel or "apple-touch-icon-precomposed" in rel:
            self.touch_icons.append(href)
        elif "icon" in rel:  # also "shortcut icon" and "alternate icon", never "mask-icon" or "fluid-icon"
            self.icons.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._title_parts is not None:
            self.page_title, self._title_parts = "".join(self._title_parts), None
        elif tag == "head":
            self.done = True

    def handle_data(self, data: str) -> None:
        if self._title_parts is not None:
            self._title_parts.append(data)


def _clean(text: str | None) -> str | None:
    """Plain text for a card: control and direction-control characters removed, whitespace collapsed, cut at TITLE_CHARS."""
    if not text:
        return None
    kept = "".join(c for c in text if c not in _DIRECTION_CONTROLS and (c.isspace() or ord(c) >= 0x20 and not 0x7F <= ord(c) < 0xA0))
    return " ".join(kept.split())[:TITLE_CHARS].rstrip() or None


def _read_head(body: bytes, content_type: str) -> tuple[str | None, list[str]]:
    """(title, icon addresses as written, best first) from the start of a page."""
    charset = "utf-8"
    match = re.search(r"charset=([\w.-]+)", content_type, re.IGNORECASE)
    if match:
        charset = match.group(1)
    try:
        text = body.decode(charset, errors="replace")
    except LookupError:
        text = body.decode("utf-8", errors="replace")
    parser = _Head()
    parser.feed(text)
    return _clean(parser.og_title) or _clean(parser.page_title), parser.touch_icons + parser.icons


def _icon(data: bytes) -> tuple[bytes, str]:
    """(thumbnail bytes, extension) of an icon's bytes: an ICO becomes a PNG of its largest image, an SVG that passes `svg.check`
    is kept as it came, the rest as `images` makes them."""
    if svg.looks_like(data):
        svg.check(data)
        return data, "svg"
    if not data.startswith(_ICO):
        ext = images.sniff(data)
        return images.thumbnail(data, ext), ext
    try:
        image = Image.open(io.BytesIO(data))  # reads the header only
        if image.width * image.height > images.MAX_PIXELS:
            raise images.ImageRefused("the image has too many pixels")
        out = io.BytesIO()
        image.convert("RGBA").save(out, "PNG")
    except images.ImageRefused:
        raise
    except Exception as err:  # noqa: BLE001  a decoder can fail in many ways; all mean unusable
        raise images.ImageRefused("this file is not an image that can be read") from err
    return images.thumbnail(out.getvalue(), "png"), "png"


def _preview(address: str, budget: _Budget) -> tuple[bytes, str]:
    """(thumbnail bytes, extension) of the icon at an address, or _Failed."""
    _final, _type, data = _fetch(address, budget, _PREVIEW_ACCEPT, PREVIEW_BYTES, types=None, refuse_longer=True)
    try:
        return _icon(data)
    except svg.SvgRefused as err:
        raise _Failed(f"{err} is not taken") from err
    except images.ImageRefused as err:
        raise _Failed("not an image that is taken") from err


def lookup(address: str) -> Found:
    """The title and icon of the page at an address. Never raises; a failure of either part leaves that part None."""
    with _Budget() as budget:
        try:
            final, content_type, body = _fetch(address, budget, _PAGE_ACCEPT, PAGE_BYTES, types=_PAGE_TYPES, until=b"</head>")
            title, icons = _read_head(body, content_type)
            candidates = [urllib.parse.urljoin(final, icon) for icon in icons]
            candidates.append(urllib.parse.urljoin(final, "/favicon.ico"))
        except Exception as err:  # noqa: BLE001  decision 9: whatever went wrong, the item is added as it is
            _log_failure("page", err)
            return Found()
        for candidate in list(dict.fromkeys(candidates))[:MAX_ICON_TRIES]:
            try:
                thumb, ext = _preview(candidate, budget)
            except Exception as err:  # noqa: BLE001  the same, for the picture alone: the title is still kept
                if not str(err).endswith("(404)"):  # a site with no icon at a guessed place is ordinary and says nothing
                    _log_failure("preview", err)
                continue
            return Found(title, thumb, ext)
        return Found(title)


def _log_failure(part: str, err: Exception) -> None:
    """The kind of failure and never the address (decision 9); an unexpected error is named by its class alone."""
    log.warning("address lookup of the %s failed: %s", part, err if isinstance(err, _Failed) else type(err).__name__)
