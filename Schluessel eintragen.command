#!/bin/zsh
# ============================================================
#  Anthropic-Schluessel eintragen
#
#  Fragt den Schluessel ab und traegt ihn in telefon-retter/.env
#  ein. Die Eingabe ist verdeckt - der Schluessel steht danach
#  nur in der Datei, nicht im Fensterverlauf.
#
#  Die alte Fassung wird vorher gesichert.
# ============================================================

cd "$(dirname "$0")" || exit 1
ENV="telefon-retter/.env"

echo ""
echo "  Anthropic-Schluessel eintragen"
echo "  ============================================"
echo ""

if [ ! -f "$ENV" ]; then
  echo "  Ich finde $ENV nicht."
  echo "  Starte das Programm aus dem kiekmolin-Ordner heraus."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi

ALT=$(grep "^ANTHROPIC_API_KEY=" "$ENV" | cut -d= -f2-)
if [ -n "$ALT" ]; then
  echo "  Bisher eingetragen: ...${ALT: -6}  (${#ALT} Zeichen)"
else
  echo "  Bisher ist keiner eingetragen."
fi
echo ""
echo "  Neuen Schluessel einfuegen (Cmd+V) und Enter druecken."
echo "  Die Eingabe bleibt unsichtbar - das ist so gewollt."
echo ""
printf "  Schluessel: "
read -s NEU
echo ""
echo ""

if [ -z "$NEU" ]; then
  echo "  Nichts eingegeben - es bleibt alles wie es war."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 0
fi

# Vertipper und halbe Zwischenablagen abfangen, bevor der Assistent
# damit gegen die Wand faehrt.
if [[ "$NEU" != sk-ant-* ]]; then
  echo "  Das sieht nicht nach einem Anthropic-Schluessel aus."
  echo "  Die fangen mit  sk-ant-  an."
  echo ""
  echo "  Nichts geaendert."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi
if [ ${#NEU} -lt 50 ]; then
  echo "  Der ist zu kurz (${#NEU} Zeichen) - vermutlich unvollstaendig kopiert."
  echo "  Nichts geaendert."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi

cp "$ENV" "$ENV.vorher"

if grep -q "^ANTHROPIC_API_KEY=" "$ENV"; then
  # Der Schluessel kann / und & enthalten - deshalb NICHT mit sed
  # ersetzen, sondern die Zeile in Python austauschen.
  python3 - "$ENV" "$NEU" <<'PY'
import io, sys
p, neu = sys.argv[1], sys.argv[2]
zeilen = io.open(p, encoding='utf-8').read().split('\n')
zeilen = [('ANTHROPIC_API_KEY=' + neu) if z.startswith('ANTHROPIC_API_KEY=') else z
          for z in zeilen]
io.open(p, 'w', encoding='utf-8').write('\n'.join(zeilen))
PY
else
  echo "ANTHROPIC_API_KEY=$NEU" >> "$ENV"
fi

echo "  Eingetragen. Ich probiere ihn gleich aus ..."
echo ""

ANTWORT=$(curl -s -m 30 https://api.anthropic.com/v1/messages \
  -H "x-api-key: $NEU" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')

if echo "$ANTWORT" | grep -q '"error"'; then
  MELDUNG=$(echo "$ANTWORT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',{}).get('message','')[:150])" 2>/dev/null)
  echo "  Er wird noch abgelehnt:"
  echo "  $MELDUNG"
  echo ""
  echo "  Der Schluessel steht trotzdem in der Datei."
  echo "  Die alte Fassung liegt als $ENV.vorher daneben."
else
  echo "  Er funktioniert. Der Assistent kann wieder antworten."
  rm -f "$ENV.vorher"
  echo ""
  echo "  Jetzt noch den Motor neu starten, damit er den neuen"
  echo "  Schluessel liest:  'Motor immer anlassen.command'"
fi
echo ""
read -q "?  [Enter] zum Schliessen"
