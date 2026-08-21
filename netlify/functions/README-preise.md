# Preise: was der Server prüft — und was noch fehlt

## Der Fall

`order-save.js` hat `subtotal`, `delivery_fee`, `discount` und `total` genau
so gespeichert, wie der Browser sie geschickt hat. Und der Browser lief nicht
einmal über diese Function — er hat direkt in die Tabelle `orders`
geschrieben.

Der Angriff braucht keine Kenntnisse: Entwicklerkonsole auf, beim Absenden
`total` auf 1 setzen. Der Wirt sieht eine ganz normale Bestellung und kocht.

## Was jetzt passiert

1. Der Browser schickt die Bestellung **zuerst** an
   `/.netlify/functions/order-save`. Der direkte Insert ist nur noch der
   Notweg, falls Netlify nicht erreichbar ist.
2. Die Function holt die Karte aus der Datenbank und rechnet gegen
   (`lib/preis-pruefung.js`).
3. Stimmt es nicht, antwortet sie mit **422**. Der Browser weicht dann *nicht*
   auf den Notweg aus, sondern sagt dem Gast, er soll neu laden.

Geprüft wird keine exakte Summe, sondern eine **Untergrenze**: was kann diese
Bestellung im günstigsten legitimen Fall kosten? Das ist der kleinste Preis,
der in der Datenbank für jedes Gericht steht — Grundpreis, kleinste Größe oder
Aktionspreis aus `menu_cross_sells`. Extras können nur draufkommen.

Der Grund für die Untergrenze statt exaktem Nachrechnen: jede Preisregel, die
morgen dazukommt und hier niemand nachträgt, kann den Preis nur *erhöhen*.
Eine Untergrenze lehnt deshalb nie eine ehrliche Bestellung ab. Ein verlorener
Gast kostet mehr als ein verhinderter Betrug einbringt.

Zusätzlich geprüft:

| | |
|---|---|
| Liefergebühr | muss der Gebühr des Restaurants entsprechen (0 bei Abholung) |
| Rabatt | höchstens das, was der Gutschein in der Tabelle hergibt |
| Trinkgeld | frei, aber nicht negativ |

Was sich **nicht** prüfen lässt — ein Gericht steht nicht mehr in der Karte,
etwa beim Nachbestellen aus dem Verlauf — wird durchgelassen und in den
Netlify-Logs vermerkt. Wer das ausnutzen will, muss ein Gericht erfinden, das
es nicht gibt, und dann steht in der Küche ein Name, den niemand kennt. Der
gefährliche Angriff ist der unsichtbare: richtiger Name, falscher Preis.

Fällt die Datenbankabfrage aus, geht die Bestellung ebenfalls durch. Eine
Störung beim Nachschlagen darf keine echten Bestellungen verhindern.

## Was noch fehlt — und ohne das ist es nicht zu

**Die Prüfung wirkt nur, wenn der Browser nicht an ihr vorbei kann.**

Solange die Tabelle `orders` Inserts mit dem öffentlichen Schlüssel annimmt,
schickt ein Angreifer seine Bestellung einfach direkt an PostgREST und die
Function sieht sie nie. Diese Datei beschreibt die Tür — der Riegel ist eine
RLS-Regel in Supabase.

Zum Ausführen in Supabase → SQL Editor:

```sql
-- Row Level Security einschalten. ACHTUNG: ab diesem Moment ist alles
-- verboten, was nicht ausdrücklich erlaubt wird -- deshalb kommen die
-- Erlaubnisse in derselben Ausführung mit.
alter table public.orders enable row level security;

-- Lesen bleibt wie bisher (Dashboard, Bestellverfolgung des Gastes).
create policy "orders lesen" on public.orders
    for select using (true);

-- Ändern bleibt wie bisher (der Wirt setzt den Status im Dashboard).
create policy "orders aendern" on public.orders
    for update using (true) with check (true);

-- Anlegen NICHT. Es gibt bewusst keine insert-Policy: damit kann nur noch
-- der Service-Key schreiben, und den hat allein die Netlify-Function.
```

Danach muss in Netlify die Umgebungsvariable `SUPABASE_SERVICE_KEY` gesetzt
sein (Supabase → Project Settings → API → `service_role`). Ohne sie fällt die
Function auf den öffentlichen Schlüssel zurück und kann selbst nicht mehr
schreiben.

**Reihenfolge beim Umstellen:**

1. `SUPABASE_SERVICE_KEY` in Netlify setzen und einmal deployen.
2. Eine Testbestellung aufgeben und prüfen, dass sie ankommt.
3. Erst dann das SQL oben ausführen.
4. Noch eine Testbestellung. Kommt sie an, ist der Riegel zu.

Kommt nach Schritt 3 nichts mehr an, ist der Service-Key nicht gesetzt oder
falsch — dann `alter table public.orders disable row level security;`
ausführen, Schlüssel prüfen, von vorn.
