#!/bin/zsh
# ============================================================
#  Kurani CRM ins Netz stellen
#
#  Baut die Netzfassung, prueft sie auf persoenliche Daten und
#  laedt sie zu Netlify hoch (kurani-crm.netlify.app).
#
#  Wichtig: js/stammdaten.js mit deiner Anschrift, IBAN und der
#  Kundenliste bleibt hier. Ins Netz geht eine leere Huelle.
# ============================================================

cd "$(dirname "$0")" || exit 1
Q="$PWD"
N="$Q/.netzfassung"
SITE="1c02d9f8-cf81-4459-ac4d-05c5aca76f8e"

echo ""
echo "  Kurani CRM ins Netz stellen"
echo "  ============================================"
echo ""

# --- 1. Fassung im Service Worker hochzaehlen -----------------
ALT=$(grep -o "kurani-crm-v[0-9]*" sw.js | head -1)
NUM=${ALT##*-v}
NEU="kurani-crm-v$((NUM+1))"
sed -i '' "s/const VERSION = '$ALT'/const VERSION = '$NEU'/" sw.js
echo "  Fassung: $ALT  ->  $NEU"
echo "  (damit dein Handy den neuen Stand zieht)"
echo ""

# --- 2. Netzfassung bauen ------------------------------------
rm -rf "$N"; mkdir -p "$N/js" "$N/css"
cp index.html manifest.json icon.png sw.js "$N/"
cp css/*.css "$N/css/"
cp js/*.js    "$N/js/"

cat > "$N/js/stammdaten.js" <<'JS'
/* Kurani CRM – persoenliche Daten (Netzfassung: leer)
   Die echte Datei liegt nur auf Ibos Rechner. Hier steht bewusst
   nichts drin. Auf dem Handy kommen die Daten ueber den Sync. */
const FIRMENDATEN = {};
const STAMMKUNDEN = [];
JS

cat > "$N/robots.txt" <<'TXT'
User-agent: *
Disallow: /
TXT

cat > "$N/netlify.toml" <<'TOML'
[build]
  publish = "."

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "no-referrer"
    Permissions-Policy = "camera=(self), microphone=(), geolocation=(), payment=()"
    X-Robots-Tag = "noindex, nofollow"
TOML

ANZ=$(find "$N" -type f | wc -l | tr -d ' ')
echo "  $ANZ Dateien gebaut"

# --- 2b. Ist die Fassung ueberhaupt vollstaendig? -------------
# Ohne diese Pruefung wuerde ein fehlgeschlagenes Kopieren eine
# leere Seite hochladen und die funktionierende ueberschreiben.
FEHLT=""
for D in index.html manifest.json icon.png sw.js css/app.css css/print.css \
         js/app.js js/store.js js/utils.js js/ui.js js/documents.js js/lastschrift.js; do
  [ -s "$N/$D" ] || FEHLT="$FEHLT $D"
done
if [ -n "$FEHLT" ] || [ "$ANZ" -lt 30 ]; then
  echo ""
  echo "  ABBRUCH – die Netzfassung ist nicht vollstaendig."
  [ -n "$FEHLT" ] && echo "  Es fehlen:$FEHLT"
  [ "$ANZ" -lt 30 ] && echo "  Nur $ANZ Dateien, erwartet werden mindestens 30."
  echo ""
  echo "  Nichts hochgeladen – die Seite im Netz bleibt wie sie ist."
  echo "  Starte das Programm aus dem Kurani-CRM-Ordner heraus."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi

# --- 3. Sicherheitspruefung ----------------------------------
echo ""
echo "  Pruefe auf persoenliche Daten ..."
# Die Suchbegriffe holt pruefmuster.py aus js/stammdaten.js. So steht im
# Skript selbst nichts Persoenliches, und die Pruefung bleibt aktuell,
# sobald du dort etwas aenderst.
MUSTER=$(python3 pruefmuster.py 2>/dev/null)
if [ -z "$MUSTER" ]; then
  echo ""
  echo "  ABBRUCH – js/stammdaten.js liess sich nicht lesen."
  echo "  Ohne sie kann ich nicht pruefen, ob persoenliche Daten mitgehen."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi
TREFFER=$(grep -rniE "$MUSTER" "$N" 2>/dev/null)
if [ -n "$TREFFER" ]; then
  echo ""
  echo "  ABBRUCH – da stehen persoenliche Daten drin:"
  echo "$TREFFER" | sed 's|'"$N"'/||' | head -20
  echo ""
  echo "  Nichts hochgeladen. Sag Claude Bescheid."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi
echo "  Sauber – nichts Persoenliches dabei."

# --- 4. Hochladen --------------------------------------------
echo ""
echo "  Lade hoch ..."
echo "  (beim ersten Mal geht der Browser auf: bei Netlify anmelden"
echo "   und die Verbindung bestaetigen – danach nie wieder)"
echo ""
cd "$N" || exit 1
npx -y netlify-cli deploy --dir=. --prod --site="$SITE"
ERG=$?

echo ""
if [ $ERG -eq 0 ]; then
  echo "  Fertig. Online unter:  https://kurani-crm.netlify.app"
  echo ""
  echo "  Auf dem Handy: Seite oeffnen, Teilen-Knopf, "
  echo "  'Zum Home-Bildschirm' – dann liegt sie als App drauf."
else
  echo "  Hat nicht geklappt (Fehler $ERG). Meist hilft: nochmal starten."
fi
echo ""
read -q "?  [Enter] zum Schliessen"
