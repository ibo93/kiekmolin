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

Vier Sätze sind fest verdrahtet — die fragen jedes Mal dasselbe ab, egal wie
du sie genau formulierst:

| Du sagst | Was er macht |
|---|---|
| „Moin" / „Tagesbericht" | **der ganze Tag in fünf Sätzen** — siehe unten |
| „Offene Posten" | unbezahlte Rechnungen mit Betrag und Alter (kurani-docs) |
| „Was steht an?" | die Woche laut kurani-roadmap, plus nächster Schritt |
| „Wie lief das letzte Reel?" | Instagram-Zahlen, mit einem Satz Einordnung |

### „Moin" — der Tagesbericht

Sag morgens einfach **„Moin"**. Dann bekommst du gesprochen:

1. **Wetter** für Emden — gerade, Höchstwert, Regenrisiko, Wind
2. **Was das fürs Handwerk heißt**: „Gutes Wetter zum Drehen und für
   Außenmontage" oder „Zu kalt zum Folienkleben — die haftet unter acht Grad
   schlecht"
3. **Kiek mol in heute**: Reservierungen, Gäste, unbestätigte, Bestellungen,
   offene Rückrufe — live aus der Datenbank
4. **Was ansteht**: die Woche laut `kurani-roadmap`, offene Rechnungen aus
   `kurani-docs`
5. **Ein Satz**, was du zuerst anpacken solltest

Das Wetter kommt von **Open-Meteo — kein Konto, kein Schlüssel, kostenlos**.
Anderer Ort als Emden:

```
SPRACH_ORT=Greetsiel
SPRACH_KOORDINATEN=53.5028,7.1069
```

Von Hand geht der harte Teil auch ohne Assistent:

```bash
node tagesbericht.js          # Wetter + Zahlen von heute
node tagesbericht.js --json   # dasselbe als Daten
```

Fällt eine Quelle aus (kein Netz, keine Supabase-Schlüssel), sagt er das in
drei Worten und liefert den Rest — statt dass der ganze Bericht wegbleibt.
Für den Tagesbericht braucht er Stufe **Arbeiten** (Standard), weil er dafür
ein Programm startet.

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

### Ohne Kopfhörer, auf dem Mac

Lautsprecher an, Mikrofon offen — normalerweise hört sich der Assistent dabei
selbst zu und unterbricht sich am eigenen Echo. Deshalb läuft es hier im
**Gegensprech-Betrieb**, wie beim Funkgerät:

- Solange er spricht, geht **kein Ton vom Mikrofon nach draußen**. Sein Echo
  kann also gar nicht erst als „du hast geredet" ankommen.
- Trotzdem kannst du ihn unterbrechen: der Browser misst währenddessen selbst
  mit und vergleicht, was vom Mikrofon kommt, mit dem, was aus den
  Lautsprechern zurückschallt. Ist deine Stimme deutlich lauter als das Echo
  und bleibt sie es eine Viertelsekunde, macht er sofort die Leitung wieder
  auf und hört dir zu.
- Nach dem letzten Wort bleibt die Leitung noch 0,35 s zu — für den Nachhall
  im Raum.

**Nimm Chrome auf dem Mac.** Die Echo-Unterdrückung von Chrome ist die beste,
Safari kann kein `webm/opus` und die Browser-Erkennung dort ist launisch.
Beim ersten Start fragt macOS nach dem Mikrofon: *Systemeinstellungen →
Datenschutz & Sicherheit → Mikrofon → Chrome*. Wenn er dich trotzdem nicht
hört, guck auf die Kugel: bleibt sie beim Sprechen völlig ruhig, kommt am
Mikrofon nichts an — dann ist in *Ton → Eingang* das falsche Gerät gewählt.

Findet der Server `claude` nicht (Homebrew legt es woanders ab), in die `.env`:
`SPRACH_CLAUDE_BEFEHL=/opt/homebrew/bin/claude`.

### Weckwort: er schläft, bis sein Name fällt

Ein offenes Mikrofon im Laden heißt sonst: jedes Wort geht an die KI — auch
das Kundengespräch und das Telefonat nebenan. Deshalb schläft er und hört nur
auf **„Kurani"**:

- „Hey Kurani, schreib eine Rechnung für La Piazza" → er macht es.
- Nur „Kurani?" → er sagt „Ja?" und wartet auf den Auftrag.
- Alles andere: wird verworfen, erscheint nicht mal auf dem Bildschirm.
- Nach seiner Antwort bleibt er **25 Sekunden wach** — Nachfragen („und
  dasselbe für Mai?") brauchen kein zweites „Kurani".
- Getippt wird nie geschlafen: was du ins Feld schreibst, gilt sofort.

Abschalten oder ändern: `SPRACH_WECKWORT=` (leer = reagiert auf alles) bzw.
`SPRACH_WECKWORT=chef`, Nachlauf über `SPRACH_NACHLAUF=25`.

**Die Kugel** übernimmt dabei den Bildschirm — wie bei ChatGPT, nur in
Kurani-Farben. Sie ist keine Deko, sondern ein Messgerät:

| Was du siehst | Was es heißt |
|---|---|
| Grau, atmet langsam | er schläft — sag „Kurani" |
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
SPRACH_MODELL=sonnet         # schnell und günstig; "opus" ist gründlicher, teurer
SPRACH_BUDGET_USD=3          # Notbremse je Auftrag; leer = kein Deckel
SPRACH_TAGESLIMIT_USD=10     # Notbremse für den ganzen Tag
```

Unten in der Fußzeile steht immer, was heute schon zusammengekommen ist. Ist
das Tageslimit erreicht, sagt er das und macht Schluss — statt still
weiterzulaufen.

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
