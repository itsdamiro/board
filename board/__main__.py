"""Start the board: `python -m board --vault <folder> [--port N]`. The vault may also come from BOARD_VAULT."""

import sys

if sys.version_info < (3, 11):  # before any import that may need a newer Python (ADR 001, amendment on Python 3.11)
    sys.exit(f"board needs Python 3.11 or newer; this is {sys.version_info.major}.{sys.version_info.minor}")

import argparse
import os

from board.server import BoardServer
from board.vault import VaultError, find_vault

DEFAULT_PORT = 8765


def main() -> int:
    parser = argparse.ArgumentParser(prog="board", description="A local board for a brand's notes and images.")
    parser.add_argument("--vault", help="the vault's folder (or set BOARD_VAULT)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port on 127.0.0.1 (default {DEFAULT_PORT})")
    args = parser.parse_args()
    try:
        vault_path = find_vault(args.vault, os.environ)
    except VaultError as err:
        print(f"board: {err}", file=sys.stderr)
        return 2
    try:
        server = BoardServer(vault_path, args.port)
    except (OSError, OverflowError) as err:
        print(f"board: cannot listen on 127.0.0.1:{args.port} ({getattr(err, 'strerror', None) or 'not a usable port'})", file=sys.stderr)
        return 2
    if not os.path.isfile(os.path.join(server.web_dir, "index.html")):
        print("board: the page is not built yet (run `npm run build` in the web folder); the API works without it", file=sys.stderr)
    with server:
        print(f"board is listening on http://127.0.0.1:{server.server_address[1]}  (Ctrl+C to stop)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
