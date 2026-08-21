#!/usr/bin/env bash
# KURANI · Autostart auf dem Mac einrichten
#
#   bash mac-autostart.sh          # einrichten
#   bash mac-autostart.sh aus      # wieder entfernen
#
# Sorgt dafuer, dass mac-dauerbetrieb.js beim Anmelden von selbst startet
# und nach einem Absturz neu gestartet wird. macOS macht das ueber launchd -
# das ist der Dienst, der auf einem Mac dafuer zustaendig ist, dass Dinge
# laufen, ohne dass jemand ein Terminal offen haelt.
#
# WARUM UEBERHAUPT: Ein Terminal-Fenster, das offen bleiben muss, ist keine
# Dauerloesung. Es reicht ein versehentliches Cmd+Q, ein Neustart nach einem
# Update oder ein Stromausfall - und das Telefon ist tot, ohne dass es jemand
# merkt. Genau das darf bei einem Dienst, den du verkaufst, nicht passieren.

set -euo pipefail

ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KENNUNG="de.kurani.dauerbetrieb"
PLIST="$HOME/Library/LaunchAgents/$KENNUNG.plist"

if [ "$(uname)" != "Darwin" ]; then
  echo "Dieses Skript ist fuer macOS. Auf einem Server nimm dauerbetrieb-setup.sh."
  exit 1
fi

# --- Abschalten ---------------------------------------------------------------
if [ "${1:-}" = "aus" ]; then
  if [ -f "$PLIST" ]; then
    launchctl bootout "gui/$(id -u)/$KENNUNG" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Autostart entfernt. Der Dauerbetrieb laeuft ab jetzt nur noch,"
    echo "wenn du ihn selbst startest:  node mac-dauerbetrieb.js"
  else
    echo "Es war gar kein Autostart eingerichtet."
  fi
  exit 0
fi

# --- Node finden --------------------------------------------------------------
# launchd startet ohne die PATH-Einstellungen deiner Shell. Der volle Pfad
# muss deshalb in die Datei, sonst laeuft es im Terminal und beim Anmelden nicht.
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "FEHLER: node ist nicht auffindbar. Erst Node installieren (nodejs.org)."
  exit 1
fi
echo "-> node gefunden: $NODE"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTENDE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$KENNUNG</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ORDNER/mac-dauerbetrieb.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$ORDNER</string>

  <!-- Beim Anmelden starten und nach einem Absturz wieder hochfahren. -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <!-- Nach einem Absturz zehn Sekunden warten, statt sofort neu zu starten:
       so bekommt eine kurz weggebrochene Leitung Zeit, zurueckzukommen. -->
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>$ORDNER/dauerbetrieb-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$ORDNER/dauerbetrieb-launchd.log</string>
</dict>
</plist>
PLISTENDE

# Falls schon einer lief: erst sauber raus, dann neu rein.
launchctl bootout "gui/$(id -u)/$KENNUNG" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "== Eingerichtet =="
echo "Der Dauerbetrieb startet ab jetzt beim Anmelden von selbst."
echo
echo "Nachsehen, ob er laeuft:"
echo "  launchctl list | grep kurani"
echo
echo "Mitlesen, was er tut:"
echo "  tail -f $ORDNER/dauerbetrieb.log"
echo
echo "Wieder abschalten:"
echo "  bash mac-autostart.sh aus"
echo
echo "NOCH ZU TUN, sonst hilft der Autostart nichts:"
echo "  1. Systemeinstellungen -> Batterie/Energie:"
echo "     'Automatischen Ruhezustand bei ausgeschaltetem Display verhindern' AN"
echo "     (Beim MacBook nur mit Netzteil - im Akkubetrieb schlaeft er trotzdem.)"
echo "  2. Systemeinstellungen -> Allgemein -> Anmelden:"
echo "     Automatische Anmeldung AN. Sonst startet nach einem Stromausfall"
echo "     nichts, bis jemand das Passwort eintippt."
