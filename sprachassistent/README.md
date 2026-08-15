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

**Beim allerersten Mal: `einrichten.command` doppelklicken.** Danach immer
`start.command`.

Das Einrichten legt an, was fehlt (`.env`, `ordner.json`), sucht deine
Kurani-Unterlagen und dein CM und sagt am Ende, ob noch etwas klemmt. Es
überschreibt **nichts**, was schon da ist, und trägt den CM-Pfad nur nach
Rückfrage ein. Zweimal ausführen schadet nicht.

`ordner.json` entsteht dabei nur mit den Ordnern, die es auf **deinem**
Rechner wirklich gibt — die Vorlage blind zu kopieren würde sonst drei
Fehler melden, obwohl nichts kaputt ist. Was übersprungen wurde, steht in
der Ausgabe.

**Danach: `start.command` doppelklicken.** Das holt beim ersten Mal die eine
Abhängigkeit, prüft sich selbst durch und macht den Browser auf. (Beim
allerersten Start meckert macOS: Rechtsklick → **Öffnen** → **Öffnen**.
Danach reicht Doppelklick.)

Soll er beim Anmelden von selbst starten: Systemeinstellungen →
Allgemein → Anmeldeobjekte → `start.command` hinzufügen.

Lieber im Terminal:

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

**Wenn etwas klemmt, frag ihn selbst.** Zwei Werkzeuge, je nach Lage:

```bash
node pruefe.js      # sind alle Zutaten da? (vor dem Start)
node arzt.js        # wo haengt es? (während er läuft)
node schluessel.js  # welche Schlüssel gehen — und welche nicht
```

`arzt.js` schickt eine echte Frage durch den laufenden Server und sagt, an
welchem Glied der Kette sie steckenbleibt — läuft der Server, antwortet er,
kommt eine Antwort, wie lange dauert sie, und welche Stimme spricht. Am Ende
steht ein Satz, was zu tun ist, statt eines Stacktrace.

Das geht alles durch — Node, Claude Code, Schlüssel, Ordner, Schreibrechte,
Port — und sagt in Klartext, was fehlt und was zu tun ist:

```
  ok Claude Code: 2.1.233
  !! Ordner buero: Gibt es nicht: /Users/ibo/Kurani/Buero
        -> Pfad in ordner.json anpassen - oder den Eintrag loeschen.
  -- Stimme: Kein ElevenLabs-Schluessel - die Browser-Stimme spricht
```

Schlüssel-Werte gibt die Prüfung nie aus, nur ob sie da sind — die Ausgabe
landet schnell mal in einem Screenshot.


---

## 3. Wie du mit ihm redest

Ganz normal. Beispiele:

- „Schreib eine Rechnung für La Piazza über 350 Euro für die Speisekarte."
- „Was steht diese Woche an?"
- „Im Dashboard kommen die Reservierungen nicht an — guck mal, woran das liegt."
- „Was hab ich bei Greetsieler Börse noch offen?"
- „Schneid aus dem Rohmaterial ein Reel, 20 Sekunden."

Diese Sätze sind fest verdrahtet — die machen jedes Mal dasselbe, egal wie
du sie genau formulierst:

| Du sagst | Was er macht |
|---|---|
| „Moin" / „Tagesbericht" | **der ganze Tag in fünf Sätzen** — siehe unten |
| „Offene Posten" | unbezahlte Rechnungen mit Betrag und Alter (kurani-docs) |
| „Was steht an?" | die Woche laut kurani-roadmap, plus nächster Schritt |
| „Wie lief das letzte Reel?" | Instagram-Zahlen, mit einem Satz Einordnung |
| „Feierabend" | was heute lief — für Stundenzettel und Rechnungen |
| „Merk dir …" / „Erinner mich …" | Notiz bzw. Erinnerung, **ohne KI, ohne Kosten** |
| „Schreib mit" … „Diktat Ende" | Diktat: alles wandert wörtlich in eine Datei |
| „… im Hintergrund" | arbeitet nebenbei weiter, meldet sich wenn fertig |
| „Was läuft gerade?" | zählt die Hintergrund-Aufträge auf |
| „Wie geht's der Agentur?" / „Wer ist rot?" | Kundenampel, fehlende Reports, Pipeline |
| **„Ich ruf gleich La Piazza an"** | Briefing: wer, welche Zahl du bringst, was schiefläuft, was du verkaufst |
| **„Was ist mit La Piazza?"** | was dein CM über den Kunden weiß |
| **„Wer ist fällig?"** | offene Wiedervorlagen aus deinem CM, mit Namen |
| **„Guck dir das an"** | macht ein Bildschirmfoto und sagt dir, was er sieht |
| **„Merk dir dauerhaft …"** | gilt ab dann in **jedem** Auftrag |
| **„Mach das fertig"** | aus dem eben Diktierten wird das echte Dokument |
| **„Beweis"** / „Was hat mein Geld gebracht?" | was der Kunde für sein Geld bekommen hat |
| **„Saison"** / „Grünkohl" | was JETZT verkauft werden muss, damit es rechtzeitig fertig ist |
| **„Wen soll ich anrufen?"** | die nächsten Adressen mit Nummer, aus `prospects.json` |

### Der Beweis-Zettel — gegen die stille Kündigung

Ein Wirt zahlt 199 Euro im Monat und **sieht nichts**. Nach drei Monaten fragt
er sich, wofür — und kündigt. Nicht weil es schlecht war, sondern weil es ihm
keiner gezeigt hat.

```bash
node beweis.js                    # Kurzfassung für alle Kunden
node beweis.js "la piazza"        # ein Kunde, zum Vorlesen
node beweis.js "la piazza" --html # das Blatt zum Ausdrucken/Mailen
```

> „Im August hat der Telefon-Retter 18 Reservierungen für 61 Gäste und
> 7 Bestellungen über 215 Euro entgegengenommen — Anrufe, bei denen sonst
> niemand rangegangen wäre. Das sind geschätzt rund 1.740 Euro Umsatz.
> Die Sichtbarkeit steht bei 68 Prozent, im Mai waren es 41."

Das Blatt ist bewusst nüchtern: große Zahlen, wenig Text, druckbar.

**Zwei Regeln, die im Code festgeschrieben sind:**

1. **Nichts erfinden.** Fehlt eine Zahl, steht sie nicht da — der Zettel sagt
   dann, dass sie fehlt.
2. **Schätzung bleibt Schätzung.** „Gerechnet mit 25 Euro pro Gast — eine
   Annahme, keine Messung" steht mit drauf. Wer damit trickst, fliegt beim
   ersten kritischen Wirt auf, und zu Recht. (Gast-Wert ändern:
   `SPRACH_GAST_WERT=30`.)

Und: **ein Rückgang steht als Rückgang da.** Wenn die Sichtbarkeit gefallen
ist, schreibt der Zettel „gefallen" — sonst ist er nichts wert.

### „Saison" — der Vorlauf, an dem das Geld hängt

Das teuerste Missverständnis im Gastro-Jahr ist der Vorlauf. Der **Grünkohl
läuft von November bis Februar — vergeben werden Karten, Plakate und
Gruppen-Aktionen im September.** Wer im November anruft, hört „haben wir
schon".

Deshalb rechnet er rückwärts: nicht *wann ist es soweit*, sondern **ab wann
muss ich darüber reden**. Sobald ein Vorlauf beginnt, steht es im
„Moin"-Bericht:

```
  Saison: Gruenkohl- und Kohlfahrt-Saison in 11 Wochen.
```

Drin sind die Anlässe, die in Ostfriesland zählen: Grünkohl/Kohlfahrt,
Weihnachtsfeiern, Silvester, Saisonstart an der Küste, Ostern, Muttertag,
Pfingsten, Sommerferien — und das **Saisonende**, weil das Winterpreis-Gespräch
geführt werden muss, *bevor* der Wirt von sich aus kündigt.

Ostern und Pfingsten rechnet er selbst aus (Gauß-Formel), sonst müsste man die
Liste jedes Jahr pflegen — und genau das vergisst man.

```bash
node saison.js        # was gerade im Vorlauf ist
```

### „Wen soll ich anrufen?" — Markt aus deinen eigenen Daten

Grundlage ist `prospects.json` (der OSM-Importer). Jedes Segment hat zwei
Noten, **offen im Code samt Begründung**:

| Segment | Kiek mol in | Telefon-Retter |
|---|---|---|
| Restaurant / Fisch / Griechisch | 3 | 3 |
| Pizzeria | 2 | **3** — Telefonbestellung *ist* das Geschäft |
| Café | 2 | 2 |
| Döner / Imbiss | 1 | 2 — Laufkundschaft |

Die Anrufliste sortiert nach: braucht beide Produkte **und hat keine Website**.

```bash
node markt.js            # Segmente, Orte, Lücken
node markt.js anrufe     # die nächsten Anrufe mit Nummer
```

### „Mach das fertig" — vom Gesagten zum fertigen Dokument

Der wichtigste Satz im Alltag. Du hast diktiert oder erzählt, jetzt soll was
Richtiges draus werden:

> „Schreib mit, Termin Greetsieler Börse." … „Diktat Ende."
> „**Mach das fertig** — als Angebot."

Er nimmt das Diktat (oder das, worüber ihr gerade geredet habt), gibt es an
Claude Code weiter und **das Dokument selbst** kommt raus — kein
Zusammenfassungs-Zettel. Welche Art, entscheidet er aus dem Inhalt:

| Inhalt | Skill | Ergebnis |
|---|---|---|
| Preise, Leistungen | `kurani-docs` | Angebot / Rechnung als .docx |
| Schild, Plakat, Folie | `kurani-design` | Briefing mit Specs |
| Reel, Dreh | `kurani-content` | Drehplan / Shotlist |
| Speisekarte | `menumaker` | .docx mit Allergenen |

Abgelegt wird dort, wo der Kunde schon liegt — in deinen Kurani-Unterlagen,
nicht irgendwo. **Was er nicht weiß, erfindet er nicht**: fehlt ein Preis oder
ein Datum, bleibt eine markierte Lücke und er sagt sie dir am Ende.

### Zugriff auf deine Kurani-Unterlagen

Er sucht sie beim Start selbst — `~/Kurani`, `~/Documents/Kurani`, iCloud —
und gibt sie frei. Keine Pfade eintippen.

**Deine `CLAUDE.md`-Dateien sind dabei das Wichtigste.** Was du dort für einen
Kunden oder ein Projekt aufgeschrieben hast, ist die Hausordnung — er liest
sie, **bevor** er für den Kunden arbeitet. Sagst du etwas, das dauerhaft für
diesen Kunden gilt, hängt er es dort an (nie überschreiben) und sagt dir in
einem Halbsatz Bescheid.

Was gefunden wurde, steht beim Start und in `node pruefe.js`:

```
  ok Kurani-Unterlagen: 2 Ordner, 7 CLAUDE.md
```

### Warum er jetzt sofort antwortet

Gemessen mit `node zeitmessung.js`: **4,2 Sekunden** bis zum ersten Wort — für
„Sag Moin."

Die Zeit ging nicht ans Denken, sondern an den Start. Claude Code fährt bei
*jedem* Satz den ganzen Werkzeugkasten hoch: Hooks, Plugins, MCP-Server,
deine `CLAUDE.md`-Dateien, alle Skills. Für „schreib die Rechnung für La
Piazza" ist das genau richtig. Für „Moin" ist es absurd.

Also zwei Wege:

| | Womit | Erstes Wort |
|---|---|---|
| **Reden** | direkt ans Modell, ohne Werkzeuge | **unter 1 Sekunde** |
| **Arbeiten** | Claude Code mit allem | ein paar Sekunden |

Entschieden wird **vorher am Satz**, nicht vom Modell — eine Rückfrage wäre
schon wieder eine Sekunde. „Moin", „wie meinst du das", „danke" gehen
sofort. Alles mit „schreib…", „mach…", „guck dir…" und jede Frage nach Geld
oder Rechnungen nimmt den gründlichen Weg.

**Die Weiche darf sich nur in eine Richtung irren.** Im Zweifel langsam: eine
erfundene Antwort in einer halben Sekunde wäre schlimmer als zwei Sekunden
warten. Deshalb geht sogar „erklär mir, was ein Kostenvoranschlag ist" zum
gründlichen Weg — das Wort allein reicht. Und der schnelle Kopf weiß, dass er
keine Werkzeuge hat: er sagt *„das mach ich — sag es nochmal mit 'mach'
davor"*, statt zu behaupten, er hätte etwas erledigt.

**Das Lagebild.** Damit die häufigsten Alltagsfragen trotzdem schnell gehen,
sammelt er im Hintergrund ein, was ohnehin auf der Platte liegt: Datum und
Uhrzeit, das Wetter, deine Liste für heute, fällige Wiedervorlagen, rote
Kunden. Das steht schon im Kopf, wenn du fragst — also kommt „wie wird das
Wetter" und „was steht heute an" in unter einer Sekunde, **mit echten
Zahlen**.

Voraussetzung ist ein `ANTHROPIC_API_KEY` (liegt meist schon in
`sichtbarkeit/.env`). Ohne ihn läuft alles wie vorher, nur langsamer — die
Startmeldung sagt dir, welcher Weg gilt:

```
  Reden:    direkt (erstes Wort in unter einer Sekunde)
```

Was das **nicht** ist: ein Ersatz für Claude Code. ChatGPTs Sprachmodus
antwortet in einer halben Sekunde und kann dafür nicht deine Rechnung
schreiben. Hier gibt es beides — jedes auf seinem Weg.

### Die Stimme aussuchen — mit dem Ohr

Die Stimme ist der Teil, den du am meisten hörst. Es gibt drei Wege, und der
Unterschied ist groß:

| Weg | Klang | Kosten |
|---|---|---|
| **ElevenLabs** | wie ein Mensch | braucht Schlüssel, kostet |
| **macOS** | sehr ordentlich, mit den Premium-Stimmen richtig gut | **nichts** |
| Browser | blechern | nichts |

Der mittlere Weg wird meist übersehen. In deinem Mac stecken gute deutsche
Stimmen — du musst sie nur aussuchen:

```bash
node stimmen.js hoeren     # spielt alle deutschen nacheinander vor
node stimmen.js nimm 3     # die dritte gefällt dir? Fertig.
```

Danach Server neu starten. Das war's — die Wahl landet in der `.env`, deine
Schlüssel bleiben dabei unangetastet.

```bash
node stimmen.js            # was auf diesem Rechner zur Verfügung steht
node stimmen.js probe Anna # eine einzelne anhören
node stimmen.js browser    # zurück zur Browser-Stimme
```

**Wie schnell und wie sanft** sind zwei verschiedene Sachen — eine Stimme
kann zügig und trotzdem sanft sein. So redet jemand, der weiß, was er sagen
will. Deshalb zwei getrennte Knöpfe:

```bash
node stimmen.js tempo       # dreimal derselbe Satz, unterschiedlich schnell
node stimmen.js tempo 215   # zügiger

node stimmen.js sanft       # gleiches Tempo, unterschiedlich sanft
node stimmen.js stil ruhig  # gleichmäßiger betont
```

Das Tempo sind Wörter pro Minute (Standard 190). Die Sanftheit ist, wie
gleichmäßig sie betont — `lebhaft` betont stark und wirkt unruhig, `ruhig`
ist sehr gleichmäßig. **Die Sanftheit wirkt nur bei ElevenLabs**; die
Mac-Stimmen können nur Tempo.

Beim ElevenLabs-Modell wird zwischen Klang und Wartezeit getauscht:
`flash` ist am schnellsten und klingt am härtesten, `multilingual` klingt am
besten und man wartet darauf. Der Assistent nimmt **`turbo`** — schnell und
trotzdem gut. Ein Gespräch lebt davon, dass die Antwort kommt; eine Stimme,
auf die man wartet, ist keine gute Stimme, egal wie schön sie klingt.

**Bessere Mac-Stimmen nachladen** (einmalig, dauert ein paar Minuten):
Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme
→ Anpassen → Deutsch → die mit **„Premium"** laden. Danach tauchen sie in
`node stimmen.js` auf.

Hast du einen ElevenLabs-Schlüssel in der `.env` (oder in
`telefon-retter/.env`), stehen dessen Stimmen mit in derselben Liste — dann
suchst du dort genauso aus.

Was gerade spricht, steht unten im Fenster und in `node pruefe.js`.

### Das Anruf-Briefing — zwanzig Sekunden, bevor du wählst

Du rufst einen Kunden an und weißt im ersten Satz nicht mehr, worüber ihr
zuletzt geredet habt. Alles, was du bräuchtest, liegt schon auf der Platte —
nur an vier Stellen: im CM, in der Agentur-Ampel, in den Monatszahlen und im
Saison-Kalender.

> „Ich ruf gleich La Piazza an." · „Briefing Deichkrone" · „Bereite den Anruf
> bei Nordsee-Grill vor."

```
La Piazza, hat Telefon-Retter + Sichtbarkeit, 199 Euro im Monat, seit 4 Monaten dabei.
Zuletzt geredet: vor 2 Monaten.
Aufhänger: seine Sichtbarkeit ist von 38 auf 41 hoch. Die Zahl kannst du bringen.
Vorsicht: die Wiedervorlage war vor 5 Wochen — du bist spät dran, das merkt er.
Vorschlag: Grünkohl-Saison — in 11 Wochen ist es soweit.
Beim letzten Mal ging es um: neue Speisekarten, Budget ca. 400.
```

Auf der Kommandozeile: `node briefing.js la piazza` (mit Telefonnummer),
`--sprich` für die Vorlese-Fassung, `--json` für die Daten.

Es liest nicht alles vor, sondern beantwortet vier Sachen:

- **Wer** — mit wem redest du, was hat er, seit wann.
- **Aufhänger** — die **eine** Zahl, mit der du reingehst. Gestiegene
  Sichtbarkeit schlägt alles; gibt es die nicht, die nächstbeste echte Zahl.
- **Vorsicht** — das eine, was schiefläuft, in der Reihenfolge, in der es weh
  tut: gefallene Sichtbarkeit, rote Ampel, fehlender Report, überfällige
  Wiedervorlage, langes Schweigen.
- **Vorschlag** — was saisonal jetzt dran ist, plus das, was er sich beim
  letzten Mal selbst gewünscht hat.

**Es erfindet nichts.** Ist die Sichtbarkeit gefallen, wird kein Anstieg
behauptet — dann steht der Rückgang unter „Vorsicht" und du sprichst ihn
selbst an, bevor er es tut. Gibt es gar keine Zahlen, sagt es: *„frag ihn, wie
es läuft, statt etwas zu behaupten."* Und läuft alles rund, fehlt der
Warnsatz ganz — ein Briefing, das immer warnt, wird nach zwei Wochen
überhört.

Steht der Kunde nicht im CM, reichen auch die Reports allein. Steht er
nirgends, sagt es genau das.

### Dein CM — er liest deine Kundenverwaltung

Du führst deine Kunden in deinem eigenen CM, das bei dir auf dem Rechner
läuft. Das ist die Wahrheit darüber, wer Kunde ist und was vereinbart wurde —
also soll er da hineinschauen, statt dich nach Sachen zu fragen, die dort
schon stehen.

> „Was ist mit La Piazza?" · „Wer ist fällig?" · „Wen hab ich lange nicht
> gehört?" · „Kundenliste"

Auf der Kommandozeile geht dasselbe:

```bash
node crm.js                    # kurzer Stand
node crm.js kunde la piazza    # was das CM über einen Kunden weiß
node crm.js faellig            # offene Wiedervorlagen, mit Nummer
node crm.js still              # von wem seit über zwei Monaten nichts kam
node crm.js quellen            # WO er gesucht hat und was er gefunden hat
```

**Er muss nicht wissen, wie dein CM innen aussieht.** Er sucht von allein in
`~/CRM`, `~/CM`, `~/Kurani` und `~/Projekte`, liest JSON, JSONL und CSV — und
ordnet die Spalten selbst zu. Ob die Spalte `telefon`, `Telefonnummer` oder
`phone` heißt, ist ihm egal; ein deutsches Datum (`12.06.2026`) rechnet er um,
und `149,00 EUR` liest er als Zahl. Was er **nicht** sicher erkennt, lässt er
leer, statt zu raten: steht im Feld „letzter Kontakt" ein Name statt eines
Datums, bleibt das Feld leer.

Findet er nichts, sagt `node crm.js quellen`, wo er gesucht hat. Dann trägst
du es einmal in die `.env` ein:

```bash
SPRACH_CRM=~/CRM/kunden.json                  # eine Datei
SPRACH_CRM=~/CRM                              # ein ganzer Ordner
SPRACH_CRM=http://localhost:3000/api/kunden   # dein CM, während es läuft
```

Läuft dein CM als Programm mit eigener Adresse, fragt er die ab — mit kurzem
Zeitlimit, damit ein ausgeschaltetes CM nie den Tagesbericht aufhält.

Zwei Sachen bewusst so gebaut:

- **Er ändert im CM nichts.** Nur lesen. Eine Stimme, die sich verhört, soll
  keine Kundenakte umschreiben — eintragen tust du selbst.
- **Fällige Wiedervorlagen stehen morgens im Tagesbericht**, ohne dass du
  fragst. Aber nur, wenn wirklich etwas ansteht: läuft alles, kein Wort davon.

### „Guck dir das an" — er sieht deinen Bildschirm

Du bist Gestalter. Das Wichtigste liegt nicht in einer Datei, über die man
reden kann, sondern auf dem Schirm: das Plakat in Canva, der Schnitt in der
Timeline, die Karte im Layout. Also guckt er hin:

> „Guck dir das mal an." · „Sieh dir meinen Bildschirm an — stimmt der Abstand
> oben?" · „Was ist hier falsch?"

Er macht ein Foto vom Bildschirm (macOS kann das von Haus aus, kein
Zusatzprogramm), Claude sieht es sich an und antwortet gesprochen. Geht es um
Gestaltung, nimmt er **`kurani-taste`** und nennt die zwei, drei Sachen, die
es am meisten heben — konkret, nicht „mach es hochwertiger".

- Ein Foto entsteht **nur auf diese Ansage hin**. Nichts läuft im Hintergrund mit.
- Die Bilder bleiben lokal in `bildschirm/` (gitignored), es werden nur die
  letzten acht behalten.
- Beim ersten Mal fragt macOS nach der Freigabe: Systemeinstellungen →
  Datenschutz & Sicherheit → **Bildschirmaufnahme** → Terminal. Fehlt sie,
  sagt er genau das, statt ein schwarzes Bild zu schicken.

### Dauerhaftes Wissen — er lernt deine Bude kennen

Notizen sind Aufgaben. **Wissen** ist das, was du einer neuen Aushilfe
erklären würdest:

> „**Merk dir dauerhaft**: die Börse zahlt per Rechnung, nie bar."
> „**Grundsätzlich**: Plakate immer mit 3 Millimeter Beschnitt."

Das steht danach in **jedem** Auftrag im Systemtext — der Unterschied zwischen
einem Werkzeug, dem man alles dreimal erklärt, und einem Kollegen, der die
Bude kennt.

- „Was weißt du?" liest vor, was dauerhaft gilt
- „Vergiss dauerhaft: …" streicht es wieder
- Alles steht in `wissen.md` — **aufmachbar, lesbar, von Hand korrigierbar**.
  Ein Gedächtnis, in das man nicht reingucken kann, ist unheimlich.
- Wird es zu lang, gewinnt das Neueste (Kostenbremse: der Systemtext geht bei
  jedem Auftrag mit)

### Nebenbei arbeiten lassen

Ein Reel schneiden oder alle SEO-Seiten bauen dauert. Solange soll das
Gespräch nicht stillstehen:

> „Schneide das Reel **im Hintergrund**." · „Bau die SEO-Seiten, **sag
> Bescheid wenn du fertig bist**."

Er antwortet „Alles klar, ich mach das nebenbei" — und du redest weiter,
fragst was anderes, lässt dir was vorlesen. Ist er fertig, **meldet er sich
von selbst** mit dem Ergebnis in einem Satz.

- „**Was läuft gerade?**" zählt auf, was nebenher arbeitet (ohne KI, sofort)
- Meldungen kommen **nie mitten in eine laufende Antwort** — sie warten, bis
  er ausgeredet hat, gehen aber nicht verloren
- Fenster zu = Schluss: laufende Hintergrund-Aufträge werden abgeräumt,
  sonst kosten sie weiter Geld, obwohl niemand die Meldung hört

### Die Agentur auf Zuruf

Die Agentur-App (`agentur/`) bleibt, wie sie ist — der Assistent liest ihr nur
über die Schulter:

> „Wie geht's der Agentur?" · „Wer ist rot?" · „Welche Reports fehlen?"

- **Kundenampel** — dieselbe Bewertung wie in der App (`agentur/lib/gesundheit`
  wird wiederverwendet, zwei verschiedene Urteile über denselben Kunden wären
  schlimmer als keins)
- **Fehlende Monats-Reports** — wer hat für diesen Monat noch keinen
- **Neukunden-Pipeline** — offene Interessenten, fällige Wiedervorlagen, Termine

Alles **lesend und ohne Netz**: die Bewertung kommt aus den Report-Daten, die
ohnehin unter `sichtbarkeit/data/` liegen. Reports **erzeugen** macht weiter
die Agentur-App — das kostet Geld und dauert, also fragt er vorher.

Im „Moin"-Bericht taucht die Agentur nur auf, wenn es was zu tun gibt:
*„Agentur: 1 Kunde im roten Bereich (La Piazza), 2 Reports fehlen diesen
Monat, 1 Wiedervorlage fällig."*

```bash
node agentur.js            # Stand zum Vorlesen
node agentur.js kunden     # Liste mit Ampel je Kunde
```

### Die Wache: läuft kiekmolin.de noch?

An der Plattform hängen rund 25 Betriebe. Fällt sie aus, merkt es sonst der
Wirt zuerst — und ruft an. Der Assistent guckt im Live-Modus alle zehn
Minuten nach (Seite + Datenbank) und **meldet nur die Änderung**:

- Seite weg → „Achtung: Seite antwortet nicht — Antwort 503."
- Wieder da → „Entwarnung: Kiek mol in ist wieder erreichbar."
- Läuft alles → **Schweigen.** Alle zehn Minuten „alles gut" will keiner hören.

Im Tagesbericht taucht die Wache nur auf, wenn etwas klemmt. Abschalten mit
`SPRACH_WACHE_MINUTEN=0`, andere Adresse mit `SPRACH_WACHE_URL=`.

### Er merkt sich Sachen — ohne KI, ohne Kosten

Notizen laufen **nicht** über Claude. Der Server schreibt eine Zeile und
antwortet sofort — kostet nichts, geht auch ohne Netz:

| Du sagst | Was passiert |
|---|---|
| „Merk dir: La Piazza will die Karte bis Freitag" | Notiz mit Termin Freitag |
| „Erinner mich morgen um neun an den Anruf" | meldet sich morgen um 9 von selbst |
| „Was hab ich mir notiert?" | liest die Liste vor |
| „Erledigt: La Piazza" | hakt ab (Stichwort reicht, keine Nummer nötig) |

Zeitangaben versteht er auf Deutsch: *morgen, übermorgen, heute abend,
Freitag, nächste Woche, in drei Tagen, am 20.9., um halb… (naja, „um 9")*.
Ohne Zeitangabe wird es eine Notiz ohne Termin — die taucht im Tagesbericht
als „dazu X Notizen ohne Termin" auf.

**Fällige Erinnerungen meldet er von selbst** — im Live-Modus, einmal pro
Minute geprüft, jede genau einmal. Nie mitten in eine laufende Antwort.

Von Hand: `node notizen.js liste | heute | merk "…" | erledigt <id>`

### Diktat: mitschreiben statt ausführen

Beim Kunden, im Auto, auf der Leiter — da will man reden und hinterher den
Text haben, und **nicht**, dass eine KI anfängt Sachen zu tun.

- „**Schreib mit**, Termin Greetsieler Börse" → ab jetzt wandert jeder Satz
  wörtlich in eine Datei
- Alles dazwischen wird **nicht ausgeführt** — auch nicht „merk dir das mit
  den Maßen". Das ist der Punkt.
- „**Diktat Ende**" → speichert nach `diktate/2026-08-14_11-30_termin-….md`
  und sagt dir, wie viele Sätze es waren

### „Feierabend" — was war heute?

Die Frage, die man abends hat und morgen früh nicht mehr beantworten kann.
Er listet, was über den Assistenten lief, was abgehakt wurde und welche
Diktate entstanden sind — Grundlage für Stundenzettel und Rechnungen.

```bash
node tagesbericht.js abend        # von Hand, auch ohne Assistent
```

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
| Er findet dein CM nicht | `node crm.js quellen` zeigt, wo er gesucht hat → Pfad als `SPRACH_CRM` in die `.env`. |
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

Dein CM wird nur **gelesen**, und die Daten daraus bleiben auf dem Rechner —
in dieses Repository kommt nichts davon. Vorgelesen wird, was du gefragt hast;
was Claude davon zu sehen bekommt, ist der Ausschnitt, den `crm.js` ausgibt,
nicht die ganze Kundenliste.
