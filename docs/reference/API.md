# The local API

> What the page, and later the browser extension, call. The code is `board/server.py` (routes, checks) and `board/items.py` (what each route does); this page is for a client's author. Errors are always `{"error": "<plain text>"}`, with no path in them.

The server listens on `127.0.0.1` only. A request's `Host` must be `127.0.0.1:<port>` or `localhost:<port>`; a request that changes anything (POST, DELETE) must carry an `Origin` of the same address, and a request with any other `Origin` is refused with 403. No CORS header is ever sent. A body is JSON with `Content-Type: application/json` and a `Content-Length`; the limit is about 34 MB (a 25 MB image in base64).

| Request | Answer |
|---|---|
| `GET /api/brands` | `{"brands": ["slug", ...]}`, alphabetical |
| `GET /api/brands/<slug>` | `{slug, status, client, summary, hub_problem, panels: [{title, text, problem}], moodboard: {exists, problem, items: [...]}}`; items newest first; text is plain, never escaped |
| `GET /api/brands/<slug>/images/<id>.<ext>` and `.../thumbs/<id>.<ext>` | the image bytes, with their own `Content-Type`; cacheable for a year (an id never changes), every other answer is `no-store` |
| `POST /api/brands/<slug>/items` with `{description, source, image}` | 201 and the new item; all three fields optional but at least one must be there; `image` is base64 or null |
| `DELETE /api/brands/<slug>/items/<key>` | `{"deleted": "<key>"}`; the key is the item's `key` from the brand view |

An item is `{key, text, description, source, image, thumb}`: `image` and `thumb` are addresses, or null for an item with no image (or whose embed was written by hand, which the app never serves). `<slug>` is the folder name under `Brands/`, quoted in the address.

Statuses: 400 a body that cannot be read; 403 a refused origin or host, or a folder the app will not write in; 404 no such brand, image or route; 409 the brand has no Moodboard note (the app creates none), the item changed or is duplicated since it was shown, or the note changed while it was being written (nothing was written; try again); 408 the client stopped sending (30 seconds); 411 no length; 413 too big; 415 not JSON; 422 an image, address or description that cannot be taken; 500 something went wrong, or a deleted item's block was removed but its image files could not be.
