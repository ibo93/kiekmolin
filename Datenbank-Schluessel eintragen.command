#!/bin/zsh
# ==========================================================
#  Supabase-Dienstschluessel eintragen
#
#  Der Assistent liest die Belegung bisher mit dem oeffentlichen
#  Schluessel. Der kommt an die Reservierungen nicht heran - die
#  Zugriffsregeln lassen ihn nicht. Ergebnis: Der Assistent haelt
#  jeden Abend fuer frei und sagt Tische zu, die laengst vergeben
#  sind.
#
#  Der Dienstschluessel (service_role) geht an diesen Regeln vorbei.
#  Genau deshalb gehoert er NUR hierher - in die .env auf dem Server
#  und auf diesen Rechner. Niemals in etwas, das ein Browser laedt.
# ==========================================================

cd "$(dirname "$0")" || exit 1
ENV="telefon-retter/.env"
SERVER="root@31.70.133.55"
ZIEL="/opt/kiekmolin/telefon-retter/.env"

# An welchem Supabase-Projekt haengt der Assistent? Steht im Code, damit
# das Programm den Schluessel dagegen pruefen kann - siehe unten.
PROJEKT=$(grep -oE "STANDARD_URL[[:space:]]*=[[:space:]]*'[^']+'" telefon-retter/lib/supabase.js \
          | sed -E "s|.*https://([a-z0-9]+)\.supabase\.co.*|\1|")

print -P "%F{cyan}"
cat <<'KOPF'
  ┌────────────────────────────────────────────┐
  │  Datenbank-Dienstschluessel eintragen      │
  └────────────────────────────────────────────┘
KOPF
print -P "%f"

if [ ! -f "$ENV" ]; then
  echo "  Ich finde $ENV nicht."
  echo ""; read "?  [Enter] zum Schliessen"; exit 1
fi

ALT=$(grep "^SUPABASE_SERVICE_KEY=" "$ENV" | cut -d= -f2-)
if [ -n "$ALT" ]; then
  echo "  Bisher eingetragen: …${ALT: -6}  (${#ALT} Zeichen)"
else
  echo "  Bisher laeuft der Assistent mit dem oeffentlichen Schluessel."
  echo "  Der sieht KEINE Reservierungen - die Belegungspruefung geht"
  echo "  damit ins Leere."
fi
echo ""
echo "  Wo du ihn findest:"
echo "    Supabase → Project Settings → API Keys → service_role"
echo "    (steht unter 'Reveal', ist rund 200 Zeichen lang)"
echo ""
print -P "  %F{yellow}Achtung, du hast mehrere Projekte.%f Gebraucht wird dieses:"
echo "    $PROJEKT"
echo "  Pruef die Adresszeile im Browser - dort muss diese Kennung stehen."
echo ""
echo "  Einfuegen (Cmd+V) und Enter. Die Eingabe bleibt unsichtbar."
echo ""
printf "  Schluessel: "
read -s NEU
echo ""
echo ""

if [ -z "$NEU" ]; then
  echo "  Nichts eingegeben. Nichts geaendert."
  echo ""; read "?  [Enter] zum Schliessen"; exit 0
fi

# --- Ist das ueberhaupt der richtige Schluessel? ---------------
#     Ein anon-Key sieht fast gleich aus. Wer ihn hier eintraegt,
#     aendert nichts und sucht dann lange nach dem Grund.
LESUNG=$(python3 - "$NEU" <<'PYEOF'
import sys, base64, json
try:
    teil = sys.argv[1].split('.')[1]
    teil += '=' * (-len(teil) % 4)
    d = json.loads(base64.urlsafe_b64decode(teil))
    print((d.get('role') or '?') + ' ' + (d.get('ref') or '?'))
except Exception:
    print('unlesbar ?')
PYEOF
)
ROLLE=${LESUNG%% *}
SCHLUESSEL_PROJEKT=${LESUNG##* }

# Die Rolle allein reicht nicht: Ein service_role-Schluessel aus einem
# ANDEREN Projekt sieht voellig richtig aus, oeffnet aber die falsche
# Datenbank - und laesst die richtige weiter im Dunkeln. Genau das ist
# beim ersten Versuch passiert.
if [ -n "$PROJEKT" ] && [ "$SCHLUESSEL_PROJEKT" != "?" ] && [ "$SCHLUESSEL_PROJEKT" != "$PROJEKT" ]; then
  echo ""
  print -P "  %F{red}Das ist der Schluessel eines anderen Projekts.%f"
  echo "    Eingefuegt:  $SCHLUESSEL_PROJEKT"
  echo "    Gebraucht:   $PROJEKT"
  echo ""
  echo "  Wechsle im Supabase-Dashboard oben links das Projekt und hol"
  echo "  den Schluessel dort. Nichts geaendert."
  echo ""
  read "?  [Enter] zum Schliessen"; exit 1
fi

if [ "$ROLLE" = "anon" ]; then
  print -P "  %F{red}Das ist der oeffentliche Schluessel (anon), nicht der Dienstschluessel.%f"
  echo "  Im Dashboard steht er direkt darunter, unter 'service_role'."
  echo "  Nichts geaendert."
  echo ""; read "?  [Enter] zum Schliessen"; exit 1
fi
if [ "$ROLLE" != "service_role" ]; then
  print -P "  %F{yellow}Rolle im Schluessel: $ROLLE%f"
  echo "  Erwartet haette ich 'service_role'. Trotzdem eintragen?"
  read "?  [j] fuer ja, alles andere bricht ab: " J
  [ "$J" = "j" ] || { echo "  Nichts geaendert."; echo ""; read "?  [Enter]"; exit 1; }
fi

# --- Auf diesem Rechner ---------------------------------------
if grep -q "^SUPABASE_SERVICE_KEY=" "$ENV"; then
  TMP=$(mktemp)
  grep -v "^SUPABASE_SERVICE_KEY=" "$ENV" > "$TMP" && mv "$TMP" "$ENV"
fi
printf '\n# Dienstschluessel: geht an den Zugriffsregeln vorbei. Ohne ihn sieht der\n# Assistent keine Reservierungen und haelt jeden Abend fuer frei.\nSUPABASE_SERVICE_KEY=%s\n' "$NEU" >> "$ENV"
echo "  Auf diesem Rechner eingetragen."

# --- Auf dem Server -------------------------------------------
echo "  Uebertrage auf den Server ..."
if ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" \
     "grep -v '^SUPABASE_SERVICE_KEY=' $ZIEL > $ZIEL.neu && mv $ZIEL.neu $ZIEL && printf '\nSUPABASE_SERVICE_KEY=%s\n' '$NEU' >> $ZIEL" 2>/dev/null; then
  echo "  Auf dem Server eingetragen."
else
  print -P "  %F{red}Keine Verbindung zum Server.%f Auf diesem Rechner steht er trotzdem."
  echo ""; read "?  [Enter] zum Schliessen"; exit 1
fi

# --- Uebernehmen und nachsehen --------------------------------
echo "  Starte den Assistenten neu ..."
ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" \
  "cd /opt/kiekmolin && docker compose up -d telefon-retter" >/dev/null 2>&1
sleep 8

echo ""
echo "  Nachsehen, ob er jetzt die Belegung sieht ..."
ERG=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" \
  "docker exec kiekmolin-telefon-retter-1 node -e \"
const s = require('/app/telefon-retter/lib/supabase');
(async () => {
  const rolle = await s.schluesselRolle();
  console.log('ROLLE=' + rolle);
})();
\"" 2>/dev/null | grep '^ROLLE=' | cut -d= -f2)

echo ""
if [ "$ERG" = "service_role" ]; then
  print -P "  %F{green}Fertig. Der Assistent arbeitet jetzt mit dem Dienstschluessel%f"
  echo "  und sieht die echte Belegung."
else
  print -P "  %F{yellow}Der Assistent meldet weiterhin die Rolle: ${ERG:-unbekannt}%f"
  echo "  Meist hilft: dieses Programm nochmal starten."
fi
echo ""
read "?  [Enter] zum Schliessen"
