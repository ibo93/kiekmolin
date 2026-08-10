# Tailwind — fertig gebaut statt im Browser

## Warum

Im `<head>` von `index.html` stand:

```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
```

Das ist der **Spiel-CDN** von Tailwind: rund 400 KB JavaScript, das die
Stylesheets erst im Browser zusammensetzt — bei jedem Aufruf, bei jedem Gast,
und blockierend im `<head>`. Solange es läuft, sieht der Gast nichts. Tailwind
schreibt selbst in seine Doku, dass das nichts im echten Betrieb zu suchen hat.

Nachgezählt: die ganze App benutzt **zehn** Tailwind-Klassen — `lg:grid-cols-12`,
ein paar `lg:col-span-*`, `hidden`, `block`, `grid`. Dafür lief ein Compiler mit.

Heute steht an derselben Stelle ein festes `<style>`: **17 KB statt 400 KB.**

## Wichtig

Das CSS enthält nicht nur die zehn Klassen, sondern auch

- **Preflight** — Tailwinds Grundformatierung (Überschriften, Listen, Links,
  Knöpfe, Bilder). Die App baut darauf auf.
- das **forms**-Plugin, das alle Eingabefelder vereinheitlicht.

Beides einfach wegzulassen würde das Aussehen an vielen Stellen verschieben.
Deshalb wird hier mit **derselben Tailwind-Version und derselben Konfiguration**
gebaut, die vorher im `<head>` stand.

Nachgemessen: 22 Auswahlen (Überschriften, Links, Knöpfe, Eingabefelder, Listen,
Bilder, die Raster-Klassen) — in echtem Chromium verglichen, **0 Unterschiede**.

## Neu bauen

Nötig, sobald jemand eine **neue** Tailwind-Klasse ins Markup schreibt.
Sonst nicht.

```bash
cd tailwind
npm install tailwindcss@3 @tailwindcss/forms @tailwindcss/container-queries
npx tailwindcss -c tailwind.config.js -i in.css -o out.css --minify
```

Dann den Inhalt von `out.css` in `index.html` in das `<style>` direkt unter dem
Kommentar „Tailwind: FERTIG GEBAUT" einsetzen.

`out.css` selbst gehört **nicht** ins Repo — die Wahrheit steht in `index.html`.
