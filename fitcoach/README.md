# FitCoach – Fitness- & Ernährungs-PWA

Persönlicher Coach für **Abnehmen und Muskelaufbau**: Kalorien tracken, Gerichte
per **KI-Foto-Scan** (Claude Vision) erfassen, Fortschritt sichtbar machen.

- **Frontend:** Vanilla JS, mobile-first, dunkles OLED-Design (Space Grotesk Display-Font), PWA (installierbar, offline-fähiger Tracker)
- **Daten:** komplett lokal auf dem Gerät (localStorage) – keine Anmeldung, keine Datenbank-Einrichtung, offline-fähig
- **Hosting:** Netlify (statische Site + Netlify Function für den Claude-API-Call)
- **KI:** Claude API (`claude-sonnet-4-6`) mit Vision + strukturiertem JSON-Output, ElevenLabs TTS mit lokalem Audio-Cache

---

## Features

| Bereich | Funktionen |
|---|---|
| **Onboarding** | Alter, Größe, Gewicht, Geschlecht, Aktivitätslevel · Ziel (Abnehmen / Muskelaufbau / Rekomposition) · Mifflin-St-Jeor-Grundumsatz, TDEE, Kalorienziel + Makros · Zielgewicht mit realistischem Zeitfenster |
| **KI-Foto-Scan** | Foto aufnehmen/hochladen → Claude erkennt Gericht + Zutaten (komponentenweise Schätzung mit Referenzgrößen) → Portionsgröße per Slider korrigieren → direkt ins Tagesprotokoll |
| **KI-Voice** | Gericht per Sprache diktieren (Web Speech API, de-DE) → Claude schätzt Kalorien & Makros aus der Beschreibung. Optional liest die Coach-Stimme (ElevenLabs) Scan-Ergebnisse vor |
| **Tracker** | Kalorien-Ring, Makro-Balken, 4 Mahlzeiten, manuelle Eingabe, Favoriten, „zuletzt gegessen“, Wasser-Tracker, Offline-Queue |
| **Fortschritt** | Gewichts-Chart mit Ziellinie, Wochen-Auswertung (Ø kcal, Protein-Tage, Workouts, kg-Trend), privater Vorher/Nachher-Foto-Vergleich |
| **Training** | Vorlagen (Push/Pull/Beine, 2× Ganzkörper), Gewichte/Wiederholungen loggen mit Vorbelegung vom letzten Mal, Sätze abhaken |
| **Theme** | Akzentfarbe wählbar (Acid-Lime, Elektro-Orange, Cyan, Hot-Pink, Violett + eigener Farbwähler) – live im ganzen UI, gespeichert im Supabase-Profil. Gesamtes CSS auf Variablen (`--accent`, `--bg`, `--surface`, `--hairline`, …); Akzent nur an Ring, Primär-Buttons und Hervorhebungs-Zahlen, Rest Graustufen |

---

## Setup (einmalig, ~5 Minuten)

Keine Datenbank, kein Login – nur Netlify:

1. Den Ordner `fitcoach` auf Netlify deployen (Drag & Drop auf den
   Deploys-Tab der Site oder via Git mit Base directory `fitcoach`).
2. Environment-Variablen der Site:

| Variable | Wozu |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (Foto-Scan, Text-Schätzung, Coach) |
| `APP_KEY` | Muss zum Wert in `public/js/config.js` passen (schützt die KI-Funktionen) |
| `ELEVENLABS_API_KEY` | optional – Coach-Stimme |

3. App öffnen, fertig. Alle Daten liegen lokal im Browser der Site –
   Website-Daten löschen heißt: App startet bei Null.

## Projektstruktur

```
fitcoach/
├── netlify.toml                  # Netlify-Konfiguration (publish, functions, redirects)
├── package.json                  # @anthropic-ai/sdk für die Function
├── supabase/
│   └── schema.sql                # Tabellen + RLS + Storage-Policies (im SQL-Editor ausführen)
├── netlify/functions/
│   └── analyze-food.js           # Claude Vision: Gericht → Kalorien/Makros als JSON
│   ├── analyze-text.js           # Claude: Text-/Sprach-Beschreibung → Kalorien/Makros
│   └── speak.js                  # ElevenLabs: Coach-Stimme (optional)
└── public/
    ├── index.html                # App-Shell (alle Views, SVG-Icon-Set)
    ├── manifest.webmanifest      # PWA-Manifest
    ├── sw.js                     # Service Worker (Offline-Shell)
    ├── css/style.css             # Dunkles Glassmorphism-Design
    ├── icons/                    # App-Icons
    └── js/
        ├── config.js             # Supabase-Zugangsdaten (eintragen!)
        ├── state.js              # Supabase-Client, App-State, Offline-Queue
        ├── calc.js               # Mifflin-St Jeor, TDEE, Makros, Zeitfenster
        ├── app.js                # Auth, Navigation, Sync
        ├── onboarding.js         # Ziel-Setup
        ├── tracker.js            # Kalorien-/Wasser-Tracker
        ├── scan.js               # KI-Foto-Scan
        ├── progress.js           # Gewichts-Chart, Wochen-Auswertung, Fotos
        └── workout.js            # Trainingspläne + Logging
```

## Sicherheit & Grenzen

- Der Anthropic-Key bleibt serverseitig; die Functions verlangen den `APP_KEY`-Header.
- Daten sind privat, weil sie das Gerät nie verlassen (außer Fotos zur KI-Analyse).
- Kein Geräte-Sync: Daten gehören zum Browser dieser Site.
