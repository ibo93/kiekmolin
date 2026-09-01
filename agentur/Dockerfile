# KURANI · Agentur-App - Container fuer den Dauerbetrieb
# Chromium ist enthalten, damit die Reports auch als PDF erzeugt werden.
# Bauen (aus dem Repo-Root):  docker compose build agentur
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV CHROME_PFAD=/usr/bin/chromium

WORKDIR /app
# Die Agentur-App nutzt sichtbarkeit/ als Motor - beide Ordner gehoeren ins Image
COPY sichtbarkeit/ ./sichtbarkeit/
COPY agentur/ ./agentur/
# Die Agentur nutzt Bibliotheken des Telefon-Assistenten (Supabase-Zugriff,
# Dialog, ElevenLabs, Webseiten-Import). Auf dem Entwicklungsrechner liegen
# beide Ordner nebeneinander und es faellt nicht auf - im Container fehlten
# sie, und die Agentur startete in einer Endlosschleife neu.
COPY telefon-retter/lib/ ./telefon-retter/lib/
COPY telefon-retter/package*.json ./telefon-retter/

WORKDIR /app/agentur
EXPOSE 3200
CMD ["node", "server.js"]
