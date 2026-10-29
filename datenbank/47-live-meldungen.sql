-- LIVE-MELDUNGEN IM DASHBOARD (29.10.2026).
--
-- Das Dashboard hoert auf neue Bestellungen und Reservierungen ueber
-- Supabase Realtime (postgres_changes auf orders und reservations). Das
-- kommt aber nur an, wenn beide Tabellen in der Publikation
-- "supabase_realtime" stehen -- und das konnte von aussen nicht gemessen
-- werden. Bis dahin faengt dashboardNetz() alles alle 15 Sekunden auf
-- (index.html). Mit diesem Schritt kommt die Meldung sofort.
--
-- Sicherheit: Realtime liefert jedem Abonnenten nur Zeilen, die er laut
-- RLS auch LESEN darf. Ein Wirt sieht also weiter nur seine eigenen Haeuser.
--
-- 1) ERST NACHSEHEN (aendert nichts):
--    select tablename from pg_publication_tables
--     where pubname = 'supabase_realtime' and schemaname = 'public'
--       and tablename in ('orders', 'reservations');
--    Zwei Zeilen = schon an, fertig. Weniger = Schritt 2.
--
-- 2) EINSCHALTEN (mehrfach ausfuehrbar, ueberspringt was schon drin ist):

do $$
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
        alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations') then
        alter publication supabase_realtime add table public.reservations;
    end if;
end $$;

-- 3) PRUEFEN: die Abfrage aus Schritt 1 muss jetzt zwei Zeilen zeigen.
