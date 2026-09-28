#!/usr/bin/env bash
# The Chef – Server einrichten in einem Durchgang (statt EINRICHTEN.md von Hand).
#
#   cd thechef && bash werkzeug/einrichten.sh
#
# Vorher einmal: `supabase login` (Enter drücken, im Browser „Authorize“).
# Das Skript fragt vor dem Anlegen des Projekts (kann Geld kosten) und lässt
# dich die Schlüssel selbst eintippen – sie erscheinen nirgends auf dem Schirm.
# Mehrfach ausführbar: ein vorhandenes Projekt „thechef“ wird weiterbenutzt.
set -euo pipefail

cd "$(dirname "$0")/.."
PROJEKT_NAME="thechef"
REGION="eu-central-1"            # Frankfurt
PW_DATEI=".supabase-db-passwort" # bleibt nur auf diesem Mac (.gitignore)

schritt() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }
ok()      { printf '  \033[32m✓ %s\033[0m\n' "$1"; }
stopp()   { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

command -v supabase >/dev/null || stopp "Supabase-Kommandozeile fehlt: brew install supabase/tap/supabase"
command -v node >/dev/null     || stopp "Node fehlt."

# ── 1. Angemeldet? ───────────────────────────────────────────────────────────
schritt "1/7 Anmeldung bei Supabase prüfen"
ORGS_JSON="$(supabase orgs list -o json 2>/dev/null)" || stopp "Nicht angemeldet. Erst: supabase login"
ok "angemeldet"

# ── 2. Projekt finden oder anlegen ───────────────────────────────────────────
schritt "2/7 Projekt „$PROJEKT_NAME“"
REF="$(supabase projects list -o json | node -e '
  const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const t = p.find((x) => x.name === process.argv[1]);
  process.stdout.write(t ? (t.id || t.ref) : "");' "$PROJEKT_NAME")"

if [ -n "$REF" ]; then
  ok "gibt es schon ($REF) – wird weiterbenutzt"
  [ -f "$PW_DATEI" ] || stopp "Datenbank-Passwort fehlt ($PW_DATEI). Im Supabase-Dashboard unter Project Settings → Database zurücksetzen und in $PW_DATEI speichern."
else
  ORG_ID="$(printf '%s' "$ORGS_JSON" | node -e '
    const o = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (o.length === 1) process.stdout.write(o[0].id);')"
  if [ -z "$ORG_ID" ]; then
    echo "  Mehrere Organisationen:"
    printf '%s' "$ORGS_JSON" | node -e '
      JSON.parse(require("fs").readFileSync(0, "utf8")).forEach((o) => console.log("   " + o.id + "  " + o.name));'
    read -r -p "  Welche ID soll The Chef bekommen? " ORG_ID
  fi
  echo
  echo "  Es wird ein NEUES Supabase-Projekt „$PROJEKT_NAME“ in Frankfurt angelegt,"
  echo "  getrennt von Kiek mol in. Je nach deinem Supabase-Tarif kann das Geld kosten"
  echo "  (bitte unter supabase.com → Organization → Billing nachsehen)."
  read -r -p "  Anlegen? (j/n) " JA
  [ "$JA" = "j" ] || stopp "Abgebrochen – nichts angelegt."
  umask 077
  node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))' > "$PW_DATEI"
  supabase projects create "$PROJEKT_NAME" --org-id "$ORG_ID" --region "$REGION" \
    --db-password "$(cat "$PW_DATEI")" -o json >/dev/null
  REF="$(supabase projects list -o json | node -e '
    const t = JSON.parse(require("fs").readFileSync(0, "utf8")).find((x) => x.name === process.argv[1]);
    process.stdout.write(t ? (t.id || t.ref) : "");' "$PROJEKT_NAME")"
  [ -n "$REF" ] || stopp "Projekt wurde nicht gefunden, obwohl es angelegt wurde."
  ok "angelegt ($REF)"
fi
DB_PW="$(cat "$PW_DATEI")"
URL="https://$REF.supabase.co"

schritt "3/7 Warten, bis das Projekt läuft (beim ersten Mal 1–3 Minuten)"
for i in $(seq 1 60); do
  STATUS="$(supabase projects list -o json | node -e '
    const t = JSON.parse(require("fs").readFileSync(0, "utf8")).find((x) => x.id === process.argv[1] || x.ref === process.argv[1]);
    process.stdout.write(t ? String(t.status) : "?");' "$REF")"
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  printf '  … %s\r' "$STATUS"; sleep 5
done
[ "$STATUS" = "ACTIVE_HEALTHY" ] || stopp "Projekt läuft nach 5 Minuten noch nicht (Status: $STATUS). Später erneut starten."
ok "läuft"

# ── 4. Schlüssel, die das Skript selbst erzeugt ─────────────────────────────
schritt "4/7 Schlüssel für Zeitplan und Mitteilungen erzeugen"
GEHEIM=".supabase-geheim.env"   # nur auf diesem Mac, .gitignore
umask 077
if [ ! -f "$GEHEIM" ]; then
  node -e '
    const c = require("crypto"), b = (x) => Buffer.from(x).toString("base64url");
    const e = c.createECDH("prime256v1"); e.generateKeys();
    console.log("ZEITPLAN_SCHLUESSEL=" + c.randomBytes(32).toString("hex"));
    console.log("VAPID_PUBLIC_KEY=" + b(e.getPublicKey()));
    console.log("VAPID_PRIVATE_KEY=" + b(e.getPrivateKey()));' > "$GEHEIM"
fi
# shellcheck disable=SC1090
set -a; . "$GEHEIM"; set +a
export CHEF_PROJEKT_URL="$URL"
ok "erzeugt (liegen in $GEHEIM, nicht im Git)"

# ── 5. Datenbank, Einstellungen, Funktionen ──────────────────────────────────
schritt "5/7 Datenbank anlegen (Tabellen, Zugriffsregeln, Foto-Speicher, Zeitplan)"
supabase link --project-ref "$REF" --password "$DB_PW" >/dev/null
supabase db push --linked --password "$DB_PW" --yes
supabase config push --project-ref "$REF" --yes
ok "Datenbank und Einstellungen übertragen"

schritt "6/7 KI-Funktionen hochladen und Schlüssel eintragen"
supabase functions deploy --project-ref "$REF"
ok "Funktionen hochgeladen"

TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{
  echo "ZEITPLAN_SCHLUESSEL=$ZEITPLAN_SCHLUESSEL"
  echo "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY"
  echo "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY"
} > "$TMP"
read -r -p "  E-Mail-Adresse für Mitteilungen (VAPID, z. B. deine): " MAIL
[ -n "$MAIL" ] && echo "VAPID_SUBJECT=mailto:$MAIL" >> "$TMP"
echo
echo "  Jetzt dein Anthropic-Schlüssel (console.anthropic.com → API Keys)."
echo "  Beim Tippen/Einfügen erscheint nichts – das ist Absicht."
read -r -s -p "  ANTHROPIC_API_KEY: " KEY; echo
[ -n "$KEY" ] || stopp "Ohne Anthropic-Schlüssel gibt es keine echte Erkennung. Skript später erneut starten."
echo "ANTHROPIC_API_KEY=$KEY" >> "$TMP"; unset KEY
echo
echo "  Für die Spracheingabe (optional, später nachholbar): OpenAI-Schlüssel."
read -r -s -p "  OPENAI_API_KEY (Enter = überspringen): " OKEY; echo
if [ -n "$OKEY" ]; then
  { echo "OPENAI_API_KEY=$OKEY"; echo "STT_ANBIETER=openai"; } >> "$TMP"
fi
unset OKEY
supabase secrets set --project-ref "$REF" --env-file "$TMP" >/dev/null
rm -f "$TMP"
ok "Schlüssel eingetragen"

# ── 7. App mit dem Server verbinden ──────────────────────────────────────────
schritt "7/7 App mit dem Server verbinden und neu bauen"
ANON="$(supabase projects api-keys --project-ref "$REF" -o json | node -e '
  const k = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const a = k.find((x) => x.name === "anon") || k.find((x) => x.type === "publishable");
  process.stdout.write(a ? a.api_key : "");')"
[ -n "$ANON" ] || stopp "Öffentlicher Schlüssel (anon) nicht gefunden."
{
  echo "# Supabase-Projekt von The Chef (NICHT das von Kiek mol in) – von einrichten.sh"
  echo "VITE_SUPABASE_URL=$URL"
  echo "VITE_SUPABASE_ANON_KEY=$ANON"
  echo "VITE_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY"
} > .env
npm run build >/dev/null
npx cap sync ios >/dev/null
ok "App gebaut – verbindet sich jetzt mit $URL"

printf '\n\033[1;32mFertig.\033[0m Die App läuft jetzt mit echter Erkennung und echtem Assistenten.\n'
echo "Nächster Schritt: in Xcode ▶ drücken (oder: npm run ios:sim)."
echo "Auf der Startseite ist der Hinweis „Demo: Ohne Server …“ jetzt weg."
