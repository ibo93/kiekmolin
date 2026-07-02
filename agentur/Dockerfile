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

WORKDIR /app/agentur
EXPOSE 3200
CMD ["node", "server.js"]
