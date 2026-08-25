-- SCHRITT 17: orders.source -- die Spalte, auf die zwei Programme zeigen
--             und die es nie gab.
--
-- GEFUNDEN AM 25.08.2026 IM DATENBANK-PROTOKOLL
-- Dutzende Zeilen, jede Stunde:
--
--     ERROR  42703  column orders.source does not exist
--
-- Zwei Stellen zeigen darauf:
--
--   telefon-retter/lib/dialog.js  schreibt  source: 'telefon'  in jede
--       Bestellung, die der Telefon-Assistent aufnimmt.
--   sichtbarkeit/lib/supabase.js  FILTERT  &source=eq.telefon , um die
--       Telefon-Bestellungen fuer den Agentur-Bericht zu zaehlen.
--
-- WAS DAS BISHER BEDEUTET HAT
-- Beim Schreiben nichts Schlimmes: resilienterInsert() erkennt den
-- 400er, wirft das unbekannte Feld weg und schreibt die Bestellung ohne
-- Quelle. Es ging also KEINE Bestellung verloren -- sie trug nur
-- nirgends, woher sie kam.
--
-- Beim Lesen dagegen alles: ein Filter auf eine Spalte, die es nicht
-- gibt, ist immer 400. Die Telefon-Bestellungen im Bericht waren nie
-- zaehlbar -- nicht "null", sondern gar keine Antwort.
--
-- reservations hat source laengst (die App schreibt dort 'app',
-- 'dashboard', 'telefon', 'phone'). Nur orders wurde vergessen.
--
-- GEFAHRLOS
-- Eine neue Spalte mit Standardwert. Bestehende Zeilen bekommen
-- 'app' -- das waren alle Online-Bestellungen. Keine Zeile wird
-- geloescht, keine Regel geaendert.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
-- Gibt es die Spalte vielleicht doch schon (dann ist unten nichts zu
-- tun)? Und wie heissen die Nachbarn?
select column_name as spalte, data_type as typ, column_default as standard
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders'
   and column_name in ('source', 'order_type', 'notes', 'customer_notes')
 order by column_name;

-- Zum Vergleich: so sieht es bei reservations aus, wo es sie gibt.
select column_name as spalte, data_type as typ, column_default as standard
  from information_schema.columns
 where table_schema = 'public' and table_name = 'reservations'
   and column_name = 'source';


-- ---- TEIL B: ANLEGEN --------------------------------------------------
-- if not exists: zweimal ausfuehren schadet nicht.
alter table public.orders
    add column if not exists source text not null default 'app';

-- Ein Index nur auf die, die nicht 'app' sind. Der Bericht sucht nach
-- 'telefon', und das sind wenige Zeilen von vielen -- ein Teil-Index ist
-- klein und trifft genau.
create index if not exists orders_source_idx
    on public.orders (restaurant_id, source)
 where source <> 'app';


-- ---- TEIL C: NACHSEHEN, OB ES GEKLAPPT HAT ---------------------------
select column_name as spalte, data_type as typ, column_default as standard
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders' and column_name = 'source';
-- Erwartet: eine Zeile -- source | text | 'app'::text

select source as quelle, count(*) as anzahl
  from public.orders
 group by source
 order by anzahl desc;
-- Erwartet: alles auf 'app'. Ab jetzt tragen die Bestellungen des
-- Telefon-Assistenten 'telefon' und sind im Bericht zaehlbar.
