-- TEAM-ZUGANG (31.10.2026): Manager und Mitarbeiter mit eigener E-Mail.
--
-- Ein Teammitglied ist eine Zeile in customers mit role = 'team', der
-- restaurant_id des Lokals und dieser Spalte. kmi_meine_haeuser() liest
-- E-Mail + restaurant_id -- damit gehoert das Teammitglied fuer alle
-- Datenbank-Regeln zum Lokal, ohne dass eine Regel geaendert wird.
-- Angelegt und entfernt wird nur ueber netlify/functions/team.js (Inhaber).
--
-- Mehrfach ausfuehrbar.

alter table public.customers add column if not exists team_rolle text;

-- PRUEFEN: eine Zeile "team_rolle".
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'customers' and column_name = 'team_rolle';
