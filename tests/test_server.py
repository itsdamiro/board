"""Tests for board/server.py: a real server on a free loopback port, a throwaway vault, and http.client."""

import base64
import http.client
import json
import os
import socket
import threading
import unittest
from unittest import mock

from board import items, moodboard, server, vault_io
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
        self.server = server.BoardServer(self.vault, 0)
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
        for path in ("/", "/api", "/api/brands/", "/api/brands/alpha/", "/api/brands/alpha/other", "/api/brands?x=1", "/api/brands/alpha?x=1", "/etc/passwd"):
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
        with mock.patch.object(items, "brand_view", side_effect=items.FilesLeft("files stayed")):
            status, body = self.json("GET", "/api/brands/alpha")
        self.assertEqual((status, body), (500, {"error": "files stayed"}))

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


if __name__ == "__main__":
    unittest.main()
