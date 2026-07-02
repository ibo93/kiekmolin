# Pilot: Greetsieler Börse

Erster Kunde für beide Bausteine der KI-Agentur.
Restaurant-ID in der Datenbank: `888dc5bc-1649-4762-a8ee-2eb1e5e1dfad`
(das ist die Standard-`RESTAURANT_ID` der App — Reservierungen und
Bestellungen laufen dort bereits über Kiek mol in).

## Baustein 2 zuerst: Sichtbarkeit (Woche 1 im Fahrplan)

Die Fragenliste für die Börse ist fest hinterlegt in
`sichtbarkeit/kunden/greetsieler-boerse.json` (8 Fragen: Fisch, Krabben,
Terrasse, norddeutsche Küche — jeden Monat identisch).

```bash
cd sichtbarkeit
cp .env.example .env      # ANTHROPIC_API_KEY + Google-Keys eintragen
node sichtbarkeit.js report 888dc5bc-1649-4762-a8ee-2eb1e5e1dfad
node sichtbarkeit.js aufbereitung 888dc5bc-1649-4762-a8ee-2eb1e5e1dfad
```

Ergebnis:
- `reports/…<monat>.html` + `.pdf` → **das ist das Dokument fürs Verkaufsgespräch**
- `aufbereitung/…/google-business-checkliste.md` → mit dem Wirt zusammen durchgehen
- `aufbereitung/…/jsonld-snippet.html` → falls die Börse eine eigene Website hat, dort in den `<head>`

Dann jeden Monatsanfang: denselben `report`-Befehl, PDF an den Wirt.
Ab Monat 2 zeigt der Report automatisch die Veränderung.

## Baustein 1 danach: Telefon-Retter (Woche 1–2 im Fahrplan)

Die `.env.example` ist bereits auf die Börse voreingestellt.

```bash
cd telefon-retter
npm install
cp .env.example .env      # Keys eintragen (Anleitung steht in der Datei)
node simulator.js --demo  # Runde 0 der TEST-CHECKLISTE (Demo-Restaurant)
node simulator.js         # dann mit den ECHTEN Börse-Daten (schreibt echt!)
```

Wichtig bei der Börse im Echt-Modus des Simulators: Test-Reservierungen
hinterher im Dashboard stornieren — oder vorher mit dem Wirt abstimmen.

Danach `TEST-CHECKLISTE.md`: Twilio-TEST-Nummer, erst wenn alles sauber
läuft die Rufumleitung „bei besetzt / keine Antwort" auf der echten
Börse-Nummer aktivieren.

## Pilot-Ziele (aus dem Bauplan)

| Woche | Ziel | Beweis |
|---|---|---|
| 1 | Erster Sichtbarkeits-Report liegt als PDF vor | Verkaufsgespräch mit dem Wirt |
| 1–2 | Telefon-Retter Stufe 1 an TEST-Nummer | Reservierung erscheint im Dashboard (Quelle `telefon`) |
| 3 | Stufe 2 (Infos) + Live-Test | Agent beantwortet Öffnungszeiten/Speisekarte korrekt |
| 4+ | Stufe 3 (Bestellung) | Erste Telefon-Bestellung, laut vorgelesen und bestätigt |

Preis-Idee aus dem Bauplan: Bundle ab 399 €/Monat (Sichtbarkeit 199–299 € +
Telefon-Retter 149–249 €). Nie „Platz 1" versprechen — der Monats-Report
zeigt Richtung, das ist das Verkaufsargument.
