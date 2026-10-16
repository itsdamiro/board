"""Tests for board/server.py: a real server on a free loopback port, a throwaway vault, and http.client."""

import base64
import http.client
import json
import os
import shutil
import socket
import threading
import unittest
from unittest import mock

from board import images, items, links, lookup, moodboard, server, vault_io
from tests.helpers import NOTE, VaultCase, make_image


class RefusalTest(unittest.TestCase):
    """`refusal` on its own: where a request may come from."""

    def test_the_servers_own_names_and_origins_are_accepted(self):
        for host in ("127.0.0.1:8000", "localhost:8000"):
            for origin in (None, "http://127.0.0.1:8000", "http://localhost:8000"):
                with self.subTest(host=host, origin=origin):
                    self.assertIsNone(server.refusal("GET", host, origin, 8000))

    def test_another_host_is_refused_for_every_method(self):
        for method in ("GET", "HEAD", "POST", "DELETE"):
            for host in (None, "", "evil.example", "evil.example:8000", "127.0.0.1", "127.0.0.1:8001", "localhost.evil.example:8000", "[::1]:8000"):
                with self.subTest(method=method, host=host):
                    self.assertTrue(server.refusal(method, host, None, 8000))

    def test_another_origin_is_refused_for_every_method(self):
        for method in ("GET", "HEAD", "POST", "DELETE"):
            for origin in ("http://evil.example", "http://127.0.0.1:8001", "https://127.0.0.1:8000", "http://127.0.0.1", "null", "", "http://127.0.0.1:8000.evil.example", "http://localhost:8000/"):
                with self.subTest(method=method, origin=origin):
                    self.assertTrue(server.refusal(method, "127.0.0.1:8000", origin, 8000))

    def test_a_request_that_changes_something_needs_an_origin(self):
        for method in ("POST", "DELETE", "PUT", "PATCH"):
            self.assertTrue(server.refusal(method, "127.0.0.1:8000", None, 8000))

    def test_reading_needs_no_origin(self):
        for method in ("GET", "HEAD"):
            self.assertIsNone(server.refusal(method, "127.0.0.1:8000", None, 8000))


class ServerCase(VaultCase):
    def setUp(self):
        super().setUp()
        patch = mock.patch.object(server.Handler, "log_message")  # the request log would fill the test output
        patch.start()
        self.addCleanup(patch.stop)
        self.server_errors = []
        patch = mock.patch.object(server.Handler, "log_error", lambda handler, fmt, *args: self.server_errors.append(fmt % args))
        patch.start()
        self.addCleanup(patch.stop)
        self.web = os.path.join(os.path.dirname(self.vault), "dist")  # a synthetic built page; a file beside it that must never be served
        os.makedirs(os.path.join(self.web, "assets"))
        for name, text in (("index.html", "<!doctype html><title>page</title>"), ("theme-init.js", "// theme"), ("assets/app-1a2b.js", "// app"),
                           ("assets/app-1a2b.css", "body{}"), ("assets/font-9z.woff2", "wOF2"), ("assets/a b.js", "// spaced"), ("assets/data.json", "{}"), (".hidden.js", "// hidden")):
            with open(os.path.join(self.web, name), "w", encoding="utf-8") as f:
                f.write(text)
        with open(os.path.join(os.path.dirname(self.web), "secret.js"), "w", encoding="utf-8") as f:
            f.write("// secret")
        self.server = server.BoardServer(self.vault, 0, self.web)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.origin = f"http://127.0.0.1:{self.port}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(5)

    def call(self, method, path, body=None, headers=None, origin="own", raw=None):
        """(status, headers, body bytes). `origin` "own" sends this server's own; None sends none."""
        send = dict(headers or {})
        if origin == "own":
            send["Origin"] = self.origin
        elif origin is not None:
            send["Origin"] = origin
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            send.setdefault("Content-Type", "application/json")
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            conn.request(method, path, body=data, headers=send)
            response = conn.getresponse()
            return response.status, response, response.read()
        finally:
            conn.close()

    def json(self, *args, **kwargs):
        status, response, body = self.call(*args, **kwargs)
        return status, json.loads(body)

    def add(self, description="a thought", source=None, image=None, slug="alpha"):
        body = {"description": description, "source": source, "image": base64.b64encode(image).decode() if image else None}
        return self.json("POST", f"/api/brands/{slug}/items", body)


class BindingTest(ServerCase):
    def test_the_server_listens_on_loopback_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")


class OriginTest(ServerCase):
    def test_a_foreign_origin_is_refused_on_every_route_and_changes_nothing(self):
        data = make_image()
        key = "0" * 64
        requests = [
            ("GET", "/api/brands", None),
            ("GET", "/api/brands/alpha", None),
            ("POST", "/api/brands/alpha/items", {"description": "x", "image": base64.b64encode(data).decode()}),
            ("DELETE", f"/api/brands/alpha/items/{key}", None),
        ]
        for origin in ("http://evil.example", "null", "http://127.0.0.1:1"):
            for method, path, body in requests:
                with self.subTest(origin=origin, method=method, path=path):
                    status, _ = self.json(method, path, body, origin=origin)
                    self.assertEqual(status, 403)
        self.assertEqual(self.moodboard_text(), NOTE)
        self.assertFalse(os.path.exists(os.path.join(self.vault, "Board")))

    def test_a_post_or_delete_without_an_origin_is_refused(self):
        self.assertEqual(self.json("POST", "/api/brands/alpha/items", {"description": "x"}, origin=None)[0], 403)
        self.assertEqual(self.json("DELETE", f"/api/brands/alpha/items/{'0' * 64}", origin=None)[0], 403)
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_a_get_without_an_origin_is_allowed(self):
        self.assertEqual(self.json("GET", "/api/brands", origin=None)[0], 200)

    def test_the_origin_localhost_is_this_server_too(self):
        status, _ = self.json("POST", "/api/brands/alpha/items", {"description": "x"}, origin=f"http://localhost:{self.port}", headers={"Host": f"localhost:{self.port}"})
        self.assertEqual(status, 201)

    def test_a_foreign_host_name_is_refused_even_with_the_right_origin(self):
        status, body = self.json("GET", "/api/brands", headers={"Host": f"rebound.example:{self.port}"})
        self.assertEqual(status, 403)
        self.assertNotIn("brands", body)

    def test_a_foreign_origin_gets_no_cors_permission(self):
        _, response, _ = self.call("GET", "/api/brands", origin="http://evil.example")
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))
        _, response, _ = self.call("GET", "/api/brands")
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))

    def test_an_options_request_gets_no_permission_either(self):
        status, response, _ = self.call("OPTIONS", "/api/brands/alpha/items", origin="http://evil.example")
        self.assertNotEqual(status, 200)
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))


class ReadTest(ServerCase):
    def test_the_brand_list(self):
        self.make_brand("beta")
        self.assertEqual(self.json("GET", "/api/brands"), (200, {"brands": ["alpha", "beta"]}))

    def test_a_brand_with_its_panels_and_items(self):
        self.add("hello", None, make_image())
        status, body = self.json("GET", "/api/brands/alpha")
        self.assertEqual(status, 200)
        self.assertEqual((body["slug"], body["status"], body["summary"]), ("alpha", "active", "A summary."))
        self.assertEqual([i["description"] for i in body["moodboard"]["items"]], ["hello"])

    def test_note_text_comes_back_unescaped(self):
        folder = os.path.join(self.vault, "Brands", "alpha")
        with open(os.path.join(folder, "alpha - Voice.md"), "w", encoding="utf-8") as f:
            f.write("Fish & <b>chips</b> \"quoted\"\n")
        _, body = self.json("GET", "/api/brands/alpha")
        self.assertEqual(body["panels"][0]["text"], "Fish & <b>chips</b> \"quoted\"")

    def test_an_unknown_brand_is_404_and_so_is_a_traversal(self):
        for slug in ("nobody", "..", "%2E%2E", "alpha%2F..%2Falpha", "ALPHA", "alpha%00"):
            with self.subTest(slug=slug):
                self.assertEqual(self.json("GET", f"/api/brands/{slug}")[0], 404)

    def test_an_unknown_address_is_404(self):
        for path in ("/api", "/api/", "/api/brands/", "/api/brands/alpha/", "/api/brands/alpha/other", "/api/brands?x=1", "/api/brands/alpha?x=1", "/api/index.html", "/etc/passwd"):
            with self.subTest(path=path):
                self.assertEqual(self.json("GET", path)[0], 404)

    def test_an_image_and_its_thumbnail_are_served_with_their_own_type_and_safe_headers(self):
        for ext in ("png", "jpg", "webp", "gif"):
            item = self.add(image=make_image(ext, (1000, 500)))[1]
            for kind, width in (("image", 1000), ("thumb", 640)):
                with self.subTest(ext=ext, kind=kind):
                    status, response, body = self.call("GET", item[kind])
                    self.assertEqual(status, 200)
                    self.assertEqual(response.getheader("Content-Type"), f"image/{'jpeg' if ext == 'jpg' else ext}")
                    self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
                    self.assertIn("default-src 'self'", response.getheader("Content-Security-Policy"))
                    self.assertEqual(response.getheader("Content-Length"), str(len(body)))
                    from io import BytesIO
                    from PIL import Image
                    self.assertEqual(Image.open(BytesIO(body)).width, width)

    def test_the_original_comes_back_byte_for_byte(self):
        data = make_image("png", (900, 700))
        item = self.add(image=data)[1]
        self.assertEqual(self.call("GET", item["image"])[2], data)

    def test_a_missing_image_or_a_name_that_is_not_an_id_is_404(self):
        for tail in ("images/2000-01-01-0000-aaaa.png", "thumbs/2000-01-01-0000-aaaa.png", "images/photo.png", "images/..%2F..%2FBrands%2Falpha%2Falpha.md",
                     "images/2000-01-01-0000-aaaa.svg", "images/2000-01-01-0000-aaaa.png/x", "other/2000-01-01-0000-aaaa.png"):
            with self.subTest(tail=tail):
                self.assertEqual(self.json("GET", f"/api/brands/alpha/{tail}")[0], 404)

    def test_an_image_of_another_brand_is_not_served_under_this_one(self):
        self.make_brand("beta")
        item = self.add(image=make_image())[1]
        self.assertEqual(self.call("GET", item["image"].replace("/alpha/", "/beta/"))[0], 404)

    def test_head_answers_without_a_body(self):
        status, response, body = self.call("HEAD", "/api/brands")
        self.assertEqual((status, body), (200, b""))
        self.assertGreater(int(response.getheader("Content-Length")), 0)

    def test_head_sends_no_body_at_all(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as conn:
            conn.sendall(f"HEAD /api/brands HTTP/1.0\r\nHost: 127.0.0.1:{self.port}\r\n\r\n".encode())
            received = b""
            while chunk := conn.recv(4096):
                received += chunk
        head, _, body = received.partition(b"\r\n\r\n")
        self.assertTrue(head.startswith(b"HTTP/1.0 200"))
        self.assertEqual(body, b"")

    def test_a_brand_with_spaces_and_accents_in_its_name_is_found_by_its_quoted_name(self):
        self.make_brand("it's café")
        item = self.add("x", image=make_image(), slug="it%27s%20caf%C3%A9")[1]
        self.assertEqual(self.json("GET", "/api/brands/it%27s%20caf%C3%A9")[1]["slug"], "it's café")
        self.assertEqual(self.call("GET", item["thumb"])[0], 200)

    def test_images_in_a_board_folder_that_is_not_a_brand_are_not_served(self):
        from board import images
        ghost = images.store(self.vault, "ghost", make_image(), "png", make_image())
        self.assertEqual(self.call("GET", f"/api/brands/ghost/images/{ghost}.png")[0], 404)
        self.assertEqual(self.call("GET", f"/api/brands/ghost/thumbs/{ghost}.png")[0], 404)
        self.assertEqual(self.call("GET", f"/api/brands/../images/{ghost}.png")[0], 404)

    def test_images_may_be_cached_and_everything_else_may_not(self):
        item = self.add(image=make_image())[1]
        for path in (item["image"], item["thumb"]):
            self.assertEqual(self.call("GET", path)[1].getheader("Cache-Control"), server.IMAGE_CACHE)
        self.assertEqual(self.call("GET", "/api/brands/alpha")[1].getheader("Cache-Control"), "no-store")
        self.assertEqual(self.call("GET", "/api/brands/alpha/images/2000-01-01-0000-aaaa.png")[1].getheader("Cache-Control"), "no-store")

    def test_every_answer_carries_the_security_headers(self):
        for method, path in (("GET", "/api/brands"), ("GET", "/api/nothing"), ("POST", "/api/brands/alpha/items")):
            _, response, _ = self.call(method, path, origin="http://evil.example")
            with self.subTest(path=path):
                self.assertEqual(response.getheader("Content-Security-Policy"), server.CSP)
                self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
                self.assertEqual(response.getheader("Cache-Control"), "no-store")


class PageTest(ServerCase):
    """The built page: its files, and nothing outside them."""

    def test_the_root_is_the_index_and_each_file_has_its_own_type(self):
        for path, content_type, text in (("/", "text/html; charset=utf-8", "<!doctype html><title>page</title>"), ("/index.html", "text/html; charset=utf-8", None),
                                         ("/theme-init.js", "text/javascript; charset=utf-8", "// theme"), ("/assets/app-1a2b.js", "text/javascript; charset=utf-8", "// app"),
                                         ("/assets/app-1a2b.css", "text/css; charset=utf-8", "body{}"), ("/assets/font-9z.woff2", "font/woff2", "wOF2"),
                                         ("/assets/a%20b.js", "text/javascript; charset=utf-8", "// spaced")):
            with self.subTest(path=path):
                status, response, body = self.call("GET", path, origin=None)
                self.assertEqual((status, response.getheader("Content-Type")), (200, content_type))
                self.assertEqual(response.getheader("Content-Length"), str(len(body)))
                if text:
                    self.assertEqual(body, text.encode())

    def test_a_page_answer_carries_the_security_headers_and_is_not_cached(self):
        for path in ("/", "/assets/app-1a2b.js"):
            _, response, _ = self.call("GET", path, origin=None)
            with self.subTest(path=path):
                self.assertEqual(response.getheader("Content-Security-Policy"), server.CSP)
                self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
                self.assertEqual(response.getheader("Cache-Control"), "no-store")
                self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))

    def test_the_page_loads_with_the_origin_a_browser_sends_for_a_module_script(self):
        self.assertEqual(self.call("GET", "/assets/app-1a2b.js")[0], 200)  # `origin="own"`: same-origin requests of a crossorigin script carry it
        self.assertEqual(self.call("GET", "/", origin="http://evil.example")[0], 403)
        self.assertEqual(self.call("GET", "/assets/app-1a2b.js", headers={"Host": f"rebound.example:{self.port}"})[0], 403)

    def test_head_answers_without_a_body(self):
        status, response, body = self.call("HEAD", "/", origin=None)
        self.assertEqual((status, body), (200, b""))
        self.assertGreater(int(response.getheader("Content-Length")), 0)

    def test_only_reading_works_on_the_page(self):
        for method in ("POST", "DELETE", "PUT"):
            with self.subTest(method=method):
                self.assertIn(self.call(method, "/", body={})[0], (404, 501))
                self.assertIn(self.call(method, "/assets/app-1a2b.js", body={})[0], (404, 501))

    def test_a_name_that_leaves_the_folder_or_is_hidden_is_404(self):
        for path in ("/../secret.js", "/%2e%2e/secret.js", "/assets/../../secret.js", "/assets/%2E%2E/%2E%2E/secret.js", "/..%2Fsecret.js", "/assets%2F..%2F..%2Fsecret.js",
                     "/.hidden.js", "/assets/.%2e/index.html", "//secret.js", "/assets//app-1a2b.js", "/assets/", "/assets",
                     "/index.html%00.js", "/index.html/", "/./index.html", "/assets/./app-1a2b.js"):
            with self.subTest(path=path):
                status, _, body = self.call("GET", path, origin=None)
                self.assertEqual(status, 404)
                self.assertNotIn(b"secret", body)

    def test_a_file_of_an_unlisted_type_is_not_served(self):
        for path in ("/assets/data.json", "/assets/data.JSON", "/index"):
            with self.subTest(path=path):
                self.assertEqual(self.call("GET", path, origin=None)[0], 404)

    def test_a_link_out_of_the_folder_is_not_followed(self):
        os.symlink(os.path.join(os.path.dirname(self.web), "secret.js"), os.path.join(self.web, "assets", "link.js"))
        os.symlink(os.path.dirname(self.web), os.path.join(self.web, "up"))
        os.makedirs(self.web + "-old")  # a sibling whose name starts with the page folder's name
        with open(os.path.join(self.web + "-old", "old.js"), "w", encoding="utf-8") as f:
            f.write("// old")
        os.symlink(self.web + "-old", os.path.join(self.web, "older"))
        for path in ("/assets/link.js", "/up/secret.js", "/older/old.js"):
            with self.subTest(path=path):
                self.assertEqual(self.call("GET", path, origin=None)[0], 404)

    def test_a_name_in_other_letters_is_served_or_missing_but_never_an_error(self):
        for path in ("/INDEX.HTML", "/Assets/APP-1A2B.JS", "/assets/app-1a2b.JS"):  # a file system that ignores case (macOS) finds these
            with self.subTest(path=path):
                self.assertIn(self.call("GET", path, origin=None)[0], (200, 404))

    def test_a_query_is_404_as_it_is_for_the_api(self):
        self.assertEqual(self.call("GET", "/?x=1", origin=None)[0], 404)
        self.assertEqual(self.call("GET", "/assets/app-1a2b.js?v=1", origin=None)[0], 404)

    def test_the_api_is_not_shadowed_by_the_page(self):
        with open(os.path.join(self.web, "assets", "x.js"), "w", encoding="utf-8") as f:
            f.write("// x")
        os.makedirs(os.path.join(self.web, "api"))
        with open(os.path.join(self.web, "api", "brands.js"), "w", encoding="utf-8") as f:
            f.write("// shadow")
        status, response, body = self.call("GET", "/api/brands.js", origin=None)
        self.assertEqual((status, response.getheader("Content-Type")), (404, "application/json; charset=utf-8"))
        self.assertEqual(self.json("GET", "/api/brands")[1], {"brands": ["alpha"]})

    def test_an_unbuilt_page_says_so_on_the_root_and_is_a_plain_404_elsewhere(self):
        os.remove(os.path.join(self.web, "index.html"))
        status, body = self.json("GET", "/", origin=None)
        self.assertEqual(status, 404)
        self.assertIn("npm run build", body["error"])
        self.assertEqual(self.json("GET", "/index.html", origin=None), (404, {"error": "no such address"}))

    def test_a_server_without_a_page_folder_is_404_not_500(self):
        shutil.rmtree(self.web)
        self.assertEqual(self.call("GET", "/", origin=None)[0], 404)
        self.assertEqual(self.call("GET", "/assets/app-1a2b.js", origin=None)[0], 404)


class AddTest(ServerCase):
    def test_an_item_is_added_and_the_note_and_files_show_it(self):
        status, item = self.add("a quiet layout", "https://example.com/p", make_image("png", (800, 400)))
        self.assertEqual(status, 201)
        (block,) = moodboard.parse(self.moodboard_text())
        self.assertEqual((item["key"], block.description, block.source), (block.key, "a quiet layout", "https://example.com/p"))
        self.assertEqual(len(self.board_files()), 2)

    def test_a_text_only_item_and_a_missing_field_are_fine(self):
        self.assertEqual(self.json("POST", "/api/brands/alpha/items", {"description": "words"})[0], 201)
        self.assertEqual(self.json("POST", "/api/brands/alpha/items", {"source": "https://example.com"})[0], 201)

    def test_the_content_type_must_be_json(self):
        for content_type in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""):
            with self.subTest(content_type=content_type):
                status, _, _ = self.call("POST", "/api/brands/alpha/items", raw=b'{"description": "x"}', headers={"Content-Type": content_type})
                self.assertEqual(status, 415)
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_a_json_content_type_with_a_charset_is_fine(self):
        status, _, _ = self.call("POST", "/api/brands/alpha/items", raw=b'{"description": "x"}', headers={"Content-Type": "Application/JSON; charset=utf-8"})
        self.assertEqual(status, 201)

    def test_a_body_that_is_not_a_json_object_is_400(self):
        for raw in (b"", b"not json", b"[1, 2]", b'"text"', b"null", b"\xff\xfe", b'{"description": '):
            with self.subTest(raw=raw):
                status, _, _ = self.call("POST", "/api/brands/alpha/items", raw=raw, headers={"Content-Type": "application/json"})
                self.assertEqual(status, 400)
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_a_field_of_the_wrong_type_is_400(self):
        for body in ({"description": 5}, {"description": None}, {"source": 5}, {"image": 5}, {"image": ["x"]}, {"description": ["a"]}):
            with self.subTest(body=body):
                self.assertEqual(self.json("POST", "/api/brands/alpha/items", body)[0], 400)

    def test_an_image_that_is_not_base64_is_400(self):
        for image in ("not base64!", "QUJD=", "ab", "%%%%"):
            with self.subTest(image=image):
                self.assertEqual(self.json("POST", "/api/brands/alpha/items", {"image": image})[0], 400)

    def test_a_request_without_a_length_is_411_and_an_oversized_one_is_413_unread(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.putrequest("POST", "/api/brands/alpha/items")
        for header, value in (("Origin", self.origin), ("Content-Type", "application/json")):
            conn.putheader(header, value)
        conn.endheaders()
        self.assertEqual(conn.getresponse().status, 411)
        conn.close()
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.putrequest("POST", "/api/brands/alpha/items")
        for header, value in (("Origin", self.origin), ("Content-Type", "application/json"), ("Content-Length", str(server.MAX_BODY + 1))):
            conn.putheader(header, value)
        conn.endheaders()
        self.assertEqual(conn.getresponse().status, 413)
        conn.close()

    def test_a_negative_or_odd_length_is_refused(self):
        for length in ("-1", "1.5", "abc", " ", "\u00b2", "\u00b9"):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            conn.putrequest("POST", "/api/brands/alpha/items")
            for header, value in (("Origin", self.origin), ("Content-Type", "application/json"), ("Content-Length", length)):
                conn.putheader(header, value)
            conn.endheaders()
            with self.subTest(length=length):
                self.assertEqual(conn.getresponse().status, 411)
            conn.close()

    def test_an_image_over_25_mb_is_refused_and_nothing_is_written(self):
        big = b"\x89PNG\r\n\x1a\n" + b"\0" * (25 * 1024 * 1024)
        status, body = self.add("big", image=big)
        self.assertEqual(status, 422)
        self.assertIn("25 MB", body["error"])
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_a_file_that_is_not_an_image_is_422_whatever_it_is_called(self):
        status, body = self.add("x", image=b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")
        self.assertEqual(status, 422)
        self.assertEqual(self.moodboard_text(), NOTE)
        self.assertFalse(os.path.exists(os.path.join(self.vault, "Board")))

    def test_a_missing_moodboard_is_409_with_a_plain_message(self):
        self.make_brand("beta", moodboard=None)
        status, body = self.add("x", slug="beta")
        self.assertEqual(status, 409)
        self.assertIn("Moodboard", body["error"])
        self.assertEqual(os.listdir(os.path.join(self.vault, "Brands", "beta")), ["beta.md"])

    def test_an_unknown_brand_is_404(self):
        self.assertEqual(self.add("x", slug="nobody")[0], 404)

    def test_a_bad_address_is_422(self):
        self.assertEqual(self.add("x", "javascript:alert(1)")[0], 422)
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_several_adds_at_once_all_land(self):
        results = []
        threads = [threading.Thread(target=lambda n=n: results.append(self.add(f"item {n}", image=make_image())[0])) for n in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(results, [201] * 8, self.server_errors)
        self.assertEqual(len(moodboard.parse(self.moodboard_text())), 8)
        self.assertEqual(len(self.board_files()), 16)


class DeleteTest(ServerCase):
    def test_an_item_is_deleted_with_its_files(self):
        keep = self.add("keep", image=make_image())[1]
        drop = self.add("drop", image=make_image())[1]
        self.assertEqual(self.json("DELETE", f"/api/brands/alpha/items/{drop['key']}"), (200, {"deleted": drop["key"]}))
        self.assertEqual([i["key"] for i in self.json("GET", "/api/brands/alpha")[1]["moodboard"]["items"]], [keep["key"]])
        self.assertEqual(self.call("GET", drop["image"])[0], 404)
        self.assertEqual(self.call("GET", keep["image"])[0], 200)

    def test_files_that_stay_are_a_200_with_a_warning_and_no_path(self):
        drop = self.add("drop", image=make_image())[1]
        with mock.patch.object(images, "remove", side_effect=PermissionError(13, "denied", self.vault)):
            status, body = self.json("DELETE", f"/api/brands/alpha/items/{drop['key']}")
        self.assertEqual((status, body), (200, {"deleted": drop["key"], "warning": items.FILES_LEFT}))
        self.assertNotIn(self.vault, json.dumps(body))
        self.assertEqual(self.json("GET", "/api/brands/alpha")[1]["moodboard"]["items"], [])

    def test_a_key_that_matches_nothing_is_409_and_changes_nothing(self):
        self.add("keep", image=make_image())
        before = self.moodboard_text()
        self.assertEqual(self.json("DELETE", f"/api/brands/alpha/items/{'a' * 64}")[0], 409)
        self.assertEqual(self.moodboard_text(), before)
        self.assertEqual(len(self.board_files()), 2)

    def test_a_key_that_is_not_a_key_is_404(self):
        for key in ("short", "A" * 64, "g" * 64, "a" * 65, "..", "a" * 63 + "%2F"):
            with self.subTest(key=key):
                self.assertEqual(self.json("DELETE", f"/api/brands/alpha/items/{key}")[0], 404)

    def test_an_unknown_brand_is_404_and_a_missing_moodboard_is_409(self):
        self.make_brand("beta", moodboard=None)
        self.assertEqual(self.json("DELETE", f"/api/brands/nobody/items/{'a' * 64}")[0], 404)
        self.assertEqual(self.json("DELETE", f"/api/brands/beta/items/{'a' * 64}")[0], 409)

    def test_only_the_named_verbs_work_on_a_route(self):
        for method, path in (("DELETE", "/api/brands"), ("POST", "/api/brands/alpha"), ("GET", "/api/brands/alpha/items"), ("PUT", "/api/brands/alpha/items"),
                             ("GET", f"/api/brands/alpha/items/{'a' * 64}"), ("POST", f"/api/brands/alpha/items/{'a' * 64}")):
            with self.subTest(method=method, path=path):
                self.assertIn(self.call(method, path, body={})[0], (404, 501))


class FailureTest(ServerCase):
    def test_an_unexpected_error_is_a_plain_500_that_says_nothing_about_the_machine(self):
        with mock.patch.object(items, "brand_view", side_effect=RuntimeError(f"secret detail {self.vault}")):
            status, response, body = self.call("GET", "/api/brands/alpha")
        self.assertEqual(status, 500)
        self.assertNotIn(b"secret", body)
        self.assertNotIn(self.vault.encode(), body)

    def test_a_purposeful_error_keeps_its_message_and_status(self):
        with mock.patch.object(items, "brand_view", side_effect=items.MissingMoodboard("no note")):
            status, body = self.json("GET", "/api/brands/alpha")
        self.assertEqual((status, body), (409, {"error": "no note"}))

    def test_a_note_that_changed_while_writing_is_409_so_the_client_can_retry(self):
        with mock.patch.object(items, "add_item", side_effect=vault_io.NoteChanged("the note changed while it was being written")):
            self.assertEqual(self.json("POST", "/api/brands/alpha/items", {"description": "x"})[0], 409)

    def test_a_client_that_stops_sending_is_answered_with_408_and_does_not_hold_the_thread(self):
        with mock.patch.object(server.Handler, "timeout", 0.3):
            with socket.create_connection(("127.0.0.1", self.port), timeout=10) as conn:
                conn.sendall((f"POST /api/brands/alpha/items HTTP/1.0\r\nHost: 127.0.0.1:{self.port}\r\nOrigin: {self.origin}\r\n"
                              "Content-Type: application/json\r\nContent-Length: 100\r\n\r\n{").encode())
                received = b""
                while chunk := conn.recv(4096):
                    received += chunk
        self.assertTrue(received.startswith(b"HTTP/1.0 408"))
        self.assertEqual(self.moodboard_text(), NOTE)

    def test_the_timeout_is_set_on_the_handler(self):
        self.assertEqual(server.Handler.timeout, 30)

    def test_the_server_keeps_answering_after_an_error(self):
        with mock.patch.object(items, "brand_view", side_effect=RuntimeError("x")):
            self.call("GET", "/api/brands/alpha")
        self.assertEqual(self.json("GET", "/api/brands")[0], 200)


class LookupRouteTest(ServerCase):
    """ADR 008 through the API: the add that looks nothing up, the lookup call, the item's title and preview, and the preview's route. The fetch itself is `self.lookup`."""

    ADDRESS = "https://example.com/page"

    def setUp(self):
        super().setUp()
        self.lookup.return_value = lookup.Found("A page", make_image("png", (900, 450)), "png")

    def add_address(self, **extra):
        return self.json("POST", "/api/brands/alpha/items", {"description": "", "source": self.ADDRESS, **extra})

    def look_up(self, key, slug="alpha"):
        return self.json("POST", f"/api/brands/{slug}/items/{key}/lookup", {})

    def post(self):
        """An address added and then looked up: the lookup's answer."""
        _, added = self.add_address()
        return self.look_up(added["key"])

    def test_an_add_looks_nothing_up_and_answers_with_no_title_and_no_preview(self):
        status, item = self.add_address()
        self.assertEqual((status, item["title"], item["preview"]), (201, None, None))
        self.lookup.assert_not_called()
        self.assertEqual(self.board_files(), [])

    def test_a_body_that_still_has_lookup_is_added_and_the_field_is_ignored(self):
        for value in (True, False, "false", 0, None):
            with self.subTest(value=value):
                self.assertEqual(self.add_address(lookup=value)[0], 201)
        self.lookup.assert_not_called()

    def test_the_lookup_call_gives_the_item_a_title_and_a_preview_and_keeps_them(self):
        status, item = self.post()
        self.assertEqual((status, item["title"]), (200, "A page"))
        self.lookup.assert_called_once_with(self.ADDRESS)
        self.assertEqual(self.call("GET", item["preview"]["url"])[0], 200)
        self.assertEqual(self.json("GET", "/api/brands/alpha")[1]["moodboard"]["items"][0]["title"], "A page")

    def test_the_lookup_call_does_not_change_the_note(self):
        _, added = self.add_address()
        before = self.moodboard_text()
        self.look_up(added["key"])
        self.assertEqual(self.moodboard_text(), before)

    def test_a_lookup_call_for_an_address_already_kept_asks_for_nothing_and_answers_with_it(self):
        self.post()
        self.lookup.reset_mock()
        _, added = self.json("POST", "/api/brands/alpha/items", {"description": "again", "source": self.ADDRESS})
        status, item = self.look_up(added["key"])
        self.assertEqual((status, item["title"]), (200, "A page"))
        self.lookup.assert_not_called()

    def test_a_failed_lookup_is_still_a_200_with_nothing_shown(self):
        self.lookup.return_value = lookup.Found()
        status, item = self.post()
        self.assertEqual((status, item["title"], item["preview"]), (200, None, None))

    def test_an_item_with_a_picture_or_with_no_address_cannot_be_looked_up(self):
        _, with_picture = self.add(source=self.ADDRESS, image=make_image("png"))
        _, words = self.add("only words")
        for item in (with_picture, words):
            with self.subTest(key=item["key"]):
                self.assertEqual(self.look_up(item["key"])[0], 422)
        self.lookup.assert_not_called()

    def test_a_key_that_is_not_in_the_note_is_409_and_a_key_that_is_not_a_key_is_404(self):
        self.assertEqual(self.look_up("a" * 64)[0], 409)
        for key in ("a" * 63, "A" * 64, "x"):
            with self.subTest(key=key):
                self.assertEqual(self.look_up(key)[0], 404)
        self.lookup.assert_not_called()

    def test_a_brand_that_is_not_there_is_404_and_one_with_no_moodboard_is_409(self):
        self.assertEqual(self.look_up("a" * 64, slug="nobody")[0], 404)
        self.make_brand("beta", moodboard=None)
        self.assertEqual(self.look_up("a" * 64, slug="beta")[0], 409)

    def test_an_item_deleted_while_the_lookup_was_asking_keeps_nothing(self):
        _, added = self.add_address()

        def asked(address):
            self.assertEqual(self.json("DELETE", f"/api/brands/alpha/items/{added['key']}")[0], 200)
            return lookup.Found("A page", make_image("png"), "png")

        self.lookup.side_effect = asked
        self.assertEqual(self.look_up(added["key"])[0], 409)
        self.assertEqual(self.board_files(), [])

    def test_a_lookup_call_needs_the_servers_own_origin(self):
        _, added = self.add_address()
        self.assertEqual(self.call("POST", f"/api/brands/alpha/items/{added['key']}/lookup", {}, origin=None)[0], 403)
        self.assertEqual(self.call("POST", f"/api/brands/alpha/items/{added['key']}/lookup", {}, origin="http://evil.example")[0], 403)
        self.lookup.assert_not_called()

    def test_the_preview_is_served_with_its_type_and_the_safe_headers(self):
        _, item = self.post()
        status, response, body = self.call("GET", item["preview"]["url"])
        self.assertEqual(status, 200)
        self.assertEqual(response.getheader("Content-Type"), "image/png")
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.getheader("Cache-Control"), server.IMAGE_CACHE)
        self.assertIn("default-src 'self'", response.getheader("Content-Security-Policy"))
        self.assertEqual(body, self.lookup.return_value.preview)
        self.assertEqual((item["preview"]["width"], item["preview"]["height"]), (900, 450))

    def test_an_svg_preview_is_served_as_an_image_that_a_page_opened_on_it_cannot_run(self):
        svg_icon = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><path/></svg>'
        self.lookup.return_value = lookup.Found("A page", svg_icon, "svg")
        _, item = self.post()
        self.assertTrue(item["preview"]["url"].endswith(".svg"))
        self.assertEqual((item["preview"]["width"], item["preview"]["height"]), (40, 30))
        status, response, body = self.call("GET", item["preview"]["url"])
        self.assertEqual((status, body), (200, svg_icon))
        self.assertEqual(response.getheader("Content-Type"), "image/svg+xml")
        self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.getheader("Content-Security-Policy"), server.SVG_CSP)
        self.assertEqual(server.SVG_CSP.split(";")[0], "sandbox")  # no allow-scripts, no allow-same-origin: an opaque origin that runs nothing
        self.assertNotIn("allow-", server.SVG_CSP)

    def test_only_an_svg_gets_the_svg_policy(self):
        _, item = self.post()
        _, response, _ = self.call("GET", item["preview"]["url"])
        self.assertEqual(response.getheader("Content-Security-Policy"), server.CSP)

    def test_a_preview_that_is_not_kept_a_brand_that_is_not_there_and_a_bad_name_are_404(self):
        _, item = self.post()
        url = item["preview"]["url"]
        for path in (url.replace(".png", ".jpg"), url.replace("alpha", "nobody"), url.replace(url[-20:-4], "0" * 16), url.replace(url[-20:-4], "0" * 15),
                     url.replace(".png", ".svg"), url.replace(".png", ".json"), url + "?x=1", url.replace("/links/", "/links/../"), url.replace("/links/", "/link/")):
            with self.subTest(path=path):
                self.assertEqual(self.call("GET", path)[0], 404)

    def test_a_name_that_is_not_16_hex_characters_is_404_even_when_a_file_has_it(self):
        _, item = self.post()
        folder = os.path.join(self.vault, "Board", "alpha", "links")
        for name in ("a" * 15, "a" * 17, "a"):
            with open(os.path.join(folder, f"{name}.png"), "wb") as f:
                f.write(make_image("png"))
            with self.subTest(name=name):
                self.assertEqual(self.call("GET", f"/api/brands/alpha/links/{name}.png")[0], 404)
        with open(os.path.join(folder, f"{'a' * 16}.png"), "wb") as f:
            f.write(make_image("png"))
        self.assertEqual(self.call("GET", f"/api/brands/alpha/links/{'a' * 16}.png")[0], 200)

    def test_a_folder_under_board_that_is_not_a_brand_is_not_served(self):
        folder = os.path.join(self.vault, "Board", "gamma", "links")
        os.makedirs(folder)
        with open(os.path.join(folder, f"{'a' * 16}.png"), "wb") as f:
            f.write(make_image("png"))
        self.assertEqual(self.call("GET", f"/api/brands/gamma/links/{'a' * 16}.png")[0], 404)

    def test_the_record_is_not_served(self):
        _, item = self.post()
        self.assertEqual(self.call("GET", item["preview"]["url"][:-3] + "json")[0], 404)

    def test_a_preview_cannot_be_posted_or_deleted_through_its_address(self):
        _, item = self.post()
        for method in ("POST", "DELETE", "PUT"):
            with self.subTest(method=method):
                self.assertIn(self.call(method, item["preview"]["url"], body={})[0], (404, 501))
        self.assertEqual(self.call("GET", item["preview"]["url"])[0], 200)

    def test_a_preview_that_is_a_link_is_not_served(self):
        _, item = self.post()
        picture = os.path.join(self.vault, "Board", "alpha", "links", os.path.basename(item["preview"]["url"]))
        outside = os.path.join(os.path.dirname(self.vault), "outside.png")
        os.rename(picture, outside)
        os.symlink(outside, picture)
        self.assertEqual(self.call("GET", item["preview"]["url"])[0], 404)

    def test_deleting_the_item_removes_the_kept_lookup_and_its_route(self):
        _, item = self.post()
        self.assertEqual(self.json("DELETE", f"/api/brands/alpha/items/{item['key']}")[0], 200)
        self.assertEqual(self.board_files(), [])
        self.assertEqual(self.call("GET", item["preview"]["url"])[0], 404)

    def test_a_delete_whose_lookup_files_stay_is_a_200_with_a_warning_and_no_path(self):
        _, item = self.post()
        with mock.patch.object(links, "remove", side_effect=PermissionError(13, "denied", self.vault)):
            status, body = self.json("DELETE", f"/api/brands/alpha/items/{item['key']}")
        self.assertEqual((status, body), (200, {"deleted": item["key"], "warning": items.FILES_LEFT}))


if __name__ == "__main__":
    unittest.main()
