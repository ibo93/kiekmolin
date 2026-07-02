# KURANI · Telefon-Retter

KI-Telefon-Agent für Restaurants (Baustein 1 der KI-Agentur): nimmt verpasste
Anrufe an, reserviert Tische, beantwortet Fragen und nimmt Bestellungen auf –
24/7, ohne Personal.

**Goldene Regeln dieses Projekts**

- Der Kiek-mol-in-Code wird **nicht angefasst**. Verbindung zu den Daten NUR
  über die Supabase-API – gleiche Tabellen, gleiche Felder wie online.
- Telefon-Reservierungen laufen durch **dieselbe Verfügbarkeitsprüfung** wie
  online (1:1 portiert aus der App) – kein Doppel-Booking. Quelle: `telefon`.
- Bei Unsicherheit **keine falsche Zusage** → Rückrufwunsch aufnehmen.
- Jede Bestellung wird komplett **vorgelesen und bestätigt**, bevor sie
  gespeichert wird.
- Secrets in `.env`, niemals im Code. Erst an einer **TEST-Nummer** üben.

## Der Stack

| Aufgabe | Tool | Datei |
|---|---|---|
| Anruf | Twilio (Media Streams) | `server.js`, `lib/anruf.js` |
| Zuhören | Deepgram (Live, Deutsch) | `lib/deepgram.js` |
| Denken | Claude (Dialog + Werkzeuge) | `lib/dialog.js` |
| Sprechen | ElevenLabs (ulaw 8000) | `lib/elevenlabs.js` |
| Speichern | Supabase (`reservations` / `orders`) | `lib/supabase.js` |

Einzige npm-Dependency: `ws` (WebSockets). `npm install` genügt.

## Stufenplan (per `STUFE` in `.env`)

1. **Reservierung** – „Tisch für 4, heute 19 Uhr" + Rückruf-Fallback. **Standard.**
2. **Infos** – Öffnungszeiten, Speisekarte, Preise (liest aus Supabase).
3. **Bestellung** – Abholung & Lieferung, mit Vorlesen + Bestätigung.

Jede Stufe erst aktivieren, wenn die vorige sauber läuft (siehe
`TEST-CHECKLISTE.md`).

## Schnellstart: erst der Simulator (ohne Telefon!)

Der Simulator testet das komplette „Gehirn" als Text-Chat – nur der
`ANTHROPIC_API_KEY` wird gebraucht:

```bash
cd telefon-retter
npm install
cp .env.example .env        # ANTHROPIC_API_KEY eintragen
node simulator.js --demo    # Demo-Restaurant, schreibt NICHTS in die DB
node simulator.js --demo --stufe 3   # mit Bestellungen
```

Ohne `--demo` nutzt der Simulator das echte Restaurant aus `.env` – Achtung,
Reservierungen landen dann wirklich in der Datenbank.

## Echte Telefonnummer einrichten (Schritt für Schritt)

1. **Keys eintragen** (`.env`, Anleitung steht in `.env.example`):
   `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` +
   `ELEVENLABS_VOICE_ID`, `RESTAURANT_NAME`.
2. **Twilio-Nummer kaufen:** [console.twilio.com](https://console.twilio.com)
   → Phone Numbers → Buy a Number (deutsche Nummer, Voice-fähig).
3. **Server öffentlich erreichbar machen.** Lokal zum Testen:
   `ngrok http 3100` → die `https://…ngrok…`-Adresse als `BASE_URL` in `.env`.
4. **Server starten:** `node server.js`
5. **Webhook setzen:** in Twilio bei der Nummer → Voice Configuration →
   *A call comes in* → Webhook → `https://DEINE-ADRESSE/anruf` (HTTP POST).
6. **Anrufen und die `TEST-CHECKLISTE.md` durchgehen.**

Beim Restaurant später: Rufumleitung „bei besetzt / keine Antwort" von der
echten Restaurant-Nummer auf die Twilio-Nummer – der Mensch bleibt erste Wahl,
der Agent rettet nur die verpassten Anrufe. Daher der Name.

## Wie eine Reservierung abläuft

1. Twilio nimmt an und verbindet den Audio-Stream per WebSocket (`/media`).
2. Deepgram macht aus der Sprache deutschen Text (Satz für Satz).
3. Claude führt das Gespräch und nutzt Werkzeuge:
   `pruefe_verfuegbarkeit` → `reserviere_tisch` (direkt vor dem Schreiben wird
   **nochmal** geprüft – falls inzwischen jemand online gebucht hat) →
   `gespraech_beenden`. Bei Sonderfällen: `rueckruf_wunsch`.
4. ElevenLabs spricht die Antworten; redet der Gast dazwischen, bricht die
   Ausgabe ab (Barge-in).
5. Die Reservierung steht mit Quelle `telefon` im Kiek-mol-in-Dashboard.

Rückrufwünsche landen als offene Anfrage im Dashboard (Tabelle `callbacks`,
falls vorhanden – sonst als `pending`-Reservierung mit dem Hinweis
`[RUECKRUF ERBETEN]`).

Jeder Anruf wird als Protokoll unter `logs/` gespeichert (gitignored).

## Projektstruktur

```
telefon-retter/
  server.js              Twilio-Webhook + WebSocket-Server
  simulator.js           Text-Chat zum Testen ohne Telefon
  lib/
    anruf.js             eine Anruf-Sitzung: Leitung <-> hören <-> denken <-> sprechen
    dialog.js            das Gehirn: Claude + Werkzeuge (Stufen 1-3)
    verfuegbarkeit.js    1:1-Portierung der Verfügbarkeitsprüfung aus der App
    supabase.js          Lesen + Schreiben (reservations/orders), wie online
    deepgram.js          Live-Transkription (mulaw 8000, Deutsch)
    elevenlabs.js        Text -> Stimme (ulaw 8000, telefonfertig)
    env.js               .env-Loader ohne Dependencies
  demo/demo-daten.json   Demo-Restaurant für den Simulator
  TEST-CHECKLISTE.md     Pflichtprogramm vor dem Live-Gang
```
