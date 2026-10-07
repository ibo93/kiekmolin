-- SCHRITT 41: TISCHPLAN -- der Raum, wie er wirklich ist.
--
-- WARUM
-- Ibo, 07.10.2026: "Wir müssen den Tischplan oben und 3D an das Restaurant
-- anpassen" -- "der Laden ist wie eine L-Form". Bisher war jeder Raum ein
-- fester rechteckiger Kasten ohne Maße, ohne Eingang, ohne Theke. Den eigenen
-- Laden erkennt darin niemand wieder.
--
-- WAS DAZUKOMMT
--   restaurants.tischplan_raum  jsonb, je Bereich ein Raum:
--     { "main": { "breite": 12, "tiefe": 9, "form": "L", "ecke": "or",
--                 "ausB": 5, "ausT": 4,
--                 "teile": [ { "id": "t1", "art": "theke", "x": 20, "y": 10,
--                              "b": 3, "t": 0.8, "dreh": 0 } ] } }
--     Maße in Metern, x/y in % des Raums (wie bei den Tischen).
--   restaurant_tables.rotation darf jetzt in 45-Grad-Schritten stehen
--   (vorher nur 0 oder 90).
--
-- WIE SIEHT ES AUS, WENN DIESE DATEI FEHLT?
-- Kein stiller Ausfall: der Plan zeigt den Raum und die Teile, beim
-- Bearbeiten steht oben, dass Raum und Teile erst gespeichert werden, wenn
-- diese Datei eingespielt ist. Tische werden weiter gespeichert, gedreht
-- wird dann in 90-Grad-Schritten.
--
-- WER DARF WAS
-- Unveraendert. Eine Spalte an "restaurants" -- dieselbe Zeile, die der Wirt
-- heute schon fuer die Bestelloptionen (features) aendert. Keine neuen Regeln.
--
-- MEHRFACH AUSFUEHREN schadet nicht.

alter table public.restaurants add column if not exists tischplan_raum jsonb;

alter table public.restaurant_tables drop constraint if exists restaurant_tables_rotation_wert;
alter table public.restaurant_tables add constraint restaurant_tables_rotation_wert
  check (rotation in (0, 45, 90, 135, 180, 225, 270, 315));

-- PRUEFUNG: muss 1 und 1 ergeben.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants' and column_name = 'tischplan_raum') as raum_spalte_muss_1_sein,
  (select count(*) from pg_constraint
    where conname = 'restaurant_tables_rotation_wert'
      and pg_get_constraintdef(oid) like '%45%') as drehung_45_muss_1_sein;
