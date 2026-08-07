# Dauerbetrieb · Telefon-Retter + Agentur-App auf einem Cloud-Server

Damit der Telefon-Retter rund um die Uhr Anrufe annimmt, muss er auf einem
Server laufen, nicht auf deinem Rechner. Diese Anleitung bringt beide Dienste
auf einen kleinen Cloud-Server (z.B. Hetzner CX22, ~4 €/Monat).

## Der schnelle Weg: ein Befehl

Auf dem frischen Ubuntu-Server (als root), nachdem der A-Record deiner
Telefon-Domain auf die Server-IP zeigt:

```bash
curl -fsSL https://raw.githubusercontent.com/ibo93/kiekmolin/main/dauerbetrieb-setup.sh -o setup.sh
bash setup.sh telefon.kurani-design.de check.kurani-design.de
```

Das Skript installiert Docker + Caddy (HTTPS), holt das Repo nach
`/opt/kiekmolin`, legt die `.env`-Dateien an (ohne vorhandene zu
überschreiben), setzt `BASE_URL` und startet beide Dienste. Danach nur
noch: Keys in die `.env`-Dateien, Twilio-Webhook setzen — steht am Ende
der Skript-Ausgabe. Die Schritte unten sind derselbe Weg von Hand.

**Der zweite Parameter ist die öffentliche Lead-Seite** (optional, aber
empfohlen): Unter `https://check.deine-domain.de/check` können sich
Restaurants selbst für den kostenlosen Sichtbarkeits-Check eintragen –
der Link für Instagram-Bio, WhatsApp-Status und Visitenkarte. Caddy gibt
dort **nur** `/check` und `/api/lead` frei; alle anderen Pfade der
Agentur-App (Kundendaten, Reports, Journale) antworten mit 404. Die App
selbst bleibt wie gehabt nur per SSH-Tunnel erreichbar.

## 1. Server mieten und vorbereiten (einmalig, ~20 Minuten)

1. Server bestellen: hetzner.com → Cloud → Ubuntu 24.04, kleinste Größe reicht.
2. Per SSH verbinden und Docker installieren:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Repo holen und Keys eintragen:
   ```bash
   git clone https://github.com/ibo93/kiekmolin.git && cd kiekmolin
   cp telefon-retter/.env.example telefon-retter/.env && nano telefon-retter/.env
   cp sichtbarkeit/.env.example  sichtbarkeit/.env  && nano sichtbarkeit/.env
   ```

## 2. HTTPS für Twilio (einmalig)

Twilio verlangt eine `https://`-Adresse. Am einfachsten mit Caddy
(holt sich das TLS-Zertifikat automatisch):

1. Eine (Sub-)Domain auf die Server-IP zeigen lassen, z.B.
   `telefon.kurani-design.de` → A-Record auf die IP.
2. Caddy installieren (`apt install caddy`) und als `/etc/caddy/Caddyfile`:
   ```
   telefon.kurani-design.de {
       reverse_proxy localhost:3100
   }
   ```
   Danach `systemctl reload caddy`.
3. In `telefon-retter/.env`: `BASE_URL=https://telefon.kurani-design.de`
4. In Twilio bei der Nummer: Webhook `https://telefon.kurani-design.de/anruf`

Die Agentur-App (Port 3200) NICHT öffentlich machen — sie hat keinen Login.
Entweder nur lokal per SSH-Tunnel nutzen:
```bash
ssh -L 3200:localhost:3200 root@DEINE-SERVER-IP
# dann wie gewohnt: http://localhost:3200
```
…oder in Caddy mit `basic_auth` schützen.

## 3. Starten

```bash
docker compose up -d       # baut und startet beide Dienste
docker compose logs -f     # zuschauen (Strg+C beendet nur die Anzeige)
```

- Telefon-Retter: Port 3100 (über Caddy als https erreichbar)
- Agentur-App: Port 3200 (per SSH-Tunnel)
- `restart: unless-stopped` sorgt dafür, dass beide nach einem
  Server-Neustart automatisch wieder laufen.

## 4. Updates einspielen

```bash
cd kiekmolin
git pull
docker compose up -d --build
```

Kunden-Historie, Reports und Anruf-Protokolle bleiben erhalten — sie liegen
als Ordner neben dem Code (`sichtbarkeit/data`, `sichtbarkeit/reports`,
`telefon-retter/logs`), nicht im Container.

## 5. Kontrolle

```bash
curl http://localhost:3100/health    # Telefon-Retter: {"ok":true,...}
docker compose ps                    # beide "running"?
ls telefon-retter/logs/              # Anruf-Protokolle
```

Notbremse: `docker compose stop telefon-retter` — dann greift die
Rufumleitung ins Leere und das Telefon klingelt wieder nur beim Wirt.

Kunden-Portal öffentlich machen (optional): in der Caddy-Config zusätzlich
```
portal.kurani-design.de {
    reverse_proxy localhost:3200
    @nichtPortal not path /portal/*
    respond @nichtPortal 404
}
```
So ist NUR `/portal/…` erreichbar – der Rest der Agentur-App bleibt privat.
