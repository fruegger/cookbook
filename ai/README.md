# Dinner für zwei — wie du weitermachst

Ein zweisprachig (mehrsprachig) angelegtes, druckfähiges digitales Dinner für zwei.
Eine HTML-Datei pro Rezept dient gleichzeitig als digitale Seite **und** als
druckbare Einzelseite (Cmd/Ctrl-P → "Als PDF speichern").

## Projektstruktur

```
cookbook/
├── index.html                   ← Widmungsseite (Eingang ins Buch)
├── recipes.html                 ← Übersichtsseite mit Kategorienfilter
├── css/cookbook.css             ← Eine zentrale Stilvorlage (Bildschirm + Druck)
├── js/cookbook.js               ← Render-Engine
├── data/
│   ├── dedication.json          ← Inhalt der Widmungsseite (auswechselbar)
│   ├── recipes.json             ← Register aller Rezepte (für Index)
│   └── recipe-001.json          ← Ein JSON pro Rezept (Inhalt)
├── recipes/
│   └── recipe-001.html          ← Eine schlanke HTML-Hülle pro Rezept
├── ingredients/
│   └── tonkabohne.html          ← Eine HTML-Seite pro Zutat
└── assets/photos/recipe-001/
    ├── basket.jpeg              ← Korbfoto (alle Zutaten)
    └── finished.jpeg            ← Hero-Foto des fertigen Gerichts
```

## Widmungsseite ändern

Der Inhalt der Widmungsseite liegt in `data/dedication.json`. Du kannst
Titel, Untertitel, Anrede, Brief-/Widmungstext und Unterschrift frei
bearbeiten — die HTML-Struktur muss nicht angefasst werden.

```json
{
  "title":      { "de": "Dinner für zwei", … },
  "tagline":    { "de": "Rezepte, gesammelt …", … },
  "salutation": { "de": "Liebe Steffi, Lieber Martin", … },
  "body":       { "de": ["Erster Absatz.", "Zweiter Absatz."], … },
  "signoff":    { "de": "— Dein Koch", … }
}
```

Leere Felder werden automatisch weggelassen.

## Lokale Vorschau

Wegen `fetch()` muss ein lokaler Webserver laufen. Im Ordner `cookbook/`:

```bash
python3 -m http.server 8000
```

Dann im Browser: `http://localhost:8000/`

## Ein neues Rezept hinzufügen

1. **Fotos** in `assets/photos/recipe-NNN/` ablegen
   (mindestens `basket.jpeg` und `finished.jpeg`).
2. **Datendatei** `data/recipe-NNN.json` erstellen — am einfachsten
   `recipe-001.json` kopieren und Inhalte ersetzen.
3. **Rezept-HTML** `recipes/recipe-NNN.html` erstellen — Kopie von
   `recipe-001.html`, nur die letzte Zeile anpassen:
   ```html
   <script>bootRecipe('../data/recipe-NNN.json');</script>
   ```
4. **Eintrag im Register** `data/recipes.json` ergänzen.

## Sprachen

Jedes Textfeld in `recipe-NNN.json` hat ein Objekt `{de, en, fr, it}`.
Leere Sprachen (z. B. `"en": ""`) werden im Sprachschalter automatisch
ausgegraut. Du brauchst zum Start nur Deutsch zu füllen.

## Verbinder vom Korbfoto zur Zutatenliste (SVG-Linien)

Im Datenfeld `basket.connectors` (oder `baskets[i].connectors`) setzt du pro
Zutaten-ID einen Punkt im Korbfoto (in Prozent der Bildbreite/-höhe):

```json
"connectors": {
"schokolade": { "x": 28, "y": 35 },
"rosmarin":   { "x": 60, "y": 50 }
}
```

Die `id` (z. B. `"schokolade"`) muss mit der `id` im Zutaten-Item
übereinstimmen.

> **TODO für Rezept #1:** Korbfoto neu fotografieren mit Sahnekännchen
> statt rotem Karton, plus Butter und Milch ergänzen — danach die
> Verbinder-Koordinaten eintragen.

## Heldenfoto: Bildausschnitt steuern

Das Hero-Foto (`finished.image`) wird sowohl auf dem Bildschirm (4:3) als
auch im Druck (16:9) auf eine feste Form zugeschnitten. Damit wichtige
Bildteile nicht abgeschnitten werden, kann pro Rezept ein Fokuspunkt
gesetzt werden:

```json
"finished": {
  "image": "../assets/photos/recipe-NNN/finished.jpeg",
  "focal": "center 35%",
  "alt": { … }
}
```

`focal` akzeptiert jeden gültigen `object-position`-Wert, z. B.
`"center top"`, `"30% center"`, `"center 60%"`. Ohne Angabe zentriert
das Bild (`center center`). Faustregel: zuerst horizontal (links/rechts),
dann vertikal (oben/unten) — kleinere Prozentwerte = weiter links bzw.
weiter oben.

## Mehrere Körbe pro Rezept

Manche Rezepte (z. B. eine Suppe mit eigenem Brot) brauchen zwei oder mehr
Körbe. Statt `"basket": { … }` verwendest du dann:

```json
"baskets": [
  { "id": "savoury", "title": { "de": "Suppe & Butter", … }, "image": "…", … },
  { "id": "bread",   "title": { "de": "Toastbrot",      … }, "image": "…", … }
]
```

Jede Zutaten-Gruppe in `ingredients.groups` bekommt dann ein
`"basket": "savoury"` bzw. `"basket": "bread"`, das den Korb identifiziert.
Auf der Seite wird jedes Korbfoto mit den passenden Zutaten daneben
gerendert.

## Drucken

Im Browser auf einer Rezeptseite Cmd/Ctrl-P. Das Druck-Stylesheet
versteckt Navigation, packt den Inhalt auf eine A4-Seite und ersetzt
Schritt-Fotos durch reinen Text (für eine echte Einseiten-Wirkung).
Ziel "Als PDF speichern" wählen.

## Zutaten-Detailseiten

Aus der Zutatenliste sind die Namen (wenn `ref` gesetzt ist) bereits
auf `ingredients/<ref>.html` verlinkt. Diese Seiten erstellst du nach
und nach — `ingredients/tonkabohne.html` dient als Vorlage.

## Nächste Schritte / Ausbau

- Schritt-Fotos: pro Schritt-Eintrag in der JSON-Datei den `photo`-Pfad
  setzen (z. B. `assets/photos/recipe-001/step-m1.jpeg`).
- Videos: Engine kann später erweitert werden, das Schema um ein
  `video`-Feld zu ergänzen — der Druck zeigt automatisch nur das Foto.
- Englisch / Französisch / Italienisch: einfach die leeren `""` Felder
  in den JSON-Dateien füllen.