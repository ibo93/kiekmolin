# The Chef – Server einrichten (einmalig)

**Am schnellsten:** zwei Befehle im Terminal auf dem Mac, der Rest läuft von selbst.

```bash
supabase login                 # Enter drücken, im Browser „Authorize“
bash werkzeug/einrichten.sh    # legt Projekt, Datenbank, Funktionen an, verbindet die App
```

Das Skript fragt vor dem Anlegen des Projekts (kann Geld kosten) und lässt dich
den Anthropic-Schlüssel selbst eintippen. Die Schritte unten sind dasselbe von Hand.


Was ich (Claude) von hier aus **nicht** kann: ein Supabase-Projekt anlegen, Secrets setzen, Netlify erreichen (Netzwerk der Cloud-Umgebung sperrt `api.netlify.com`). Diese Schritte machst du – jeder mit einem Satz, woran du siehst, dass er geklappt hat.

## 1. Supabase-Projekt (NEU, nicht das von Kiek mol in)

1. supabase.com → New project → Name `thechef`, Region Frankfurt.
2. **Authentication → Providers → Anonymous sign-ins: an.** (Mitarbeiter treten per Code bei, ohne Passwort.)
3. **Authentication → URL Configuration → Site URL:** die Adresse der App (z. B. `https://thechef-demo.netlify.app`).
4. SQL Editor: nacheinander ausführen
   `supabase/migrations/0001_grundlage.sql`, `0002_speicher.sql`, `0004_ios_push.sql`, `0005_weggeworfen_offline.sql`
   (`0003` erst in Schritt 4).
   *Geklappt, wenn* unter Table Editor `betriebe`, `produkte`, `bestand` … stehen und bei jeder Tabelle „RLS enabled“.

## 2. Secrets (Project Settings → Edge Functions → Secrets)

| Name | Wert |
|---|---|
| `ANTHROPIC_API_KEY` | aus console.anthropic.com |
| `ZEITPLAN_SCHLUESSEL` | ein langes Zufallswort (auch in Schritt 4) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:deine@adresse.de` |
| `STT_ANBIETER` | `openai` oder `elevenlabs` (siehe `werkzeug/stt-vergleich.md`) |
| `OPENAI_API_KEY` bzw. `ELEVENLABS_API_KEY` | passend zum Anbieter |
| `APNS_KEY_P8` | nur für die iPhone-App: Inhalt der `.p8`-Datei (Schritt 6) |
| `APNS_KEY_ID` / `APNS_TEAM_ID` | nur für die iPhone-App (Schritt 6) |
| optional `APNS_BUNDLE_ID` | Standard `de.kiekmolin.thechef` |
| optional `APNS_UMGEBUNG` | `sandbox` (Xcode, Standard) oder `production` (TestFlight/App Store) |
| optional `CHEF_MODELL` | Standard `claude-opus-5` |
| optional `CHEF_USD_EUR` | Umrechnung für die Kostenanzeige, Standard 0.9 |
| optional `STT_PREIS_PRO_MINUTE_USD` | für die Kosten der Spracheingabe |

## 3. Edge Functions deployen

```bash
cd thechef
npx supabase login
npx supabase link --project-ref <projekt-ref>
npx supabase functions deploy scan-erkennen assistent nach-scan sprache uebersetzen
npx supabase functions deploy zeitplan --no-verify-jwt
```
*Geklappt, wenn* unter Edge Functions sechs Funktionen stehen.

## 4. Zeitplan (Briefing, Erinnerung, Fotos löschen)

Project Settings → Vault → zwei Secrets: `chef_projekt_url` = `https://<ref>.supabase.co`, `chef_zeitplan_key` = derselbe Wert wie `ZEITPLAN_SCHLUESSEL`.
Dann `supabase/migrations/0003_zeitplan.sql` im SQL Editor ausführen.
*Geklappt, wenn* nach 15 Minuten unter Edge Functions → zeitplan → Logs ein Aufruf mit Status 200 steht.

## 5. App mit dem Server verbinden

`thechef/.env` (siehe `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`.
In Netlify dieselben drei als Umgebungsvariablen; Base directory `thechef`.
*Geklappt, wenn* auf der Startseite der Hinweis „Demo: Ohne Server …“ weg ist und „Ich bin der Chef“ nach E-Mail und Passwort fragt.

## 6. iPhone-App: Mitteilungen über Apple (nur für die Xcode-App)

In der iPhone-App gibt es kein Web-Push – Mitteilungen laufen dort über Apple (APNs).
Dafür braucht es ein **bezahltes Apple-Developer-Konto** (99 €/Jahr). Ohne das zeigt die App
beim Einschalten der Mitteilungen eine klare Meldung; alles andere läuft trotzdem.

1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → „+“ → *Apple Push Notifications service (APNs)* → herunterladen.
   Die `.p8`-Datei gibt es **nur einmal**. Key ID und Team ID stehen auf derselben Seite.
2. Supabase-Secrets: `APNS_KEY_P8` (ganzer Inhalt der Datei), `APNS_KEY_ID`, `APNS_TEAM_ID`.
3. Xcode → Projekt *App* → Target *App* → **Signing & Capabilities** → Team wählen → „+ Capability“ → **Push Notifications**.
4. App aufs **echte iPhone** (im Simulator gibt es kein Geräte-Token von Apple) → Einstellungen → Mitteilungen an.

*Geklappt, wenn* in Supabase unter Table Editor → `push_abos` eine Zeile mit `art = apns` steht
**und** nach dem nächsten Scan-Erinnerungs-Zeitpunkt die Mitteilung auf dem iPhone ankommt.
Die Antwort der Funktion `zeitplan` (Edge-Function-Logs) zeigt `gesendet` und bei Problemen `fehler`
(z. B. `apns_nicht_eingerichtet` = Secrets fehlen, `apns` = Apple hat abgelehnt, Grund steht im Log).

**Nicht geprüft:** Der Versand an Apple ließ sich beim Bau nicht bis zum Ende testen (die Bau-Umgebung
erreicht `api.push.apple.com` nicht). Geprüft sind die Anmeldung bei Apple (Signatur) und die Auswertung
der Antworten. Der erste echte Versand ist also der eigentliche Test.

**Taschenlampe:** In der iPhone-App schaltet ein natives Plugin das Licht. Ob es sich mit der
laufenden Kamera verträgt, lässt sich nur auf einem echten iPhone prüfen (der Simulator hat kein Licht).

