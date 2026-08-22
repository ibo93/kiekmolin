#!/bin/zsh
# ============================================================
#  Kurani CRM starten
#
#  Startet den kleinen Server auf Port 8899 (falls er nicht schon
#  laeuft) und macht das CRM im Browser auf.
#
#  Der Port ist fest: Der Browser speichert deine Daten pro Adresse.
#  Unter einer anderen Adresse waere dein CRM auf einmal leer.
# ============================================================

cd "$(dirname "$0")" || exit 1
PORT=8899
URL="http://localhost:$PORT/index.html"

if [ ! -f index.html ]; then
  echo "index.html fehlt neben diesem Starter."
  echo "Liegt die Datei noch im Ordner Kurani-CRM?"
  read -q "?[Enter] zum Schliessen"
  exit 1
fi

# Laeuft schon einer auf dem Port?
if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/index.html"; then
  echo "Server laeuft schon."
else
  if command -v node > /dev/null 2>&1; then
    nohup node server.js > /tmp/kurani-crm-server.log 2>&1 &
  else
    # Notfalls Python – reicht zum Anzeigen
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 > /tmp/kurani-crm-server.log 2>&1 &
  fi
  # Kurz warten, bis er antwortet
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -s -o /dev/null --max-time 1 "http://localhost:$PORT/index.html" && break
    sleep 0.4
  done
fi

if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/index.html"; then
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    open "$URL"
  fi
else
  echo "Der Server ist nicht hochgekommen. Log: /tmp/kurani-crm-server.log"
  read -q "?[Enter] zum Schliessen"
  exit 1
fi

osascript -e 'tell application "Terminal" to close (every window whose name contains "Kurani CRM starten")' >/dev/null 2>&1 &
exit 0
