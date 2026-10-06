# Datenbank in Worten

Der Entwurf steht in `supabase/schema-entwurf.sql` (30 Tabellen — in der Datenbank nachgezählt —, noch
**nicht eingespielt**). Geprüft am 01.10.2026 in einer leeren
PostgreSQL 16 mit `supabase/tests/entwurf-pruefen.sql`: Schema lädt
fehlerfrei, 15 von 15 Prüfungen grün, drei absichtlich eingebaute Lecks
wurden alle erkannt.

## Die Bereiche

| Bereich | Tabellen | Wofür |
|---|---|---|
| **Betriebe** | `tenants`, `tenant_members`, `platform_admins`, `phone_numbers` | Wer ist Kunde, wer darf was, welche Agent-Nummer gehört zu wem |
| **Einstellungen** | `tenant_settings`, `opening_hours`, `closures`, `public_holidays`, `delivery_zones`, `faq_entries` | Alles, was der Wirt in der App selbst stellt |
| **Speisekarte** | `menu_categories`, `menu_items`, `menu_item_variants`, `modifier_groups`, `modifiers`, `menu_item_modifier_groups` | Gerichte, Größen, Extras, Allergene, „heute ausverkauft“ |
| **Gespräche** | `conversations`, `conversation_turns` | Anrufprotokoll + Transkript; später auch WhatsApp |
| **Bestellungen** | `orders`, `order_items`, `order_item_modifiers`, `order_events` | Bestellung mit festgehaltenen Preisen + Statusverlauf |
| **Reservierungen** | `dining_tables`, `reservations` | Tische, Reservierungen mit Wünschen |
| **Rund herum** | `callbacks`, `blocked_numbers`, `messages`, `devices`, `error_log`, `audit_log` | Rückrufbitten, Sperrliste, SMS, Push-Geräte, Fehler, Änderungsprotokoll |

## Entscheidungen, die man sehen sollte

- **Jeder Betrieb ist abgeschottet.** Inhaber A sieht von Betrieb B nichts.
  Mitarbeiter sehen alles ihres Betriebs, ändern aber keine Karte und keine
  Einstellungen. Ibo als Anbieter sieht alle (Admin-Bereich).
- **Die Datenbank prüft Summen selbst.** Eine Bestellung, deren Summe nicht
  Zwischensumme + Liefergebühr ist, wird abgelehnt. Eine Lieferung ohne
  Straße und PLZ auch.
- **Preise werden in die Bestellung kopiert.** Ändert der Wirt morgen den
  Preis, bleibt die Bestellung von heute, wie sie dem Gast vorgelesen wurde.
- **Größen sind eigene Zeilen, Extras können an eine Größe gebunden sein.**
  Lehre aus Kiek mol in (03.09.2026, Pizzeria Pronto Riepe): dort standen
  Größen als JSON im Gericht, die Extras ohne Verbindung daneben — der Gast
  konnte zur großen Pizza Zutaten zum Kleinpreis wählen.
- **Allergene als Wort** (`gluten`, `sellerie` …), genau wie in Kiek mol in.
  Buchstaben zählt jede gedruckte Karte anders.
- **Geld in Cent.** 12,50 € steht als `1250` da. Keine Rundungsfehler.
- **`is_halal` darf leer sein.** Leer heißt „weiß ich nicht“ — dann sagt der
  Agent das auch, statt zu raten.
- **Standardfragen nur aus `faq_entries`.** Was dort nicht steht (Parken,
  Gutscheine, Catering …), beantwortet der Agent nicht — er bietet einen
  Rückruf an.
- **Belege für die Aufsicht.** `ai_notice_played` hält pro Gespräch fest,
  dass der KI-Hinweis lief; `latency_p50_ms` die echte Antwortzeit;
  `cost_*` die Kosten des Anrufs.
- **Löschfristen pro Betrieb.** Transkript 30 Tage, Aufnahme 7 Tage (wenn
  überhaupt an), Kontaktdaten 180 Tage — einstellbar, ein nächtlicher
  Aufräumlauf setzt sie durch.
- **Bereit für WhatsApp.** `conversations.channel` und `messages.channel`
  kennen schon `whatsapp`.
- **Bereit für Kiek mol in.** `menu_items.external_ref` nimmt später die
  ID aus Kiek mol in auf, damit dieselbe Karte nur einmal gepflegt wird.

## Wie der Agent schreibt

Der Agent-Server bekommt **keinen** Zugriff auf Tabellen, sondern ruft nur
Funktionen auf (`agent_warenkorb_pruefen`, `agent_bestellung_anlegen`,
`agent_verfuegbarkeit` …). Jede davon prüft Betrieb, Öffnungszeit,
Pause, Kapazität und rechnet Preise selbst nach. Die Liste steht am Ende
von `schema-entwurf.sql`; ausgeschrieben werden sie in Phase 1 und 2.

## Noch offen für Phase 1

- Die Funktionen ausschreiben, jede mit Test.
- Kapazitätsprüfung: v1 rechnet mit „Plätze pro Zeitfenster“
  (`max_covers_per_slot`), Tische sind für die Ansicht in der App. Echte
  Tischzuteilung später.
- Fortlaufende Bestellnummer pro Tag ohne Doppelvergabe bei zwei
  gleichzeitigen Anrufen (Zähler mit Sperre in der Funktion).
- Ob Bestellungen für den Wirt aufbewahrungspflichtig sind (GoBD) — Frage
  an den Steuerberater, bevor Löschfristen für Bestellungen gelten.
