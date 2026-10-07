-- SCHRITT 39: TISCHPLAN -- wo steht welcher Tisch.
--
-- WARUM
-- Der Tischplan im Dashboard (Reservierungen -> Tischplan) zeigt seit dem
-- 06.10.2026 die echten Tische aus restaurant_tables, in 3D und von oben.
-- Damit ein Wirt seine Tische so hinstellen kann, wie sie im Lokal stehen,
-- braucht jeder Tisch eine Lage. Bisher gab es dafuer keine Spalte: der
-- alte Plan hatte acht fest eingebaute Tische, und "Speichern" zeigte nur
-- eine Meldung.
--
-- WAS DAZUKOMMT (nur drei Spalten, keine neue Tabelle, keine neuen Regeln)
--   pos_x     Mitte des Tisches, 0-100 % der Raumbreite
--   pos_y     Mitte des Tisches, 0-100 % der Raumtiefe
--   rotation  0 oder 90 Grad
--
-- WIE SIEHT ES AUS, WENN DIESE DATEI FEHLT?
-- Kein stiller Ausfall: der Plan zeigt trotzdem alle Tische (gleichmaessig
-- verteilt), und beim Bearbeiten steht oben: "Die Lage der Tische kann erst
-- gespeichert werden, wenn die Datei datenbank/39-tischplan.sql in Supabase
-- eingespielt ist." Name, Plaetze und Bereich werden schon gespeichert.
--
-- WER DARF WAS
-- Unveraendert. Es kommen nur Spalten an eine bestehende Tabelle; ihre
-- Zeilen-Regeln (RLS) gelten fuer die neuen Spalten genauso. Der Plan
-- schreibt ueber denselben Weg wie die Tischverwaltung heute (PATCH mit
-- Antwort) und meldet eine leere Antwort als Fehler, nicht als Erfolg.
--
-- MEHRFACH AUSFUEHREN schadet nicht ("if not exists").

alter table public.restaurant_tables add column if not exists pos_x numeric(5,2);
alter table public.restaurant_tables add column if not exists pos_y numeric(5,2);
alter table public.restaurant_tables add column if not exists rotation smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_tables_pos_bereich') then
    alter table public.restaurant_tables add constraint restaurant_tables_pos_bereich
      check ((pos_x is null or pos_x between 0 and 100) and (pos_y is null or pos_y between 0 and 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_tables_rotation_wert') then
    alter table public.restaurant_tables add constraint restaurant_tables_rotation_wert
      check (rotation in (0, 90));
  end if;
end $$;

-- PRUEFUNG: muss 3 ergeben.
select count(*) as spalten_muessen_3_sein
from information_schema.columns
where table_schema = 'public' and table_name = 'restaurant_tables'
  and column_name in ('pos_x', 'pos_y', 'rotation');
