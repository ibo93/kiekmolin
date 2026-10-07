# Telefon-Retter v2 — Arbeitsregeln, Architektur, Entscheidungen

Diese Datei wird zu Beginn jeder Sitzung gelesen und bei jeder Entscheidung
aktualisiert. Die Regeln der Kiek-mol-in-`CLAUDE.md` im Wurzelordner gelten
hier genauso (erst messen, kein „behoben“ ohne Beleg, stille Ausfälle …).

**Was das ist:** Ein KI-Agent geht für Restaurants ans Telefon, nimmt
Bestellungen und Reservierungen an und legt alles in einer iOS-App für den
Wirt ab. Kompletter Neubau — aus `telefon-retter/` (v1) wird **kein Code**
übernommen, nur Erfahrungen.

**Für wen ich schreibe:** Ibo ist Designer, kein Vollzeit-Entwickler.
Entscheidungen kurz und verständlich erklären. Bei mehreren Wegen: einen
empfehlen, nicht drei hinwerfen.

---

## Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Stack-Vergleich + Kosten, Architektur, Datenbankschema, diese Datei | **läuft** |
| 1 | Supabase-Schema + iOS-Grundgerüst (Login, Dashboard, Listen) | wartet auf OK |
| 2 | Voice-Agent end-to-end an Testnummer, Beispielkarte als JSON | – |
| 3 | Einstellungen, Anrufprotokoll, Push, Pause, Weiterleitung, SMS, Admin | – |
| 4 | WhatsApp über denselben Agenten | – |
| 5 | Auswertung, Sprachen, Stammkunden, Bondrucker, TestFlight | – |

**Nach jeder Phase: stoppen, zeigen was läuft, auf Ibos OK warten.**

---

## Regeln dieses Projekts

1. **Preise rechnet nur die Datenbank.** Der Agent nennt nie einen Betrag,
   den nicht eine Datenbank-Funktion geliefert hat. Die Zusammenfassung am
   Ende („2× Pizza Salami groß … zusammen 27,50 €“) wird aus den
   gespeicherten Daten als Vorlage erzeugt — nicht vom Sprachmodell frei
   formuliert. Ein erfundenes Gericht kann gar nicht erst im Warenkorb landen.
2. **KI-Hinweis im ersten Satz.** Jede Begrüßung beginnt mit dem Hinweis,
   dass hier eine KI spricht (EU AI Act Art. 50). Der Wirt kann den Text
   ändern, aber den Pflichtsatz nicht entfernen. Ein Test prüft das.
3. **Jede Tabelle hat `tenant_id` und Row Level Security.** Tests laufen
   mit echten Rollen: Inhaber von Betrieb A sieht von Betrieb B *nichts* —
   und eine leere Liste wegen fehlender Rechte muss als Fehler sichtbar
   werden, nicht als „keine Bestellungen“.
4. **Keine Fake-Daten im Produkt.** Testdaten nur in `supabase/seed/`, in
   einem als Test markierten Betrieb (`is_test = true`).
5. **Keine Schlüssel im Code.** Server: `.env` (nur `.env.example` wird
   eingecheckt). iOS: Keychain. Edge Functions: Supabase Secrets.
6. **Keine stillen Abstürze.** Jeder Fehler wird mit Anruf-ID protokolliert.
   Geht im Gespräch etwas schief, fällt der Agent auf eine Rückrufbitte
   zurück — nie auf Schweigen oder Auflegen.
7. **Datenschutz als Grundeinstellung.** Aufnahme aus, Transkript an mit
   Löschfrist. Beides pro Betrieb abschaltbar. Nur speichern, was für
   Bestellung/Reservierung nötig ist.
8. **iOS ist erst fertig mit Simulator-Bild.** iOS 27, hell und dunkel,
   iPhone und iPad, im Chat gezeigt. **iOS-Arbeit gehört in eine lokale
   Sitzung auf Ibos Mac** — nur dort gibt es das iOS-Simulator-Fenster der
   Claude-App, in dem Ibo live zusieht (so will er es, 01.10.2026). In einer
   Cloud-Sitzung gibt es nur Bilder vom GitHub-Mac; dann muss `STAND.md` im
   Zweig `simulator-bilder` genau den Commit nennen, über den wir reden.
9. **Ein Gehirn, viele Kanäle.** Telefon, Text-Simulator und später
   WhatsApp nutzen denselben Dialog-Kern (Werkzeuge, Regeln, Texte). Die
   ≥ 20 Testgespräche laufen automatisch gegen diesen Kern.
10. **Test erst rot, dann grün.** Jeden neuen Test einmal mit eingebautem
    Fehler laufen lassen und sehen, dass er anschlägt.

---

## Was ich messen kann — und was nicht

| kann ich | kann ich **nicht** |
|---|---|
| Quelltext, Tests, GitHub-Läufe | echte Telefonanrufe führen oder hören |
| iOS bauen + Simulator-Bilder über den GitHub-Mac | den Simulator live bedienen (nur Bilder) |
| Supabase-Protokolle (sobald das Projekt existiert) | Ibos iPhone, sein Xcode, seine Konten |
| Preise auf öffentlichen Seiten (teils gesperrt) | Verträge/Preise hinter einem Login |

**Wo läuft die Sitzung?** Das entscheidet, was beim iOS-Teil geht:

| | lokale Sitzung auf Ibos Mac | Cloud-Sitzung (Linux) |
|---|---|---|
| Xcode, `xcodebuild`, `simctl` | ja | **nein** |
| iOS-Simulator-Fenster in der Claude-App (live, Claude bedient es) | **ja** — „Simulator verbinden“ | nein |
| Simulator-Bilder | direkt | über den GitHub-Mac, ~10 Min |

Darum: **iOS-Phasen lokal auf dem Mac**, Datenbank/Agent/Doku gehen auch in
der Cloud. Als Netz für jede Sitzung baut `.github/workflows/ios-simulator.yml`
die App bei jedem Push auf einem GitHub-Mac (Runner `xcode-27`) und legt
Bilder in den Zweig `simulator-bilder`. Das Repo ist öffentlich, die
Mac-Minuten kosten nichts. Am 01.10.2026 gemessen: Lauf 2 grün, iPhone 18 Pro
und iPad Pro 13″ mit iOS 27.0, Xcode 27.0 (27A266a). Noch offen: auf dem iPad
greift die 9:41-Statusleiste nicht, und die Systemsprache steht auf Englisch.

---

## Ordnerstruktur

```
telefon-retter-v2/
├── CLAUDE.md                  diese Datei
├── docs/
│   ├── phase-0-stack.md       Stack-Vergleich, Kosten, Latenz — mit Quellen
│   ├── architektur.md         Diagramm und Abläufe
│   ├── datenbank.md           das Schema in Worten
│   └── recht.md               Recht & Datenschutz, Liste für den Anwalt
├── supabase/
│   ├── schema-entwurf.sql     Phase 0: Entwurf, NICHT eingespielt
│   ├── migrations/            ab Phase 1
│   ├── functions/             Edge Functions (Push, SMS, Onboarding)
│   ├── seed/                  Testbetrieb mit Beispielkarte
│   └── tests/                 RLS- und Funktionstests
├── agent/                     ab Phase 2: der Voice-Agent
│   ├── kern/                  Dialog-Kern: Werkzeuge, Regeln, Texte
│   ├── telefon/               Audio: Telefonie ↔ Spracherkennung/KI/Stimme
│   ├── text/                  Simulator (Chat statt Telefon)
│   └── gespraechstests/       die ≥ 20 Testgespräche
├── beispielkarte/             Pizzeria-Karte als JSON (Phase 2)
└── ios/
    ├── project.yml            Bauplan → TelefonRetter.xcodeproj (XcodeGen)
    └── TelefonRetter/
        ├── App/               Einstieg, Navigation
        ├── Features/          Dashboard, Bestellungen, Reservierungen,
        │                      Anrufe, Einstellungen, Admin
        ├── Core/              Supabase-Client, Modelle, Dienste
        └── LiveActivity/      Widget-Erweiterung (Phase 3)
```

---

## Architektur in einem Satz je Teil

Ausführlich mit Diagramm: `docs/architektur.md`.

- **Telefonie:** deutsche Ortsnetz-Nummer pro Betrieb, das Restaurant leitet
  dorthin um (bei besetzt / nach X Sekunden / immer).
- **Voice-Agent:** eigener Server in Frankfurt; Audio rein → Spracherkennung →
  Sprachmodell mit Werkzeugen → Stimme → Audio raus. Werkzeuge rufen nur
  Datenbank-Funktionen auf, nie direkt Tabellen.
- **Backend:** eigenes Supabase-Projekt in Frankfurt (nicht das von Kiek mol
  in). Postgres + RLS, Realtime für die App, Edge Functions für Push/SMS.
- **iOS-App:** SwiftUI, MVVM, Swift Concurrency, Supabase Swift SDK, APNs,
  Live Activities.
- **WhatsApp (Phase 4):** Meta Cloud API → Webhook → derselbe Dialog-Kern im
  Textmodus.

---

## Entscheidungen

| # | Datum | Frage | Stand |
|---|---|---|---|
| E1 | 01.10.2026 | Kompletter Neubau, kein Code aus v1 | entschieden (Ibo) |
| E2 | 01.10.2026 | Xcode-Projekt aus `project.yml` (XcodeGen) statt eingecheckter `.xcodeproj` — Cloud-Sitzungen können Text sicher ändern | vorgeschlagen |
| E3 | 01.10.2026 | iOS lokal auf Ibos Mac mit dem Simulator-Fenster der Claude-App; GitHub-Mac `xcode-27` baut und fotografiert bei jedem Push als Netz | Ibo will das Live-Fenster (01.10.2026); GitHub-Mac gemessen: Lauf 2 grün, 4 Bilder |
| E4 | 01.10.2026 | Mindest-iOS 26, gebaut mit iOS-27-SDK, getestet im iOS-27-Simulator — damit ältere Restaurant-iPads mitlaufen | vorgeschlagen |
| E5 | 01.10.2026 | Voice-Stack: **eigene Kaskade** (Spracherkennung → Claude → Stimme) statt Sprache-zu-Sprache oder fertiger Plattform — Preise wortgenau aus der Datenbank, EU-Hosting, ~0,055 $/Min | vorgeschlagen → `docs/phase-0-stack.md` |
| E6 | 01.10.2026 | Telefonie: Start mit **Twilio (Region Irland)**, Wechsel zu sipgate ohne Umbau möglich (gleiches Protokoll über die sipgate-Brücke) | vorgeschlagen |
| E7 | 01.10.2026 | Eigenes Supabase-Projekt in Frankfurt | vorgeschlagen |
| E8 | – | Eigenes Repo statt Unterordner in kiekmolin | offen |
| E9 | 01.10.2026 | Sprachmodell: **Claude Haiku 4.5** über AWS Bedrock (EU-Profil); Sonnet 5.5 läuft in den Testgesprächen zum Vergleich | vorgeschlagen |
| E10 | 01.10.2026 | Pipeline-Framework: **Pipecat** (Python) auf eigenem Server in Frankfurt | vorgeschlagen |
| E11 | 01.10.2026 | Spracherkennung Deepgram Nova-3, Soniox im Vergleich messen; Stimme per Hörprobe (ElevenLabs / Cartesia / Azure) — Ibo entscheidet nach Gehör | vorgeschlagen, Messung Phase 2 |
| E12 | 01.10.2026 | Pilot mit „Umleitung beim Restaurant“ (Weg 1), „wir steuern“ (Weg 2) später | vorgeschlagen → `docs/architektur.md` |
| E13 | 01.10.2026 | Allergene als Wort (`gluten` …) wie in Kiek mol in, Geld in Cent | vorgeschlagen |

---

## Kurzbefehle

Lokale Sitzung auf dem Mac starten (Claude-App → Neu → Ordner kiekmolin),
dann als erste Nachricht:

> git fetch origin claude/api-529-overload-uk9lbk && git checkout
> claude/api-529-overload-uk9lbk — lies telefon-retter-v2/CLAUDE.md und
> starte die Probe-App im verbundenen Simulator.

Im Simulator-Fenster der App: **Simulator verbinden** (iPhone, iOS 27).

```bash
# iOS auf dem Mac öffnen (einmalig: brew install xcodegen)
cd telefon-retter-v2/ios && xcodegen generate && open TelefonRetter.xcodeproj

# iOS in der Cloud bauen + Bilder: einfach pushen (Änderung unter ios/)
# Bilder danach holen:
git fetch origin simulator-bilder && git show FETCH_HEAD:STAND.md
```
