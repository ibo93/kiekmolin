-- SCHRITT 35: NUR NACHSEHEN. Diese Datei aendert NICHTS.
--
-- Vor Schritt 36 (KI-Assistenten-Schicht) ausfuehren und das Ergebnis
-- zurueckmelden. Schritt 36 legt Sichten auf restaurants und menu_items
-- an und schreibt Reservierungs-ANFRAGEN mit source = 'ki-assistent'.
-- Beides geht nur gut, wenn die Spalten wirklich so heissen, wie der
-- Code sie liest -- und wenn keine Regel in der Datenbank den neuen
-- source-Wert abweist.
--
-- Aus dem Code gelesen, aber hier nicht messbar ohne diese Abfrage:
--   * gibt es is_vegan / is_vegetarian / allergens / additives wirklich
--     als Spalten, oder nur in der App?
--   * hat reservations.source einen CHECK, der nur bestimmte Werte zulaesst?


-- ---- 1. Fehlt eine Spalte, die Schritt 36 braucht? --------------------
-- ERWARTET: keine einzige Zeile. Jede Zeile hier ist eine Spalte, die
-- fehlt -- dann Schritt 36 NICHT ausfuehren, sondern melden.
with gebraucht(tabelle, spalte) as (values
    ('restaurants', 'id'), ('restaurants', 'slug'), ('restaurants', 'name'),
    ('restaurants', 'city'), ('restaurants', 'street'), ('restaurants', 'zip'),
    ('restaurants', 'phone'), ('restaurants', 'description'),
    ('restaurants', 'cuisine'), ('restaurants', 'cuisine_type'),
    ('restaurants', 'tags'), ('restaurants', 'features'),
    ('restaurants', 'opening_hours'), ('restaurants', 'opening_time'),
    ('restaurants', 'closing_time'), ('restaurants', 'rest_day'),
    ('restaurants', 'slot_interval_minutes'), ('restaurants', 'price_range'),
    ('restaurants', 'lat'), ('restaurants', 'lng'), ('restaurants', 'is_active'),
    ('menu_items', 'id'), ('menu_items', 'restaurant_id'), ('menu_items', 'category_id'),
    ('menu_items', 'name'), ('menu_items', 'description'), ('menu_items', 'base_price'),
    ('menu_items', 'is_available'), ('menu_items', 'sort_order'),
    ('menu_items', 'allergens'), ('menu_items', 'additives'),
    ('menu_items', 'is_vegan'), ('menu_items', 'is_vegetarian'), ('menu_items', 'is_spicy'),
    ('menu_categories', 'id'), ('menu_categories', 'name'),
    ('reservations', 'source'), ('reservations', 'status'), ('reservations', 'notes'),
    ('restaurant_tables', 'restaurant_id'), ('restaurant_tables', 'is_active')
)
select g.tabelle, g.spalte, 'FEHLT' as stand
  from gebraucht g
 where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = g.tabelle
        and c.column_name = g.spalte);


-- ---- 2. Welche Typen haben die Listen-Spalten? ------------------------
-- Der Code erwartet bei allergens/additives/tags/features eine Liste
-- (text[] oder jsonb). Steht dort "text", muss der Code angepasst werden.
select table_name as tabelle, column_name as spalte, data_type as typ, udt_name
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'menu_items'  and column_name in ('allergens', 'additives'))
     or (table_name = 'restaurants' and column_name in ('tags', 'features', 'opening_hours', 'cuisine_type')))
 order by 1, 2;


-- ---- 3. Laesst reservations.source den Wert 'ki-assistent' zu? --------
-- ERWARTET: keine Zeile, oder ein CHECK, in dem 'ki-assistent' steht.
-- Steht dort ein CHECK mit einer festen Liste OHNE 'ki-assistent', dann
-- bitte melden -- Schritt 36 aendert bestehende Tabellen bewusst nicht.
select conname as regel, pg_get_constraintdef(oid) as bedingung
  from pg_constraint
 where conrelid = 'public.reservations'::regclass
   and contype = 'c';


-- ---- 4. Welche source-Werte gibt es schon? ----------------------------
select coalesce(source, '(leer)') as source, count(*) as anzahl
  from public.reservations
 group by 1
 order by 2 desc;


-- ---- 5. Die beiden Pilot-Haeuser: gibt es sie unter diesen Slugs? -----
-- ERWARTET: genau zwei Zeilen. tags zeigt, was der Assistent als
-- Ausstattung meldet (hunde_erlaubt, terrasse ...) -- bitte pruefen,
-- ob das stimmt. Falsche Tags schicken Gaeste an die falsche Tuer.
select id, slug, name, city, tags, features, is_active,
       lat is not null and lng is not null as hat_geo
  from public.restaurants
 where slug in ('greetsieler-boerse', 'la-piazza-greetsiel');


-- ---- 6. Wie gut sind die Allergene bei den Pilot-Haeusern gepflegt? ---
-- Wo nichts eingetragen ist, sagt der Assistent "keine Angabe" -- NIE
-- "allergenfrei". Diese Zahl zeigt, wie oft das passieren wird.
select r.slug,
       count(*)                                                        as gerichte,
       count(*) filter (where m.allergens is not null
                          and m.allergens::text not in ('[]', '{}', '')) as mit_allergenen,
       count(*) filter (where m.is_vegan or m.is_vegetarian)            as veg_markiert
  from public.menu_items m
  join public.restaurants r on r.id = m.restaurant_id
 where r.slug in ('greetsieler-boerse', 'la-piazza-greetsiel')
   and coalesce(m.is_available, true)
 group by r.slug;
