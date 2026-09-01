#!/bin/zsh
# ============================================================
#  Telefon-Assistent auf den Server kopieren
#
#  Schiebt den Code von deinem Mac auf den Cloud-Server und
#  startet die Dienste neu. Ohne Umweg ueber GitHub - deine
#  Interessentenliste bleibt damit privat.
#
#  Vorher einmal: SERVER unten eintragen.
# ============================================================

cd "$(dirname "$0")" || exit 1

# --- Hier die Adresse deines Servers eintragen ---------------
# Beispiel: SERVER="root@203.0.113.42"
SERVER="root@31.70.133.55"
ZIEL="/opt/kiekmolin"

echo ""
echo "  Telefon-Assistent auf den Server kopieren"
echo "  ============================================"
echo ""

if [ -z "$SERVER" ]; then
  echo "  Es fehlt die Server-Adresse."
  echo ""
  echo "  Oeffne diese Datei in einem Texteditor und trage oben bei"
  echo "  SERVER= die Adresse ein, z.B.:"
  echo ""
  echo "      SERVER=\"root@203.0.113.42\""
  echo ""
  echo "  Die IP steht in deinem Hetzner-Konto beim Server."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi

# --- Erreichbar? --------------------------------------------
echo "  Pruefe die Verbindung zu $SERVER ..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" "echo ok" >/dev/null 2>&1; then
  echo ""
  echo "  Keine Verbindung zu $SERVER."
  echo ""
  echo "  Moegliche Gruende:"
  echo "   - Der Server laeuft noch nicht"
  echo "   - Die Adresse stimmt nicht"
  echo "   - Dein SSH-Schluessel liegt nicht auf dem Server"
  echo "     (dann einmal:  ssh-copy-id $SERVER)"
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi
echo "  Verbindung steht."

# --- Was NICHT mitgeht --------------------------------------
# node_modules baut der Server selbst. Die .env-Dateien bleiben
# auf dem Server wie sie sind - sonst wuerden die dort
# eingetragenen Schluessel bei jedem Kopieren ueberschrieben.
AUS=(
  --exclude ".git"
  --exclude "node_modules"
  --exclude ".env"
  --exclude ".netzfassung"
  --exclude ".DS_Store"
  --exclude "*.log"
)

echo ""
echo "  Kopiere ..."
# Die Dockerfiles liegen in den Unterordnern und gehen dort mit.
# dauerbetrieb-setup.sh kommt mit, damit der Server-Teil dort ausfuehrbar ist.
# prospects.json muss mit: die Interessentenliste liegt bewusst NICHT
# mehr im oeffentlichen Repo, der Server braucht sie aber zum Arbeiten.
rsync -az --delete "${AUS[@]}" \
  telefon-retter sichtbarkeit agentur docker-compose.yml dauerbetrieb-setup.sh \
  prospects.json \
  "$SERVER:$ZIEL/" 2>&1 | tail -5
ERG=$?

if [ $ERG -ne 0 ]; then
  echo ""
  echo "  Das Kopieren hat nicht geklappt (Fehler $ERG)."
  echo "  Auf dem Server bleibt alles wie es war."
  echo ""
  read -q "?  [Enter] zum Schliessen"
  exit 1
fi
echo "  Kopiert."

# --- Neu starten --------------------------------------------
echo ""
echo "  Starte die Dienste neu ..."
# Der Exit-Code muss von ssh kommen, nicht von tail - sonst meldet das
# Skript Erfolg, obwohl der Befehl auf dem Server fehlgeschlagen ist. 
ssh "$SERVER" "cd $ZIEL && docker compose up -d --build" > /tmp/serverstart.log 2>&1
NEU=$?
tail -8 /tmp/serverstart.log

echo ""
if [ $NEU -eq 0 ]; then
  echo "  Fertig. Der Assistent laeuft mit dem neuen Stand."
  echo ""
  echo "  Zum Nachsehen, ob er wirklich abnimmt:"
  echo "     ssh $SERVER 'cd $ZIEL && docker compose logs -f telefon-retter'"
else
  echo "  Der Neustart hat gehakt (Fehler $NEU)."
  echo "  Nachsehen mit:  ssh $SERVER 'cd $ZIEL && docker compose ps'"
fi
echo ""
read -q "?  [Enter] zum Schliessen"
