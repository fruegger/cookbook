#!/usr/bin/env python3
"""One-off migration: splits the old single data/dedication.json into the
new multi-dedication layout (data/dedications.json registry +
data/dedication-001.json), and adds the new `image`/`imageAlt` fields
(left empty — fill in a photo path yourself) so the schema matches what
cookbook.js now expects.

Run once from the cookbook/ directory:

    python3 migrate_dedication.py

Safe to re-run: it won't overwrite data/dedication-001.json if it already
exists, and it leaves the old data/dedication.json untouched (in case
index.html or anything else still points at it — check before deleting).
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
OLD_PATH = os.path.join(DATA_DIR, "dedication.json")
NEW_PATH = os.path.join(DATA_DIR, "dedication-001.json")
REGISTRY_PATH = os.path.join(DATA_DIR, "dedications.json")


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    if not os.path.isfile(OLD_PATH):
        print(f"No {OLD_PATH} found — nothing to migrate.", file=sys.stderr)
        return 1

    if os.path.isfile(NEW_PATH):
        print(f"{NEW_PATH} already exists — not overwriting. Delete it first "
              f"if you want to re-run this migration.", file=sys.stderr)
        return 1

    old = read_json(OLD_PATH)
    empty_i18n = {"de": "", "en": "", "fr": "", "it": ""}

    new_dedication = {
        "id": "dedication-001",
        "title": old.get("title", empty_i18n),
        "salutation": old.get("salutation", empty_i18n),
        "image": "",           # fill in, e.g. "assets/photos/dedication-001/cover.jpeg"
        "imageAlt": empty_i18n,
        "body": old.get("body", {"de": [], "en": [], "fr": [], "it": []}),
        "signoff": old.get("signoff", empty_i18n)
    }
    write_json(NEW_PATH, new_dedication)
    print(f"Wrote {NEW_PATH}")

    registry = {"dedications": [{
        "id": "dedication-001",
        "title": new_dedication["title"],
        "thumb": ""
    }]}
    write_json(REGISTRY_PATH, registry)
    print(f"Wrote {REGISTRY_PATH}")

    print("\nDone. Notes:")
    print(f"  - {OLD_PATH} was left untouched (index.html still reads it directly).")
    print(f"  - Add a photo path to {NEW_PATH}'s \"image\" field (or via the")
    print(f"    editor's 'Zueignung' tab) so the book's dedication has its own photo page.")
    print(f"  - Run the server once (python3 server.py) to also pick this up")
    print(f"    if you add more dedications later via the editor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
