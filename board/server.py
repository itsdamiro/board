"""The local HTTP server, its API and the built page (ADR 001, decisions 1, 5, 6 and 8; ADR 002, decisions 1 and 6).

It listens on 127.0.0.1 only. Every request must name this server in `Host` (which stops a web page reaching it through a
DNS name that points here), and a request that changes anything must carry an `Origin` that is this server's own; a request
with any other `Origin` is refused whatever its method. Bodies are JSON, so a form on another site cannot send one.
Routes (all under /api; errors are `{"error": "<plain text>"}`):

  GET    /api/brands                          {"brands": [slug, ...]}
  GET    /api/brands/<slug>                   the brand: badges, summary, panels, and Moodboard items, newest first
  GET    /api/brands/<slug>/images/<id>.<ext> the original image;  .../thumbs/<id>.<ext> its thumbnail
  GET    /api/brands/<slug>/links/<hash>.<ext> the thumbnail of an address's preview (ADR 008)
  POST   /api/brands/<slug>/items             {"description", "source", "image"(base64)} -> the new item, 201
  POST   /api/brands/<slug>/items/<key>/lookup  looks the item's address up (up to 8 s) -> the item, 200
  DELETE /api/brands/<slug>/items/<key>       removes the item whose key the brand view gave

Everything else that is read (GET, HEAD) is the built page, `web/dist/`: `/` is its index.html, other addresses are its files.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

from board import images, items, links, moodboard, vault, vault_io
from board.moodboard import MoodboardError

IMAGE_CACHE = "private, max-age=31536000, immutable"  # an image is named by its id and never changes; a deleted id is never made again
CSP = "default-src 'self'; img-src 'self' blob:"  # ADR 002, decision 6: its own origin and blob: images, nothing else
WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "dist")  # ADR 002, decision 1
PAGE_TYPES = {  # the only files the page route serves, each with its own type (nosniff makes a wrong one a broken script)
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}
MAX_BODY = images.MAX_BYTES * 4 // 3 + 64 * 1024  # a 25 MB image in base64, and the text around it
_BRAND, _KEY = r"(?P<slug>[^/]+)", r"(?P<key>[0-9a-f]{64})"
_IMAGE = rf"(?P<kind>images|thumbs)/(?P<id>{moodboard.ID_PATTERN})\.(?P<ext>{'|'.join(images.CONTENT_TYPES)})"
_LINK = rf"links/(?P<name>[0-9a-f]{{16}})\.(?P<ext>{'|'.join(images.CONTENT_TYPES)})"
ROUTES = [
    ("GET", re.compile(r"/api/brands"), "brands"),
    ("GET", re.compile(rf"/api/brands/{_BRAND}"), "brand"),
    ("GET", re.compile(rf"/api/brands/{_BRAND}/{_IMAGE}"), "image"),
    ("GET", re.compile(rf"/api/brands/{_BRAND}/{_LINK}"), "link"),
    ("POST", re.compile(rf"/api/brands/{_BRAND}/items"), "add"),
    ("POST", re.compile(rf"/api/brands/{_BRAND}/items/{_KEY}/lookup"), "lookup"),
    ("DELETE", re.compile(rf"/api/brands/{_BRAND}/items/{_KEY}"), "delete"),
    ("GET", re.compile(r"/(?!api/)(?P<name>.*)"), "page"),  # last, and never under /api: an unknown API address stays a JSON 404
]


def refusal(method: str, host: str | None, origin: str | None, port: int) -> str | None:
    """Why a request must be refused on grounds of where it comes from, or None. `port` is the one the server listens on."""
    names = {f"127.0.0.1:{port}", f"localhost:{port}"}
    if host not in names:
        return "this server answers only to its own address"
    if origin is None:
        return None if method in ("GET", "HEAD") else "a request that changes something must say where it comes from"
    return None if origin in {f"http://{n}" for n in names} else "this request comes from another origin"


def page_file(web_dir: str, name: str) -> str | None:
    """The built file the quoted `name` (no leading slash) stands for, or None. Only a plain file of a known type inside `web_dir`."""
    parts = unquote(name).split("/")
    if any(not part or part.startswith(".") or "\0" in part for part in parts):
        return None
    if os.path.splitext(parts[-1])[1].lower() not in PAGE_TYPES:
        return None
    root = os.path.realpath(web_dir)
    path = os.path.realpath(os.path.join(root, *parts))
    return path if path.startswith(root + os.sep) and os.path.isfile(path) else None


class Failure(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def _status_of(err: Exception) -> HTTPStatus | None:
    """The status for an error the vault, image and item code raise on purpose; None for anything unexpected."""
    for kind, status in (
        (vault.BrandNotFound, HTTPStatus.NOT_FOUND),
        (items.MissingMoodboard, HTTPStatus.CONFLICT),
        (vault_io.NoteChanged, HTTPStatus.CONFLICT),
        (TimeoutError, HTTPStatus.REQUEST_TIMEOUT),
        (moodboard.BlockNotFound, HTTPStatus.CONFLICT),
        (moodboard.AmbiguousBlock, HTTPStatus.CONFLICT),
        (images.ImageRefused, HTTPStatus.UNPROCESSABLE_ENTITY),
        (items.ItemError, HTTPStatus.UNPROCESSABLE_ENTITY),
        (MoodboardError, HTTPStatus.UNPROCESSABLE_ENTITY),
        (vault.VaultError, HTTPStatus.FORBIDDEN),
    ):
        if isinstance(err, kind):
            return status
    return None


class Handler(BaseHTTPRequestHandler):
    server: "BoardServer"
    timeout = 30  # seconds a client may stay silent; else a stalled upload would hold its thread for good

    def _send(self, status: HTTPStatus, body: bytes, content_type: str, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: HTTPStatus, data: object) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _body(self) -> dict:
        if (self.headers.get("Content-Type") or "").split(";")[0].strip().lower() != "application/json":
            raise Failure(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "the body must be JSON")
        length = self.headers.get("Content-Length", "")
        if not (length.isascii() and length.isdigit()):
            raise Failure(HTTPStatus.LENGTH_REQUIRED, "the body needs a Content-Length")
        if int(length) > MAX_BODY:
            raise Failure(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "the request is too big")
        try:
            data = json.loads(self.rfile.read(int(length)))
        except (ValueError, UnicodeDecodeError) as err:
            raise Failure(HTTPStatus.BAD_REQUEST, "the body is not valid JSON") from err
        if not isinstance(data, dict):
            raise Failure(HTTPStatus.BAD_REQUEST, "the body must be a JSON object")
        return data

    def _handle(self) -> None:
        port = self.server.server_address[1]
        try:
            why = refusal(self.command, self.headers.get("Host"), self.headers.get("Origin"), port)
            if why:
                raise Failure(HTTPStatus.FORBIDDEN, why)
            method = "GET" if self.command == "HEAD" else self.command
            path, matched = self.path, None
            for verb, pattern, name in ROUTES:
                found = pattern.fullmatch(path) if verb == method else None
                if found:
                    matched = (name, found.groupdict())
                    break
            if not matched:
                raise Failure(HTTPStatus.NOT_FOUND, "no such address")
            getattr(self, f"_route_{matched[0]}")(**{k: unquote(v) if k == "slug" else v for k, v in matched[1].items()})
        except Failure as err:
            self._json(err.status, {"error": err.message})
        except Exception as err:  # noqa: BLE001  every error answers the request; the ones raised on purpose have a status
            status = _status_of(err)
            if status is None:
                self.log_error("%s: %s", type(err).__name__, err)
                self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "something went wrong in the app"})
            else:
                self._json(status, {"error": str(err)})

    do_GET = do_HEAD = do_POST = do_DELETE = _handle

    def _route_brands(self) -> None:
        self._json(HTTPStatus.OK, {"brands": vault.list_brands(self.server.vault)})

    def _route_brand(self, slug: str) -> None:
        self._json(HTTPStatus.OK, items.brand_view(self.server.vault, slug))

    def _route_image(self, slug: str, kind: str, id: str, ext: str) -> None:  # noqa: A002
        vault.moodboard_path(self.server.vault, slug)  # refuses a slug that is not a brand
        path = images.path_of(self.server.vault, slug, id, ext, kind == "thumbs")
        if not path:
            raise Failure(HTTPStatus.NOT_FOUND, "no such image")
        with open(path, "rb") as f:
            self._send(HTTPStatus.OK, f.read(), images.CONTENT_TYPES[ext], IMAGE_CACHE)

    def _route_link(self, slug: str, name: str, ext: str) -> None:
        vault.moodboard_path(self.server.vault, slug)  # refuses a slug that is not a brand
        path = links.path_of(self.server.vault, slug, name, ext)
        if not path:
            raise Failure(HTTPStatus.NOT_FOUND, "no such image")
        with open(path, "rb") as f:
            self._send(HTTPStatus.OK, f.read(), images.CONTENT_TYPES[ext], IMAGE_CACHE)

    def _route_page(self, name: str) -> None:
        path = page_file(self.server.web_dir, name or "index.html")
        if not path:
            if not name:
                raise Failure(HTTPStatus.NOT_FOUND, "the page is not built yet: run `npm run build` in the web folder")
            raise Failure(HTTPStatus.NOT_FOUND, "no such address")
        with open(path, "rb") as f:
            self._send(HTTPStatus.OK, f.read(), PAGE_TYPES[os.path.splitext(path)[1].lower()])

    def _route_add(self, slug: str) -> None:
        data = self._body()
        description, source, picture = data.get("description", ""), data.get("source"), data.get("image")
        if not (isinstance(description, str) and isinstance(source, (str, type(None))) and isinstance(picture, (str, type(None)))):
            raise Failure(HTTPStatus.BAD_REQUEST, "description, source and image must be text or null")
        try:
            image = base64.b64decode(picture, validate=True) if picture is not None else None
        except binascii.Error as err:
            raise Failure(HTTPStatus.BAD_REQUEST, "the image is not valid base64") from err
        self._json(HTTPStatus.CREATED, items.add_item(self.server.vault, slug, description, source, image))

    def _route_lookup(self, slug: str, key: str) -> None:
        self._json(HTTPStatus.OK, items.look_up_item(self.server.vault, slug, key))

    def _route_delete(self, slug: str, key: str) -> None:
        warning = items.delete_item(self.server.vault, slug, key)
        self._json(HTTPStatus.OK, {"deleted": key} if warning is None else {"deleted": key, "warning": warning})


class BoardServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64  # the default of 5 resets some of a dozen thumbnails a page asks for at once

    def __init__(self, vault_path: str, port: int = 0, web_dir: str | None = None):
        super().__init__(("127.0.0.1", port), Handler)  # loopback only (ADR 001, decision 1)
        self.vault = vault_path
        self.web_dir = web_dir or WEB_DIR
