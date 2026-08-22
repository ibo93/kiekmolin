-- ==========================================================
-- Kurani CRM – Handy-Sync einrichten
-- Supabase Dashboard → SQL Editor → alles einfügen → RUN
-- Läuft auch mehrfach ohne Schaden.
-- ==========================================================

-- 1) Tabelle: pro Benutzer genau eine Zeile mit dem kompletten CRM-Stand
create table if not exists public.crm_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  device     text
);

-- 2) Zeilenschutz einschalten: ohne Regel kommt niemand an die Daten
alter table public.crm_state enable row level security;

-- 3) Regeln: jeder sieht und ändert ausschließlich seine eigene Zeile
drop policy if exists "eigene zeile lesen"   on public.crm_state;
drop policy if exists "eigene zeile anlegen" on public.crm_state;
drop policy if exists "eigene zeile aendern" on public.crm_state;

create policy "eigene zeile lesen" on public.crm_state
  for select using (auth.uid() = user_id);

create policy "eigene zeile anlegen" on public.crm_state
  for insert with check (auth.uid() = user_id);

create policy "eigene zeile aendern" on public.crm_state
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) Kontrolle: muss "true" zeigen
select relname, relrowsecurity as zeilenschutz_aktiv
from pg_class
where relname = 'crm_state';
