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
