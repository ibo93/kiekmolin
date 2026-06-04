-- The Chef – Datenbank-Setup für Supabase
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query -> einfügen -> Run.
-- Speichert pro Nutzer den App-Zustand (Lager, Rezepte, Team, Schichten, Tagesdaten ...).

create table if not exists public.chef_state (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  k          text        not null,
  v          text,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);

alter table public.chef_state enable row level security;

-- Jeder Nutzer darf ausschließlich seine eigenen Zeilen lesen/schreiben.
drop policy if exists "chef_state_select_own" on public.chef_state;
create policy "chef_state_select_own" on public.chef_state
  for select using (auth.uid() = user_id);

drop policy if exists "chef_state_insert_own" on public.chef_state;
create policy "chef_state_insert_own" on public.chef_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "chef_state_update_own" on public.chef_state;
create policy "chef_state_update_own" on public.chef_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chef_state_delete_own" on public.chef_state;
create policy "chef_state_delete_own" on public.chef_state
  for delete using (auth.uid() = user_id);


-- ===== Tägliche Erinnerungen (Push auch bei geschlossener App) =====
-- Speichert pro Gerät ein Push-Abo + die gewünschten Erinnerungs-Zeiten.
-- Zugriff nur über den Service-Key (Netlify-Functions) – RLS sperrt alles andere.
create table if not exists public.chef_reminders (
  endpoint     text        primary key,
  p256dh       text        not null,
  auth         text        not null,
  morning      text        default '08:30',
  evening      text        default '21:00',
  tz           text        default 'Europe/Berlin',
  reminders_on boolean     default true,
  last_m       text,
  last_e       text,
  updated_at   timestamptz not null default now()
);

alter table public.chef_reminders enable row level security;
-- Keine Policies => anon/authenticated haben keinen Zugriff; nur der Service-Key
-- (in den Netlify-Functions) umgeht RLS und darf lesen/schreiben.


-- ===== POS-Webhook: Echtzeit-Umsatz / Verkäufe aus dem Kassensystem =====
-- Pro Gastronom ein zufälliger Token; das Kassensystem (oder Zapier/Make) pusht
-- Events an /.netlify/functions/pos-webhook?token=… , das Frontend pollt sie.
create table if not exists public.chef_pos_events (
  id     bigserial primary key,
  token  text        not null,
  type   text        not null,
  data   jsonb       not null default '{}'::jsonb,
  ts     timestamptz not null default now()
);
create index if not exists chef_pos_events_token_ts on public.chef_pos_events (token, ts);

alter table public.chef_pos_events enable row level security;
-- Keine Policies => nur Service-Key darf lesen/schreiben.
