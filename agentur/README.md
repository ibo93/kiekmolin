# KURANI · Agentur-App

Die Web-Oberfläche für deine KI-Agentur: alle Kunden auf einen Blick,
Monats-Reports per Klick, Report-Historie, Aufbereitung (Teil A) und
der Live-Status des Telefon-Retters.

Nutzt `sichtbarkeit/` und `telefon-retter/` als Motor – gleiche Logik,
keine Kopien. Die Kiek-mol-in-App bleibt unangetastet.

## Starten

```bash
cd agentur
node server.js            # echte Datenbank (nutzt sichtbarkeit/.env)
node server.js --demo     # zum Ausprobieren ohne Keys
```

Dann im Browser: **http://localhost:3200**

## Was die App kann

- **Übersicht (Dashboard-Kopf):** Kunden, Reports diesen Monat, Telefon-Umsatz
  über alle Kunden und offene Rückrufe auf einen Blick
- **Monats-Automatik:** am `AUTO_REPORT_TAG` (Standard: 1. des Monats) laufen
  die Reports für ALLE Kunden von selbst – kein Klicken mehr. War der Rechner
  am Stichtag aus, holt der nächste Start den Lauf automatisch nach.
  Abschalten mit `AUTO_REPORT_TAG=0` in `sichtbarkeit/.env`.
- **Offene Rückrufe:** alle Rückruf-Wünsche aus dem Telefon-Retter als
  Arbeitsliste mit Anruf-Link und „Erledigt"-Knopf – jeder abgearbeitete
  Rückruf ist ein geretteter Gast
- **Anruf-Zähler:** Anrufe heute / diesen Monat aus der anonymen
  Telefon-Retter-Statistik (`logs/statistik.jsonl`)
- **Nächste Schritte je Kunde:** die Empfehlungen aus dem letzten Report
  direkt in der App – dieselbe Logik wie im PDF

- **Kundenliste** aus der Kiek-mol-in-Datenbank, mit Suche, Kategorie,
  Anzahl bisheriger Reports und letzter Sichtbarkeits-Quote
- **Umsatz-Nachweis je Kunde**: „Telefon-Retter · dieser Monat" zeigt
  Reservierungen, Gäste, Bestellungen und den (transparent geschätzten)
  Umsatz am Telefon – dieselben Zahlen landen im Monats-Report
- **Kunde öffnen** → „Monats-Report erzeugen" (läuft im Hintergrund,
  Fortschritt wird angezeigt, Report öffnet sich fertig im neuen Tab)
- **Report-Historie** pro Kunde mit HTML/PDF-Links und Quoten-Verlauf
- **Aufbereitung erzeugen** (Teil A): JSON-LD, Beschreibung, Speisekarte
  als Text, Google-Business-Checkliste – direkt in der App einsehbar
- **Telefon-Retter-Status** oben: grüner Punkt wenn der Server läuft
  (welches Restaurant, welche Stufe) + die letzten Anruf-Protokolle

## Zusammenspiel

```
agentur/  (http://localhost:3200)  ← du arbeitest hier
   │  nutzt als Motor:
   ├── sichtbarkeit/   Reports, Fragen, Aufbereitung, Historie
   └── telefon-retter/ Status über /health (Port 3100) + logs/
```

Keys werden weiterhin in `sichtbarkeit/.env` bzw. `telefon-retter/.env`
gepflegt – die Agentur-App selbst braucht keine eigenen Secrets.
