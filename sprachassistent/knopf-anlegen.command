#!/bin/bash
# LEGT DEN STARTKNOPF AUF DEN SCHREIBTISCH.
#
# Doppelklick - danach liegt "Kurani.command" auf dem Schreibtisch und
# startet den Assistenten mit einem Doppelklick.
#
# Warum eine eigene Datei statt eines Alias: der Finder oeffnet Aliase auf
# .command-Dateien nicht zuverlaessig, und macOS haengt frisch angelegten
# Dateien eine Quarantaene-Markierung an. Beides wird hier erledigt.

cd "$(dirname "$0")" || exit 1
ORDNER="$(pwd)"
KNOPF="$HOME/Desktop/Kurani.command"

cat > "$KNOPF" <<EOF
#!/bin/bash
# Kurani · Sprachassistent - Startknopf (angelegt von knopf-anlegen.command)
cd "$ORDNER" || { echo "  Der Ordner $ORDNER ist weg."; read -r -p "  Enter zum Schliessen..."; exit 1; }

# Laeuft noch einer von vorhin? Der blockiert sonst den Platz.
lsof -ti:3400 | xargs kill -9 2>/dev/null

# Browser aufmachen, sobald der Server steht.
( sleep 3; open "http://localhost:3400" >/dev/null 2>&1 ) &

echo ""
echo "  KURANI · Sprachassistent"
echo "  Dieses Fenster offen lassen - zumachen heisst: Assistent aus."
echo ""
exec node server.js
EOF

chmod +x "$KNOPF"
# Ohne das fragt macOS bei jedem Start nach.
xattr -d com.apple.quarantine "$KNOPF" 2>/dev/null

echo ""
echo "  Fertig. Auf dem Schreibtisch liegt jetzt: Kurani.command"
echo "  Doppelklick startet den Assistenten."
echo ""
echo "  Beim allerersten Mal meckert macOS vielleicht:"
echo "  Rechtsklick -> Oeffnen -> Oeffnen. Danach reicht Doppelklick."
echo ""
read -r -p "  Mit Enter schliessen..."
