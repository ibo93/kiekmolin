# Kiek mol in + Kurani KI-Agentur

Zwei Dinge leben in diesem Repository:

1. **Kiek mol in** – die Restaurant-Plattform für Ostfriesland
   (kiekmolin.de): Reservierungen, Bestellungen, Dashboards für ~25
   Gastronomen. Kern: `index.html`, Deploy über Netlify.
2. **Die KI-Agentur** – drei eigenständige Projekte, die an dieselbe
   Datenbank andocken, ohne die Plattform anzufassen (siehe
   `Kurani_KIAgentur_Bauplan` / Strategie-Dokument).

## Schnelleinstieg

**→ [`START-HIER.md`](START-HIER.md)** – eine Seite: wie alles
zusammenhängt und wie du es in Betrieb nimmst.

```bash
cd agentur && node server.js --demo    # die Agentur-App ansehen
# → http://localhost:3200
```

## Die Projekte

| Ordner | Was es ist | Doku |
|---|---|---|
| `index.html` + Root | Die Kiek-mol-in-App (Netlify) | `APPLY-CHANGES.md` |
| `agentur/` | Web-Oberfläche der Agentur: Kunden, Reports per Klick, Telefon-Status | `agentur/README.md` |
| `sichtbarkeit/` | Baustein 2: KI-Sichtbarkeit – Monats-Report + Aufbereitung | `sichtbarkeit/README.md` |
| `telefon-retter/` | Baustein 1: KI-Telefon-Agent (Reservierung → Infos → Bestellung) | `telefon-retter/README.md`, `TEST-CHECKLISTE.md` |

## Weitere Anleitungen

- [`PILOT-GREETSIELER-BOERSE.md`](PILOT-GREETSIELER-BOERSE.md) – Fahrplan
  für den ersten Kunden
- [`DAUERBETRIEB.md`](DAUERBETRIEB.md) – beide Dienste per Docker auf einem
  Cloud-Server betreiben (`docker compose up -d`)

## Goldene Regeln

- `index.html` niemals neu schreiben; Backup vor großen Änderungen.
- Die Agentur-Projekte reden mit der Datenbank **nur** über die
  Supabase-API – gleiche Tabellen und Prüfungen wie die App.
- Secrets ausschließlich in `.env`-Dateien (gitignored), nie im Code.
- Nie „Platz 1 garantiert" versprechen; Bestellungen am Telefon werden
  immer vorgelesen und bestätigt; im Zweifel Rückruf statt falscher Zusage.
