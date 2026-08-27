-- ALLES, WAS NOCH OFFEN IST -- IN EINEM STUECK.
--
-- Stand: 27.08.2026, 15:30 Uhr. Nachgemessen in den Edge-Protokollen,
-- nicht geraten:
--
--   19-mindestbestellwert.sql   SCHON DRIN. Ab 05:45 Uhr kommt auf
--                               ?select=min_order_value eine 200
--                               zurueck, vorher 400. Danke.
--                               ABER: der Wert steht ueberall auf 0 --
--                               die 15 Euro muessen einmal im
--                               Dashboard neu gespeichert werden,
--                               siehe ganz unten.
--
--   17-orders-quelle.sql        NOCH OFFEN. Zuletzt um 15:20:53 Uhr
--                               eine 400 auf ?select=...source.
--
--   20-ereignisse-vom-gast.sql  NOCH OFFEN. 9 mal 403 beim Anlegen.
--
--   21-wache-gedaechtnis.sql    NEU. Ohne die Tabelle meldet die Wache
--                               weiter oefter als noetig.
--
-- Alles hier ist gefahrlos und darf zweimal laufen: nur neue Spalten
-- mit Standardwert, eine neue Tabelle, eine neue Anlege-Regel. Keine
-- Zeile wird geloescht, keine bestehende Regel geaendert.
--
-- Kopieren, im Supabase-SQL-Editor einfuegen, "Run".


-- ====================================================================
-- 1. orders.source -- woher eine Bestellung kam
-- ====================================================================
-- Zwei Programme zeigen darauf: der Telefon-Assistent schreibt
-- source: 'telefon', der Agentur-Bericht filtert danach. Ein Filter auf
-- eine Spalte, die es nicht gibt, ist immer 400 -- die
-- Telefon-Bestellungen waren nie zaehlbar. Bestehende Zeilen bekommen
-- 'app', das waren alle Online-Bestellungen.

alter table public.orders
    add column if not exists source text not null default 'app';

-- Ein Teil-Index: der Bericht sucht nach 'telefon', und das sind wenige
-- Zeilen von vielen.
create index if not exists orders_source_idx
    on public.orders (restaurant_id, source)
 where source <> 'app';


-- ====================================================================
-- 2. restaurant_events -- der Gast darf eine Stoerung melden
-- ====================================================================
-- logRestaurantEvent() schreibt aus dem BROWSER mit, wenn im Betrieb
-- etwas schiefgeht. Beim Wirt klappt das, beim Gast nicht -- und der
-- Gast ist genau derjenige, bei dem die interessanten Stoerungen
-- passieren. Bitter, weil dieses Protokoll dafuer da ist, stille
-- Ausfaelle sichtbar zu machen: es ist selbst einer geworden.
--
-- NUR anlegen, nicht lesen. Wer die Tabelle lesen darf, saehe die
-- Stoerungen aller Betriebe mit Bestellnummern und Nutzdaten.

drop policy if exists "Jeder darf eine Stoerung melden" on public.restaurant_events;

create policy "Jeder darf eine Stoerung melden"
    on public.restaurant_events for insert to anon, authenticated
    with check (restaurant_id is not null);


-- ====================================================================
-- 3. wache_status -- damit die Wache sich etwas merken kann
-- ====================================================================
-- Gemessen: 96 E-Mails zwischen dem 26.08. 22:30 und dem 27.08. 07:45,
-- alle 15 Minuten, alle mit demselben Satz.
--
-- Die alte Ruhezeit lag in /tmp. Eine Netlify-Funktion bekommt fast
-- jedes Mal einen frischen Behaelter -- /tmp war bei jedem Start leer,
-- also war jede Meldung wieder "die erste".
--
-- Hier ueberlebt der Stand jeden Neustart. Daraus folgt:
--   erste Meldung sofort, auch nachts
--   dasselbe danach still -- hoechstens eine Erinnerung am Tag, 8-21 Uhr
--   etwas ANDERES kaputt: sofort, trotz laufender Ruhe
--   wieder in Ordnung: eine Entwarnung, genau eine

create table if not exists public.wache_status (
    kennung          text primary key,
    zustand          text        not null default 'ok',   -- 'ok' | 'klemmt'
    fehlversuche     integer     not null default 0,
    seit             timestamptz,
    zuletzt_gemeldet timestamptz,
    text             text,
    updated_at       timestamptz not null default now()
);

-- NIEMAND AUSSER DEM DIENSTSCHLUESSEL.
-- Wer hier schreiben koennte, koennte die Wache stummschalten -- und
-- eine stumme Wache ist schlimmer als keine, weil man sich auf sie
-- verlaesst. RLS an, keine einzige Policy: der Dienstschluessel geht an
-- RLS vorbei, alle anderen sehen eine leere Tabelle.
alter table public.wache_status enable row level security;


-- ====================================================================
-- 4. NACHSEHEN, OB ES GEKLAPPT HAT
-- ====================================================================
-- Drei Zeilen sollen herauskommen, alle mit "ja".

select 'orders.source angelegt' as sache,
       case when exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'orders' and column_name = 'source'
       ) then 'ja' else 'NEIN' end as ergebnis

union all

select 'Gast darf Stoerung melden',
       case when exists (
           select 1 from pg_policies
            where schemaname = 'public' and tablename = 'restaurant_events'
              and cmd = 'INSERT' and 'anon' = any(roles)
       ) then 'ja' else 'NEIN' end

union all

select 'Wache hat ein Gedaechtnis',
       case when exists (
           select 1 from information_schema.tables
            where table_schema = 'public' and table_name = 'wache_status'
       ) then 'ja' else 'NEIN' end;


-- ---- UND DAS HIER IST KEIN SQL, SONDERN EIN HANDGRIFF ---------------
-- Der Mindestbestellwert steht ueberall auf 0. Die Spalte gibt es seit
-- heute Morgen, aber die 15 Euro, die du im Dashboard siehst, kommen
-- aus dem Speicher DEINES Browsers -- in der Datenbank sind sie nie
-- angekommen, weil es die Spalte damals nicht gab.
--
-- Also einmal im Dashboard neu eintragen und speichern. Danach muss
-- dort "Mindestbestellwert: 15 EUR" stehen und NICHT "Nur auf diesem
-- Geraet gespeichert". Erst dann sieht der Gast ihn auch.
--
-- Kontrolle:
select name               as betrieb,
       min_order_value    as mindestbestellwert,
       free_delivery_from as gratis_ab,
       delivery_fee       as liefergebuehr
  from public.restaurants
 where is_active is not false
 order by name;
