"""One-shot scaffolder: create empty ingredient JSONs for every ref used in
recipes, so that ingredient.html?id=xxx always resolves to *something*. Run
once; the editor handles further content."""

import json
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)  # cookbook/
DATA_DIR = os.path.join(ROOT, "data")
ING_DIR = os.path.join(DATA_DIR, "ingredients")

# Slug -> human-readable German name (best-effort defaults; user can edit).
NAMES_DE = {
    "beeren-mix": "Beerenmischung",
    "blumenkohl": "Blumenkohl",
    "butter": "Butter",
    "cognac": "Cognac",
    "creme-fraiche": "Crème fraîche",
    "dunkle-schokolade": "Dunkle Schokolade",
    "ei": "Ei",
    "estragon": "Estragon",
    "filoteig": "Filoteig",
    "kartoffeln": "Kartoffeln",
    "kraeuter": "Kräuter",
    "kressi": "Kresse",
    "mehl": "Mehl",
    "milch": "Milch",
    "miso": "Miso",
    "olivenoel": "Olivenöl",
    "panko": "Panko",
    "rosmarin": "Rosmarin",
    "rote-bete": "Rote Bete (Randen)",
    "salz": "Salz",
    "schalotte": "Schalotte",
    "shiitake": "Shiitake",
    "thymian": "Thymian",
    "tonburi": "Tonburi",
    "tonkabohne": "Tonkabohne",
    "trockenhefe": "Trockenhefe",
    "vollrahm": "Vollrahm",
    "weisswein": "Weisswein",
    "zaatar": "Za'atar",
    "zucker": "Zucker",
}


def collect_refs():
    """Walk every recipe-*.json and return the set of ingredient refs."""
    refs = set()
    for fn in os.listdir(DATA_DIR):
        if not (fn.startswith("recipe-") and fn.endswith(".json")):
            continue
        with open(os.path.join(DATA_DIR, fn), encoding="utf-8") as f:
            recipe = json.load(f)
        for group in recipe.get("ingredients", {}).get("groups", []):
            for item in group.get("items", []):
                if item.get("ref"):
                    refs.add(item["ref"])
    return refs


def collect_used_in():
    """For each ref, list which recipe-NNN.json files reference it."""
    used = {}
    for fn in os.listdir(DATA_DIR):
        if not (fn.startswith("recipe-") and fn.endswith(".json")):
            continue
        rid = fn[:-5]  # drop .json
        with open(os.path.join(DATA_DIR, fn), encoding="utf-8") as f:
            recipe = json.load(f)
        seen = set()
        for group in recipe.get("ingredients", {}).get("groups", []):
            for item in group.get("items", []):
                if item.get("ref"):
                    seen.add(item["ref"])
        for ref in seen:
            used.setdefault(ref, []).append(rid)
    return used


def empty_ingredient(slug, used_in):
    return {
        "id": slug,
        "name": {
            "de": NAMES_DE.get(slug, slug.replace("-", " ").title()),
            "en": "",
            "fr": "",
            "it": ""
        },
        "latin": "",
        "image": "",
        "image_alt": {"de": "", "en": "", "fr": "", "it": ""},
        "description": {"de": "", "en": "", "fr": "", "it": ""},
        "nutrition": {"energy": "", "carbs": "", "fat": "", "protein": "", "_per": "100 g"},
        "origin": {"de": "", "en": "", "fr": "", "it": ""},
        "seasonality": {"de": "", "en": "", "fr": "", "it": ""},
        "tips": {"de": "", "en": "", "fr": "", "it": ""},
        "usedIn": sorted(used_in)
    }


def main():
    os.makedirs(ING_DIR, exist_ok=True)
    refs = collect_refs()
    used_in = collect_used_in()

    created = []
    skipped = []
    for slug in sorted(refs):
        path = os.path.join(ING_DIR, f"{slug}.json")
        if os.path.exists(path):
            # Update only the usedIn field — leave the rest of the
            # already-populated ingredient JSON alone.
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
            obj["usedIn"] = sorted(used_in.get(slug, []))
            with open(path, "w", encoding="utf-8") as f:
                json.dump(obj, f, ensure_ascii=False, indent=2)
                f.write("\n")
            skipped.append(slug)
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump(empty_ingredient(slug, used_in.get(slug, [])), f,
                     ensure_ascii=False, indent=2)
            f.write("\n")
        created.append(slug)

    # Also produce data/ingredients.json — the registry analogous to recipes.json.
    registry = {
        "ingredients": [
            {
                "id": slug,
                "name": {
                    "de": NAMES_DE.get(slug, slug.replace("-", " ").title()),
                    "en": "",
                    "fr": "",
                    "it": ""
                },
                "href": f"ingredient.html?id={slug}",
                "usedIn": sorted(used_in.get(slug, []))
            }
            for slug in sorted(refs)
        ]
    }
    # If a tonkabohne.json (or other) already has populated names, mirror those
    # into the registry for accuracy.
    for entry in registry["ingredients"]:
        path = os.path.join(ING_DIR, f"{entry['id']}.json")
        try:
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
            for lang in ("de", "en", "fr", "it"):
                if obj.get("name", {}).get(lang):
                    entry["name"][lang] = obj["name"][lang]
        except Exception:
            pass
    with open(os.path.join(DATA_DIR, "ingredients.json"), "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Created {len(created)} new ingredient files, updated {len(skipped)} existing.")
    print(f"Wrote registry: data/ingredients.json ({len(registry['ingredients'])} entries)")


if __name__ == "__main__":
    main()
