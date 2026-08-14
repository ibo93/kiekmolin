# KURANI · Sprachassistent

Reden statt tippen. Du sagst, was zu tun ist — der Assistent erledigt es
**auf deinem Rechner** und antwortet gesprochen.

Er ist kein Chatbot: unter der Haube läuft **Claude Code** in dem Ordner, um
den es gerade geht. Damit hat er alles, was du sonst per Hand bedienst —
deine Skills (`kurani-docs`, `menumaker`, `kiekmolin`, `kurani-video` …),
deine Dateien, git, node, ffmpeg.

```
  Mikrofon  ─►  Text  ─►  Claude Code im richtigen Ordner  ─►  Antwort  ─►  Stimme
              (Deepgram      (deine Skills, deine Dateien)      (kurz)     (ElevenLabs
             oder Browser)                                                oder Browser)
```

---

## 1. Was du brauchst

**Hardware:** nichts Neues. Rechner mit Mikrofon (eingebaut reicht),
Kopfhörer sind angenehm, sonst hört er sich beim Freihand-Modus selbst zu.

**Software — hast du alles schon:**

| Was | Warum | Prüfen |
|---|---|---|
| Node 18+ | der kleine Server | `node --version` |
| Claude Code | der Kopf des Assistenten | `claude --version` |
| Chrome, Edge oder Safari | Mikrofon im Browser | – |

**Schlüssel — brauchst du KEINE, machen es aber besser:**

| Schlüssel | Wofür | Ohne ihn |
|---|---|---|
| `DEEPGRAM_API_KEY` | Zuhören, versteht Ostfriesisch-Deutsch sauber | Der Browser hört selbst zu (Chrome) — reicht für kurze Sätze |
| `ELEVENLABS_API_KEY` + Voice-ID | Die Stimme, die dir antwortet | Die eingebaute Browser-Stimme spricht — klingt blechern, kostet nichts |

Beide liegen bereits in `telefon-retter/.env`, wenn du den Telefon-Retter
eingerichtet hast. **Der Sprachassistent liest sie von dort mit** — du musst
nichts doppelt eintragen und kein neues Konto anlegen.

---

## 2. Loslegen

```bash
cd sprachassistent
node server.js --demo     # erst mal gucken: nichts wird wirklich getan
```

Browser öffnen: **http://localhost:3400** → Mikrofon anklicken (oder
Leertaste gedrückt halten) und sprechen.

Wenn es sich gut anfühlt, im Echtbetrieb:

```bash
node server.js
```

Optional vorher Einstellungen anlegen (nichts davon ist Pflicht):

```bash
cp .env.example .env              # Modell, Kostendeckel, Rechte
cp ordner.json.example ordner.json # deine Ordner auf deinem Rechner
```

---

## 3. Wie du mit ihm redest

Ganz normal. Beispiele:

- „Schreib eine Rechnung für La Piazza über 350 Euro für die Speisekarte."
- „Was steht diese Woche an?"
- „Im Dashboard kommen die Reservierungen nicht an — guck mal, woran das liegt."
- „Was hab ich bei Greetsieler Börse noch offen?"
- „Schneid aus dem Rohmaterial ein Reel, 20 Sekunden."

Drei Worte wirken **sofort**, ohne dass die KI überhaupt loslegt:

| Du sagst | Was passiert |
|---|---|
| „Stopp" / „hör auf" | Der laufende Auftrag wird abgebrochen |
| „Neues Thema" / „vergiss das" | Gedächtnis leeren, frisch anfangen |
| (nur „ähm", „ok", „hm") | Wird verworfen, kostet nichts |

**Tastatur:** Leertaste halten = sprechen. Enter im Textfeld = tippen.
Escape = Klappe halten und abbrechen.

**Freihand** (Knopf oben rechts): er hört dauerhaft zu, merkt selbst, wann
dein Satz zu Ende ist, und lauscht nach seiner Antwort wieder. Gedacht für
Hände-voll-Situationen — beim Fahren, beim Aufkleben, in der Werkstatt.

---

## 4. Wer darf was — die drei Stufen

Oben im Fenster stellst du ein, wie weit er gehen darf:

| Stufe | Darf | Darf nicht |
|---|---|---|
| **Nur reden** | lesen, suchen, erklären | nichts schreiben, keine Befehle |
| **Arbeiten** *(Standard)* | Dateien schreiben und ändern, Befehle ausführen (Rechnung als .docx, ffmpeg, git status) | `rm`, `sudo`, `git push`, `npm publish`, Formatieren, Herunterfahren |
| **Freie Hand** | alles | – |

„Freie Hand" ist absichtlich abgeschaltet, bis du sie in der `.env`
freigibst (`SPRACH_FREIE_HAND=ja`).

**Ehrlich gesagt:** Die Sperren in „Arbeiten" sind ein Anschnallgurt, kein
Panzer. Wer schreiben und Programme starten darf, könnte auf Umwegen auch
Schaden anrichten. Sie fangen die klassischen Ausrutscher ab — mehr nicht.
Der Assistent ist zusätzlich angewiesen, bei riskanten Schritten (löschen,
veröffentlichen, Geld) vorher zu fragen. Bei allem, was weh tun kann:
Stufe „Nur reden" nehmen oder es selbst tippen.

Der Server hört **nur auf 127.0.0.1** und weist Anfragen mit fremdem
Host-Namen ab. Er darf Dateien ändern — er gehört nie ins offene Netz.

---

## 5. Wo er arbeitet (`ordner.json`)

Der Assistent wählt anhand deiner Worte den Ordner und startet Claude Code
**genau dort** — dadurch greifen die richtigen Skills und er findet die
richtigen Dateien:

- „Rechnung", „Angebot", „Steuer" → Büro-Ordner
- „Dashboard", „Reservierung", „Supabase" → dieses Repository
- „Reel", „Schnitt", „Rohmaterial" → Video-Ordner

Anpassen in `ordner.json` (Vorlage: `ordner.json.example`). Im Fenster
kannst du den Ordner jederzeit fest vorgeben, per Sprache mit
„im büro: …". Ohne eigene `ordner.json` arbeitet er immer hier im
Kiek-mol-in-Repository.

Pro Ordner merkt er sich das laufende Gespräch — du kannst also nachfragen
(„und dasselbe für Mai") ohne alles zu wiederholen. Ein Ordnerwechsel
vermischt nichts.

---

## 6. Was es kostet

Jeder Auftrag ist ein Claude-Code-Lauf. Kurze Fragen kosten wenige Cent,
größere Aufgaben mehr. Nach jeder Antwort steht der Betrag klein unter der
Blase. In der `.env` steckt ein Deckel pro Auftrag:

```
SPRACH_MODELL=sonnet      # schnell und günstig; "opus" ist gründlicher, teurer
SPRACH_BUDGET_USD=3       # Notbremse je Auftrag; leer = kein Deckel
```

Deepgram und ElevenLabs kosten separat nach Minuten bzw. Zeichen — deshalb
wird immer nur eine **Kurzfassung** vorgelesen; der volle Text steht im
Fenster.

---

## 7. Mitschrift

Jeder Auftrag landet als eine Zeile in `protokoll/JJJJ-MM-TT.jsonl`:
Frage, Antwort, Ordner, Stufe, Kosten, Dauer. Damit du abends nachlesen
kannst, welche Rechnung er morgens „rausgeschickt" hat. Bleibt lokal, ist
gitignored.

---

## 8. Wenn was klemmt

| Symptom | Ursache / Abhilfe |
|---|---|
| „Ich komme nicht ans Mikrofon" | Browser fragt einmal um Erlaubnis — erlauben. Safari braucht dafür `localhost`, nicht die IP. |
| Er hört zu, versteht aber nichts | Ohne Deepgram hört der Browser zu: Chrome nehmen, deutlich sprechen, kurze Sätze. |
| Antwort klingt blechern | Kein ElevenLabs-Schlüssel gefunden → Browser-Stimme. `telefon-retter/.env` prüfen. |
| „Ich finde den Befehl claude nicht" | `SPRACH_CLAUDE_BEFEHL=/voller/pfad/zu/claude` in die `.env`. |
| „Den Ordner … finde ich nicht" | Pfad in `ordner.json` stimmt nicht. |
| Er redet zu lang | `SPRACH_MAX_SAETZE=2` in der `.env`. |
| Er soll nichts anfassen | Stufe „Nur reden". |

Tests (ohne Schlüssel, ohne Netz, ohne Kosten):

```bash
node test.js
```

---

## 9. Datenschutz

Mit Schlüsseln gehen deine Aufnahmen an Deepgram und der Antworttext an
ElevenLabs — dieselben Dienste, die schon am Telefon-Retter hängen. Ohne
Schlüssel bleibt beides im Browser. Der eigentliche Auftrag geht in jedem
Fall an Claude, wie bei Claude Code auf der Kommandozeile auch. Kundendaten
also mit demselben Kopf behandeln wie sonst.
