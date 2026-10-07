-- SCHRITT 40: TISCH-ZUORDNUNG -- Reservierungen an die echten Tische haengen.
--
-- WARUM (gemessen am 07.10.2026, postgres_logs)
-- Ibo hat im neuen Tischplan Tisch 4 reserviert. Die Datenbank lehnte ab:
--     insert or update on table "reservations" violates foreign key
--     constraint "reservations_table_id_fkey"
--     DETAIL: Key is not present in table "tables".
-- Elfmal zwischen 06:04:17 und 06:04:45 UTC, jeder Versuch 409.
--
-- reservations.table_id verweist auf die ALTE Tabelle "tables". Die App
-- arbeitet aber seit langem mit restaurant_tables -- Tischverwaltung,
-- Tischplan, Bearbeiten-Dialog und die Tischwahl der Gaeste. Jede
-- Reservierung MIT Tisch musste daran scheitern.
--
-- WAS DIESE DATEI MACHT
-- Die Regel zeigt danach auf restaurant_tables. "not valid" heisst: alte
-- Reservierungen, die noch auf "tables" zeigen, bleiben unangetastet --
-- nichts wird geloescht oder geleert. Geprueft werden nur neue und
-- geaenderte Zeilen. "on delete set null": wird ein Tisch geloescht,
-- bleibt die Reservierung, nur ohne Tisch.
--
-- WIE SIEHT ES AUS, WENN DIESE DATEI FEHLT?
-- Seit 07.10.2026 kein Abweisen mehr: Tischplan und Gaeste-Weg speichern
-- dann ohne table_id und schreiben "Tisch: <Name>" in die Notiz; der Plan
-- zeigt die Reservierung trotzdem am Tisch und sagt oben, dass diese
-- Datei fehlt. Fest zugeordnet ist der Tisch erst mit dieser Datei.
--
-- DIE APP VORHER UND NACHHER
-- Drei Listen lesen den Tisch ueber diese Verknuepfung mit
-- (tables:table_id(...)). Sie versuchen erst die alte Form, bei Fehler die
-- neue (max_capacity statt seats) -- sie laden also vor und nach dieser
-- Datei. Reihenfolge Deploy/SQL ist egal.
--
-- MEHRFACH AUSFUEHREN schadet nicht.

begin;

-- 1. Vorher: wohin zeigt die Regel, wie viele Reservierungen haben einen Tisch?
select conname as regel, confrelid::regclass as zeigt_auf
from pg_constraint where conname = 'reservations_table_id_fkey';

select count(*) filter (where table_id is not null) as mit_tisch,
       count(*) filter (where table_id in (select id from public.restaurant_tables)) as davon_restaurant_tables
from public.reservations;

-- 2. Umstellen
alter table public.reservations drop constraint if exists reservations_table_id_fkey;
alter table public.reservations
  add constraint reservations_table_id_fkey
  foreign key (table_id) references public.restaurant_tables(id)
  on delete set null
  not valid;

commit;

-- 3. Gegenprobe: erwartet zeigt_auf = restaurant_tables
select conname as regel, confrelid::regclass as zeigt_auf, convalidated as alte_zeilen_geprueft
from pg_constraint where conname = 'reservations_table_id_fkey';

-- PostgREST neu einlesen lassen, damit die Verknuepfung sofort gilt.
notify pgrst, 'reload schema';
