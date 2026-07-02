# START HIER · Wie alles zusammenhängt und wie du es in Betrieb nimmst

Für dich als Betreiber. Eine Seite, alle Schritte, in der richtigen Reihenfolge.

## 1. Das große Bild

Es gibt **nichts einzubauen** — das ist der Trick der Architektur. Alle Teile
docken an deine bestehende Supabase-Datenbank an. Die Kiek-mol-in-App bleibt
unverändert:

```
                    ┌─────────────────────────────┐
                    │   SUPABASE (deine Datenbank) │
                    │  restaurants · menu_items    │
                    │  reservations · orders       │
                    └──────┬───────┬───────┬───────┘
             liest+schreibt│  liest│       │liest+schreibt
                           │       │       │
   ┌───────────────┐  ┌────┴────┐ ┌┴──────┴──────┐
   │ kiekmolin.de  │  │agentur/ │ │telefon-retter/│
   │ (deine App,   │  │Web-Ober-│ │ Anruf-Server  │
   │  UNVERÄNDERT) │  │fläche   │ │ (24/7)        │
   └───────────────┘  └────┬────┘ └───────────────┘
                           │ steuert
                      ┌────┴─────────┐
                      │sichtbarkeit/ │
                      │Report-Motor  │
                      └──────────────┘
```

- **Deine App (kiekmolin.de)** läuft weiter wie bisher. Der Wirt arbeitet
  weiter in seinem Dashboard — dort tauchen auch die Telefon-Reservierungen
  auf, automatisch, weil sie in dieselbe Datenbank geschrieben werden.
- **agentur/** ist DEINE Oberfläche (läuft auf deinem Rechner): Kunden sehen,
  Reports klicken, Telefon-Retter-Status.
- **sichtbarkeit/** ist der Motor hinter den Reports (brauchst du nie direkt
  anfassen, die Agentur-App bedient ihn).
- **telefon-retter/** ist ein eigener kleiner Server, der Anrufe annimmt.
  Er wird nicht "eingebaut", sondern per **Rufumleitung** mit der
  Telefonnummer des Restaurants verbunden (Schritt 4).

## 2. Einmalig: Voraussetzungen (10 Minuten)

1. **Node.js 18 oder neuer** installieren: https://nodejs.org (LTS-Version).
   Prüfen im Terminal: `node --version`
2. Dieses Repository auf deinen Rechner holen (falls noch nicht da):
   `git clone https://github.com/ibo93/kiekmolin.git && cd kiekmolin`
3. Einmal die Abhängigkeit des Telefon-Retters installieren:
   `cd telefon-retter && npm install && cd ..`

## 3. Die Agentur-App starten (dein Alltag)

```bash
cd agentur
node server.js --demo     # erst mal ohne Keys ausprobieren
```

Browser öffnen: **http://localhost:3200** — Kunden anklicken, „Monats-Report
erzeugen" drücken, fertig.

Für den **Echt-Betrieb** brauchst du Keys (einmalig einrichten):

```bash
cd sichtbarkeit
cp .env.example .env      # Datei öffnen und ausfüllen:
```

| Key | Wo bekommst du ihn | Wofür |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | KI-Test im Report („empfiehlt ChatGPT/Claude den Betrieb?") |
| `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | Anleitung steht in der .env.example | Google-Test („Top 10 bei Google?") |

Dann `node server.js` (ohne `--demo`) — jetzt siehst du alle echten
Restaurants aus deiner Datenbank. Ohne Keys läuft es auch, dann steht im
Report „manuell prüfen" statt automatischer Ergebnisse.

**Monats-Routine pro Kunde:** App öffnen → Kunde → „Monats-Report erzeugen"
→ PDF an den Wirt schicken. Das war's.

## 4. Den Telefon-Retter in Betrieb nehmen

Der Telefon-Retter ist ein Server, der laufen muss, solange er Anrufe
annehmen soll. Reihenfolge (Details in `telefon-retter/README.md`):

### 4a. Gehirn testen — ohne Telefon, ohne Risiko (heute machbar)

```bash
cd telefon-retter
cp .env.example .env      # nur ANTHROPIC_API_KEY eintragen
node simulator.js --demo  # Gespräch als Text-Chat durchspielen
```

Du tippst, was ein Gast sagen würde („Tisch für 4 morgen um 19 Uhr") und
siehst, wie der Agent reagiert. Schreibt nichts in die echte Datenbank.

### 4b. Echte Telefonnummer (wenn 4a sauber läuft)

1. Restliche Keys in die `.env`: `DEEPGRAM_API_KEY` (console.deepgram.com),
   `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (elevenlabs.io, deutsche
   Stimme aus der Voice Library aussuchen).
2. **Twilio-Nummer kaufen:** console.twilio.com → Phone Numbers → Buy a
   Number → deutsche Nummer mit „Voice"-Fähigkeit (~1 €/Monat).
3. Server erreichbar machen. Zum Testen von zu Hause:
   `ngrok http 3100` (ngrok.com, kostenlos) → die `https://…`-Adresse als
   `BASE_URL` in die `.env`.
4. `node server.js` starten.
5. In Twilio bei der Nummer: Voice Configuration → *A call comes in* →
   Webhook → `https://DEINE-NGROK-ADRESSE/anruf` (HTTP POST).
6. **Mit dem Handy anrufen** und `TEST-CHECKLISTE.md` durchgehen.

### 4c. Beim Restaurant „einbauen" (z.B. Greetsieler Börse)

Der Einbau ist genau EINE Sache: der Wirt (oder du) richtet bei seiner
normalen Telefonnummer eine **Rufumleitung bei besetzt / bei Nichtannahme**
auf die Twilio-Nummer ein (macht man beim Telefonanbieter oder direkt am
Telefon, z.B. `*61*Twilio-Nummer#`). Ergebnis:

- Wirt geht ran wie immer → alles wie bisher, der Agent bleibt stumm.
- Wirt ist beschäftigt / Küche voll / Feierabend → Agent übernimmt,
  reserviert, und die Reservierung steht sofort in seinem Dashboard
  (Quelle „telefon").

Dauerbetrieb später: den Server statt über ngrok auf einem kleinen
Cloud-Server laufen lassen (z.B. Hetzner ~5 €/Monat) — sag Bescheid,
dann richte ich dir das ein.

## 5. Reihenfolge für den Piloten (Greetsieler Börse)

1. Heute: Agentur-App im Demo-Modus ansehen (`--demo`)
2. Keys für die Sichtbarkeit eintragen → ersten echten Börse-Report klicken
3. Mit dem Report zum Wirt → Abo verkaufen (199–299 €/Monat)
4. Parallel: Telefon-Retter im Simulator testen (4a)
5. Twilio-TEST-Nummer einrichten, Checkliste durchgehen (4b)
6. Rufumleitung bei der Börse aktivieren (4c) → Bundle anbieten (ab 399 €)

## Wenn etwas klemmt

- Agentur-App zeigt keine Kunden → läuft sie ohne `--demo`? Internet da?
- Report-Fehler → fehlen Keys in `sichtbarkeit/.env`? (App zeigt den Fehler an)
- Telefon-Karte bleibt grau → der Telefon-Retter-Server läuft nicht
  (`cd telefon-retter && node server.js`)
- Anruf kommt nicht an → stimmt `BASE_URL` (ngrok-Adresse ändert sich bei
  jedem Neustart!) und der Twilio-Webhook?
