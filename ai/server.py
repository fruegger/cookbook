"""Tiny localhost backend for the cookbook editor.

Run from the cookbook/ directory:

    python3 server.py

Then open http://localhost:8000/

What this does:
  - Serves the static site (index.html, recipe.html, css/, js/, assets/).
  - Provides a tiny JSON API the editor uses to save:
      GET  /api/recipes/<id>         → returns data/<id>.json
      PUT  /api/recipes/<id>         → writes data/<id>.json (and rebuilds index)
      GET  /api/ingredients/<id>     → returns data/ingredients/<id>.json
      PUT  /api/ingredients/<id>     → writes data/ingredients/<id>.json
      GET  /api/dedications/<id>     → returns data/<id>.json
      PUT  /api/dedications/<id>     → writes data/<id>.json (and rebuilds index)
      GET  /api/books/<id>           → returns data/<id>.json
      PUT  /api/books/<id>           → writes data/<id>.json (and rebuilds index)
  - On any PUT, regenerates data/recipes.json, data/ingredients.json,
    data/dedications.json, and data/books.json so the indexes stay in sync.

What this is NOT:
  - Not for production. No auth. Bind to localhost only.
  - No database. Files in data/ remain the source of truth — diff-friendly
    and trivial to back up via git.
"""

import json
import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
ING_DIR = os.path.join(DATA_DIR, "ingredients")

# Slug must look like a slug — guards against path traversal.
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# recipes/dedications/books all live directly in DATA_DIR, distinguished
# by filename prefix. Requiring the slug to match its kind's prefix stops
# an accidental id collision (e.g. saving a book as "recipe-001") from
# silently overwriting an unrelated file.
KIND_PREFIX = {
    "recipes": "recipe-",
    "dedications": "dedication-",
    "books": "book-",
}


def is_valid_slug(s):
    return bool(s) and bool(SLUG_RE.match(s)) and ".." not in s


def slug_matches_kind(kind, slug):
    prefix = KIND_PREFIX.get(kind)
    return prefix is None or slug.startswith(prefix)


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def rebuild_recipes_index():
    """Regenerate data/recipes.json from every data/recipe-*.json."""
    recipes = []
    for fn in sorted(os.listdir(DATA_DIR)):
        if not (fn.startswith("recipe-") and fn.endswith(".json")):
            continue
        try:
            r = read_json(os.path.join(DATA_DIR, fn))
        except Exception:
            continue
        recipes.append({
            "id": r.get("id", fn[:-5]),
            "category": r.get("category", "main"),
            "title": r.get("title", {"de": "", "en": "", "fr": "", "it": ""}),
            "thumb": (r.get("finished") or {}).get("image", ""),
            "href": f"recipe.html?id={r.get('id', fn[:-5])}"
        })
    write_json(os.path.join(DATA_DIR, "recipes.json"), {"recipes": recipes})


def rebuild_dedications_index():
    """Regenerate data/dedications.json from every data/dedication-*.json."""
    dedications = []
    for fn in sorted(os.listdir(DATA_DIR)):
        if not (fn.startswith("dedication-") and fn.endswith(".json")):
            continue
        try:
            d = read_json(os.path.join(DATA_DIR, fn))
        except Exception:
            continue
        dedications.append({
            "id": d.get("id", fn[:-5]),
            "title": d.get("title", {"de": "", "en": "", "fr": "", "it": ""}),
            "thumb": d.get("image", "")
        })
    write_json(os.path.join(DATA_DIR, "dedications.json"), {"dedications": dedications})


def rebuild_books_index():
    """Regenerate data/books.json from every data/book-*.json."""
    books = []
    for fn in sorted(os.listdir(DATA_DIR)):
        if not (fn.startswith("book-") and fn.endswith(".json")):
            continue
        try:
            b = read_json(os.path.join(DATA_DIR, fn))
        except Exception:
            continue
        books.append({
            "id": b.get("id", fn[:-5]),
            "title": b.get("title", {"de": "", "en": "", "fr": "", "it": ""}),
            "dedicationId": b.get("dedicationId", ""),
            "recipeCount": len(b.get("recipeIds") or []),
            "href": f"book.html?id={b.get('id', fn[:-5])}"
        })
    write_json(os.path.join(DATA_DIR, "books.json"), {"books": books})


def rebuild_ingredients_index():
    """Regenerate data/ingredients.json from every data/ingredients/*.json,
    including back-references (which recipes use each ingredient)."""
    if not os.path.isdir(ING_DIR):
        return

    # First pass: which recipes use which ingredient ref?
    used_in = {}
    for fn in os.listdir(DATA_DIR):
        if not (fn.startswith("recipe-") and fn.endswith(".json")):
            continue
        try:
            r = read_json(os.path.join(DATA_DIR, fn))
        except Exception:
            continue
        rid = r.get("id", fn[:-5])
        seen = set()
        for g in (r.get("ingredients") or {}).get("groups", []):
            for it in g.get("items", []):
                if it.get("ref"):
                    seen.add(it["ref"])
        for ref in seen:
            used_in.setdefault(ref, []).append(rid)

    ingredients = []
    for fn in sorted(os.listdir(ING_DIR)):
        if not fn.endswith(".json"):
            continue
        try:
            ing = read_json(os.path.join(ING_DIR, fn))
        except Exception:
            continue
        slug = ing.get("id", fn[:-5])
        # Refresh usedIn on the ingredient JSON itself too, so it's not stale.
        ing["usedIn"] = sorted(used_in.get(slug, []))
        write_json(os.path.join(ING_DIR, fn), ing)

        ingredients.append({
            "id": slug,
            "name": ing.get("name", {"de": "", "en": "", "fr": "", "it": ""}),
            "href": f"ingredient.html?id={slug}",
            "usedIn": sorted(used_in.get(slug, []))
        })
    write_json(os.path.join(DATA_DIR, "ingredients.json"),
               {"ingredients": ingredients})


class Handler(SimpleHTTPRequestHandler):
    """Static file server with a small JSON API bolted on."""

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    # Quiet down the default access log a bit.
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ----- API routing -----

    def _api_match(self):
        """Return (kind, slug) if the path is
        /api/(recipes|ingredients|dedications|books)/<slug>."""
        m = re.match(r"^/api/(recipes|ingredients|dedications|books)/([^/]+)$",
                     urlparse(self.path).path)
        if not m:
            return None
        kind, slug = m.group(1), m.group(2)
        return kind, slug

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, msg):
        self._send_json(status, {"error": msg})

    def do_GET(self):
        api = self._api_match()
        if api:
            kind, slug = api
            if not is_valid_slug(slug):
                return self._send_error_json(400, "invalid slug")
            if kind in KIND_PREFIX and not slug_matches_kind(kind, slug):
                return self._send_error_json(400, f"{kind} id should start with '{KIND_PREFIX[kind]}'")
            path = (os.path.join(ING_DIR, f"{slug}.json") if kind == "ingredients"
                    else os.path.join(DATA_DIR, f"{slug}.json"))
            if not os.path.isfile(path):
                return self._send_error_json(404, "not found")
            return self._send_json(200, read_json(path))
        return super().do_GET()

    def do_PUT(self):
        api = self._api_match()
        if not api:
            return self._send_error_json(405, "PUT only allowed on /api/...")
        kind, slug = api
        if not is_valid_slug(slug):
            return self._send_error_json(400, "invalid slug")
        if kind in KIND_PREFIX and not slug_matches_kind(kind, slug):
            return self._send_error_json(400, f"{kind} id should start with '{KIND_PREFIX[kind]}'")
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = self.rfile.read(length)
            obj = json.loads(body.decode("utf-8"))
        except Exception as e:
            return self._send_error_json(400, f"invalid JSON: {e}")

        # Sanity: the body's id should match the URL slug; if not, prefer URL.
        obj["id"] = slug

        path = (os.path.join(ING_DIR, f"{slug}.json") if kind == "ingredients"
                else os.path.join(DATA_DIR, f"{slug}.json"))

        write_json(path, obj)
        rebuild_recipes_index()
        rebuild_ingredients_index()
        rebuild_dedications_index()
        rebuild_books_index()
        return self._send_json(200, {"ok": True, "id": slug})


def main():
    port = int(os.environ.get("PORT", "8000"))
    # Rebuild registries once at startup so they're consistent with disk.
    try:
        rebuild_recipes_index()
        rebuild_ingredients_index()
        rebuild_dedications_index()
        rebuild_books_index()
    except Exception as e:
        print(f"Warning: could not rebuild registries: {e}", file=sys.stderr)

    httpd = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving cookbook on http://localhost:{port}/")
    print(f"  Editor:    http://localhost:{port}/editor.html")
    print(f"  Recipes:   http://localhost:{port}/recipes.html")
    print(f"  Books:     http://localhost:{port}/books.html")
    print(f"  Press Ctrl-C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
