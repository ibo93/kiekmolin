# Test-Checkliste · Telefon-Retter

**Regel aus dem Bauplan: Zuerst an einer TEST-Nummer üben, nie direkt auf der
echten Restaurant-Leitung.** Diese Liste komplett durchgehen, bevor ein
echter Gast den Agenten hört.

## Runde 0 – Simulator (ohne Telefon, 10 Minuten)

`node simulator.js --demo` (Stufe 1) – kostet fast nichts, findet die meisten Fehler:

- [ ] „Ich möchte einen Tisch reservieren" → Agent fragt nach Datum, Uhrzeit, Personen, Name (einzeln, nicht alles auf einmal)
- [ ] „Morgen um 19 Uhr, 4 Personen, Name Müller" → Agent prüft Verfügbarkeit VOR der Zusage und bestätigt mit allen Daten
- [ ] Uhrzeit außerhalb der Öffnungszeiten („3 Uhr nachts") → Agent lehnt ab und nennt Alternativen
- [ ] Silvester 19 Uhr (im Demo belegt) → Agent bietet Alternativ-Zeiten an, sagt nichts fest zu
- [ ] „12 Personen, Weihnachtsfeier" → Agent bietet Rückruf an (Gruppen = Chefsache)
- [ ] „Ich will mich beschweren" / „Kann ich den Chef sprechen?" → Rückrufwunsch, keine Diskussion
- [ ] Unsinn erzählen („Ich möchte ein Auto mieten") → Agent bleibt höflich, bietet ggf. Rückruf an
- [ ] „Bist du ein Mensch?" → Agent sagt ehrlich, dass er ein digitaler Assistent ist
- [ ] Nach der Reservierung: Agent verabschiedet sich und beendet das Gespräch selbst

Stufe 2 (`--stufe 2`):
- [ ] „Habt ihr vegane Gerichte?" → nennt echte Gerichte aus der Speisekarte (nicht erfunden)
- [ ] „Was kostet die Lasagne?" → korrekter Preis
- [ ] „Wann habt ihr auf?" / „Wo kann ich parken?" → Öffnungszeiten korrekt; bei Unbekanntem KEINE Erfindung

Stufe 3 (`--stufe 3`):
- [ ] Bestellung mit 3 Artikeln + Extras („einmal Salami ohne Zwiebeln") → Agent liest ALLES vor inkl. Summe und fragt nach Bestätigung
- [ ] „Nein, doch keine Tonno" vor der Bestätigung → Agent korrigiert und liest neu vor
- [ ] Gericht, das es nicht gibt („Pizza Hawaii") → Agent fragt nach statt zu raten
- [ ] Lieferung ohne Adresse → Agent fragt die Adresse ab, Liefergebühr taucht in der Summe auf
- [ ] Summe von Hand nachrechnen: stimmt sie? (Mengen × Preise + Liefergebühr)

## Runde 1 – echte Telefonleitung, TEST-Nummer

Twilio-Testnummer einrichten (README), Server starten, mit dem eigenen Handy anrufen:

- [ ] Begrüßung kommt innerhalb von ~2 Sekunden nach Rufannahme
- [ ] Agent versteht dich bei normalem Sprechtempo (5 Reservierungen durchspielen)
- [ ] Dazwischenreden („Moment, anders…") → Agent hört auf zu sprechen und reagiert
- [ ] Ostfriesisches Nuscheln / Nebengeräusche → im Zweifel fragt der Agent nach, statt Falsches einzutragen
- [ ] Reservierung erscheint im Kiek-mol-in-Dashboard mit Quelle „telefon" und richtigen Daten
- [ ] Parallel online denselben Slot vollbuchen → Telefon-Agent bietet Alternativen an (kein Doppel-Booking!)
- [ ] Auflegen mitten im Satz → Server läuft weiter, nächster Anruf funktioniert (logs/ prüfen)
- [ ] 2 Anrufe gleichzeitig (zweites Handy) → beide Gespräche sauber getrennt

## Runde 2 – Pilot beim echten Restaurant (z.B. La Piazza)

- [ ] Wirt eingewiesen: wo Reservierungen/Rückrufe im Dashboard auftauchen
- [ ] Rufumleitung NUR bei besetzt/keine Antwort auf die Twilio-Nummer (der Mensch bleibt erste Wahl)
- [ ] Eine Woche lang jeden Abend `logs/` durchsehen: Was hat der Agent falsch verstanden?
- [ ] Wirt-Feedback: Stimmen die Reservierungen? Gab es Beschwerden?
- [ ] Erst wenn eine Woche sauber läuft → Stufe 2 aktivieren, gleiche Prüfung, dann Stufe 3

## Notbremse

`STUFE` zurückstellen oder Server stoppen und Rufumleitung deaktivieren –
die normale Leitung funktioniert dann wieder wie vorher.
