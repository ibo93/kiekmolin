# KIN Agent-Ready: Pilot und Testanleitung

**Ziel:** ChatGPT, Claude, Gemini & Co. finden Kiek-mol-in-Restaurants, lesen die
Karte und können einen Tisch anfragen, ohne dass der Gast die Webseite öffnet.

**Pilot:** Greetsieler Börse, La Piazza Greetsiel.
**Adresse für Assistenten:** `https://kiekmolin.de/mcp`

---

## Was gebaut ist

| Baustein | Datei | Was es tut |
|---|---|---|
| MCP-Server | `netlify/functions/mcp.js` | 4 Werkzeuge, ohne Anmeldung, zustandslos |
| Werkzeuge | `netlify/functions/lib/ki-werkzeuge.js` | Suche, Karte, freie Zeiten, Anfrage |
| Regeln | `netlify/functions/lib/ki-agent.js` | Allergene (LMIV A–R), Zeiten (Berlin), Filter, Drossel |
| Datenbank | `datenbank/35-…pruefen.sql`, `36-ki-assistent.sql` | nur neue Sichten und Tabellen |
| Google & Co. | `build-seo-pages.js` | Allergene, vegetarisch/vegan, Öffnungszeiten, Ausstattung im JSON-LD |
| llms.txt | `build-seo-pages.js` | Abschnitt „Für KI-Assistenten“ mit MCP-Adresse |
| Messen | `netlify/functions/weekly-report.js` | „davon über KI-Assistenten: X bestätigt · Y Gäste“ |
| Auffindbar | `.well-known/mcp/server-card.json` (öffentlich), `ki-assistent/server.json` (nur für die Registry, im Netz gesperrt) | Server-Karte und Eintrag für die offizielle MCP-Registry |
| Tests | `tests/ki-assistent-test.js` | 61 Tests; jede Regel wird rot, wenn man sie bricht |

### Die Regeln im Code

- **Nie fest.** Jede Anfrage ist `status = 'pending'` mit `source = 'ki-assistent'`.
  Das gilt auch, wenn das Haus „Reservierungen sofort bestätigen“ eingeschaltet hat.
  In der Notiz steht `[KI-Assistent via Claude – bitte bestätigen]`.
- **Keine Personendaten nach außen.** Gelesen wird nur aus `agent_*_v`-Sichten, in denen
  es keine Gäste-, Umsatz- oder Kundendaten gibt. Name und Telefon des Gastes gehen
  nur in die Datenbank, nie zurück.
- **Opt-in.** Sichtbar ist nur, wer in `agent_optin` mit `aktiv = true` steht.
- **Drossel.** Pro Telefonnummer höchstens 3 Anfragen am Tag (+49 und 0 zählen als
  dieselbe Nummer), pro Haus 15 am Tag, pro IP 30 pro Stunde. Doppelte Anfragen
  ergeben keine zweite Reservierung.
- **Fail closed.** Wenn die Drossel nicht zählen kann, wird nichts angelegt.
- **Allergene.** Steht bei einem Gericht nichts, heißt das „keine Angabe“ und nie
  „allergenfrei“. Beim Filter „ohne Gluten“ fallen solche Gerichte heraus.

---

## Einrichten (einmalig)

### 1. Datenbank prüfen: Supabase → SQL Editor

`datenbank/35-ki-assistent-pruefen.sql` ausführen. Diese Datei ändert nichts.

| Teil | Erwartet | Wenn nicht |
|---|---|---|
| 1 | keine Zeile | Jede Zeile ist eine fehlende Spalte. **Stopp und melden.** |
| 3 | keine Zeile, oder ein CHECK mit `ki-assistent` | Die Regel würde die Anfrage abweisen. **Stopp und melden.** |
| 5 | zwei Zeilen | Bitte prüfen, ob `tags` stimmt (`hunde_erlaubt`, `terrasse`). |
| 6 | Anzahl der Gerichte mit Allergenen | Nichts zu tun, nur zur Info. |

### 2. Datenbank anlegen

`datenbank/36-ki-assistent.sql` ausführen. Am Ende muss stehen:
- **Objekte:** alle sechs vorhanden
- **Freigabe:** zwei Pilot-Häuser aktiv
- **Lesezugriff von außen:** überall „nein“

### 3. Netlify → Environment variables

- `AGENT_HASH_SALT` = ein langes Zufallswort. Das ist optional, sonst dient der
  Service-Schlüssel als Salz.
- `SUPABASE_SERVICE_KEY` ist schon da, die anderen Funktionen nutzen ihn auch.

### 4. Deployen

Danach mit diesen Befehlen prüfen:

```bash
curl -s https://kiekmolin.de/version.txt
```

```bash
curl -s -X POST https://kiekmolin.de/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Die Antwort muss die vier Werkzeuge nennen. Kommt HTML zurück, greift die
Umleitung `/mcp` in `netlify.toml` nicht.

```bash
curl -s -X POST https://kiekmolin.de/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_restaurants","arguments":{"ort":"Greetsiel","kueche":"fisch","hunde_erlaubt":true}}}'
```

---

## Selbst testen: findet der Assistent das Restaurant und kann er anfragen?

Die Menüs der Assistenten ändern sich oft. Wenn ein Punkt anders heißt als hier:
**Screenshot schicken.** Nicht raten.

### A. Claude (claude.ai, auch Free: 1 eigener Connector)

1. **Einstellungen → Connectors → „Add custom connector“**
2. Name: `Kiek mol in`, URL: `https://kiekmolin.de/mcp`, keine Anmeldung.
3. Neuer Chat, Connector einschalten, dann sagen:
   > Buch mir morgen um 19:30 einen Tisch für 4 in Greetsiel, Fisch, mit Hund.
4. **Erwartet:**
   - Claude ruft `search_restaurants` auf und findet die Greetsieler Börse.
   - Dann ruft Claude `check_availability` auf.
   - Claude **fragt nach Name und Telefonnummer**.
   - Erst dann ruft Claude `request_reservation` auf.
   - Die Antwort sagt ausdrücklich „noch nicht bestätigt“.

### B. ChatGPT (Plus/Pro, Web)

1. **Einstellungen → Apps/Plugins → Erweitert → Entwicklermodus einschalten**
2. **„Erstellen“:** URL `https://kiekmolin.de/mcp`, Authentifizierung „Keine“.
3. Im Chat die App auswählen und denselben Satz sagen.
4. ChatGPT fragt vor `request_reservation` selbst nach einer Bestätigung.
   Das ist richtig so, denn das Werkzeug ist als „schreibend“ markiert.

### C. Gemini (Web, privates Konto, zunächst nur Englisch)

1. **Einstellungen → Connected Apps → „Add a custom app“** → URL eintragen.
2. Auf Englisch fragen:
   > Book a table for 4 tomorrow 7:30 pm in Greetsiel, fish restaurant, dog friendly.

### D. Beweis im Dashboard und in der Datenbank

1. **Dashboard der Börse:** Die Anfrage steht als „Ausstehend“ da, in der Notiz steht
   `[KI-Assistent via …]`. Bestätigen oder absagen wie immer.
2. **Supabase SQL:** Wer hat was gefragt? (ohne Namen, ohne Nummern)

   ```sql
   select created_at, client, werkzeug, ergebnis, details
     from agent_requests order by created_at desc limit 20;
   ```

3. **Wochenbericht am Montag:** Die Zeile „davon über KI-Assistenten“ erscheint,
   sobald es in der Woche eine Anfrage gab.

**Behoben bzw. fertig ist es erst, wenn Schritt D1 von einem echten Assistenten
aus geklappt hat.** Uhrzeit und Anfrage-Nr. notieren.

---

## Auffindbar machen

Ohne diesen Teil findet nur, wer die Adresse selbst einträgt.

1. **Offizielle MCP-Registry** (Vorschau-Phase, registry.modelcontextprotocol.io):

   ```bash
   brew install mcp-publisher
   ```

   ```bash
   cd ki-assistent && mcp-publisher login http --domain kiekmolin.de
   ```

   Der Befehl nennt eine Datei für `https://kiekmolin.de/.well-known/mcp-registry-auth`.
   Die kommt ins Repo und wird deployt.

   ```bash
   cd ki-assistent && mcp-publisher publish
   ```

2. **ChatGPT-Verzeichnis und Claude-Verzeichnis:** Einreichung mit Prüfung.
   Das kommt nach dem Pilot (Phase 2).
3. **Wichtiger als alles oben:** Die Assistenten holen Restaurants aus Google Maps,
   Bing Places, Apple Business Connect und Yelp. Die Einträge der Pilot-Häuser dort
   mit Link auf `kiekmolin.de/<slug>` pflegen, z. B. über `sichtbarkeit/`.

---

## Mehr Häuser freischalten und abschalten

```sql
-- freischalten
insert into agent_optin (restaurant_id, notiz)
select id, 'freigeschaltet' from restaurants where slug = '<slug>'
on conflict (restaurant_id) do update set aktiv = true;

-- abschalten (sofort, nichts wird gelöscht)
update agent_optin set aktiv = false
 where restaurant_id = (select id from restaurants where slug = '<slug>');
```

## Bewusst noch nicht drin (Phase 2)

- Eigenes Abzeichen „KI-Assistent“ im Dashboard. Heute steht der Hinweis in der
  Notiz, weil `index.html` nicht umgebaut werden sollte.
- `get_request_status`, damit der Gast über den Assistenten nachfragen kann.
- Bestätigung durch den Gast per E-Mail oder SMS gegen Fake-Anfragen.
- Einreichung im ChatGPT- und im Claude-Verzeichnis.
- Siri: geht nur über eine native App.
- Reserve with Google: nur mit Plattformvertrag.
