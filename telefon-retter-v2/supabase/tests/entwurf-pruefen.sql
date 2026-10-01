-- Prueft schema-entwurf.sql in einer LEEREN Postgres-Datenbank (ab 15),
-- ohne Supabase. Dafuer wird das Noetigste von Supabase nachgebaut:
-- die Rollen anon/authenticated/service_role, auth.users und auth.uid().
--
--   createdb pruefung
--   psql -d pruefung -v ON_ERROR_STOP=1 -f tests/entwurf-pruefen.sql
--
-- Jede Pruefung meldet OK oder bricht mit FEHLER ab. Gegenprobe: eine
-- Policy in schema-entwurf.sql auf "using (true)" stellen -> muss rot werden.

\set QUIET on
set client_min_messages = warning;

-- --- Supabase-Nachbau -------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- --- Das Schema -------------------------------------------------------
\ir ../schema-entwurf.sql

grant usage on schema public, app to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema app to authenticated;

-- --- Zwei Betriebe, drei Menschen ------------------------------------
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),  -- Inhaber A
  ('00000000-0000-0000-0000-00000000000b'),  -- Inhaber B
  ('00000000-0000-0000-0000-0000000000a2'),  -- Mitarbeiter A
  ('00000000-0000-0000-0000-0000000000ad');  -- Anbieter (Ibo)
insert into public.tenants (id, name, slug, is_test) values
  ('10000000-0000-0000-0000-00000000000a', 'Testbetrieb A', 'test-a', true),
  ('10000000-0000-0000-0000-00000000000b', 'Testbetrieb B', 'test-b', true);
insert into public.tenant_members values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'inhaber', true, now()),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'inhaber', true, now()),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'mitarbeiter', true, now());
insert into public.platform_admins values ('00000000-0000-0000-0000-0000000000ad', now());
insert into public.tenant_settings (tenant_id) values
  ('10000000-0000-0000-0000-00000000000a'), ('10000000-0000-0000-0000-00000000000b');
insert into public.menu_categories (id, tenant_id, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Pizza'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Pizza');
insert into public.orders (tenant_id, order_number, business_day, channel, fulfillment,
                           customer_name, subtotal_cents, total_cents) values
  ('10000000-0000-0000-0000-00000000000a', 1, current_date, 'test', 'abholung', 'Test A', 1000, 1000),
  ('10000000-0000-0000-0000-00000000000b', 1, current_date, 'test', 'abholung', 'Test B', 2000, 2000);

-- --- Pruefhelfer -------------------------------------------------------
create or replace function pg_temp.pruefe(name text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'OK     %', name; else raise exception 'FEHLER %', name; end if;
end $$;
set client_min_messages = notice;

create or replace function pg_temp.zeilen(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function pg_temp.als(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
end $$;

-- --- 1. Inhaber A sieht nur A -----------------------------------------
select pg_temp.als('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.pruefe('Inhaber A sieht 1 Bestellung', (select count(*) from public.orders) = 1);
select pg_temp.pruefe('... und zwar seine eigene', (select customer_name from public.orders) = 'Test A');
select pg_temp.pruefe('Inhaber A sieht nur Betrieb A', (select count(*) from public.tenants) = 1);
select pg_temp.pruefe('Inhaber A darf seine Karte aendern',
  pg_temp.zeilen($q$update public.menu_categories set name = 'Pizzen' where tenant_id = '10000000-0000-0000-0000-00000000000a'$q$) = 1);
select pg_temp.pruefe('Inhaber A kann Karte von B nicht aendern',
  pg_temp.zeilen($q$update public.menu_categories set name = 'gehackt' where tenant_id = '10000000-0000-0000-0000-00000000000b'$q$) = 0);
reset role;

-- --- 2. Mitarbeiter A liest, aendert aber keine Einstellungen ---------
select pg_temp.als('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select pg_temp.pruefe('Mitarbeiter A sieht die Bestellung von A', (select count(*) from public.orders) = 1);
select pg_temp.pruefe('Mitarbeiter A kann Einstellungen nicht aendern',
  pg_temp.zeilen($q$update public.tenant_settings set orders_enabled = false$q$) = 0);
select pg_temp.pruefe('Mitarbeiter A kann Karte nicht aendern',
  pg_temp.zeilen($q$update public.menu_categories set name = 'x'$q$) = 0);
reset role;

-- --- 3. Fremde und Anonyme sehen nichts -------------------------------
select pg_temp.als(null);
set role anon;
select pg_temp.pruefe('Anonym sieht keine Bestellungen', (select count(*) from public.orders) = 0);
select pg_temp.pruefe('Anonym sieht keine Betriebe', (select count(*) from public.tenants) = 0);
reset role;

-- --- 4. Der Anbieter sieht alles --------------------------------------
select pg_temp.als('00000000-0000-0000-0000-0000000000ad');
set role authenticated;
select pg_temp.pruefe('Anbieter sieht beide Bestellungen', (select count(*) from public.orders) = 2);
reset role;

-- --- 5. Die Datenbank rechnet: falsche Summen gehen nicht rein --------
do $$ begin
  insert into public.orders (tenant_id, order_number, business_day, channel, fulfillment,
                             customer_name, subtotal_cents, delivery_fee_cents, total_cents)
  values ('10000000-0000-0000-0000-00000000000a', 2, current_date, 'test', 'abholung', 'x', 1000, 0, 999);
  raise exception 'FEHLER falsche Summe wurde angenommen';
exception when check_violation then
  raise notice 'OK     falsche Summe (999 statt 1000) wird abgelehnt';
end $$;
do $$ begin
  insert into public.orders (tenant_id, order_number, business_day, channel, fulfillment,
                             customer_name, subtotal_cents, total_cents)
  values ('10000000-0000-0000-0000-00000000000a', 3, current_date, 'test', 'lieferung', 'x', 1000, 1000);
  raise exception 'FEHLER Lieferung ohne Adresse wurde angenommen';
exception when check_violation then
  raise notice 'OK     Lieferung ohne Adresse wird abgelehnt';
end $$;
do $$ begin
  insert into public.menu_items (tenant_id, category_id, name, allergens)
  values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'x', array['A']);
  raise exception 'FEHLER Allergen-Buchstabe statt Wort wurde angenommen';
exception when check_violation then
  raise notice 'OK     Allergen "A" statt "gluten" wird abgelehnt';
end $$;

-- --- 6. Jede Tabelle mit tenant_id hat RLS an -------------------------
select pg_temp.pruefe('alle Tabellen mit tenant_id haben RLS', not exists (
  select 1 from information_schema.columns c
  join pg_class k on k.relname = c.table_name
  join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
  where c.table_schema = 'public' and c.column_name = 'tenant_id' and not k.relrowsecurity));

\echo 'Alle Pruefungen gruen.'
