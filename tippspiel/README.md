# TippArena

Sport-Tippspiel mit Spielgeld. **Kein Glücksspiel – nur Spielgeld, keine Gewinne in Geld.**
Coins können weder gekauft noch ausgezahlt werden.

Eigenständige App, nur im selben Repo wie Kiek mol in. Teilt **nichts** mit
Kiek mol in: eigenes Supabase-Projekt, eigenes Netlify-Projekt. Auf kiekmolin.de
ist `/tippspiel/` gesperrt (`netlify.toml`).

## Stand

| Schritt | Inhalt | Stand |
|---|---|---|
| 1 | Datenbank-Schema, Migrationen, Seed | fertig, lokal geprüft |
| 2 | Edge Functions `sync`, `place-bet`, `cashout` | fertig, lokal geprüft – nicht deployed |
| 3 | Frontend (React/Vite/TS/Tailwind, PWA) | Demo-Betrieb geprüft; Supabase-Anschluss gebaut, ungetestet gegen echtes Projekt |
| 4 | Netlify-Deploy, Seed prüfen | offen |

## App (`app/`)

```bash
cd tippspiel/app && npm install && npm run dev
```

Ohne Supabase läuft sie im **Demo-Betrieb**: dieselben Spiele wie `seed.sql`,
dieselben Prüfregeln wie `place_bets()`, Live-Spiele ticken (Quoten blinken,
Märkte sperren). Stand bleibt auf dem Gerät gespeichert. Bilder: `vorschau/`.

## Echte Spiele & Quoten (`supabase/functions/sync`)

- **Quelle:** The Odds API (kostenloser Zugang reicht für den Start). Schlüssel nur als
  Supabase-Secret `ODDS_API_KEY`, nie im Frontend.
- **1/X/2, Über/Unter, Handicap:** echte Quoten – Median aller Buchmacher (Ausreißer zählen nicht).
- **Doppelte Chance, Beide treffen, Halbzeit, Sieg ohne Remis:** aus einem Poisson-Modell,
  das an die echten Quoten angepasst ist (`source = 'derived'`).
- **Live (Fußball):** echte Startquote + echter Spielstand + Restzeit → neu gerechnet, ohne
  API-Kosten. Ohne frischen Spielstand (älter als 13 min) sind die Märkte **gesperrt** –
  sonst könnte man auf ein schon gefallenes Tor wetten.
- **Spielminute:** liefert die API nicht; geschätzt aus dem Anpfiff, angezeigt mit „~“.
- **Kontingent:** wird bis Monatsende eingeteilt; jeder Abruf steht in `api_usage`.
- **Nicht gegen die echte API gemessen:** das Antwortformat stammt aus der Doku. Von der
  Entwicklungsumgebung aus ist der Host gesperrt.

### Einrichten (einmalig)

1. Supabase-Projekt anlegen, Migrationen + `seed.sql` einspielen
2. Secrets: `ODDS_API_KEY`, `CRON_SECRET` (beliebige lange Zufallszeichenkette)
3. Functions deployen: `supabase functions deploy sync place-bet cashout`
4. `cron.sql` im SQL-Editor ausführen (vorher die zwei Vault-Werte setzen)
5. App: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen → echter Betrieb

## Datenbank (`supabase/`)

| Datei | Inhalt |
|---|---|
| `migrations/…01_schema.sql` | 15 Tabellen, RLS überall, Rechte |
| `migrations/…02_wallet.sql` | Startguthaben 1.000, Tagesbonus 100, Nachfüllen auf 500 (1×/Woche) |
| `migrations/…03_betting.sql` | Wette platzieren, Abrechnung, Cash-Out, Boosts |
| `migrations/…04_social.sql` | Rangliste, Tippgruppen, Profil-Statistik, Realtime |
| `migrations/…05_sync.sql` | Abruf echter Spiele: Upsert in einer Transaktion, Spielstand, Kontingent-Protokoll |
| `seed.sql` | Sportarten, Ligen (The-Odds-API-Schlüssel), 9 Demo-Spiele |

**Guthaben nur serverseitig:** Clients haben auf `wallets`, `transactions`,
`bets`, `bet_selections` nur Leserecht (eigene Zeilen). Jede Änderung läuft
über `wallet_apply()` und erzeugt genau eine Buchung. `place_bets`,
`settle_event`, `cashout_bet` darf nur die service_role (Edge Functions).

**Einstellbar ohne Migration:** Tabelle `app_config` (Einsatzgrenzen,
Bonusbeträge, Cash-Out-Abschlag, Alter der Live-Quoten …).

### Grenzen, die man kennen muss

- **Halbzeit-Märkte:** The Odds API liefert keinen Halbzeitstand. Ohne ihn
  werden Halbzeit-Tipps bei der Abrechnung *void* (Einsatz zurück).
- **Viertel-Handicaps** (−0,25 / −0,75) werden nicht geteilt abgerechnet,
  sondern ganz gewonnen/verloren.
- **Wetten-Konfigurator:** Märkte, die dasselbe vorhersagen (Sieg + Doppelte
  Chance), dürfen nicht kombiniert werden. Quote = Produkt × 0,9 je weiterem Tipp.

## Tests

Prüfen das Verhalten an einer echten Postgres-Datenbank, nicht den Quelltext:

```bash
TIPP_PG="-h <host> -p <port> -U postgres" node tippspiel/supabase/tests/db-test.js   # 92 Prüfungen
node --experimental-strip-types tippspiel/supabase/tests/model-test.ts                # 36 Prüfungen
```

`tests/supabase-shim.sql` bildet Rollen, `auth.users` und `auth.uid()` nach –
**nur lokal**, nie auf Supabase ausführen.
