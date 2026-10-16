"""Tests for board/lookup.py (ADR 008, decision 12), on synthetic pages from a local server.

Only `_resolve`, `_connect` and `_tls_context` are replaced: a name resolves to an address the test chooses, and every
connection goes to the local server whatever address it was asked for, with the address recorded. So nothing reaches the
network, and the checks of decision 3 around those seams are the ones the server runs.
"""

import io
import ipaddress
import logging
import socket
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from PIL import Image

from board import images, lookup
from tests.helpers import make_image

PUBLIC = "93.184.216.34"
OTHER_PUBLIC = "151.101.1.69"
NAT64_PUBLIC = "64:ff9b::5db8:d822"  # the well-known NAT64 prefix with 93.184.216.34 inside


def page(head="", body="", title=None):
    inner = (f"<title>{title}</title>" if title is not None else "") + head
    return f"<!doctype html><html><head><meta charset=utf-8>{inner}</head><body>{body}</body></html>".encode()


def ok(body, content_type="text/html; charset=utf-8", **headers):
    return {"status": 200, "headers": {"Content-Type": content_type, **headers}, "body": body}


def redirect(location, status=302):
    return {"status": status, "headers": {"Location": location}, "body": b""}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802  the name http.server calls
        site = self.server.site
        site.requests.append((self.path, {k.lower(): v for k, v in self.headers.items()}))
        route = site.routes.get(self.path) or site.routes.get(self.path.split("?")[0])
        if route is None:
            route = {"status": 404, "headers": {}, "body": b"not here"}
        try:
            if callable(route):
                route(self)
                return
            self.send_response(route["status"])
            for name, value in route["headers"].items():
                self.send_header(name, value)
            if "Content-Length" not in route["headers"]:
                self.send_header("Content-Length", str(len(route["body"])))
            self.end_headers()
            self.wfile.write(route["body"])
        except OSError:  # the client has gone: it stopped reading, which some tests want
            pass

    def log_message(self, *_args):
        pass


class Site:
    """A local server whose routes are set by the test, a record of what it was asked, and the fake name resolution."""

    def __init__(self):
        self.routes, self.requests, self.connects, self.resolved = {}, [], [], []
        self.names = {"good.test": [PUBLIC], "other.test": [OTHER_PUBLIC], "evil.test": ["10.0.0.5"], "mixed.test": [PUBLIC, "10.0.0.5"],
                      "localhost": ["127.0.0.1"], "loop6.test": ["::1"],
                      "nat64.test": [NAT64_PUBLIC], "nat64-private.test": ["64:ff9b::a00:1"],
                      "nat64-mixed.test": [NAT64_PUBLIC, "64:ff9b::7f00:1"]}
        self.release = threading.Event()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.server.site = self
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, args=(0.01,), daemon=True).start()

    def resolve(self, host, port):
        self.resolved.append(host)
        try:
            ipaddress.ip_address(host)
            return [host]
        except ValueError:
            pass
        if host not in self.names:
            raise socket.gaierror("no such name")
        return list(self.names[host])

    def connect(self, ip, port, timeout):
        self.connects.append(ip)
        return socket.create_connection(("127.0.0.1", self.port), timeout)

    def close(self):
        self.release.set()
        self.server.shutdown()
        self.server.server_close()


class LookupCase(unittest.TestCase):
    def setUp(self):
        quiet = logging.NullHandler()  # with a handler the log is not printed to the screen; assertLogs still sees it
        logging.getLogger("board.lookup").addHandler(quiet)
        self.addCleanup(logging.getLogger("board.lookup").removeHandler, quiet)
        self.site = Site()
        self.addCleanup(self.site.close)
        for target, replacement in (("_resolve", self.site.resolve), ("_connect", self.site.connect)):
            patcher = mock.patch.object(lookup, target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

    def get(self, address="http://good.test/"):
        return lookup.lookup(address)

    def serve(self, path, route):
        self.site.routes[path] = route


class RefusedAddressesTest(LookupCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(lookup, "MAX_ICON_TRIES", 0)  # these tests are about the request for the page itself
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_each_kind_of_address_that_is_not_on_the_public_internet_is_refused_without_a_connection(self):
        for address in (
            "http://127.0.0.1/", "http://[::1]/", "http://localhost/", "http://loop6.test/", "http://10.0.0.1/", "http://172.16.0.1/",
            "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://0.0.0.0/",
            "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:93.184.216.34]/",
            "http://224.0.0.1/", "http://[ff02::1]/", "http://[2002:7f00:1::]/", "http://[64:ff9b::7f00:1]/", "http://[::7f00:1]/",
            "http://[64:ff9b::a00:1]/", "http://[64:ff9b::a9fe:a9fe]/", "http://[64:ff9b:1::1]/", "http://nat64-private.test/", "http://nat64-mixed.test/",
            "http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/", "http://evil.test/", "http://mixed.test/",
        ):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_an_address_written_as_a_number_is_refused_without_the_name_being_resolved(self):
        for address in ("http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://017700000001/", "http://0x7f000001/", "http://1/"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual((self.site.resolved, self.site.connects), ([], []))

    def test_an_address_with_credentials_is_refused(self):
        for address in ("http://user@good.test/", "http://user:secret@good.test/", "http://@good.test/", "http://good.test@evil.test/"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_only_http_and_https_are_taken(self):
        for address in ("ftp://good.test/", "file:///etc/passwd", "gopher://good.test/", "data:text/html,<title>x</title>", "good.test", "//good.test/"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_only_ports_80_and_443_are_taken(self):
        for address in ("http://good.test:8080/", "https://good.test:8443/", "http://good.test:22/", "http://good.test:0/", "http://good.test:99999/"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_a_space_or_control_character_in_the_address_is_refused(self):
        for address in ("http://good.test/a b", "http://good.test/\x00", "http://good.test/\x7f", "http://good.test/x\x01y"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_a_host_that_is_not_a_name_is_refused(self):
        for address in ("http:///path", "http://", "http://bad host/", "http://good.test\\@evil.test/", "http://[fe80::1%25en0]/", "http://a..b/", "http://good!.test/"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_a_host_that_is_not_a_name_is_refused_by_the_check_alone_even_if_it_would_resolve(self):
        for host in ("good!.test", "go od.test", "good.test\\@evil.test", "good$.test", "[x].test"):
            self.site.names[host] = [PUBLIC]
        for address in ("http://good!.test/", "http://good$.test/", "http://good.test\\@evil.test/"):
            with self.subTest(address=address):
                self.assertEqual(self.get(address), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_a_scope_on_an_address_is_refused_even_if_the_address_is_public(self):
        self.assertEqual(self.get("http://[2606:4700:4700::1111%25en0]/"), lookup.Found())
        self.assertEqual(self.get("http://[64:ff9b::5db8:d822%25en0]/"), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_a_name_that_does_not_resolve_gives_nothing(self):
        self.assertEqual(self.get("http://nowhere.test/"), lookup.Found())

    def test_a_name_that_gives_one_private_address_among_public_ones_is_refused_whole(self):
        self.serve("/", ok(page(title="Hi")))
        self.assertEqual(self.get("http://mixed.test/"), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_which_addresses_count_as_public(self):
        for ip in (PUBLIC, OTHER_PUBLIC, "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888", NAT64_PUBLIC,
                   "64:ff9b::808:808", "64:ff9b::6400:1"):
            with self.subTest(ip=ip):
                self.assertTrue(lookup._is_public(ip))
        for ip in ("127.0.0.1", "0.0.0.0", "10.1.2.3", "172.31.0.1", "192.168.0.1", "169.254.0.1", "100.64.0.1", "100.127.255.255", "224.0.0.1",
                   "239.255.255.250", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "ff02::1", "::ffff:8.8.8.8",
                   "2002:808:808::", "64:ff9b::7f00:1", "64:ff9b::a00:1", "64:ff9b::a9fe:a9fe", "64:ff9b::6440:1", "64:ff9b::e000:1", "64:ff9b::ffff:ffff",
                   "64:ff9b:1::808:808", "64:ff9b:1::1", "::808:808", "2001:0:0:0:0:0:0:1", "not an address", ""):
            with self.subTest(ip=ip):
                self.assertFalse(lookup._is_public(ip))

    def test_a_nat64_address_is_judged_by_the_ipv4_address_inside_it(self):
        self.assertTrue(lookup._is_public("64:ff9b::808:808"))  # 8.8.8.8
        self.assertTrue(lookup._is_public("64:ff9b::6400:1"))  # 100.0.0.1, just below carrier-grade space
        self.assertFalse(lookup._is_public("64:ff9b::6440:1"))  # 100.64.0.1
        self.assertFalse(lookup._is_public("64:ff9b:1::808:808"))  # the local-use prefix is not the well-known one
        self.assertTrue(lookup._is_public("64:ff9b::1:7f00:1"))  # outside the /96 the last 32 bits mean nothing: an ordinary global address

    def test_a_name_with_only_a_nat64_address_is_looked_up_at_the_checked_address_after_one_resolution(self):
        self.serve("/", ok(page(title="Hi")))
        self.assertEqual(self.get("http://nat64.test/").title, "Hi")
        self.assertEqual((self.site.resolved, self.site.connects), (["nat64.test"], [NAT64_PUBLIC]))

    def test_a_nat64_address_written_in_the_address_is_looked_up_when_the_ipv4_inside_is_public(self):
        self.serve("/", ok(page(title="Hi")))
        self.assertEqual(self.get("http://[64:ff9b::5db8:d822]/").title, "Hi")
        self.assertEqual(self.site.connects, [NAT64_PUBLIC])

    def test_the_address_just_outside_carrier_grade_space_is_public(self):
        self.assertTrue(lookup._is_public("100.63.255.255"))
        self.assertTrue(lookup._is_public("100.128.0.1"))


class WhatIsAskedTest(LookupCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(lookup, "MAX_ICON_TRIES", 0)  # these tests are about the request for the page itself
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_request_names_the_host_and_sends_nothing_else_about_anyone(self):
        self.serve("/a/b", ok(page(title="T")))
        self.get("http://Good.Test/a/b?x=1&y=%20z#frag")
        (path, headers), = self.site.requests
        self.assertEqual(path, "/a/b?x=1&y=%20z")
        self.assertEqual(headers["host"], "good.test")
        self.assertEqual(headers["accept-encoding"], "identity")
        self.assertEqual(headers["user-agent"], lookup.USER_AGENT)
        self.assertNotIn("python", headers["user-agent"].lower())
        self.assertNotRegex(headers["user-agent"], r"\d")  # it names the app and carries no version of anything
        self.assertEqual(headers["connection"], "close")
        self.assertEqual(headers["accept"], lookup._PAGE_ACCEPT)
        self.assertEqual(sorted(headers), ["accept", "accept-encoding", "connection", "host", "user-agent"])
        self.assertEqual(self.site.connects, [PUBLIC])

    def test_a_bare_address_asks_for_the_root(self):
        self.serve("/", ok(page(title="T")))
        self.assertEqual(self.get("http://good.test").title, "T")
        self.assertEqual(self.site.requests[0][0], "/")

    def test_a_port_that_is_not_the_scheme_s_own_is_named_in_host(self):
        self.serve("/", ok(page(title="T")))
        self.get("http://good.test:443/")
        self.assertEqual(self.site.requests[0][1]["host"], "good.test:443")

    def test_an_ipv6_address_is_in_brackets_in_host(self):
        self.serve("/", ok(page(title="T")))
        self.site.names["v6.test"] = ["2606:4700:4700::1111"]
        self.get("http://[2606:4700:4700::1111]/")
        self.assertEqual(self.site.requests[0][1]["host"], "[2606:4700:4700::1111]")
        self.assertEqual(self.site.connects, ["2606:4700:4700::1111"])

    def test_a_name_with_other_letters_is_asked_for_in_its_ascii_form(self):
        self.site.names["xn--bcher-kva.test"] = [PUBLIC]
        self.serve("/", ok(page(title="T")))
        self.assertEqual(self.get("http://bücher.test/").title, "T")
        self.assertEqual(self.site.requests[0][1]["host"], "xn--bcher-kva.test")

    def test_non_ascii_in_the_path_is_sent_encoded(self):
        self.serve("/caf%C3%A9", ok(page(title="T")))
        self.assertEqual(self.get("http://good.test/café").title, "T")

    def test_the_connection_goes_to_the_address_that_was_checked_and_the_name_is_resolved_once(self):
        answers = iter([[PUBLIC], ["127.0.0.1"], ["127.0.0.1"]])
        self.site.names = mock.MagicMock()
        self.site.names.__contains__.return_value = True
        self.site.names.__getitem__.side_effect = lambda _host: next(answers)
        self.serve("/", ok(page(title="T")))
        self.assertEqual(self.get().title, "T")
        self.assertEqual(self.site.connects, [PUBLIC])
        self.assertEqual(self.site.resolved, ["good.test"])

    def test_the_first_address_that_does_not_answer_is_skipped_for_the_next_checked_one(self):
        self.site.names["two.test"] = [PUBLIC, OTHER_PUBLIC]
        self.serve("/", ok(page(title="T")))
        real = self.site.connect

        def connect(ip, port, timeout):
            if ip == PUBLIC:
                self.site.connects.append(ip)
                raise ConnectionRefusedError
            return real(ip, port, timeout)

        with mock.patch.object(lookup, "_connect", connect):
            self.assertEqual(self.get("http://two.test/").title, "T")
        self.assertEqual(self.site.connects, [PUBLIC, OTHER_PUBLIC])

    def test_ipv4_addresses_are_tried_before_ipv6_ones_each_group_in_the_names_order(self):
        v6a, v6b = "2606:4700:4700::1111", "2001:4860:4860::8888"
        self.site.names["dual.test"] = [v6a, PUBLIC, v6b, OTHER_PUBLIC]
        self.serve("/", ok(page(title="T")))
        real = self.site.connect

        def connect(ip, port, timeout):
            if ip != v6b:
                self.site.connects.append(ip)
                raise ConnectionRefusedError
            return real(ip, port, timeout)

        with mock.patch.object(lookup, "_connect", connect):
            self.assertEqual(self.get("http://dual.test/").title, "T")
        self.assertEqual(self.site.connects, [PUBLIC, OTHER_PUBLIC, v6a, v6b])

    def test_a_name_with_ipv6_first_is_reached_over_ipv4_when_that_answers(self):
        self.site.names["dual.test"] = ["2606:4700:4700::1111", "2001:4860:4860::8888", PUBLIC]
        self.serve("/", ok(page(title="T")))
        self.assertEqual(self.get("http://dual.test/").title, "T")
        self.assertEqual(self.site.connects, [PUBLIC])

    def test_every_address_is_still_checked_before_any_is_tried(self):
        self.site.names["dual.test"] = ["2606:4700:4700::1111", PUBLIC, "fd00::1"]
        self.assertEqual(self.get("http://dual.test/"), lookup.Found())
        self.assertEqual(self.site.connects, [])

    def test_an_attempt_takes_at_most_two_seconds_and_never_more_than_the_time_left(self):
        timeouts = []

        def connect(ip, port, timeout):
            timeouts.append(timeout)
            raise TimeoutError

        self.site.names["two.test"] = [PUBLIC, OTHER_PUBLIC]
        with mock.patch.object(lookup, "_connect", connect):
            self.assertEqual(self.get("http://two.test/"), lookup.Found())
            self.assertEqual(timeouts, [lookup.ATTEMPT_TIMEOUT] * 2)
            timeouts.clear()
            with mock.patch.object(lookup, "TOTAL_TIMEOUT", 0.5):
                self.get("http://two.test/")
        self.assertTrue(timeouts and all(t <= 0.5 for t in timeouts))

    def test_https_checks_the_certificate_against_the_name_given(self):
        calls = []

        class Context:
            def wrap_socket(self, sock, server_hostname=None):
                calls.append(server_hostname)
                return sock

        self.serve("/", ok(page(title="T")))
        with mock.patch.object(lookup, "_tls_context", Context):
            self.assertEqual(self.get("https://good.test/").title, "T")
        self.assertEqual(calls, ["good.test"])
        self.assertEqual(self.site.requests[0][1]["host"], "good.test")

    def test_a_failed_certificate_check_gives_nothing(self):
        import ssl

        class Context:
            def wrap_socket(self, sock, server_hostname=None):
                raise ssl.SSLCertVerificationError("bad certificate")

        self.serve("/", ok(page(title="T")))
        with mock.patch.object(lookup, "_tls_context", Context):
            self.assertEqual(self.get("https://good.test/"), lookup.Found())
        self.assertEqual(self.site.requests, [])

    def test_the_real_tls_context_verifies_certificates_and_names(self):
        context = lookup._tls_context()
        self.assertTrue(context.check_hostname)
        import ssl

        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)


class RedirectsTest(LookupCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(lookup, "MAX_ICON_TRIES", 0)  # these tests are about the request for the page itself
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_a_redirect_is_followed_and_the_result_is_the_final_page(self):
        self.serve("/", redirect("/next"))
        self.serve("/next", ok(page(title="Final")))
        self.assertEqual(self.get().title, "Final")

    def test_each_kind_of_redirect_status_is_followed(self):
        for status in (301, 302, 303, 307, 308):
            with self.subTest(status=status):
                self.serve("/", redirect("/next", status))
                self.serve("/next", ok(page(title="Final")))
                self.assertEqual(self.get().title, "Final")

    def test_a_redirect_to_another_host_is_resolved_and_checked_again(self):
        self.serve("/", redirect("http://other.test/p"))
        self.serve("/p", ok(page(title="Other")))
        self.assertEqual(self.get().title, "Other")
        self.assertEqual(self.site.resolved, ["good.test", "other.test"])
        self.assertEqual(self.site.connects, [PUBLIC, OTHER_PUBLIC])

    def test_a_redirect_to_an_address_that_is_not_public_is_refused_before_connecting_to_it(self):
        for location in ("http://evil.test/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/", "http://192.168.1.1/",
                         "http://2130706433/", "http://user@other.test/", "http://other.test:8080/", "ftp://other.test/", "http://mixed.test/"):
            with self.subTest(location=location):
                self.site.connects.clear()
                self.serve("/", redirect(location))
                self.serve("/p", ok(page(title="Hidden")))
                self.assertEqual(self.get(), lookup.Found())
                self.assertEqual(self.site.connects, [PUBLIC])

    def test_three_redirects_are_followed_and_a_fourth_is_not(self):
        self.serve("/0", redirect("/1"))
        self.serve("/1", redirect("/2"))
        self.serve("/2", redirect("/3"))
        self.serve("/3", ok(page(title="Third")))
        self.assertEqual(self.get("http://good.test/0").title, "Third")
        self.serve("/3", redirect("/4"))
        self.serve("/4", ok(page(title="Fourth")))
        self.assertEqual(self.get("http://good.test/0"), lookup.Found())

    def test_a_redirect_loop_ends(self):
        self.serve("/", redirect("/"))
        self.assertEqual(self.get(), lookup.Found())
        self.assertEqual(len(self.site.requests), lookup.MAX_REDIRECTS + 1)

    def test_https_never_falls_back_to_http(self):
        class Context:
            def wrap_socket(self, sock, server_hostname=None):
                return sock

        self.serve("/", redirect("http://other.test/p"))
        self.serve("/p", ok(page(title="Plain")))
        with mock.patch.object(lookup, "_tls_context", Context):
            self.assertEqual(self.get("https://good.test/"), lookup.Found())
            self.serve("/", redirect("HTTP://other.test/p"))
            self.assertEqual(self.get("https://good.test/"), lookup.Found())
        self.assertEqual(self.site.connects, [PUBLIC, PUBLIC])

    def test_http_may_move_to_https(self):
        class Context:
            def wrap_socket(self, sock, server_hostname=None):
                return sock

        self.serve("/", redirect("https://other.test/p"))
        self.serve("/p", ok(page(title="Secure")))
        with mock.patch.object(lookup, "_tls_context", Context):
            self.assertEqual(self.get().title, "Secure")

    def test_a_redirect_without_a_place_to_go_gives_nothing_and_asks_once(self):
        self.serve("/", {"status": 302, "headers": {}, "body": b""})
        self.assertEqual(self.get(), lookup.Found())
        self.assertEqual(len(self.site.requests), 1)

    def test_a_redirect_to_a_private_address_for_the_preview_keeps_the_title_and_drops_the_picture(self):
        self.serve("/", ok(page('<link rel="icon" href="/img">', title="T")))
        self.serve("/img", redirect("http://evil.test/img"))
        with mock.patch.object(lookup, "MAX_ICON_TRIES", 3):
            self.assertEqual(self.get(), lookup.Found("T"))
        self.assertEqual(self.site.connects, [PUBLIC, PUBLIC, PUBLIC])  # the page, the redirected icon (not followed), then /favicon.ico


class BoundsTest(LookupCase):
    def patched(self, **values):
        for name, value in values.items():
            patcher = mock.patch.object(lookup, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_a_page_that_is_not_html_gives_nothing(self):
        for content_type in ("application/json", "image/png", "text/plain", "application/octet-stream", ""):
            with self.subTest(content_type=content_type):
                self.serve("/", ok(page(title="T"), content_type))
                self.assertEqual(self.get(), lookup.Found())

    def test_html_and_xhtml_are_read_with_or_without_parameters_and_in_any_case(self):
        for content_type in ("text/html", "TEXT/HTML; charset=UTF-8", "application/xhtml+xml", "text/html ;charset=utf-8"):
            with self.subTest(content_type=content_type):
                self.serve("/", ok(page(title="T"), content_type))
                self.assertEqual(self.get().title, "T")

    def test_an_answer_other_than_200_gives_nothing(self):
        for status in (201, 204, 301, 400, 403, 404, 500):
            with self.subTest(status=status):
                route = {"status": status, "headers": {"Content-Type": "text/html"}, "body": page(title="T")}
                self.serve("/", route)
                self.assertEqual(self.get(), lookup.Found())

    def test_only_the_first_512_kb_of_a_page_are_read(self):
        self.patched(PAGE_BYTES=2000)
        self.serve("/", ok(b"<html><head>" + b"<!-- " + b"x" * 3000 + b" --><title>Late</title></head></html>"))
        self.assertEqual(self.get(), lookup.Found())
        self.serve("/", ok(b"<html><head><title>Early</title><!-- " + b"x" * 3000 + b" --></head></html>"))
        self.assertEqual(self.get().title, "Early")

    def test_the_page_limit_is_exact(self):
        self.patched(PAGE_BYTES=100)
        for fill, found in ((73, "y" * 73), (74, None)):  # the closing tag ends at byte 100, then at byte 101
            with self.subTest(fill=fill):
                self.serve("/", ok(b"<html><head><title>" + b"y" * fill + b"</title>"))
                self.assertEqual(self.get().title, found)

    def test_the_default_page_limit_is_512_kb(self):
        self.assertEqual(lookup.PAGE_BYTES, 512 * 1024)

    def test_reading_stops_at_the_end_of_the_head(self):
        self.patched(READ_TIMEOUT=0.5)

        def stalls_after_the_head(handler):
            head = b"<html><HEAD><title>Done</title></HeAd>"
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html")
            handler.send_header("Content-Length", "100000")
            handler.end_headers()
            handler.wfile.write(head)
            handler.wfile.flush()
            self.site.release.wait(5)

        self.serve("/", stalls_after_the_head)
        started = time.monotonic()
        self.assertEqual(self.get().title, "Done")
        self.assertLess(time.monotonic() - started, 2)

    def test_the_end_of_the_head_is_found_when_it_arrives_in_two_pieces(self):
        self.patched(READ_TIMEOUT=0.5)

        def splits_the_tag(handler):
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html")
            handler.send_header("Content-Length", "100000")
            handler.end_headers()
            handler.wfile.write(b"<html><head><title>Joined</title></he")
            handler.wfile.flush()
            time.sleep(0.1)
            handler.wfile.write(b"ad>")
            handler.wfile.flush()
            self.site.release.wait(5)

        self.serve("/", splits_the_tag)
        started = time.monotonic()
        self.assertEqual(self.get().title, "Joined")
        self.assertLess(time.monotonic() - started, 2)

    def test_a_server_that_never_answers_is_given_up_on_after_the_read_timeout(self):
        self.patched(READ_TIMEOUT=0.3)
        self.serve("/", lambda handler: self.site.release.wait(5))
        started = time.monotonic()
        self.assertEqual(self.get(), lookup.Found())
        self.assertLess(time.monotonic() - started, 2)

    def test_a_server_that_goes_quiet_in_the_body_is_given_up_on_after_the_read_timeout(self):
        self.patched(READ_TIMEOUT=0.3)

        def stalls(handler):
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html")
            handler.end_headers()
            handler.wfile.write(b"<html><head><title>Half")
            handler.wfile.flush()
            self.site.release.wait(5)

        self.serve("/", stalls)
        started = time.monotonic()
        self.assertEqual(self.get(), lookup.Found())
        self.assertLess(time.monotonic() - started, 2)

    def test_a_connection_that_times_out_gives_nothing(self):
        def connect(ip, port, timeout):
            self.assertEqual(timeout, lookup.ATTEMPT_TIMEOUT)
            raise TimeoutError

        with mock.patch.object(lookup, "_connect", connect):
            self.assertEqual(self.get(), lookup.Found())

    def test_a_server_that_sends_a_byte_at_a_time_cannot_hold_the_lookup_past_the_whole_limit(self):
        self.patched(TOTAL_TIMEOUT=0.6)

        def drips(handler):
            handler.wfile.write(b"HTTP/1.1 200 OK\r\n")
            for _ in range(200):
                handler.wfile.write(b"X-Slow: a\r\n")
                handler.wfile.flush()
                time.sleep(0.1)

        self.serve("/", drips)
        started = time.monotonic()
        self.assertEqual(self.get(), lookup.Found())
        self.assertLess(time.monotonic() - started, 2.5)

    def test_a_body_that_drips_past_the_whole_limit_is_cut_off(self):
        self.patched(TOTAL_TIMEOUT=0.6)

        def drips(handler):
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html")
            handler.end_headers()
            handler.wfile.write(b"<html><head><meta name=x>")
            for _ in range(200):
                handler.wfile.write(b" ")
                handler.wfile.flush()
                time.sleep(0.1)

        self.serve("/", drips)
        started = time.monotonic()
        self.assertEqual(self.get(), lookup.Found())
        self.assertLess(time.monotonic() - started, 2.5)

    def test_a_name_lookup_that_hangs_is_given_up_on_at_the_whole_limit(self):
        self.patched(TOTAL_TIMEOUT=0.4)
        done = threading.Event()

        def resolve(host, port):
            done.wait(3)
            return [PUBLIC]

        self.addCleanup(done.set)
        started = time.monotonic()
        with mock.patch.object(lookup, "_resolve", resolve):
            self.assertEqual(self.get(), lookup.Found())
        self.assertLess(time.monotonic() - started, 2)

    def test_the_whole_limit_is_shared_by_the_page_and_its_preview(self):
        self.patched(TOTAL_TIMEOUT=0.8)
        self.serve("/", ok(page('<link rel="icon" href="/img">', title="T")))

        def slow_image(handler):
            self.site.release.wait(5)

        self.serve("/img", slow_image)
        started = time.monotonic()
        self.assertEqual(self.get(), lookup.Found("T"))
        self.assertLess(time.monotonic() - started, 3)

    def test_the_default_times_are_two_five_and_eight_seconds(self):
        self.assertEqual((lookup.CONNECT_TIMEOUT, lookup.READ_TIMEOUT, lookup.TOTAL_TIMEOUT), (5.0, 5.0, 8.0))
        self.assertEqual(lookup.ATTEMPT_TIMEOUT, 2.0)

    def test_the_default_redirect_and_icon_limits(self):
        self.assertEqual((lookup.MAX_REDIRECTS, lookup.PREVIEW_BYTES, lookup.ALLOWED_PORTS), (3, 1024 * 1024, (80, 443)))
        self.assertEqual(lookup.MAX_ICON_TRIES, 3)

    def test_a_failure_does_not_leave_the_timer_running(self):
        before = threading.active_count()
        self.assertEqual(self.get("http://127.0.0.1/"), lookup.Found())
        time.sleep(0.05)
        self.assertLessEqual(threading.active_count(), before)


class ReadingThePageTest(LookupCase):
    def title_of(self, head="", title=None, content_type="text/html; charset=utf-8", body=None):
        self.serve("/", ok(body if body is not None else page(head, title=title), content_type))
        return self.get().title

    def test_og_title_comes_before_the_title_element(self):
        self.assertEqual(self.title_of('<meta property="og:title" content="Shared">', title="Plain"), "Shared")

    def test_the_title_element_is_used_without_an_og_title(self):
        self.assertEqual(self.title_of(title="Plain"), "Plain")

    def test_og_title_given_by_name_is_taken_too(self):
        self.assertEqual(self.title_of('<meta name="og:title" content="By name">'), "By name")

    def test_an_empty_og_title_falls_back_to_the_title_element(self):
        self.assertEqual(self.title_of('<meta property="og:title" content="  ">', title="Plain"), "Plain")

    def test_the_first_icon_that_gives_an_image_wins_and_no_more_is_asked_for(self):
        self.serve("/", ok(page('<link rel="icon" href="/first"><link rel="icon" href="/second">')))
        self.serve("/first", ok(make_image("png")))
        self.serve("/second", ok(b"not an image"))
        self.assertIsNotNone(self.get().preview)
        self.assertEqual([path for path, _ in self.site.requests], ["/", "/first"])

    def test_og_image_is_not_read_or_asked_for(self):
        self.serve("/", ok(page('<meta property="og:image" content="/banner">', title="T")))
        self.serve("/banner", ok(make_image("png")))
        self.assertEqual(self.get(), lookup.Found("T"))
        self.assertNotIn("/banner", [path for path, _ in self.site.requests])

    def test_the_names_of_meta_tags_are_read_in_any_case(self):
        self.assertEqual(self.title_of('<meta property="OG:Title" content="Upper">'), "Upper")

    def test_a_title_element_in_the_body_is_not_read(self):
        self.assertIsNone(self.title_of(body=b"<html><head></head><body><title>Body</title></body></html>"))

    def test_the_first_of_two_titles_wins(self):
        self.assertEqual(self.title_of('<meta property="og:title" content="One"><meta property="og:title" content="Two">', title="A"), "One")
        self.assertEqual(self.title_of(head="<title>Second</title>", title="First"), "First")

    def test_no_title_gives_none(self):
        self.assertIsNone(self.title_of())

    def test_markup_in_a_title_stays_text(self):
        self.assertEqual(self.title_of('<meta property="og:title" content="&lt;b&gt;Bold&lt;/b&gt; &amp; <i>more</i>">'), "<b>Bold</b> & <i>more</i>")

    def test_entities_are_decoded(self):
        self.assertEqual(self.title_of(title="Caf&eacute; &amp; &#8364;5 &#x263A;"), "Café & €5 ☺")

    def test_control_and_direction_control_characters_are_removed(self):
        dirty = "A\x00B\x07C\x1bD\x7fE\x80F\u202eG\u202aH\u2066I\u2069J\u200eK\u200fL\u061cM"
        self.assertEqual(self.title_of(f'<meta property="og:title" content="{dirty}">'), "ABCDEFGHIJKLM")

    def test_whitespace_is_collapsed_and_trimmed(self):
        self.assertEqual(self.title_of(title="\n  One \t two\r\n\u00a0 three\x85four  \n"), "One two three four")

    def test_a_title_is_cut_at_200_characters(self):
        self.assertEqual(self.title_of(title="x" * 500), "x" * 200)
        self.assertEqual(self.title_of(title="y" * 200), "y" * 200)

    def test_a_title_cut_at_a_space_loses_the_space(self):
        self.assertEqual(self.title_of(title="x" * 199 + " " + "y" * 50), "x" * 199)

    def test_a_title_made_only_of_removed_characters_is_none(self):
        self.assertIsNone(self.title_of('<meta property="og:title" content="\u202e\u200f">'))

    def test_a_title_inside_a_script_is_not_a_title(self):
        self.assertEqual(self.title_of("<script>var x = '<title>Fake</title>';</script>", title="Real"), "Real")

    def test_meta_tags_after_the_head_are_not_read(self):
        body = b"<html><head><title>Head</title></head><body><meta property='og:title' content='Late'></body></html>"
        self.assertEqual(self.title_of(body=body), "Head")

    def test_a_page_in_another_charset_is_decoded_by_the_one_it_names(self):
        body = "<html><head><title>Café</title></head></html>".encode("latin-1")
        self.assertEqual(self.title_of(content_type="text/html; charset=iso-8859-1", body=body), "Café")

    def test_an_unknown_charset_falls_back_to_utf8(self):
        self.assertEqual(self.title_of(content_type="text/html; charset=nonsense", body=page(title="Café")), "Café")

    def test_a_page_that_is_broken_html_still_gives_what_can_be_read(self):
        self.assertEqual(self.title_of(body=b"<html><head><title>Cut off<meta <<<>>> <title"), None)
        self.assertEqual(self.title_of(body=b"<html><head><meta property=og:title content=Unquoted><title"), "Unquoted")

    def test_a_page_that_is_empty_gives_nothing(self):
        self.assertEqual(self.title_of(body=b""), None)


class PreviewTest(LookupCase):
    def with_image(self, data, content_type="image/png", head_content="/img"):
        self.serve("/", ok(page(f'<link rel="icon" href="{head_content}">', title="T")))
        self.serve("/img", ok(data, content_type))
        return self.get()

    def test_the_preview_is_returned_as_a_thumbnail_in_its_own_format(self):
        for ext in ("png", "jpg", "webp", "gif"):
            with self.subTest(ext=ext):
                found = self.with_image(make_image(ext, (1000, 40)))
                self.assertEqual((found.title, found.preview_ext), ("T", ext))
                self.assertEqual(images.sniff(found.preview), ext)
                self.assertEqual(Image.open(__import__("io").BytesIO(found.preview)).width, images.THUMB_WIDTH)

    def test_the_original_picture_is_not_what_is_returned(self):
        original = make_image("png", (1000, 40))
        self.assertNotEqual(self.with_image(original).preview, original)

    def test_the_preview_address_is_resolved_against_the_page(self):
        for written in ("/img", "img", "http://good.test/img", "//good.test/img"):
            with self.subTest(written=written):
                self.serve("/", ok(page(f'<link rel="icon" href="{written}">')))
                self.serve("/img", ok(make_image("png")))
                self.assertIsNotNone(self.get("http://good.test/").preview)

    def test_a_preview_on_another_host_goes_through_the_same_checks(self):
        self.serve("/", ok(page('<link rel="icon" href="http://other.test/img">')))
        self.serve("/img", ok(make_image("png")))
        self.assertIsNotNone(self.get().preview)
        self.assertEqual(self.site.connects, [PUBLIC, OTHER_PUBLIC])
        self.site.connects.clear()
        self.serve("/", ok(page('<link rel="icon" href="http://evil.test/img">', title="T")))
        self.assertEqual(self.get(), lookup.Found("T"))
        self.assertEqual(self.site.connects, [PUBLIC, PUBLIC])  # nothing to evil.test; then /favicon.ico on the page's own host

    def test_a_preview_address_that_is_not_http_gives_no_picture(self):
        for written in ("data:image/png;base64,iVBORw0KGgo=", "file:///etc/passwd", "ftp://good.test/img", "javascript:alert(1)", "http://127.0.0.1/img"):
            with self.subTest(written=written):
                self.serve("/", ok(page(f'<link rel="icon" href="{written}">', title="T")))
                self.assertEqual(self.get(), lookup.Found("T"))

    def test_a_preview_is_asked_for_as_an_image_with_the_same_manners(self):
        self.with_image(make_image("png"))
        path, headers = self.site.requests[1]
        self.assertEqual(path, "/img")
        self.assertEqual(headers["accept"], lookup._PREVIEW_ACCEPT)
        self.assertEqual(sorted(headers), ["accept", "accept-encoding", "connection", "host", "user-agent"])
        self.assertEqual(headers["accept-encoding"], "identity")

    def test_a_preview_whatever_its_content_type_is_known_by_its_first_bytes(self):
        self.assertEqual(self.with_image(make_image("png"), "text/plain").preview_ext, "png")
        self.assertEqual(self.with_image(make_image("jpg"), "").preview_ext, "jpg")

    def test_something_that_is_not_an_image_is_ignored(self):
        for data in (b"<svg xmlns='http://www.w3.org/2000/svg'/>", b"<html></html>", b"%PDF-1.7", b"", b"\x89PNG\r\n\x1a\nbut not really", b"GIF89a"):
            with self.subTest(data=data[:12]):
                self.assertEqual(self.with_image(data), lookup.Found("T"))

    def test_an_svg_by_content_type_is_ignored(self):
        self.assertEqual(self.with_image(b"<svg/>", "image/svg+xml"), lookup.Found("T"))

    def test_a_preview_over_the_limit_is_ignored_and_one_at_the_limit_is_taken(self):
        data = make_image("png", (40, 30))
        with mock.patch.object(lookup, "PREVIEW_BYTES", len(data)):
            self.assertIsNotNone(self.with_image(data).preview)
            self.assertEqual(self.with_image(data + b"\0"), lookup.Found("T"))

    def test_a_preview_that_runs_over_the_limit_without_announcing_its_length_is_ignored(self):
        data = make_image("png", (40, 30))

        def unannounced(handler):
            handler.send_response(200)
            handler.send_header("Content-Type", "image/png")
            handler.end_headers()
            handler.wfile.write(data + b"\0")

        self.serve("/", ok(page('<link rel="icon" href="/img">', title="T")))
        self.serve("/img", unannounced)
        with mock.patch.object(lookup, "PREVIEW_BYTES", len(data)):
            self.assertEqual(self.get(), lookup.Found("T"))
        with mock.patch.object(lookup, "PREVIEW_BYTES", len(data) + 1):
            self.assertIsNotNone(self.get().preview)

    def test_a_preview_whose_length_is_announced_over_the_limit_is_refused_without_reading_it(self):
        sent = []

        def liar(handler):
            handler.send_response(200)
            handler.send_header("Content-Type", "image/png")
            handler.send_header("Content-Length", str(lookup.PREVIEW_BYTES + 1))
            handler.end_headers()
            sent.append(1)
            self.site.release.wait(5)

        self.serve("/", ok(page('<link rel="icon" href="/img">', title="T")))
        self.serve("/img", liar)
        started = time.monotonic()
        self.assertEqual(self.get(), lookup.Found("T"))
        self.assertLess(time.monotonic() - started, 2)

    def test_a_preview_with_too_many_pixels_is_ignored_before_it_is_decoded(self):
        with mock.patch.object(images, "MAX_PIXELS", 100):
            self.assertEqual(self.with_image(make_image("png", (40, 30))), lookup.Found("T"))

    def test_a_missing_preview_keeps_the_title(self):
        self.serve("/", ok(page('<link rel="icon" href="/gone">', title="T")))
        self.assertEqual(self.get(), lookup.Found("T"))

    def test_a_preview_through_a_redirect_is_taken(self):
        self.serve("/", ok(page('<link rel="icon" href="/img">')))
        self.serve("/img", redirect("/real"))
        self.serve("/real", ok(make_image("png")))
        self.assertIsNotNone(self.get().preview)

    def test_a_page_with_no_icon_link_is_asked_for_its_favicon_and_nothing_else(self):
        self.serve("/", ok(page(title="T")))
        self.assertEqual(self.get(), lookup.Found("T"))
        self.assertEqual([path for path, _ in self.site.requests], ["/", "/favicon.ico"])

    def test_the_favicon_is_asked_for_on_the_final_address_of_the_page(self):
        self.serve("/start", redirect("http://other.test/home"))
        self.serve("/home", ok(page(title="T")))
        self.serve("/favicon.ico", ok(make_image("png"), "image/x-icon"))
        self.assertEqual(self.get("http://good.test/start").preview_ext, "png")
        self.assertEqual(self.site.connects, [PUBLIC, OTHER_PUBLIC, OTHER_PUBLIC])

    def test_candidates_are_apple_touch_icons_then_icon_links_then_the_favicon_without_repeats(self):
        head = (
            '<link rel="icon" href="/b.png"><link rel="shortcut icon" href="/c.png"><link rel="apple-touch-icon-precomposed" href="/a.png">'
            '<link rel="apple-touch-icon" href="/a.png"><link rel="alternate icon" href="/d.png">'
        )
        self.serve("/", ok(page(head)))
        with mock.patch.object(lookup, "MAX_ICON_TRIES", 10):
            self.get()
        self.assertEqual([path for path, _ in self.site.requests], ["/", "/a.png", "/b.png", "/c.png", "/d.png", "/favicon.ico"])

    def test_icons_of_other_kinds_and_svg_icons_are_not_candidates(self):
        head = (
            '<link rel="mask-icon" href="/mask.png"><link rel="fluid-icon" href="/fluid.png"><link rel="stylesheet" href="/x.css">'
            '<link rel="icon" type="image/svg+xml" href="/a.png"><link rel="icon" href="/b.SVG?v=1"><link rel="icon" href="">'
            '<link rel="icon" href="/ok.png">'
        )
        self.serve("/", ok(page(head)))
        self.get()
        self.assertEqual([path for path, _ in self.site.requests], ["/", "/ok.png", "/favicon.ico"])

    def test_at_most_three_candidates_are_asked_for(self):
        self.serve("/", ok(page("".join(f'<link rel="icon" href="/{n}.png">' for n in range(6)))))
        self.get()
        self.assertEqual([path for path, _ in self.site.requests], ["/", "/0.png", "/1.png", "/2.png"])

    def test_an_ico_is_taken_as_a_png_of_its_largest_image(self):
        buffer = io.BytesIO()
        Image.open(io.BytesIO(make_image("png", (48, 48)))).save(buffer, "ICO", sizes=[(16, 16), (48, 48)])
        found = self.with_image(buffer.getvalue(), "image/x-icon")
        self.assertEqual((found.title, found.preview_ext), ("T", "png"))
        self.assertEqual(images.sniff(found.preview), "png")
        self.assertEqual(Image.open(io.BytesIO(found.preview)).size, (48, 48))

    def test_an_ico_that_cannot_be_read_or_has_too_many_pixels_is_ignored(self):
        self.assertEqual(self.with_image(b"\x00\x00\x01\x00\x01\x00broken", "image/x-icon"), lookup.Found("T"))
        buffer = io.BytesIO()
        Image.new("RGBA", (32, 32)).save(buffer, "ICO", sizes=[(32, 32)])
        with mock.patch.object(images, "MAX_PIXELS", 100), mock.patch.object(Image.Image, "convert") as convert:
            self.assertEqual(self.with_image(buffer.getvalue(), "image/x-icon"), lookup.Found("T"))
        convert.assert_not_called()  # refused before the pixels are decoded


class FailureTest(LookupCase):
    def test_lookup_never_raises_whatever_goes_wrong_inside(self):
        self.serve("/", ok(page(title="T")))
        for target in ("_read_head", "_fetch", "_parse", "_addresses", "_open", "_preview"):
            with self.subTest(target=target), mock.patch.object(lookup, target, side_effect=RuntimeError("boom")):
                self.assertIsInstance(self.get(), lookup.Found)

    def test_the_log_names_the_kind_of_failure_and_never_the_address(self):
        with self.assertLogs("board.lookup", "WARNING") as logged:
            self.get("http://secret-client.test/private/path?token=abc")
            self.get("http://127.0.0.1/secret-path")
            self.get("http://good.test:8080/secret-path")
        text = "\n".join(logged.output)
        for word in ("secret", "client", "token", "private", "127.0.0.1", "good.test"):
            self.assertNotIn(word, text)
        self.assertIn("did not resolve", text)
        self.assertIn("not on the public internet", text)
        self.assertIn("port", text)

    def test_an_unexpected_error_is_logged_by_its_class_alone(self):
        self.serve("/", ok(page(title="T")))
        with self.assertLogs("board.lookup", "WARNING") as logged, mock.patch.object(lookup, "_read_head", side_effect=KeyError("http://secret.test/")):
            self.get()
        self.assertNotIn("secret", "\n".join(logged.output))
        self.assertIn("KeyError", "\n".join(logged.output))

    def test_a_failed_preview_is_logged_apart_from_the_page(self):
        self.serve("/", ok(page('<link rel="icon" href="/bad">', title="T")))
        self.serve("/bad", ok(b"not an image"))
        with self.assertLogs("board.lookup", "WARNING") as logged:
            self.get()
        self.assertIn("preview", logged.output[0])

    def test_a_refusal_by_status_is_logged_with_the_status_and_a_missing_icon_is_not_logged(self):
        self.serve("/", ok(page('<link rel="icon" href="/busy">', title="T")))
        self.serve("/busy", {"status": 429, "headers": {}, "body": b""})
        with self.assertLogs("board.lookup", "WARNING") as logged:
            self.get()
        self.assertEqual(len(logged.output), 1)  # /favicon.ico was missing (404) and said nothing
        self.assertIn("answer other than 200 (429)", logged.output[0])
        self.assertNotIn("busy", logged.output[0])

    def test_a_good_lookup_logs_nothing(self):
        self.serve("/", ok(page(title="T")))
        with self.assertNoLogs("board.lookup", "WARNING"):
            self.get()


if __name__ == "__main__":
    unittest.main()
