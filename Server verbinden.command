#!/bin/zsh
# ============================================================
#  Server verbinden
#
#  Traegt den SSH-Schluessel dieses Macs auf dem Server ein.
#  Danach laeuft alles ohne Passwort.
#
#  Das Terminal zeigt beim Passwort normalerweise NICHTS an -
#  keine Punkte, keine Sternchen. Das verunsichert und man
#  weiss nie, ob die Eingabe ankommt. Hier siehst du Sternchen.
# ============================================================

SERVER_IP="31.70.133.55"
KEY="$HOME/.ssh/id_ed25519"

echo ""
echo "  Server verbinden"
echo "  ============================================"
echo ""

[ -f "$KEY.pub" ] || ssh-keygen -t ed25519 -N "" -C "kurani-crm@$(hostname -s)" -f "$KEY" -q

if ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "root@$SERVER_IP" true 2>/dev/null; then
  echo "  Der Server kennt diesen Mac bereits - nichts zu tun."
  echo "  Sag Claude Bescheid."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 0
fi

echo "  Das Root-Passwort steht im IONOS-Panel unter"
echo "  \"Zugangsdaten\", unter dem Benutzernamen root."
echo ""

# Passwort mit sichtbaren Sternchen abfragen. read -s zeigt nichts an,
# deshalb Zeichen fuer Zeichen mit eigener Anzeige.
PW=""
printf "  Passwort: "
while true; do
  read -k 1 c
  if [[ "$c" == $'\n' || "$c" == $'\r' ]]; then echo; break; fi
  if [[ "$c" == $'\177' ]]; then                 # Rueckschritt
    if [ -n "$PW" ]; then PW="${PW%?}"; printf "\b \b"; fi
  else
    PW="$PW$c"; printf "*"
  fi
done

PW="${PW## }"; PW="${PW%% }"                     # mitkopierte Leerzeichen weg
if [ -z "$PW" ]; then
  echo "  Nichts eingegeben."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi
echo "  ${#PW} Zeichen erhalten. Verbinde ..."
echo ""

SCHLUESSEL=$(cat "$KEY.pub")

# expect fuettert das Passwort an ssh - ssh nimmt es nur von einem
# echten Terminal entgegen, nicht ueber eine Pipe.
expect <<EXPECTENDE >/tmp/verbinden.log 2>&1
set timeout 40
log_user 1
spawn ssh -o StrictHostKeyChecking=accept-new -o NumberOfPasswordPrompts=1 \
    root@$SERVER_IP "mkdir -p ~/.ssh && echo '$SCHLUESSEL' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys && echo OK_EINGETRAGEN"
expect {
  -re "(?i)password:" { send "$PW\r"; exp_continue }
  "OK_EINGETRAGEN"    { exit 0 }
  "Permission denied" { exit 2 }
  timeout             { exit 3 }
  eof                 { exit 4 }
}
EXPECTENDE
ERG=$?

if ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "root@$SERVER_IP" true 2>/dev/null; then
  echo "  GESCHAFFT. Der Server kennt diesen Mac jetzt."
  echo "  Sag Claude Bescheid - den Rest macht er allein."
elif [ $ERG -eq 2 ]; then
  echo "  Das Passwort wurde abgelehnt."
  echo ""
  echo "  Im IONOS-Panel unter Zugangsdaten nachsehen. Dort kannst du"
  echo "  es auch neu setzen - dann kennst du es sicher."
  echo "  Danach dieses Programm nochmal starten."
else
  echo "  Hat nicht geklappt (Code $ERG)."
  echo "  Die letzten Zeilen:"
  tail -6 /tmp/verbinden.log | sed 's/^/    /'
fi
echo ""
read -q "?  [Enter] zum Schliessen"
