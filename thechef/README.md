# The Chef

KI-Lager-App mit Küchen-Assistent für kleine Gastronomie. Spezifikation: [`THECHEF.md`](THECHEF.md), Design-Vorlagen: [`design/`](design/).

## Auf dem Mac im iOS-Simulator starten

Voraussetzung: Xcode (aus dem App Store) und Node 22.

```bash
cd thechef
npm install
npm run ios        # baut die App, kopiert sie ins Xcode-Projekt, öffnet Xcode
```

In Xcode oben ein iPhone als Ziel wählen (z. B. „iPhone 17“) und ▶ drücken.
Beim ersten Mal lädt Xcode die Capacitor-Pakete (Swift Package Manager) – das dauert einen Moment.

Direkt ohne Xcode-Fenster: `npm run ios:sim` (fragt nach dem Simulator).

**Ohne Supabase-Zugang läuft die App im Demo-Modus** (orangefarbenes Band oben):
Daten von „ÖZ KEBAB“, Erkennung und Assistent sind simuliert. Mit echtem Server:
`.env` anlegen (siehe `.env.example`), dann `npm run ios`.

## Im Browser

```bash
npm run dev        # http://localhost:5173
```

## Prüfen

```bash
npx tsc -b         # Typen
npm test           # 115 Tests: RLS gegen echtes Postgres (PGlite), Logik, Zahlwörter, Sprachen, Antwort-Prüfung
npm run build
```

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/` | React-App (Seiten, Bausteine, Sprachsystem, Offline-Warteschlange) |
| `public/sprachen/` | Texte je Sprache – ohne Code-Änderung korrigierbar |
| `supabase/migrations/` | Datenbank, RLS, Funktionen (`scan_bestaetigen`, Chargen FIFO) |
| `supabase/functions/` | Edge Functions: Scan-Erkennung, Assistent (Claude), Push, Zeitplan |
| `supabase/functions/_shared/logik/` | Rechenlogik – von App UND Server benutzt |
| `ios/` | Xcode-Projekt (Capacitor) |
| `tests/` | Vitest |
