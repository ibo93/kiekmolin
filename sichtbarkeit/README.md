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
| `SERPER_API_KEY` | Google-Test über Serper.dev (echte Google-Ergebnisse; 2.500 Suchen gratis) | Google-Spalte = „manuell prüfen" |
| `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | Alt-Weg über Googles Custom-Search-API – **nur für Bestandskunden**, Neukunden bekommen dort 403 | – |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | optional – sonst wird der public-safe anon-Key der App genutzt | funktioniert trotzdem |
| `BON_PRO_GAST` | Durchschnittsbon in € für die Reservierungs-Umsatzschätzung im Report | Standard 25 € |

„Manuell prüfen"-Fragen fließen **nicht** in die Sichtbarkeits-Quote ein –
keine geschönten Zahlen.

### Google-Platzierungen einrichten (Serper.dev, kostenlos)

**Wichtig:** Googles eigene Custom-Search-API ist für **Neukunden
geschlossen** (dauerhaft 403 „does not have access", egal wie korrekt man
sie einrichtet). Der Standardweg ist deshalb **Serper.dev** – liefert echte
Google-Ergebnisse, ein einziger Schlüssel, 2.500 Suchen gratis (reicht bei
6–8 Fragen pro Kunde und Monat für Jahre):

1. **serper.dev** → „Sign up" (geht mit dem Google-Konto).
2. Im Dashboard den **API Key** kopieren.
3. `node ../schluessel-einrichten.js` → Schritt 5 → Key einfügen
   (wird mit einer echten Suche live geprüft).

Wer noch einen alten Zugang zur Google-API hat, kann weiter
`GOOGLE_API_KEY` + `GOOGLE_CSE_ID` nutzen – `SERPER_API_KEY` hat Vorrang.

## Umsatz-Nachweis des Telefon-Retters

Der Monats-Report enthält die Sektion **„Was der Telefon-Retter gebracht
hat"**: Reservierungen, Gäste, Bestellungen und Bestellwert des Monats –
gelesen aus denselben Tabellen, in die der Telefon-Retter schreibt
(Quelle `telefon`, `lib/telefonzahlen.js`). Der Bestellwert ist **echt**,
der Reservierungs-Umsatz eine **transparent ausgewiesene Schätzung**
(Gäste × Durchschnittsbon). Die Sektion erscheint nur, wenn es in dem
Monat tatsächlich Telefon-Aktivität gab.

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

**Maßgeschneiderte Fragen pro Kunde:** eine Datei `kunden/<kunde>.json`
anlegen (Matching per `restaurant_id`, `slug` oder `name`) – dann gilt deren
Fragenliste statt der automatischen. Beispiel liegt bei:
`kunden/greetsieler-boerse.json` (Pilotkunde). Fragen nicht umformulieren,
sonst stimmt der Vormonats-Vergleich nicht mehr – lieber neue hinzufügen.

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
