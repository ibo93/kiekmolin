-- SCHRITT 38: AKTIONEN -- Ladies Night, Party, Happy Hour, 10 % bei
-- Online-Reservierung. Vom Wirt selbst angelegt, einmalig oder jede Woche.
--
-- WARUM EINE EIGENE TABELLE
-- Es gibt schon "offers" -- das ist das Heute-Angebot: ein Angebot je Haus,
-- gueltig bis zu einer Uhrzeit am selben Tag. Kein Wochentag, keine
-- Wiederholung, kein Bezug zur Reservierung. Und "offers" steht in keiner
-- dieser Dateien: ihre Regeln sind von hier aus nicht nachzulesen. Eine
-- Tabelle umzubauen, deren Regeln man nicht kennt, ist genau die Sorte
-- Eingriff, die am 25.08.2026 einen Tag gekostet hat.
--
-- WAS EINE AKTION IST
--   titel, beschreibung     -- "Ladies Night", "Jeden Donnerstag ab 21 Uhr"
--   art                     -- 'event' (Ankuendigung) oder 'vorteil'
--   gilt_fuer               -- 'alle' oder nur 'reservierung'
--   vorteil                 -- Freitext des Wirts: "10 % auf die Rechnung"
--   wochentage              -- 0 = Montag ... 6 = Sonntag (wie rest_day)
--   datum                   -- ODER ein einzelner Tag
--   von, bis                -- Uhrzeit; bis < von heisst ueber Mitternacht
--   gueltig_ab, gueltig_bis -- optional: Aktion nur im Oktober
--
-- WARUM DER VORTEIL EIN TEXT IST UND KEINE ZAHL
-- Eine Reservierung hat keinen Preis. Den Vorteil zieht das Personal an der
-- Kasse ab. Eine Zahl wuerde Rechnen versprechen, das hier nicht passiert.
-- Rabatte auf Bestellungen bleiben bei den Rabatt-Codes: die prueft der
-- Preis-Schutz auf dem Server. Eine Aktion, die Bestellungen billiger
-- macht, wuerde er ablehnen -- und zwar zu Recht.
--
-- WER DARF WAS
--   lesen:  aktive Aktionen jeder (die Gaesteseite zeigt sie),
--           alle eigenen der Inhaber, alles der Superadmin
--   aendern: nur der Inhaber des Hauses und der Superadmin
-- Dieselben Bausteine wie bei restaurants: kmi_meine_haeuser(),
-- kmi_ist_superadmin().
--
-- DER VORTEIL AN DER RESERVIERUNG (reservations.aktion_text)
-- Schreibt NUR der Server (reservation-guest) mit dem Dienstschluessel --
-- er schlaegt selbst nach, welche Aktion fuer Tag und Uhrzeit gilt. Dem
-- Browser wird nicht geglaubt: sonst traegt sich jeder "100 % gratis" ein.
-- Geschuetzt mit einem Ausloeser, wie customers.role (SQL 11) -- NICHT mit
-- einem Spaltenrecht. Ein "revoke update (spalte)" wirkt nicht, solange
-- die Rolle das Recht auf die ganze Tabelle hat, und das vergibt Supabase
-- von Haus aus.
--
-- Laesst sich gefahrlos mehrfach ausfuehren.

-- Vorher: gibt es die Tabelle schon?
select case when to_regclass('public.aktionen') is null
            then 'aktionen gibt es noch nicht -- wird angelegt'
            else 'aktionen gibt es schon -- wird nur ergaenzt' end as vorher;

create table if not exists public.aktionen (
    id            uuid        primary key default gen_random_uuid(),
    restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
    titel         text        not null check (char_length(titel) between 1 and 80),
    beschreibung  text        check (beschreibung is null or char_length(beschreibung) <= 500),
    art           text        not null default 'event' check (art in ('event', 'vorteil')),
    gilt_fuer     text        not null default 'alle' check (gilt_fuer in ('alle', 'reservierung')),
    vorteil       text        check (vorteil is null or char_length(vorteil) <= 120),
    wochentage    smallint[],
    datum         date,
    von           time,
    bis           time,
    gueltig_ab    date,
    gueltig_bis   date,
    aktiv         boolean     not null default true,
    reihenfolge   integer     not null default 0,
    erstellt_am   timestamptz not null default now(),
    -- Ohne Zeitplan waere eine Aktion nie und immer zugleich.
    constraint aktion_hat_zeitplan check (datum is not null or (wochentage is not null and cardinality(wochentage) > 0)),
    constraint aktion_wochentage_gueltig check (wochentage is null or wochentage <@ array[0,1,2,3,4,5,6]::smallint[])
);

create index if not exists aktionen_haus_aktiv on public.aktionen (restaurant_id, aktiv);

alter table public.aktionen enable row level security;

drop policy if exists "Aktive Aktionen sieht jeder" on public.aktionen;
create policy "Aktive Aktionen sieht jeder"
    on public.aktionen for select to anon, authenticated
    using (aktiv = true);

drop policy if exists "Eigene Aktionen sieht der Inhaber" on public.aktionen;
create policy "Eigene Aktionen sieht der Inhaber"
    on public.aktionen for select to authenticated
    using (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Der Inhaber legt Aktionen an" on public.aktionen;
create policy "Der Inhaber legt Aktionen an"
    on public.aktionen for insert to authenticated
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Der Inhaber aendert Aktionen" on public.aktionen;
create policy "Der Inhaber aendert Aktionen"
    on public.aktionen for update to authenticated
    using      (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin())
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Der Inhaber loescht Aktionen" on public.aktionen;
create policy "Der Inhaber loescht Aktionen"
    on public.aktionen for delete to authenticated
    using (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

grant select on public.aktionen to anon, authenticated;
grant insert, update, delete on public.aktionen to authenticated;

-- ---- Der Vorteil an der Reservierung ---------------------------------
alter table public.reservations add column if not exists aktion_text text;

comment on column public.reservations.aktion_text is
    'Welcher Vorteil fuer diesen Termin gilt, z.B. "Online-Reservierung: 10 % auf die Rechnung". '
    'Schreibt nur reservation-guest mit dem Dienstschluessel -- siehe kmi_aktion_schuetzen.';

create or replace function public.kmi_aktion_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Ohne Anmeldung (SQL-Editor) und mit Dienstschluessel: unveraendert.
    if auth.jwt() is null then return new; end if;
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
    if public.kmi_ist_superadmin() then return new; end if;

    if tg_op = 'INSERT' then
        new.aktion_text := null;            -- ein Gast traegt sich nichts selbst ein
    else
        new.aktion_text := old.aktion_text; -- der Wirt bestaetigt, der Vorteil bleibt
    end if;
    return new;
end
$$;

drop trigger if exists kmi_aktion_schuetzen on public.reservations;
create trigger kmi_aktion_schuetzen
    before insert or update on public.reservations
    for each row execute function public.kmi_aktion_schuetzen();

-- ---- Gegenprobe: alles muss "ja" sein ------------------------------
select
  (to_regclass('public.aktionen') is not null)                                  as tabelle_da,
  (select relrowsecurity from pg_class where oid = 'public.aktionen'::regclass) as rls_an,
  ((select count(*) from pg_policies where tablename = 'aktionen') = 5)         as fuenf_regeln,
  exists (select 1 from information_schema.columns
          where table_name = 'reservations' and column_name = 'aktion_text')    as spalte_an_reservierung,
  exists (select 1 from pg_trigger where tgname = 'kmi_aktion_schuetzen')       as schutz_aktiv;
