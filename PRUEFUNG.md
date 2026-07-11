# Prüfbericht · KI-Agentur (Stand vor Go-Live Greetsieler Börse)

Ein Prüf-Team hat alle vier Projekte durchleuchtet (Bugs, Sicherheit, Betrieb,
Recht, Kosten). Ergebnis: **52 Punkte**. Die eindeutigen Code-Blocker habe ich
in dieser Runde bereits behoben (✅). Was übrig bleibt, braucht deine
Entscheidung oder Handlung – vor allem **Recht/DSGVO** und **Twilio-Absicherung**.

> **Wichtig einzuordnen:** Der Telefon-Retter ist noch NICHT live – er nimmt erst
> Anrufe an, wenn du Twilio einrichtest. Die meisten Blocker betreffen also
> „bevor das erste echte Telefon klingelt", nicht „jetzt sofort".
> Einzige Ausnahme: `agentur.html` ist bereits öffentlich auf kiekmolin.de.

---

## ✅ In dieser Runde schon behoben

| Was | Warum es gefährlich war |
|---|---|
| **Server-Absturz bei TTS-Fehler in der Begrüßung** | Ein Aussetzer bei ElevenLabs im ersten Satz brachte den ganzen Telefon-Server zum Absturz (unbehandelte Promise-Rejection). Jetzt abgefangen. |
| **Barge-in reparirt** | Der Agent hörte beim Dazwischenreden nicht auf zu sprechen (das „spricht"-Flag war sofort wieder falsch). Jetzt über Twilios `mark`-Echo gelöst – Gast kann jederzeit unterbrechen. |
| **Abschied wurde abgeschnitten** | Auflegen nach festen 6 Sekunden kappte lange Bestätigungen. Jetzt wird aufgelegt, wenn der Satz wirklich fertig gesprochen ist. |
| **Massen-Fake-Buchungen** | Ein Anrufer konnte sich das ganze Wochenende zubuchen. Jetzt max. 3 Buchungen pro Anruf (`MAX_BUCHUNGEN_PRO_ANRUF`), danach nur noch Rückruf. |
| **KI-Offenlegung** | Der Agent nennt sich jetzt in der Begrüßung ausdrücklich „digitaler KI-Assistent" (Transparenzpflicht, EU AI Act). |
| **Hängende API-Aufrufe** | Claude/ElevenLabs/Google/Supabase ohne Timeout konnten Anruf oder Report minutenlang einfrieren. Jetzt überall Timeouts. |
| **Container-Zeitzone** | Docker lief in UTC → „heute" und Uhrzeiten 1–2 h verschoben. Jetzt `TZ=Europe/Berlin`. |
| **Agentur-App im Docker öffentlich** | Port 3200 war auf `0.0.0.0` (offen im Internet, ohne Login). Jetzt nur noch `127.0.0.1` – Zugriff per SSH-Tunnel. |
| **Bestell-Vorlesen abgeschnitten** | `max_tokens` war mit 400 zu knapp fürs Vorlesen ganzer Bestellungen. Auf 800/1500 erhöht. |

---

## 🔴 Blocker – DU musst handeln, bevor das Telefon live geht

### 1. ✅ ERLEDIGT: WebSocket `/media` und Webhook sind jetzt abgesichert
Der `/anruf`-Webhook prüft die Twilio-Signatur (nur echte Twilio-Anfragen),
und der Audio-Kanal `/media` akzeptiert nur Verbindungen mit einem
kurzlebigen Token, das der Webhook selbst ausgestellt hat. Verbindungen ohne
gültigen Start fliegen nach 10 Sekunden raus.
**Dein einziger Handgriff:** `TWILIO_AUTH_TOKEN` in die `.env` eintragen
(Twilio Console → Account Info → Auth Token). Ohne den Eintrag warnt der
Server beim Start und prüft nicht.

### 2. DSGVO – bevor echte Gäste anrufen
Der Agent verarbeitet Name, Telefonnummer, bei Lieferung die Adresse, und
schickt die Sprache an US-Dienste (Twilio, Deepgram, ElevenLabs, Anthropic).
Das ist ohne Vorbereitung nicht sauber. **Nötig (mit Steuerberater/Anwalt oder
Musphtervorlagen):**
- Auftragsverarbeitungs-Verträge (AVV/DPA) mit allen vier Anbietern abschließen
  (gibt es bei allen online zum Anklicken).
- Anrufer informieren, dass eine KI das Gespräch verarbeitet (macht die neue
  Begrüßung schon zum Teil).
- Speicherdauer für die Gesprächs-Protokolle festlegen und automatisch löschen
  (aktuell bleiben sie unbegrenzt liegen – siehe Punkt „Logs" unten).
- Der Wirt (Börse) und du seid hier gemeinsam verantwortlich – kurz vertraglich klären.

### 3. ✅ TEIL-ERLEDIGT: Gesprächs-Protokolle werden jetzt automatisch gelöscht
Anruf-Protokolle werden nach 30 Tagen automatisch gelöscht (einstellbar über
`LOG_AUFBEWAHRUNG_TAGE` in der `.env`; Prüfung beim Start und dann täglich).
**Bleibt an dir:** die Agentur-App nie ohne Passwortschutz öffentlich machen
(im Docker-Setup ist sie bereits nur an localhost gebunden), und die
Löschfrist in deine Datenschutz-Unterlagen übernehmen.

### 4. Twilio: deutsche Nummer braucht Adressnachweis
Für eine deutsche Rufnummer verlangt Twilio ein „Regulatory Bundle"
(Ausweis/Gewerbenachweis, Bearbeitung dauert 1–3 Tage). **Das im Pilot-Zeitplan
einplanen**, sonst steht der Go-Live-Termin und die Nummer ist noch nicht frei.

---

## 🟠 Wichtig, bald angehen

- **Kein Alarm, wenn der Telefon-Server nachts abstürzt** → Anrufer landen in
  einer Twilio-Fehleransage, du merkst es nicht. Lösung: einfacher Uptime-Wächter
  (z. B. UptimeRobot pingt `/health`, kostenlos).
- **Kosten pro Anruf/Report nirgends dokumentiert.** Grobe Schätzung:
  ein 3-Minuten-Anruf kostet dich rund 0,15–0,40 € (Twilio + Deepgram + Claude +
  ElevenLabs); ein Monats-Report je nach Keys ein paar Cent bis ~0,20 €. Bei
  199–399 €/Monat Abo ist das unkritisch – aber ElevenLabs hat eine
  **monatliche Grundgebühr**, die sich erst ab mehreren Kunden lohnt. Vor dem
  Skalieren einmal durchrechnen.
- **Report-Historie hängt nur am Browser (`localStorage`).** Bei
  `agentur.html`: Cache leeren oder Browserwechsel = Vormonatsvergleich weg.
  Für echte Kundenarbeit die Server-Variante (`agentur/`) nutzen, die speichert
  in Dateien. (Siehe „Doppelte Engines" unten.)
- **Backups.** Kundendaten (Historie, Reports, Logs) liegen auf einem einzelnen
  Server. Ein `restic`/`rsync`-Backup oder Hetzner-Snapshots einrichten.
- **`agentur.html` braucht Impressum/Datenschutz-Bezug** oder gehört besser
  hinter Passwortschutz statt offen auf kiekmolin.de. (Ein `noindex` ist schon
  gesetzt, Suchmaschinen zeigen sie also nicht.)

---

## 🟡 Kleinere Bugs (Komfort/Korrektheit, keine Blocker)

- Report `speichereHistorie` überschreibt einen Monat bedingungslos – ein
  misslungener Zweit-Lauf kann gute Monatsdaten überschreiben.
- Vormonats-Trend vergleicht auch dann, wenn diesen Monat weniger Fragen
  getestet wurden (z. B. Keys fehlten) → scheinbarer Absturz. Besser nur bei
  gleicher Testbasis vergleichen.
- Gast-Sätze, die kommen während Claude noch denkt, werden verworfen –
  Korrekturen mitten im Satz gehen verloren.
- `jobs{}` in `agentur/server.js` wächst unbegrenzt (nur relevant bei
  Dauerbetrieb der Server-Variante).
- „Google-Platz X" im Report kommt aus der Custom-Search-API, die nicht 1:1 dem
  echten google.de-Ranking entspricht – im Kundengespräch als „Richtwert"
  benennen, nicht als exakte Position.

---

## 🔮 Zukunft – Reihenfolge nach Nutzen

1. **Ein Server für alle Restaurants** statt einer pro Kunde. Aktuell bedient
   der Telefon-Retter genau ein Restaurant; für 5+ Kunden bräuchtest du 5
   Container. Lösung: die angerufene Twilio-Nummer (`To`) bestimmt das
   Restaurant. Mittelgroßer Umbau – lohnt sich, sobald Kunde 2 kommt.
2. **Batch-Reports:** alle Kunden mit einem Klick/Befehl statt 25 einzeln.
3. **Reports automatisch per E-Mail** an die Wirte (Cron am Monatsanfang).
4. **Antwort-Latenz am Telefon senken:** Streaming-TTS statt komplett puffern,
   satzweise sprechen – fühlt sich für den Gast deutlich natürlicher an.
5. **Mehrsprachigkeit am Telefon:** Deepgram ist auf Deutsch festgelegt –
   Ostfriesland hat viele Touristen; Englisch/Niederländisch erkennen.
6. **Anruf-Protokolle strukturiert in Supabase** statt Textdateien – dann kannst
   du auswerten, was Gäste wirklich fragen (Produkt-Gold).
7. **Zwei Report-Engines zusammenführen** (`agentur.html` vs. `sichtbarkeit/`):
   aktuell gepflegt an zwei Stellen, drohen auseinanderzulaufen.
8. **GitHub Actions:** die vorhandenen Tests bei jedem Push automatisch laufen
   lassen.
9. **Mini-Kundenverwaltung:** wer zahlt was, seit wann, Report verschickt ja/nein.
10. **Google-Business-Profil-Automatisierung** und **Schema.org automatisch** auf
    die kiekmolin.de-Profilseiten schreiben (statt manuell einbauen).

---

*Der Prüflauf hat die Analyse vollständig durchlaufen; die adversariale
Gegenprüfung wurde durch ein Sitzungslimit unterbrochen. Die oben als „behoben"
und „Blocker" markierten Punkte habe ich zusätzlich selbst am Code verifiziert.*
