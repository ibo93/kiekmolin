# The Chef – Server einrichten (einmalig)

Was ich (Claude) von hier aus **nicht** kann: ein Supabase-Projekt anlegen, Secrets setzen, Netlify erreichen (Netzwerk der Cloud-Umgebung sperrt `api.netlify.com`). Diese Schritte machst du – jeder mit einem Satz, woran du siehst, dass er geklappt hat.

## 1. Supabase-Projekt (NEU, nicht das von Kiek mol in)

1. supabase.com → New project → Name `thechef`, Region Frankfurt.
2. **Authentication → Providers → Anonymous sign-ins: an.** (Mitarbeiter treten per Code bei, ohne Passwort.)
3. **Authentication → URL Configuration → Site URL:** die Adresse der App (z. B. `https://thechef-demo.netlify.app`).
4. SQL Editor: nacheinander ausführen
   `supabase/migrations/0001_grundlage.sql`, `0002_speicher.sql`.
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
