-- BESONDERER ABEND (Silvester, Weihnachten, Weinabend) -- mit Menue,
-- Ablauf, Preis und Plaetzen.
--
-- Ibo, 12.10.2026, fuer Luett Italia: Der QR-Code auf der gedruckten
-- Silvester-Karte fuehrt auf die Seite des Lokals, und dort steht oben
-- ein Silvester-Block -- "mit Menue, Ablauf und Restplaetzen".
--
-- WARUM AN DEN AKTIONEN (SQL 38) UND NICHT EINE NEUE TABELLE
-- ==========================================================
-- Ein besonderer Abend IST eine einmalige Aktion: Titel, Datum, Uhrzeit,
-- aktiv/pausiert, nur fuer das eigene Haus -- alles schon da, samt der
-- Regeln fuer Lesen und Schreiben. Es fehlen nur vier Felder.
--
--   menue     ein Gang pro Zeile           "Vitello tonnato"
--   ablauf    eine Station pro Zeile       "19:00 Empfang mit Prosecco"
--   preis_pp  Preis pro Person in Euro     89.00
--   plaetze   Plaetze insgesamt an diesem Abend
--
-- RESTPLAETZE ZAEHLT DER SERVER (netlify/functions/aktion-plaetze.js):
-- plaetze minus die Personen aller Reservierungen an diesem Datum (ohne
-- Absagen und ohne Warteliste). reservation-guest nimmt keine Reservierung
-- an, die ueber die Plaetze ginge -- sonst stuende auf der Seite
-- "ausgebucht" und trotzdem kaemen Buchungen herein.
--
-- Einspielen: einmal im Supabase SQL-Editor ausfuehren. Mehrfach geht auch.
-- Ohne diese Datei laufen die Aktionen weiter wie bisher; nur die vier
-- Felder fehlen (das Dashboard sagt es, statt still nichts zu speichern).

alter table public.aktionen add column if not exists menue    text;
alter table public.aktionen add column if not exists ablauf   text;
alter table public.aktionen add column if not exists preis_pp numeric(8,2);
alter table public.aktionen add column if not exists plaetze  integer;

alter table public.aktionen drop constraint if exists aktion_menue_laenge;
alter table public.aktionen add constraint aktion_menue_laenge
    check (menue is null or char_length(menue) <= 2000);
alter table public.aktionen drop constraint if exists aktion_ablauf_laenge;
alter table public.aktionen add constraint aktion_ablauf_laenge
    check (ablauf is null or char_length(ablauf) <= 1000);
alter table public.aktionen drop constraint if exists aktion_preis_gueltig;
alter table public.aktionen add constraint aktion_preis_gueltig
    check (preis_pp is null or (preis_pp >= 0 and preis_pp <= 10000));
-- Plaetze nur fuer einen Abend mit Datum: "jeden Donnerstag 60 Plaetze"
-- waere ein Kontingent fuer jeden Donnerstag, das zaehlt hier niemand.
alter table public.aktionen drop constraint if exists aktion_plaetze_gueltig;
alter table public.aktionen add constraint aktion_plaetze_gueltig
    check (plaetze is null or (plaetze between 1 and 5000 and datum is not null));

comment on column public.aktionen.menue    is 'Besonderer Abend: Menue, ein Gang pro Zeile.';
comment on column public.aktionen.ablauf   is 'Besonderer Abend: Ablauf, eine Station pro Zeile ("19:00 Empfang").';
comment on column public.aktionen.preis_pp is 'Besonderer Abend: Preis pro Person in Euro.';
comment on column public.aktionen.plaetze  is 'Besonderer Abend: Plaetze insgesamt; Restplaetze zaehlt aktion-plaetze.js.';

select 'aktionen hat jetzt Menue, Ablauf, Preis und Plaetze' as fertig,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'aktionen'
           and column_name in ('menue', 'ablauf', 'preis_pp', 'plaetze')) as neue_spalten;
