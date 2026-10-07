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
--   restaurant_tables.laenge_cm / breite_cm: echte Tischmaße (rund:
--     Durchmesser) -- Ibo: "es muss mit den echten Maßen sein". Fehlen sie,
--     nimmt der Plan die übliche Größe aus Form und Plätzen.
--   restaurant_tables.rotation darf jetzt jeden Winkel von 0 bis 359 Grad
--   haben (vorher nur 0 oder 90) -- Ibo: "noch besser mit drehen können".
--
-- WIE SIEHT ES AUS, WENN DIESE DATEI FEHLT?
-- Kein stiller Ausfall: der Plan zeigt den Raum und die Teile, beim
-- Bearbeiten steht oben, dass Raum und Teile erst gespeichert werden, wenn
-- diese Datei eingespielt ist. Tische werden weiter gespeichert, gedreht
-- wird dann nur in 90-Grad-Schritten.
--
-- WER DARF WAS
-- Unveraendert. Eine Spalte an "restaurants" -- dieselbe Zeile, die der Wirt
-- heute schon fuer die Bestelloptionen (features) aendert. Keine neuen Regeln.
--
-- MEHRFACH AUSFUEHREN schadet nicht.

alter table public.restaurants add column if not exists tischplan_raum jsonb;

alter table public.restaurant_tables add column if not exists laenge_cm smallint;
alter table public.restaurant_tables add column if not exists breite_cm smallint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_tables_masse_bereich') then
    alter table public.restaurant_tables add constraint restaurant_tables_masse_bereich
      check ((laenge_cm is null or laenge_cm between 30 and 800) and (breite_cm is null or breite_cm between 30 and 400));
  end if;
end $$;

alter table public.restaurant_tables drop constraint if exists restaurant_tables_rotation_wert;
alter table public.restaurant_tables add constraint restaurant_tables_rotation_wert
  check (rotation between 0 and 359);

-- PRUEFUNG: muss 1, 2 und 1 ergeben.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants' and column_name = 'tischplan_raum') as raum_spalte_muss_1_sein,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurant_tables' and column_name in ('laenge_cm', 'breite_cm')) as mass_spalten_muessen_2_sein,
  (select count(*) from pg_constraint
    where conname = 'restaurant_tables_rotation_wert'
      and pg_get_constraintdef(oid) like '%359%') as drehung_frei_muss_1_sein;
