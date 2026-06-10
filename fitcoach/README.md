# 🏋️ FitCoach – Fitness- & Ernährungs-PWA

Persönlicher Coach für **Abnehmen und Muskelaufbau**: Kalorien tracken, Gerichte
per **KI-Foto-Scan** (Claude Vision) erfassen, Fortschritt sichtbar machen.

- **Frontend:** Vanilla JS, mobile-first, dunkles Glassmorphism-Design, PWA (installierbar, offline-fähiger Tracker)
- **Backend:** Supabase (Auth, Postgres mit Row Level Security, Storage für Fotos)
- **Hosting:** Netlify (statische Site + Netlify Function für den Claude-API-Call)
- **KI:** Claude API (`claude-opus-4-8`) mit Vision + strukturiertem JSON-Output

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

## Setup (einmalig, ~15 Minuten)

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen.
2. **SQL Editor** öffnen und den kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) ausführen.
   Das legt alle Tabellen, RLS-Policies und die privaten Storage-Buckets (`food-photos`, `progress-photos`) an.
3. Unter **Project Settings → API** die Werte `Project URL` und `anon public key` kopieren.
4. Optional: Unter **Authentication → Providers → Email** „Confirm email“ deaktivieren,
   wenn du ohne E-Mail-Bestätigung testen willst.

### 2. Frontend konfigurieren

In [`public/js/config.js`](public/js/config.js) eintragen:

```js
export const SUPABASE_URL = 'https://xyzxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

> Der Anon-Key darf öffentlich sein – die Datensicherheit kommt von Row Level
> Security: jeder User sieht ausschließlich seine eigenen Daten.

### 3. Netlify-Site anlegen

1. Neues Netlify-Projekt aus diesem Repo erstellen.
2. **Base directory:** `fitcoach` (wichtig – die App liegt im Unterordner).
   Publish directory und Functions werden über `fitcoach/netlify.toml` gesetzt.
3. Unter **Site settings → Environment variables** drei Variablen anlegen:

| Variable | Wert | Wozu |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-…` (von [console.anthropic.com](https://console.anthropic.com)) | Claude-Vision-Call – bleibt serverseitig, landet nie im Frontend |
| `SUPABASE_URL` | wie in config.js | Token-Verifizierung in der Function |
| `SUPABASE_ANON_KEY` | wie in config.js | Token-Verifizierung in der Function |
| `ELEVENLABS_API_KEY` | optional (von [elevenlabs.io](https://elevenlabs.io)) | Coach-Stimme: liest Scan-Ergebnisse vor. Ohne Key bleibt die App einfach stumm |
| `ELEVENLABS_VOICE_ID` | optional | Andere ElevenLabs-Stimme als der Standard |

4. Deployen. Fertig 🎉

### 4. Auf dem Handy installieren

Seite im Browser öffnen → „Zum Startbildschirm hinzufügen“. Die App läuft dann
im Vollbild; der Tracker funktioniert dank Service Worker auch offline
(Einträge werden synchronisiert, sobald du wieder online bist).

---

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

## Anmeldung (Anonymous-Modus)

Die App hat **keinen Login**: Beim ersten Start meldet sie sich automatisch
anonym bei Supabase an (dazu in Supabase **Authentication → Sign In / Providers
→ Anonymous sign-ins** einschalten). Die Identität hängt am Browser dieser
Site – **Website-Daten löschen oder ein anderes Gerät bedeutet ein frisches
Konto** ohne die bisherigen Einträge. Für Mehrgeräte-Sync müsste man später
auf E-Mail-Login umstellen.

## Sicherheit

- **RLS auf allen Tabellen** – jede Policy prüft `auth.uid() = user_id`.
- **Private Storage-Buckets** – Fotos liegen unter `<user_id>/…`; Policies erlauben nur den eigenen Ordner, Anzeige über kurzlebige signierte URLs.
- **Claude-API-Key nur serverseitig** in der Netlify Function; die Function verifiziert zusätzlich das Supabase-JWT, damit nur eingeloggte Nutzer den (kostenpflichtigen) KI-Call auslösen können.
- Bilder werden clientseitig auf 1280 px komprimiert (schnellerer Upload, geringere API-Kosten).
