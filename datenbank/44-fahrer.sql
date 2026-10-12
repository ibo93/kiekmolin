-- FAHRER MIT EIGENEM PROFIL -- "Bin auf dem Rueckweg"
--
-- Ibo, 12.10.2026: "wenn Lieferant er drueckt ein Knopf, dass er zurueck
-- kommt zum Laden, so machen die das Essen fuer die Bestellung schon
-- fertig". Und: "die haben Handys alle, so koennt jeder Fahrer sein
-- eigenes Profil haben".
--
-- WIE ES GEHT
-- ===========
-- Der Wirt legt im Dashboard einen Fahrer an (nur ein Name). Dabei
-- entsteht ein persoenlicher Link: kiekmolin.de/fahrer.html#t=<geheim>. Den
-- bekommt der Fahrer per WhatsApp, oeffnet ihn auf seinem Handy -- kein
-- Passwort, kein Konto. Auf seiner Seite tippt er "Bin auf dem Rueckweg,
-- ca. 10 Min", und im Dashboard steht gross: "Ali in ca. 10 Min zurueck --
-- jetzt die naechste Lieferung fertig machen".
--
-- DER LINK IST DER SCHLUESSEL -- DESHALB NUR SEIN FINGERABDRUCK HIER
-- ================================================================
-- In der Tabelle steht nicht der Link, sondern nur sein SHA-256-Wert
-- (token_hash). Der Link entsteht im Browser des Wirts und wird nur einmal
-- angezeigt. Wer die Tabelle liest, kann damit keinen Fahrer spielen.
-- Verloren? "Neuer Link" im Dashboard -- der alte geht dann nicht mehr.
--
-- WER SCHREIBT WAS
-- ================
--   Wirt (angemeldet):   anlegen, umbenennen, neuer Link, entfernen --
--                        nur fuer die eigenen Haeuser (kmi_meine_haeuser).
--   Fahrer (ohne Konto): nur ueber netlify/functions/fahrer.js, die den
--                        Link prueft und mit dem Dienstschluessel schreibt.
--   Gaeste:              gar nichts. Kein Leserecht fuer anon.
--
-- Einspielen: einmal im Supabase SQL-Editor ausfuehren. Mehrfach geht auch.

select case when to_regclass('public.fahrer') is null
            then 'fahrer gibt es noch nicht -- wird angelegt'
            else 'fahrer gibt es schon -- wird nur ergaenzt' end as vorher;

create table if not exists public.fahrer (
    id             uuid        primary key default gen_random_uuid(),
    restaurant_id  uuid        not null references public.restaurants(id) on delete cascade,
    name           text        not null check (char_length(btrim(name)) between 1 and 40),
    token_hash     text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    status         text        not null default 'im_laden'
                               check (status in ('im_laden', 'unterwegs', 'rueckweg')),
    zurueck_um     timestamptz,
    aktualisiert   timestamptz not null default now(),
    aktiv          boolean     not null default true,
    erstellt_am    timestamptz not null default now()
);

create index if not exists fahrer_haus on public.fahrer (restaurant_id, aktiv);

alter table public.fahrer enable row level security;

drop policy if exists "Eigene Fahrer sieht der Inhaber" on public.fahrer;
create policy "Eigene Fahrer sieht der Inhaber"
    on public.fahrer for select to authenticated
    using (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Der Inhaber legt Fahrer an" on public.fahrer;
create policy "Der Inhaber legt Fahrer an"
    on public.fahrer for insert to authenticated
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Der Inhaber aendert Fahrer" on public.fahrer;
create policy "Der Inhaber aendert Fahrer"
    on public.fahrer for update to authenticated
    using      (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin())
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Der Inhaber entfernt Fahrer" on public.fahrer;
create policy "Der Inhaber entfernt Fahrer"
    on public.fahrer for delete to authenticated
    using (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

-- Absichtlich KEIN Recht fuer anon: ein Gast hat hier nichts zu suchen.
revoke all on public.fahrer from anon;
grant select, insert, update, delete on public.fahrer to authenticated;

comment on table public.fahrer is
    'Fahrer eines Lokals mit persoenlichem Link (nur der SHA-256-Wert steht hier). '
    'Status schreibt netlify/functions/fahrer.js mit dem Dienstschluessel.';

select 'fahrer ist eingerichtet' as fertig,
       (select count(*) from pg_policies where tablename = 'fahrer') as regeln;
