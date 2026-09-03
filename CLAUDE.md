# Kiek mol in — Arbeitsregeln

Diese Datei wird zu Beginn jeder Sitzung gelesen. Sie steht hier, weil am
25. und 26.08.2026 zwei Fehler zusammen einen ganzen Tag gekostet haben —
und der Schaden nicht durch die Fehler entstand, sondern durch die Art,
wie ich sie behandelt habe.

Ibo dazu: *"Das darf nicht mehr passieren... wir müssen zusammen und nicht
gegen."*

---

## Die sechs Regeln

### 1. Erst messen, dann bauen.

Nicht aus Teilinformationen eine Theorie bauen und die wie einen Befund
behandeln. Die Protokolle sind da:

- `mcp__Supabase__query_logs` → `edge_logs` (jede Anfrage, Status, angemeldet
  als wer, Antwortgröße) und `postgres_logs` (der echte Fehlertext)
- Netlify-MCP → welcher Commit gerade **wirklich live** ist

Wenn etwas nicht messbar ist: **sagen**, dass es nicht messbar ist. Keine
Vermutung als Befund verkaufen.

### 2. Bei zwei Bedeutungen einmal kurz fragen.

*"Es kommen keine Reservierungen rein"* heißt entweder "Gäste können keine
anlegen" oder "ich sehe keine im Dashboard". Ich habe mir eine ausgesucht,
das Falsche repariert und "fertig" gemeldet. Eine Rückfrage hätte einen Tag
gespart.

Eine kurze Frage ist kein Zeitverlust. Die falsche Reparatur ist einer.

### 3. Kein "behoben", bevor es bei ihm ankommt.

Gemergt ist nicht behoben. Deployed ist nicht behoben. **Behoben ist, wenn
im Protokoll ein Erfolg von einem echten Gerät steht** — mit Uhrzeit.

Am 25.08. war der Server repariert und die Wache meldete grün, während sein
Browser noch die alte App lud. Ich habe "behoben" gesagt. Das war der Fehler,
der ihn Kunden gekostet hat — nicht der Code.

### 4. Die Auslieferung gehört zur Reparatur.

Ein Fix im Code erreicht niemanden von selbst. Dazu gehören:

- Ist der Commit **live**? (Netlify prüfen, nicht annehmen)
- Wurde `CACHE` in `sw.js` hochgezählt? Sonst behalten die Geräte die alte
  Fassung. **Jede Änderung an einem Gästeweg braucht eine neue Nummer.**
  `tests/service-worker-huelle-test.js` prüft das.

### 5. Ein Test, der den Fehler einfordert, ist schlimmer als keiner.

Dreimal in einer Woche passiert:

| Test | forderte |
|---|---|
| `push-tabelle-test.js` | `window.currentUser.role` — existiert nie |
| `spaltennamen-test.js` | `reviews.restaurant_id` — gibt es nicht |
| `sitzungs-token-test.js` | ohne Ablaufdatum den anon-Schlüssel — machte alles leer |

Beim Schreiben eines Tests: **den Fehler wieder einbauen und prüfen, dass er
rot wird.** Ein Test, der nur wiederholt, was der Code sagt, prüft nichts.

Und: unsere ~4000 Tests lesen **Quelltext**. Die echten Ausfälle standen
woanders — in einer Datenbank-Regel, im Deploy, im Zwischenspeicher des
Browsers. Dafür ist `gastweg-wache.js` da: sie geht den echten Weg.

### 6. Stille Ausfälle sind die gefährlichsten.

Eine leere Liste ist keine Fehlermeldung, sie sieht aus wie eine Antwort:

- RLS ohne Leserecht → `[]` statt 403 → "keine Bestellungen"
- fehlende Spalte → catch-Zweig → Preis-Check monatelang aus
- `window.<let-Variable>` → immer `undefined` → der andere Zweig, immer

Bei jeder Änderung fragen: **Wie sieht das aus, wenn es kaputt ist?** Wenn
die Antwort "wie normal, nur leer" ist, muss eine Meldung dazu.

### 7. Was ich nicht sehen kann, darf ich nicht anleiten.

Am 01.09.2026 bei Stripe: erst „einfach das Datum ändern“, dann „das
geht nicht, du brauchst ein neues Abo“. Beides von mir, innerhalb von
Minuten. Ibo dazu: *„wegen deine fehler jedes mal so“.*

Der Grund war nicht Unwissen über Stripe. Der Grund war, dass ich
**seinen Bildschirm nicht sehe** — und trotzdem drei mögliche Wege
hingeworfen habe, statt einen zu fragen.

Bei Supabase, Netlify und GitHub kann ich messen. Bei allem anderen
nicht:

| kann ich messen | kann ich **nicht** messen |
|---|---|
| Supabase-Protokolle | sein Stripe-Fenster |
| Netlify-Deploys | sein Postfach bei Resend |
| GitHub, Tests, Quelltext | sein Browser, sein Dashboard |
| | kiekmolin.de (Proxy sperrt es) |

**Regel:** Wo ich nicht messen kann, kommt zuerst EINE Frage — was
steht da gerade? Nicht drei Wege zur Auswahl. Drei Wege sind keine
Hilfe, sondern die Arbeit an ihn zurückgegeben.

---

## Zusammen, nicht gegeneinander

**Was ich liefere:** Befunde mit Beleg — Uhrzeit, Status, Fehlertext. Wenn
ich etwas nicht weiß, steht das da, statt einer Theorie im Ton einer
Tatsache.

**Was ich brauche:** bei einem Ausfall die Antwort auf *wo* (Dashboard oder
Gästeseite), *was* (leer oder Fehlermeldung) und *wie angemeldet* (Passwort,
Google, gar nicht). Drei Angaben, die mir das Raten ersparen.

---

## Kurzbefehle

```bash
node tests/run-all.js          # alle Tests, muss grün sein vor jedem Push
node tests/<name>-test.js      # einzeln

# Im echten Browser messen, was kein Textvergleich sieht:
npm i playwright-core
node werkzeug/dunkelmodus-messen.js            # Dunkelmodus
KMI_HELL=1 node werkzeug/dunkelmodus-messen.js # zum Vergleich hell
node werkzeug/dunkelmodus-messen.js <datei>    # vorher/nachher vergleichen
```

Das Werkzeug lädt `index.html` in Chromium und misst den Kontrast jedes
sichtbaren Textes. Es sieht **nur, was ohne Anmeldung rendert** — das
Dashboard erreicht es nicht. Und es kann nicht hinter ein Bild schauen;
solche Stellen zählt es getrennt als *nicht messbar*, statt sie als
Fehler zu melden.

Zeitpläne stehen in `netlify.toml`. Die Wache (`gastweg-wache`) läuft alle
15 Minuten und prüft in dieser Reihenfolge: ausgelieferte Seite, Reservieren,
Bestellen, Preis-Schutz, Mindestbestellwert. Schlägt sie an, klingelt Ibos
Handy.

**Wie oft sie stören darf** — am 27.08.2026 gemessen: 96 E-Mails in einer
Nacht, alle 15 Minuten, alle mit demselben Satz. Seitdem gilt:

| Fall | Signal |
|---|---|
| zum ersten Mal kaputt | sofort, auch nachts |
| dasselbe danach | still — höchstens eine Erinnerung pro Tag, nur 8–21 Uhr |
| etwas **anderes** kaputt | sofort, trotz laufender Ruhe |
| wieder in Ordnung | eine Entwarnung, genau eine |

Der Stand liegt in `wache_status` (Datenbank), **nicht** in `/tmp` — eine
Netlify-Funktion startet fast immer kalt und hätte dort nie etwas gefunden.
Und die Wache gibt **immer 200** zurück: bei 500 hält Netlify den Durchlauf
für misslungen und startet ihn neu, gemessen dreimal je Viertelstunde.
