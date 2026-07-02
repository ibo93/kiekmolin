# KURANI · KI-Sichtbarkeit

Werkzeug für den Baustein 2 der KI-Agentur: prüft und verbessert, ob ein
Restaurant/Laden bei **Google UND KI-Assistenten** (Claude/ChatGPT/Gemini)
gefunden und empfohlen wird – und erzeugt den **Monats-Report**, der das Abo
rechtfertigt.

**Goldene Regeln dieses Projekts**

- Der Kiek-mol-in-Code wird **nicht angefasst**. Dieses Projekt liest nur über
  die Supabase-API (es gibt im Code bewusst keine Schreib-Funktionen).
- Secrets liegen in `.env`, niemals im Code. `.env` ist gitignored.
- Es wird **nie „Platz 1 garantiert"** versprochen – der Report zeigt Richtung
  und ist transparent darüber, was automatisch getestet wurde und was nicht.

Keine npm-Dependencies – nur Node 18+ (wie `build-seo-pages.js`).

## Schnellstart (2 Minuten, ohne Keys)

```bash
cd sichtbarkeit
node sichtbarkeit.js report --demo
```

Erzeugt `reports/la-piazza-emden-<monat>.html` (und `.pdf`, wenn Chrome
installiert ist) mit Beispieldaten – so sieht der fertige Kunden-Report aus.

## Einrichtung für echte Kunden

```bash
cp .env.example .env     # dann Keys eintragen (Anleitung steht in der Datei)
```

| Key | Wofür | Ohne Key |
|---|---|---|
| `ANTHROPIC_API_KEY` | KI-Test: stellt die Suchfragen an Claude (mit Web-Suche) und prüft, ob der Betrieb empfohlen wird | KI-Spalte = „manuell prüfen" |
| `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | Google-Test über die offizielle Custom-Search-API (kein Scraping) | Google-Spalte = „manuell prüfen" |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | optional – sonst wird der public-safe anon-Key der App genutzt | funktioniert trotzdem |

„Manuell prüfen"-Fragen fließen **nicht** in die Sichtbarkeits-Quote ein –
keine geschönten Zahlen.

## Die drei Befehle

```bash
node sichtbarkeit.js liste                    # alle aktiven Betriebe aus der Datenbank
node sichtbarkeit.js report <name|slug>       # Monats-Report für einen Kunden (Teil B)
node sichtbarkeit.js aufbereitung <name|slug> # JSON-LD + Texte + GBP-Checkliste (Teil A)
```

Beispiel:

```bash
node sichtbarkeit.js report "La Piazza"
node sichtbarkeit.js aufbereitung la-piazza-emden
```

## Teil B – der Monats-Report (Kernstück)

Pro Betrieb wird jeden Monat **dieselbe** Fragenliste getestet
(automatisch aus Stadt + Kategorie erzeugt, siehe `lib/fragen.js`):

- „beste pizzeria in Emden", „wo essen in Norden", „Pizza in Emden bestellen", …

Geprüft wird pro Frage:

1. **Google** – taucht der Betrieb in den Top 10 auf? (Custom-Search-API)
2. **KI-Assistent** – empfiehlt Claude (mit Web-Suche) den Betrieb? Die
   Roh-Antwort wird gespeichert → wiederholbarer, dokumentierter Test.

Dazu ein Basis-Check: Eintrag auf kiekmolin.de erreichbar + Schema.org
vorhanden? Eigene Website erreichbar + maschinenlesbar?

Jeder Lauf wird unter `data/<kunde>/JJJJ-MM.json` gespeichert. Ab dem zweiten
Monat zeigt der Report automatisch die **Veränderung zum Vormonat** – das ist
der Schwarz-auf-weiß-Beweis für den Wirt.

Ergebnis: `reports/<kunde>-<monat>.html` + `.pdf` (schlicht, schwarz/grau,
ein Akzent). Kein Chrome installiert? HTML im Browser öffnen → Drucken →
„Als PDF sichern".

## Teil A – Aufbereitung (einmalig pro Kunde)

`node sichtbarkeit.js aufbereitung <kunde>` erzeugt in `aufbereitung/<kunde>/`:

- `schema.jsonld` + `jsonld-snippet.html` – Schema.org-Markup inkl. Speisekarte,
  fertig zum Einbau in jede Website (`<head>`)
- `beschreibung.txt` – klare Betriebsbeschreibung
- `speisekarte.txt` – Speisekarte als sauber lesbarer Text (das, was KI liest)
- `google-business-checkliste.md` – personalisierte Checkliste fürs
  Google-Business-Profil

## Monats-Routine pro Kunde (≈ 5 Minuten)

```bash
node sichtbarkeit.js report <kunde>   # Report erzeugen
open reports/<kunde>-<monat>.pdf      # kurz prüfen, dann an den Kunden senden
```

## Projektstruktur

```
sichtbarkeit/
  sichtbarkeit.js        CLI: liste / report / aufbereitung
  lib/
    env.js               .env-Loader (ohne Dependencies)
    supabase.js          Read-only-Zugriff auf die Kiek-mol-in-Datenbank
    fragen.js            Suchfragen pro Betrieb (Stadt + Kategorie)
    checks.js            Google-, KI- und Basis-Checks
    aufbereitung.js      Teil A: JSON-LD, Texte, GBP-Checkliste
    report.js            Teil B: Auswertung, Historie, HTML/PDF-Report
  demo/demo-daten.json   Beispieldaten für --demo
  data/                  Monats-Historie pro Kunde (gitignored)
  reports/               erzeugte Reports (gitignored)
  aufbereitung/          erzeugte Kunden-Bausteine (gitignored)
```
