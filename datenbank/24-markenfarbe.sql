-- SCHRITT 24: restaurants.brand_color -- die Farbe der eigenen Landepage.
--
-- Idee von Ibo am 04.09.2026: jeder Gastronom soll auf seiner Seite
-- (kiekmolin.de/<slug>) seine eigene Farbe haben.
--
-- Bewusst NUR ein Akzent, keine Farbwelt: Knoepfe, der Zitatstrich, die
-- Gericht-Kachel und das Abschlussband. Hintergrund, Schrift und
-- Abstaende bleiben KIN -- der Gast soll die Plattform wiedererkennen,
-- daran haengt sein Vertrauen beim Bezahlen.
--
-- Gespeichert wird immer die GEPRUEFTE Farbe: die App schickt jede
-- Eingabe durch eine Kontrastpruefung (WCAG, weisse Schrift, min 4.5:1)
-- und dunkelt zu helle Farben ab. Sonst waere der Bestellknopf bei einem
-- hellen Gelb nicht mehr lesbar -- und der Wirt saehe es nicht, weil er
-- seinen eigenen Knopf auswendig kennt.
--
-- Ohne diese Spalte laeuft alles weiter: fehlt sie, antwortet PostgREST
-- auf das Speichern mit 400, und das Dashboard sagt genau das -- samt
-- Hinweis auf diese Datei. Die Landepage nimmt dann die Hausfarbe.

-- 1. Vorher nachsehen, was da ist.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'restaurants'
   and column_name in ('brand_color', 'slug', 'min_order_value');

-- 2. Anlegen. text und nicht ein enger Typ: Hex-Farben sind Text, und
--    die Pruefung gehoert in die App, wo der Wirt eine Antwort bekommt.
alter table public.restaurants
  add column if not exists brand_color text;

-- 3. Gegenprobe: die Spalte muss jetzt da sein und ueberall leer.
--    Leer heisst "keine eigene Farbe" -- die Seite nimmt dann KIN-Gruen.
select count(*) as haeuser,
       count(brand_color) as mit_eigener_farbe
  from public.restaurants;
