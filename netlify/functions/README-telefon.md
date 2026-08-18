# Telefon-Assistent → Kiek mol in

Anbindung des KI-Telefonassistenten (Telefon-Retter, Kurani) an die
Reservierungen. Entspricht **TR-03** aus der Q3-Roadmap.

## Was schon da war

Mehr als gedacht — die Leitungen lagen bereits:

| | |
|---|---|
| `reservations.source` | gibt es; die App schreibt dort `'app'` |
| `reservations.status` | gibt es; `'pending'` ist der unbestätigte Zustand |
| Live-Anzeige | das Dashboard hört per Realtime auf `INSERT` — neue Zeilen erscheinen von selbst |
| Bestätigen-Knopf | `updateReservation(id, 'confirmed')` gibt es |

Die DoD aus der Roadmap — *„Testanruf → Reservierung erscheint binnen 10 Sek
im Dashboard"* — ist damit von der App-Seite her erfüllt, sobald der Eintrag
geschrieben wird.

## Was dazugekommen ist

**`reservation-save.js`** — der Eingang für den Assistenten.

```
POST /.netlify/functions/reservation-save
Authorization: Bearer <TELEFON_TOKEN>
Content-Type: application/json

{ "reservation": {
    "restaurant_id": "uuid-des-restaurants",
    "guest_name":    "Anke Janssen",
    "guest_phone":   "+49 176 1234567",
    "party_size":    4,
    "reservation_date": "2026-08-21",
    "reservation_time": "19:30",
    "notes":         "Fensterplatz, wenn möglich"
} }
```

Antwort: `{ "ok": true, "id": "…" }` — die Kennung kann der Assistent im
Gespräch nennen.

Bei einer unbrauchbaren Angabe: `400` mit `error`, zum Beispiel
`"reservation_date muss JJJJ-MM-TT sein"`. Der Assistent kann dann im
Gespräch nachfragen, statt eine kaputte Zeile im Dashboard zu hinterlassen.

`status` und `source` setzt **der Server**, nicht der Aufrufer — sonst könnte
eine Reservierung als bereits bestätigt hereinkommen und niemand sähe hin.

**Im Dashboard** trägt sie eine eigene Plakette „Telefon-Assistent". Vorher
galt alles, was nicht `'app'` war, als *vom Wirt selbst eingetippt* — eine
Telefon-Reservierung hätte sich darunter versteckt, und niemand hätte gewusst,
dass da vielleicht noch jemand zurückrufen muss.

## Einrichtung

Netlify → Site configuration → Environment variables:

| Variable | Woher |
|---|---|
| `TELEFON_TOKEN` | ein langes Zufallswort, das gleiche beim Assistenten hinterlegen |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → `service_role` |

**Ohne `TELEFON_TOKEN` nimmt der Eingang gar nichts an** (HTTP 503). Das ist
Absicht: ein offener Eingang, der ohne Anmeldung Reservierungen anlegt, ist
eine Einladung — ein Skript, das hundert Tische auf morgen Abend bucht, legt
den Laden lahm.

Das ist genau umgekehrt zu `order-save.js`: dort geht eine Bestellung im
Zweifel durch, weil ein Gast davorsteht, der zahlen will. Hier steht ein
Dienst davor, der es in einer Minute nochmal versuchen kann.

## Was geprüft wird

Alles, was am Telefon schiefgeht — die Spracherkennung versteht „am
Einundzwanzigsten" falsch, erfindet ein Jahr, oder der Anrufer nennt gar
kein Datum:

- `restaurant_id`, `guest_name`, `guest_phone` müssen da sein. Die
  Rückrufnummer ist Pflicht: bei Unklarheiten — und die sind am Telefon die
  Regel — kann der Wirt sonst nichts tun.
- `party_size` zwischen 1 und 50.
- Datum `JJJJ-MM-TT`, Uhrzeit `HH:MM`.
- Der Zeitpunkt darf nicht in der Vergangenheit liegen (zwei Stunden
  Nachsicht: ein Anruf um 19:05 für „heute 19 Uhr" ist gemeint, nicht
  vertippt) und nicht mehr als ein Jahr voraus.

Nicht geprüft wird die **Verfügbarkeit**. Der Assistent nimmt auf, er sagt
nicht zu — deshalb `pending`, deshalb der Bestätigen-Knopf beim Menschen.

## Was noch fehlt (nicht Code)

1. **Öffnungszeiten.** Die zweite Aufgabe des Assistenten ist „wann habt ihr
   auf". Bei fünf Restaurants stehen die Zeiten nicht im System — für die
   kann er die Frage nicht beantworten.
2. **Nummer → Restaurant.** Der Assistent muss wissen, für wen der Anruf war.
   Die Zuordnung bleibt auf der Telefon-Retter-Seite; hierher kommt die
   fertige `restaurant_id`.
3. **RLS auf `reservations`.** Solange die Tabelle Schreibzugriffe mit dem
   öffentlichen Schlüssel annimmt, ist dieser Eingang eine gut gesicherte Tür
   in einer offenen Wand. Siehe `README-preise.md`.
