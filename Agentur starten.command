#!/usr/bin/env bash
# KURANI · Agentur starten
#
# Diese Datei ist zum DOPPELKLICKEN im Finder gedacht - kein Terminal,
# kein Befehl abtippen, kein "in welchem Fenster war ich nochmal".
# macOS oeffnet sie in Terminal und fuehrt sie aus.
#
# Falls beim ersten Doppelklick nichts passiert ("kann nicht geoeffnet
# werden"), einmal im Terminal:  chmod +x "Agentur starten.command"
# Und beim ersten Mal fragt macOS eventuell nach - dann Rechtsklick auf
# die Datei, "Oeffnen", und im Hinweisfenster nochmal "Oeffnen".

cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

echo "=============================================="
echo "  KURANI AGENTUR"
echo "=============================================="
echo
echo "Dieses Fenster bleibt offen, solange die Agentur laeuft."
echo "HIER NICHTS EINTIPPEN. Fuer alles andere ein neues Fenster (Cmd+N)."
echo
echo "Beenden: dieses Fenster schliessen oder Strg+C."
echo

# Node muss da sein - sonst startet gar nichts, und zwar mit einer
# Meldung, die einem Nicht-Techniker nichts sagt.
if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: Node ist auf diesem Mac nicht installiert."
  echo
  echo "Das ist das Programm, mit dem die Agentur laeuft."
  echo "Zu holen unter:  https://nodejs.org  (die linke, empfohlene Version)"
  echo "Danach diese Datei nochmal doppelklicken."
  echo
  read -r -p "Zum Schliessen Enter druecken."
  exit 1
fi

# Pakete fehlen nach einem frischen Klonen - dann einmal nachinstallieren,
# statt den Nutzer mit "Cannot find module" alleinzulassen.
if [ ! -d node_modules ]; then
  echo "Beim ersten Start werden die noetigen Pakete geladen. Das dauert kurz…"
  npm install || {
    echo
    echo "Das Nachladen hat nicht geklappt. Haeufigste Ursache: kein Internet."
    read -r -p "Zum Schliessen Enter druecken."
    exit 1
  }
  echo
fi

node mac-dauerbetrieb.js

# Ist der Dauerbetrieb beendet (Absturz oder Strg+C), soll das Fenster
# NICHT sofort verschwinden - sonst ist die Fehlermeldung weg, bevor
# sie jemand lesen konnte.
echo
echo "=============================================="
echo "  Die Agentur ist beendet."
echo "  Stand oben eine Fehlermeldung? Die bitte schicken."
echo "=============================================="
read -r -p "Zum Schliessen Enter druecken."
