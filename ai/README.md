# Dinner für zwei

Ein zweisprachig (mehrsprachig) angelegtes, druckfähiges digitales Kochbuch.
Eine Render-Engine, eine HTML-Hülle pro Seitentyp — der Inhalt liegt komplett
in JSON-Dateien.

## Was hat sich geändert (Refactor)

Die Architektur ist von **„eine HTML-Datei pro Rezept"** auf **„eine HTML-Datei
pro Seitentyp"** umgestellt:

| Alt                                  | Neu                                   |
| ------------------------------------ | ------------------------------------- |
| `recipes/recipe-001.html` (× N)      | `recipe.html?id=recipe-001`           |
| `ingredients/tonkabohne.html` (× N)  | `ingredient.html?id=tonkabohne`       |
| Zutaten als HTML-Stubs               | `data/ingredients/<slug>.json`        |
| (kein Editor)                        | `editor.html` mit Live-Vorschau       |
| (kein Backend)                       | `server.py` (optional)                |

Vorteile: ein neues Rezept = eine JSON-Datei, sonst nichts. Eine neue Zutat =
ein Eintrag im Editor. Kein Copy-Paste von HTML mehr.

## Projektstruktur

```
cookbook/
├── index.html                   ← Widmungsseite
├── recipes.html                 ← Rezeptübersicht (mit Kategoriefilter)
├── ingredients.html             ← Zutatenübersicht
├── recipe.html                  ← EINE Rezeptseite (liest ?id=… aus URL)
├── ingredient.html              ← EINE Zutatenseite (liest ?id=… aus URL)
├── editor.html                  ← Editor mit Live-Vorschau
│
├── css/cookbook.css             ← Stilvorlage (Bildschirm + Druck)
├── css/editor.css               ← Editor-spezifische Stile
├── js/cookbook.js               ← Render-Engine (Rezept + Zutat)
├── js/editor.js                 ← Editor (Form + Vorschau + Save)
│
├── data/
│   ├── dedication.json          ← Inhalt der Widmungsseite
│   ├── recipes.json             ← Index aller Rezepte (auto-generiert)
│   ├── ingredients.json         ← Index aller Zutaten (auto-generiert)
│   ├── recipe-001.json          ← Ein JSON pro Rezept
│   ├── recipe-002.json
│   ├── recipe-003.json
│   └── ingredients/
│       ├── tonkabohne.json      ← Ein JSON pro Zutat
│       └── …
│
├── assets/photos/recipe-001/    ← Fotos pro Rezept
│   ├── basket.jpeg
│   └── finished.jpeg
│
├── server.py                    ← Optionales Backend (siehe unten)
└── scripts/
    └── scaffold_ingredients.py  ← Einmaliges Erzeugen leerer Zutaten-JSONs
```

## Lokale Vorschau

**Mit Backend (empfohlen, ermöglicht Speichern aus dem Editor):**

```bash
cd cookbook
python3 server.py
```

→ http://localhost:8000/

**Ohne Backend (nur Lesen, Editor speichert per JSON-Download):**

```bash
cd cookbook
python3 -m http.server 8000
```

Beide Varianten funktionieren — der Editor erkennt automatisch, ob das Backend
verfügbar ist, und fällt sonst auf "Download" zurück.

## Ein neues Rezept hinzufügen

Drei Wege, je nach Vorliebe:

**a) Über den Editor (empfohlen, läuft mit oder ohne Backend):**

1. http://localhost:8000/editor.html öffnen
2. Modus „Rezept", Picker auf „— neu —"
3. Felder ausfüllen, Live-Vorschau rechts beobachten
4. „Speichern" klickt → mit Backend: schreibt direkt nach `data/`.
   Ohne Backend: Download-Dialog, Datei manuell nach `data/` verschieben.

**b) JSON-Datei direkt anlegen:**

1. Fotos in `assets/photos/recipe-NNN/` ablegen
2. `data/recipe-NNN.json` erstellen (am einfachsten: Kopie von
   `data/recipe-001.json`, Inhalte ersetzen)
3. Mit Backend: `data/recipes.json` wird beim nächsten Start automatisch
   neu generiert. Ohne Backend: per Hand ergänzen.

**c) Aus einem bestehenden Rezept abzweigen:**

`editor.html?type=recipe&id=recipe-001` → öffnet das Rezept im Editor,
ID ändern, „Speichern" → neues Rezept.

## Eine neue Zutat hinzufügen

Genauso, nur Modus „Zutat". URL z. B.
`editor.html?type=ingredient&id=tonkabohne` zum Editieren einer bestehenden.

Falls neue Zutaten-Refs in einem Rezept auftauchen, läuft einmal:

```bash
python3 scripts/scaffold_ingredients.py
```

Das erzeugt leere Zutaten-JSONs, damit `ingredient.html?id=…` für jeden Ref
auflösbar wird.

## Sprachen

Jedes Textfeld hat ein Objekt `{de, en, fr, it}`. Leere Sprachen werden im
Sprachschalter ausgegraut. Du brauchst zum Start nur Deutsch zu füllen.

Der Editor zeigt immer nur die aktive Sprache an — über die Sprach-Tabs links
wechseln, um Übersetzungen einzugeben.

## Verbinder vom Korbfoto zur Zutatenliste (SVG-Linien)

Wie zuvor: in `basket.connectors` (oder `baskets[i].connectors`) pro Zutaten-ID
ein {x, y} in Prozent setzen. Die `id` muss mit der `id` im Zutaten-Item
übereinstimmen.

```json
"connectors": {
"schokolade": { "x": 28, "y": 35 },
"rosmarin":   { "x": 60, "y": 50 }
}
```

## Drucken

Auf einer Rezept- oder Zutatenseite Cmd/Ctrl-P. Das Druck-Stylesheet
versteckt Navigation und packt den Inhalt auf eine A4-Seite.

## Eine leere Seite in ein Buch einfügen

In gedruckten, gebundenen Büchern bilden Seiten Doppelseiten:
(links, rechts) = (gerade, ungerade). Ein Rezept lässt sich nur dann als
Doppelseite am Stück lesen, wenn es auf einer linken (geraden) Seite
beginnt. Läuft ein Rezept z. B. auf 3 Seiten statt der üblichen 1–2,
kann eine Leerseite davor eingefügt werden, damit das nächste Rezept
wieder links beginnt.

Dazu in `book.json` in `recipeIds` einfach den String `"blankPage"` an
der gewünschten Stelle einfügen:

```json
"recipeIds": ["recipe-001", "blankPage", "recipe-002"]
```

Das fügt eine komplett leere Seite ein — sowohl im Bildschirm-Pager
(book.html) als auch im zusammenhängenden Druck. Es gibt aktuell keine
automatische Erkennung, wie viele Seiten ein Rezept braucht oder ob es
links/rechts beginnt — das Einfügen ist bewusst manuell, einfach im
Druck-Vorschau prüfen und bei Bedarf `"blankPage"` ergänzen.

`"blankPage"` ist als eigener String-Eintrag (statt z. B. eines Feldes
am Rezept) bewusst so gehalten, dass an derselben Stelle im Array
später auch andere Seitentypen stehen könnten (ein ganzseitiges Bild,
eine Textseite) — siehe `SPECIAL_PAGE_IDS` in `cookbook.js`.

## Backend (server.py)

Ein winziger lokaler Server (~80 Zeilen Python, keine Abhängigkeiten):

- Statisch-Hosting wie `python3 -m http.server`
- Plus eine kleine JSON-API:
    - `GET  /api/recipes/<id>` → liest `data/<id>.json`
    - `PUT  /api/recipes/<id>` → schreibt `data/<id>.json`
    - `GET  /api/ingredients/<id>` → liest `data/ingredients/<id>.json`
    - `PUT  /api/ingredients/<id>` → schreibt `data/ingredients/<id>.json`
- Bei jedem PUT werden `recipes.json` und `ingredients.json` automatisch neu
  gebaut, plus `usedIn`-Backlinks auf Zutaten.

Nur an `127.0.0.1` gebunden, keine Authentifizierung — bewusst. Für lokale
Editierarbeit gedacht; die generierten JSON-Dateien können danach genauso wie
zuvor versioniert/verschickt/auf statisches Hosting gelegt werden.