# KURANI · Sprachassistent

Reden statt tippen. Du sagst, was zu tun ist — der Assistent erledigt es
**auf deinem Rechner** und antwortet gesprochen.

Er ist kein Chatbot: unter der Haube läuft **Claude Code** in dem Ordner, um
den es gerade geht. Damit hat er alles, was du sonst per Hand bedienst —
deine Skills (`kurani-docs`, `menumaker`, `kiekmolin`, `kurani-video` …),
deine Dateien, git, node, ffmpeg.

```
  Mikrofon  ─►  Text  ─►  Claude Code im richtigen Ordner  ─►  Antwort  ─►  Stimme
              (Deepgram      (deine Skills, deine Dateien)   (satzweise)  (ElevenLabs
             oder Browser)                                                oder Browser)
                  ▲                                                           │
                  └──────────── du redest dazwischen: er ist sofort still ◄───┘
```

Im **Live-Modus** läuft das durchgehend, wie ein Telefonat: er hört mit
während du sprichst, fängt an zu antworten sobald der erste Satz steht, und
hält die Klappe, wenn du dazwischenredest.

---

## 1. Was du brauchst

**Hardware:** nichts Neues. Rechner mit Mikrofon (eingebaut reicht).
**Kopfhörer** lohnen sich im Live-Modus — sonst hört das Mikrofon seine
eigene Stimme mit.

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
npm install               # einmalig, holt nur "ws" (für den Live-Modus)
node server.js --demo     # erst mal gucken: nichts wird wirklich getan
```

Browser öffnen: **http://localhost:3400** → **Live** drücken und einfach
reden. Oder Mikrofon anklicken / Leertaste halten, wenn du lieber pro Satz
entscheidest.

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

### Live-Modus — reden wie mit einem Menschen

Knopf **Live** oben rechts. Dann läuft das Mikrofon durch:

- Du redest, er hört mit — noch während du sprichst steht der Text da.
- Er antwortet **satzweise**: der erste Satz wird gesprochen, während er den
  Rest noch schreibt. Kein Warten auf den ganzen Block.
- **Dazwischenreden unterbricht.** Sobald du zwei Wörter sagst, ist er still,
  wirft den laufenden Auftrag weg und hört dir zu. Ein „ähm" reicht nicht —
  sonst würde er sich am eigenen Echo verschlucken.
- „Stopp" wirkt sofort, ohne dass die KI überhaupt gefragt wird.

**Die Kugel** übernimmt dabei den Bildschirm — wie bei ChatGPT, nur in
Kurani-Farben. Sie ist keine Deko, sondern ein Messgerät:

| Was du siehst | Was es heißt |
|---|---|
| Blau, wächst mit deiner Stimme | er hört dich — wenn sie stillsteht, kommt nichts am Mikrofon an |
| Orange mit wanderndem Bogen | er arbeitet gerade (unten steht, in welchem Ordner) |
| Grün, pulst im Takt der Antwort | er spricht |

Darunter läuft mit, was gerade gehört oder gesagt wird. Die volle Mitschrift
holst du mit dem Knopf **Verlauf** nach vorn.

Für Live gilt: **Kopfhörer sind besser als Lautsprecher.** Ohne Kopfhörer
hört das Mikrofon seine eigene Stimme mit; die Echo-Unterdrückung des
Browsers fängt das meist ab, aber nicht immer.

Ohne Deepgram-Schlüssel funktioniert Live auch — dann hört Chrome selbst
durchgehend zu. Etwas ungenauer, kostet nichts.

**Freihand** (der Knopf daneben) ist die kleine Variante: er hört zu, wartet
auf das Satzende, antwortet, lauscht wieder — aber ohne Unterbrechen.
Gedacht für Hände-voll-Situationen, wenn Live zu gesprächig ist.

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

### Zugriff auf alles

Standardmäßig sieht der Assistent nur den Arbeitsordner. Wenn er überall
rankommen soll — Downloads, Desktop, Kundenordner, alles —, in die `.env`:

```
SPRACH_ALLES=ja                                  # das ganze Benutzerverzeichnis
SPRACH_ZUSATZ_ORDNER=~/Kurani,~/Downloads        # oder gezielt nur diese
```

Damit kann er Dateien überall lesen und schreiben. Zusammen mit „Freie Hand"
hat er dann faktisch deine Rechte — das ist genau die Ansage „Zugriff auf
alles", aber sag nicht, ich hätte es nicht dazugeschrieben: eine verhörte
Anweisung trifft dann auch Ordner, an die du gerade nicht denkst. Mein Rat:
`SPRACH_ALLES=ja` ja, „Freie Hand" nur wenn du dabeisitzt.

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

## 6. Instagram

Ist ein `INSTAGRAM_TOKEN` eingetragen, kann der Assistent dein Konto lesen
und bedienen — per Sprache:

- „Wie lief das letzte Reel?" → Aufrufe, Likes, Speicherungen, vorgelesen
- „Was schreiben die Leute drunter?" → Kommentare
- „Antworte dem: danke dir, kommt bald mehr" → Antwort unter den Kommentar
- „Poste das Reel mit dem Text …" → veröffentlicht (liest den Text vorher vor)

Von Hand geht dasselbe:

```bash
node instagram.js konto            # Follower, Anzahl Beiträge
node instagram.js zahlen           # letztes Reel im Detail
node instagram.js kommentare       # Kommentare drunter
node instagram.js antworte <id> "danke dir!"
node instagram.js poste https://…/reel.mp4 "Neue Karte für La Piazza"
```

**Einrichten (einmalig, ~15 Minuten):**

1. Instagram-Konto auf **Profi-Konto** umstellen (Business oder Creator) —
   in der Instagram-App unter Einstellungen → Kontotyp.
2. Auf **developers.facebook.com** eine App anlegen (Typ „Business").
3. Produkt **Instagram** hinzufügen → *Instagram-API mit Instagram-Login*.
4. Dein Konto verbinden und einen **langlebigen Zugriffs-Token** erzeugen
   (gilt 60 Tage, danach verlängern).
5. Den Token in `sprachassistent/.env` eintragen: `INSTAGRAM_TOKEN=…`

**Grenzen, ehrlich gesagt:**

- Es geht über die **offizielle Schnittstelle**. Kein Roboter, der sich als
  du einloggt — das wäre gegen Instagrams Regeln und kostet im Zweifel den
  Account.
- **Stories und DMs** gibt die Schnittstelle nicht her (DMs nur eingeschränkt
  über eine separate Freigabe). Feed-Posts, Reels, Kommentare und Zahlen: ja.
- Beim Posten **holt sich Instagram das Video** — es muss also unter einer
  öffentlichen Adresse liegen (Netlify oder Supabase-Storage reichen).
- Läuft der Token ab, sagt der Assistent genau das, statt zu raten.

## 7. Was es kostet

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

## 8. Mitschrift

Jeder Auftrag landet als eine Zeile in `protokoll/JJJJ-MM-TT.jsonl`:
Frage, Antwort, Ordner, Stufe, Kosten, Dauer. Damit du abends nachlesen
kannst, welche Rechnung er morgens „rausgeschickt" hat. Bleibt lokal, ist
gitignored.

---

## 9. Wenn was klemmt

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

## 10. Datenschutz

Mit Schlüsseln gehen deine Aufnahmen an Deepgram und der Antworttext an
ElevenLabs — dieselben Dienste, die schon am Telefon-Retter hängen. Ohne
Schlüssel bleibt beides im Browser. Der eigentliche Auftrag geht in jedem
Fall an Claude, wie bei Claude Code auf der Kommandozeile auch. Kundendaten
also mit demselben Kopf behandeln wie sonst.
