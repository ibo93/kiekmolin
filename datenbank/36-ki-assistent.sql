-- SCHRITT 36: KI-ASSISTENTEN-SCHICHT ("KIN Agent-Ready").
--
-- ERST Schritt 35 ausfuehren. Nur weitermachen, wenn dort Teil 1 leer war.
--
-- WAS DAS IST
-- ChatGPT, Claude, Gemini & Co. sollen ueber kiekmolin.de/mcp Restaurants
-- finden, die Karte lesen und einen Tisch ANFRAGEN koennen. Diese Datei
-- legt dafuer nur NEUES an:
--
--   agent_restaurants_v  Sicht: nur die Spalten, die ein Assistent sehen darf
--   agent_menu_v         Sicht: Karte mit Allergenen, ohne interne Felder
--   agent_belegung_v     Sicht: Belegung je Tag -- Uhrzeit, Personen, Status, Tisch
--   agent_tische_v       Sicht: Anzahl aktiver Tische je Haus
--   agent_optin          welche Haeuser mitmachen (Pilot: zwei)
--   agent_requests       Protokoll jeder Assistenten-Anfrage (ohne Personendaten)
--
-- WAS DAS NICHT IST
-- Keine bestehende Tabelle wird geaendert, keine Regel, keine Spalte.
-- Reservierungs-Anfragen landen als normale Zeile in reservations --
-- mit status 'pending' und source 'ki-assistent', genau wie der
-- Telefon-Assistent es mit 'telefon' seit August macht.
--
-- WER DARF LESEN
-- NIEMAND von aussen. Die Sichten und Tabellen sind fuer anon und
-- authenticated gesperrt -- es entsteht KEIN neuer oeffentlicher Weg
-- ueber den Browser-Schluessel. Lesen tut nur die Netlify-Funktion mcp
-- mit dem Service-Schluessel, und die liest AUSSCHLIESSLICH diese
-- Sichten. Dass eine Spalte wie email oder stripe_* nie herausgeht,
-- steht damit in der Datenbank, nicht nur im Code.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
select to_regclass('public.agent_restaurants_v') as sicht_restaurants,
       to_regclass('public.agent_menu_v')        as sicht_karte,
       to_regclass('public.agent_optin')         as optin,
       to_regclass('public.agent_requests')      as protokoll;


-- ---- TEIL B: SICHTEN -------------------------------------------------
-- security_invoker: die Sicht prueft mit den Rechten dessen, der fragt.
-- Ohne das liefe sie mit den Rechten ihres Besitzers und wuerde RLS
-- auf restaurants umgehen, falls sie doch einmal freigegeben wird.
create or replace view public.agent_restaurants_v
with (security_invoker = true) as
select r.id, r.slug, r.name, r.description,
       r.street, r.zip, r.city, r.phone,
       r.lat, r.lng,
       r.cuisine, r.cuisine_type, r.price_range,
       r.tags, r.features,
       r.opening_hours, r.opening_time, r.closing_time, r.rest_day,
       r.slot_interval_minutes
  from public.restaurants r
 where coalesce(r.is_active, true);

create or replace view public.agent_menu_v
with (security_invoker = true) as
select m.id, m.restaurant_id,
       c.name as kategorie,
       m.name, m.description, m.base_price,
       m.allergens, m.additives,
       m.is_vegan, m.is_vegetarian, m.is_spicy,
       m.sort_order
  from public.menu_items m
  left join public.menu_categories c on c.id = m.category_id
 where coalesce(m.is_available, true);

-- Belegung eines Tages: dieselben vier Felder, die res-availability.js
-- herausgibt. Kein Name, kein Telefon, keine Notiz, keine Kennung.
create or replace view public.agent_belegung_v
with (security_invoker = true) as
select restaurant_id, reservation_date, reservation_time, party_size, status, table_id
  from public.reservations
 where status is distinct from 'cancelled';

-- Nur die Anzahl aktiver Tische -- die Freie-Zeiten-Rechnung braucht nicht mehr.
create or replace view public.agent_tische_v
with (security_invoker = true) as
select restaurant_id, count(*)::int as tische
  from public.restaurant_tables
 where coalesce(is_active, true)
 group by restaurant_id;

revoke all on public.agent_restaurants_v from anon, authenticated;
revoke all on public.agent_menu_v        from anon, authenticated;
revoke all on public.agent_belegung_v    from anon, authenticated;
revoke all on public.agent_tische_v      from anon, authenticated;
grant select on public.agent_restaurants_v to service_role;
grant select on public.agent_menu_v        to service_role;
grant select on public.agent_belegung_v    to service_role;
grant select on public.agent_tische_v      to service_role;


-- ---- TEIL C: WER MACHT MIT -------------------------------------------
-- Ein Haus erscheint beim Assistenten nur, wenn es hier mit aktiv = true
-- steht. Abschalten: update ... set aktiv = false -- sofort wirksam,
-- nichts wird geloescht.
create table if not exists public.agent_optin (
    restaurant_id uuid        primary key,
    aktiv         boolean     not null default true,
    seit          timestamptz not null default now(),
    notiz         text
);
alter table public.agent_optin enable row level security;
revoke all on public.agent_optin from anon, authenticated;
grant select, insert, update on public.agent_optin to service_role;

-- Pilot: Greetsieler Boerse und La Piazza Greetsiel.
insert into public.agent_optin (restaurant_id, notiz)
select id, 'Pilot KIN Agent-Ready'
  from public.restaurants
 where slug in ('greetsieler-boerse', 'la-piazza-greetsiel')
on conflict (restaurant_id) do nothing;


-- ---- TEIL D: PROTOKOLL -----------------------------------------------
-- Jede Anfrage eines Assistenten, damit sich zeigen laesst: "X Gaeste
-- kamen ueber KI-Assistenten" -- und damit die Drossel zaehlen kann.
--
-- WAS NICHT DRINSTEHT: kein Name, keine Telefonnummer, keine IP. Die IP
-- und die Telefonnummer stehen nur als Hash mit geheimem Salz darin --
-- genug, um "dieselbe Quelle zum dritten Mal in einer Stunde" zu
-- erkennen, nicht genug, um auf eine Person zurueckzukommen.
create table if not exists public.agent_requests (
    id             uuid        primary key default gen_random_uuid(),
    created_at     timestamptz not null default now(),
    werkzeug       text        not null,          -- search_restaurants, get_menu, ...
    client         text,                          -- ChatGPT, Claude, Gemini, unbekannt
    user_agent     text,                          -- gekuerzt auf 200 Zeichen
    restaurant_id  uuid,
    ergebnis       text        not null,          -- ok, abgelehnt, gedrosselt, fehler
    ip_hash        text,
    telefon_hash   text,                          -- nur bei request_reservation
    reservation_id text,                          -- nur bei angelegter Anfrage
    details        jsonb                          -- Filter, Datum, Personen -- nie Namen
);
create index if not exists agent_requests_zeit_idx  on public.agent_requests (created_at desc);
create index if not exists agent_requests_ip_idx    on public.agent_requests (ip_hash, created_at desc);
create index if not exists agent_requests_tel_idx   on public.agent_requests (telefon_hash, created_at desc);
create index if not exists agent_requests_haus_idx  on public.agent_requests (restaurant_id, created_at desc);

alter table public.agent_requests enable row level security;
revoke all on public.agent_requests from anon, authenticated;
grant select, insert on public.agent_requests to service_role;


-- ---- TEIL E: KONTROLLE -----------------------------------------------
-- ERWARTET: vier Objekte da, zwei Pilot-Haeuser aktiv.
select to_regclass('public.agent_restaurants_v') as sicht_restaurants,
       to_regclass('public.agent_menu_v')        as sicht_karte,
       to_regclass('public.agent_optin')         as optin,
       to_regclass('public.agent_requests')      as protokoll;

select o.aktiv, r.slug, r.name
  from public.agent_optin o
  join public.restaurants r on r.id = o.restaurant_id;

-- Von aussen darf NICHTS lesbar sein. ERWARTET: sechs Zeilen, alle "nein".
select t.name,
       case when has_table_privilege('anon', t.name, 'select') then 'JA -- LOCH' else 'nein' end as anon_liest
  from (values ('public.agent_restaurants_v'), ('public.agent_menu_v'),
               ('public.agent_belegung_v'), ('public.agent_tische_v'),
               ('public.agent_optin'), ('public.agent_requests')) as t(name);
