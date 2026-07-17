#!/usr/bin/env bash
# KURANI · Dauerbetrieb-Setup - richtet einen frischen Ubuntu-Server
# (z.B. Hetzner CX22) in einem Rutsch fuer den 24/7-Betrieb ein:
# Docker + Caddy (HTTPS) + Repo + .env-Vorlagen + Start beider Dienste.
#
# Auf dem Server als root ausfuehren:
#   curl -fsSL https://raw.githubusercontent.com/ibo93/kiekmolin/main/dauerbetrieb-setup.sh | bash -s -- telefon.DEINE-DOMAIN.de
#
# Idempotent: darf mehrfach laufen (z.B. nach einem Fehler einfach nochmal).
# Details und Handbetrieb: DAUERBETRIEB.md

set -euo pipefail

DOMAIN="${1:-}"
REPO_URL="https://github.com/ibo93/kiekmolin.git"
ZIEL="/opt/kiekmolin"

echo "== KURANI Dauerbetrieb-Setup =="
if [ -z "$DOMAIN" ]; then
  echo "FEHLER: Bitte die Telefon-Domain angeben, z.B.:"
  echo "  bash dauerbetrieb-setup.sh telefon.kurani-design.de"
  echo "(Vorher den A-Record der Domain auf die IP dieses Servers zeigen lassen.)"
  exit 1
fi

# --- 1. Docker (offizielles Skript, ueberspringt wenn vorhanden) -------------
if ! command -v docker >/dev/null 2>&1; then
  echo "-> Docker installieren"
  curl -fsSL https://get.docker.com | sh
else
  echo "-> Docker ist schon da"
fi

# --- 2. Caddy fuer HTTPS (Twilio verlangt https) ------------------------------
if ! command -v caddy >/dev/null 2>&1; then
  echo "-> Caddy installieren"
  apt-get update -qq && apt-get install -y -qq caddy
else
  echo "-> Caddy ist schon da"
fi

echo "-> Caddyfile schreiben ($DOMAIN -> Telefon-Retter auf Port 3100)"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    reverse_proxy localhost:3100
}
# Die Agentur-App (3200) bleibt bewusst PRIVAT (kein Login!).
# Zugriff per SSH-Tunnel:  ssh -L 3200:localhost:3200 root@SERVER-IP
CADDY
systemctl enable --now caddy >/dev/null 2>&1 || true
systemctl reload caddy

# --- 3. Repo holen / aktualisieren -------------------------------------------
if [ -d "$ZIEL/.git" ]; then
  echo "-> Repo aktualisieren"
  git -C "$ZIEL" pull --ff-only
else
  echo "-> Repo klonen nach $ZIEL"
  git clone "$REPO_URL" "$ZIEL"
fi
cd "$ZIEL"

# --- 4. .env-Dateien anlegen (nur wenn noch nicht da - nie ueberschreiben!) ---
for paar in "telefon-retter" "sichtbarkeit"; do
  if [ ! -f "$paar/.env" ]; then
    cp "$paar/.env.example" "$paar/.env"
    echo "-> $paar/.env angelegt (aus .env.example) - KEYS EINTRAGEN!"
  else
    echo "-> $paar/.env existiert schon - bleibt unangetastet"
  fi
done

# BASE_URL fuer Twilio direkt richtig setzen (falls noch der Platzhalter drin ist)
if ! grep -q "^BASE_URL=https://$DOMAIN" telefon-retter/.env; then
  if grep -q "^BASE_URL=" telefon-retter/.env; then
    sed -i "s|^BASE_URL=.*|BASE_URL=https://$DOMAIN|" telefon-retter/.env
  else
    echo "BASE_URL=https://$DOMAIN" >> telefon-retter/.env
  fi
  echo "-> BASE_URL=https://$DOMAIN in telefon-retter/.env gesetzt"
fi

# --- 5. Dienste bauen und starten (restart: unless-stopped = ueberlebt Reboots)
echo "-> Dienste bauen und starten (kann beim ersten Mal ein paar Minuten dauern)"
docker compose up -d --build

echo ""
echo "== FERTIG. Jetzt noch von Hand: =="
echo "1. Keys eintragen:  nano $ZIEL/telefon-retter/.env   und   nano $ZIEL/sichtbarkeit/.env"
echo "   Danach neu starten:  cd $ZIEL && docker compose up -d"
echo "2. Twilio-Webhook der Nummer setzen:  https://$DOMAIN/anruf   (A call comes in, HTTP POST)"
echo "3. Kontrolle:  curl https://$DOMAIN/health   ->  {\"ok\":true,...}"
echo "4. Agentur-App von deinem Rechner aus:  ssh -L 3200:localhost:3200 root@SERVER-IP"
echo "   dann im Browser: http://localhost:3200"
