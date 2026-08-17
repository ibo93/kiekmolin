#!/bin/bash
# KURANI · Sprachassistent — Startknopf fuer den Mac
#
# Doppelklick im Finder genuegt. (Beim allerersten Mal fragt macOS
# nach: Rechtsklick -> Oeffnen -> Oeffnen.)
#
# Was hier passiert:
#   1. in den richtigen Ordner wechseln (egal von wo geklickt wurde)
#   2. beim ersten Start die eine Abhaengigkeit holen (ws)
#   3. Selbstpruefung - klemmt etwas, steht es hier, bevor es losgeht
#   4. Server starten und den Browser aufmachen
#
# Fenster zumachen = Assistent aus. Nichts laeuft heimlich weiter.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  KURANI · Sprachassistent"
echo "  ================================================"

# Node da?
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node ist nicht installiert."
  echo "  -> nodejs.org oeffnen, LTS-Version holen, dann nochmal doppelklicken."
  echo ""
  read -r -p "  Mit Enter schliessen..."
  exit 1
fi

# Beim ersten Start: ws holen (fuer das Live-Gespraech)
if [ ! -d node_modules/ws ]; then
  echo "  Erster Start - hole einmalig die Abhaengigkeit (ws) ..."
  npm install --no-audit --no-fund --silent || {
    echo "  npm install hat nicht geklappt. Ohne ws laeuft alles ausser Live."
  }
fi

# Selbstpruefung. Bricht sie ab, sagt sie warum - dann nicht starten.
if ! node pruefe.js; then
  echo "  Erst das oben in Ordnung bringen, dann nochmal starten."
  echo ""
  read -r -p "  Mit Enter schliessen..."
  exit 1
fi

PORT="${SPRACH_PORT:-3400}"

# Browser aufmachen, sobald der Server steht (kurz warten, dann oeffnen).
( sleep 2; open "http://localhost:${PORT}" >/dev/null 2>&1 ) &

echo "  Fenster: http://localhost:${PORT}"
echo "  Beenden: dieses Fenster schliessen oder Strg+C"
echo ""

exec node server.js
