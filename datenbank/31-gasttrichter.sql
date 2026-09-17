-- SCHRITT 31: guest_funnel -- wo die Gaeste abspringen.
--
-- WARUM
-- Am 14.09.2026 standen im Protokoll 1.902 Speisekarten-Abrufe und 114
-- Bestellungen. Daraus laesst sich KEINE Quote machen: ein Gast loest
-- mehrere Abrufe aus, das Dashboard laedt die Karte mit, und der Drucker
-- fragt alle paar Sekunden nach. 1.902 ist keine Gaestezahl.
--
-- Diese Tabelle zaehlt Besuche statt Abrufe: eine Zufallsnummer pro
-- Browser-Sitzung, drei Schritte, jeder Schritt hoechstens einmal.
--
-- WAS NICHT DRINSTEHT
-- Kein Name, keine Mail, keine Telefonnummer, keine IP. "besuch" ist eine
-- Zufallszahl, die beim Schliessen des Tabs verschwindet (sessionStorage)
-- und zu nichts zurueckfuehrt. Mehr braucht es nicht, um drei Schritte zu
-- zaehlen -- und alles darueber waere Personendaten ohne Grund.
--
-- WARUM ANLEGEN, ABER NICHT LESEN
-- Genau wie bei restaurant_events (Schritt 20): wer lesen darf, sieht das
-- Besucherverhalten ALLER Betriebe. Der Gast braucht nur das Recht,
-- eine Zeile hinzuzufuegen. Ausgewertet wird im Wochenbericht, und der
-- laeuft mit dem Service-Schluessel -- der Browser liest hier nie.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
select case when to_regclass('public.guest_funnel') is null
            then 'Tabelle fehlt noch' else 'Tabelle ist da' end as stand;


-- ---- TEIL B: ANLEGEN --------------------------------------------------
create table if not exists public.guest_funnel (
    id            uuid primary key default gen_random_uuid(),
    restaurant_id uuid        not null,
    besuch        text        not null,
    schritt       text        not null,
    created_at    timestamptz not null default now()
);

-- Die Schranke gehoert in die Datenbank, nicht nur in den Browser.
-- Sonst kann jeder mit dem oeffentlichen Schluessel beliebigen Text in
-- beliebiger Laenge hier ablegen -- die Tabelle ist fuer anon offen.
alter table public.guest_funnel
    drop constraint if exists guest_funnel_schritt_check;
alter table public.guest_funnel
    add constraint guest_funnel_schritt_check
    check (schritt in ('karte', 'warenkorb', 'bestellt'));

alter table public.guest_funnel
    drop constraint if exists guest_funnel_besuch_check;
alter table public.guest_funnel
    add constraint guest_funnel_besuch_check
    check (char_length(besuch) between 8 and 64);

-- Der Wochenbericht holt "ein Haus, letzte 7 Tage". Ohne diesen Index
-- liest er die ganze Tabelle.
create index if not exists guest_funnel_haus_zeit_idx
    on public.guest_funnel (restaurant_id, created_at desc);

-- Derselbe Schritt im selben Besuch soll nur einmal zaehlen. Der Browser
-- passt schon auf, aber ein zweiter Tab oder ein Neuladen kommt sonst
-- doppelt an -- und dann stimmt die Quote nicht mehr.
create unique index if not exists guest_funnel_einmal_idx
    on public.guest_funnel (besuch, schritt);

alter table public.guest_funnel enable row level security;

drop policy if exists "Jeder Gast darf einen Schritt melden" on public.guest_funnel;
create policy "Jeder Gast darf einen Schritt melden"
    on public.guest_funnel for insert to anon, authenticated
    with check (restaurant_id is not null);
-- Bewusst KEINE select-, update- oder delete-Regel.


-- ---- TEIL C: NACHSEHEN, OB ES GEKLAPPT HAT ---------------------------
select cmd        as recht,
       policyname as regel,
       case when 'anon' = any(roles) then 'ja' else 'NEIN' end as gilt_fuer_gaeste
  from pg_policies
 where schemaname = 'public' and tablename = 'guest_funnel'
 order by cmd;
-- Erwartet: GENAU EINE Zeile, cmd = INSERT, gilt_fuer_gaeste = ja.
-- Steht hier eine SELECT-Regel mit "ja", ist das ein Loch -- dann sieht
-- jeder Gast das Besucherverhalten aller Betriebe.

select case when rowsecurity then 'AN' else 'AUS' end as schutz
  from pg_tables
 where schemaname = 'public' and tablename = 'guest_funnel';
-- Erwartet: AN. Steht hier AUS, ist die Tabelle fuer jeden offen.


-- ---- TEIL D: AUFRAEUMEN ----------------------------------------------
-- Der Wochenbericht loescht selbst, was aelter als 90 Tage ist (siehe
-- netlify/functions/weekly-report.js). Von Hand geht es so:
--
--   delete from public.guest_funnel
--    where created_at < now() - interval '90 days';
