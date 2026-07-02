# KURANI · Telefon-Retter - Container fuer den Dauerbetrieb
# Bauen (aus dem Repo-Root):  docker compose build telefon-retter
FROM node:22-slim

WORKDIR /app/telefon-retter

COPY telefon-retter/package*.json ./
RUN npm install --omit=dev

COPY telefon-retter/ ./

EXPOSE 3100
CMD ["node", "server.js"]
