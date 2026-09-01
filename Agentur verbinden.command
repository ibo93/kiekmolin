#!/bin/zsh
# ============================================================
#  Agentur verbinden
#
#  Die Agentur laeuft auf dem Server, nicht mehr hier. Dieses
#  Programm baut eine Verbindung dorthin auf, damit das CRM sie
#  unter localhost:3200 findet - genau wie frueher.
#
#  Lass dieses Fenster offen, solange du im CRM arbeitest.
#  Zum Beenden: Fenster schliessen oder Strg+C.
#
#  Warum nicht direkt ueber die Server-Adresse? Weil die Agentur
#  keinen Login hat. Ueber diese Verbindung ist sie nur fuer
#  diesen Mac erreichbar, nicht fuer das halbe Internet.
# ============================================================

SERVER="root@31.70.133.55"
KEY="$HOME/.ssh/id_ed25519"

echo ""
echo "  Agentur verbinden"
echo "  ============================================"
echo ""

# Laeuft hier noch die alte Agentur? Die wuerde den Port belegen.
BELEGT=""
for PID in $(lsof -ti :3200 2>/dev/null); do
  BEFEHL=$(ps -o command= -p "$PID" 2>/dev/null)
  case "$BEFEHL" in
    *node*server.js*) BELEGT="$BELEGT $PID" ;;
  esac
done

if [ -n "$BELEGT" ]; then
  echo "  Hier laeuft noch die alte Agentur. Die schalte ich ab -"
  echo "  ab jetzt kommt alles vom Server."
  for PID in ${=BELEGT}; do kill "$PID" 2>/dev/null; done
  sleep 2
  echo "  abgeschaltet."
  echo ""
fi

echo "  Verbinde mit dem Server ..."
echo "  (Fenster offen lassen, solange du im CRM arbeitest)"
echo ""

# Endlos-Schleife: bricht die Verbindung ab, wird sie neu aufgebaut.
# Ein WLAN-Aussetzer soll nicht bedeuten, dass das CRM ploetzlich
# ins Leere greift.
while true; do
  ssh -i "$KEY" -N \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -L 3200:localhost:3200 \
      "$SERVER"
  ERG=$?
  [ $ERG -eq 0 ] && break
  echo "  Verbindung unterbrochen - neuer Versuch in 5 Sekunden ..."
  sleep 5
done

echo ""
echo "  Verbindung beendet."
read -q "?  [Enter] zum Schliessen"
