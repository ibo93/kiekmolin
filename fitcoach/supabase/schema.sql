-- ============================================================
-- FitCoach – Supabase Datenbank-Schema
-- Im Supabase SQL-Editor ausführen (einmalig).
-- Alle Tabellen mit Row Level Security: jeder User sieht nur seine Daten.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFIL (Onboarding-Daten + berechnete Ziele)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  alter           int     not null check (alter between 10 and 120),
  groesse_cm      numeric not null check (groesse_cm between 100 and 250),
  gewicht_kg      numeric not null check (gewicht_kg between 30 and 350),
  geschlecht      text    not null check (geschlecht in ('m', 'w')),
  -- Aktivitätsfaktor: 1.2 sitzend … 1.9 sehr aktiv
  aktivitaetslevel numeric not null check (aktivitaetslevel between 1.2 and 1.9),
  ziel            text    not null check (ziel in ('abnehmen', 'muskelaufbau', 'rekomposition')),
  zielgewicht_kg  numeric check (zielgewicht_kg between 30 and 350),
  zieldatum       date,
  -- Berechnete Werte (Mifflin-St-Jeor → TDEE → Ziel)
  grundumsatz     int not null,
  tdee            int not null,
  kalorienziel    int not null,
  protein_g       int not null,
  carbs_g         int not null,
  fett_g          int not null,
  wasserziel_ml   int not null default 2500,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Eigenes Profil lesen"    on public.profiles for select using (auth.uid() = id);
create policy "Eigenes Profil anlegen"  on public.profiles for insert with check (auth.uid() = id);
create policy "Eigenes Profil ändern"   on public.profiles for update using (auth.uid() = id);
create policy "Eigenes Profil löschen"  on public.profiles for delete using (auth.uid() = id);

-- ------------------------------------------------------------
-- 2. MAHLZEITEN-PROTOKOLL (manuell + KI-Scan)
-- ------------------------------------------------------------
create table if not exists public.food_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  datum       date not null default (now() at time zone 'utc')::date,
  mahlzeit    text not null check (mahlzeit in ('fruehstueck', 'mittag', 'abend', 'snack')),
  name        text not null,
  menge_g     numeric,                 -- geschätzte/angepasste Portionsgröße
  kalorien    numeric not null check (kalorien >= 0),
  protein_g   numeric not null default 0 check (protein_g >= 0),
  carbs_g     numeric not null default 0 check (carbs_g >= 0),
  fett_g      numeric not null default 0 check (fett_g >= 0),
  quelle      text not null default 'manuell' check (quelle in ('manuell', 'ki_scan', 'favorit')),
  foto_pfad   text,                    -- Pfad im Storage-Bucket food-photos
  ki_details  jsonb,                   -- komplette KI-Antwort (Zutaten etc.)
  created_at  timestamptz not null default now()
);

create index if not exists food_entries_user_datum on public.food_entries (user_id, datum);

alter table public.food_entries enable row level security;

create policy "Eigene Einträge lesen"   on public.food_entries for select using (auth.uid() = user_id);
create policy "Eigene Einträge anlegen" on public.food_entries for insert with check (auth.uid() = user_id);
create policy "Eigene Einträge ändern"  on public.food_entries for update using (auth.uid() = user_id);
create policy "Eigene Einträge löschen" on public.food_entries for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. FAVORITEN (häufige Gerichte mit einem Tap eintragen)
-- ------------------------------------------------------------
create table if not exists public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  menge_g     numeric,
  kalorien    numeric not null check (kalorien >= 0),
  protein_g   numeric not null default 0,
  carbs_g     numeric not null default 0,
  fett_g      numeric not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.favorites enable row level security;

create policy "Eigene Favoriten lesen"   on public.favorites for select using (auth.uid() = user_id);
create policy "Eigene Favoriten anlegen" on public.favorites for insert with check (auth.uid() = user_id);
create policy "Eigene Favoriten ändern"  on public.favorites for update using (auth.uid() = user_id);
create policy "Eigene Favoriten löschen" on public.favorites for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. WASSER-TRACKER (ein Eintrag pro Glas/Flasche)
-- ------------------------------------------------------------
create table if not exists public.water_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  datum       date not null default (now() at time zone 'utc')::date,
  menge_ml    int not null check (menge_ml between 1 and 3000),
  created_at  timestamptz not null default now()
);

create index if not exists water_entries_user_datum on public.water_entries (user_id, datum);

alter table public.water_entries enable row level security;

create policy "Eigenes Wasser lesen"   on public.water_entries for select using (auth.uid() = user_id);
create policy "Eigenes Wasser anlegen" on public.water_entries for insert with check (auth.uid() = user_id);
create policy "Eigenes Wasser löschen" on public.water_entries for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5. GEWICHTSVERLAUF (wöchentliches Wiegen)
-- ------------------------------------------------------------
create table if not exists public.weight_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  datum       date not null default (now() at time zone 'utc')::date,
  gewicht_kg  numeric not null check (gewicht_kg between 30 and 350),
  created_at  timestamptz not null default now(),
  unique (user_id, datum)               -- max. ein Eintrag pro Tag
);

alter table public.weight_entries enable row level security;

create policy "Eigenes Gewicht lesen"   on public.weight_entries for select using (auth.uid() = user_id);
create policy "Eigenes Gewicht anlegen" on public.weight_entries for insert with check (auth.uid() = user_id);
create policy "Eigenes Gewicht ändern"  on public.weight_entries for update using (auth.uid() = user_id);
create policy "Eigenes Gewicht löschen" on public.weight_entries for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6. FORTSCHRITTSFOTOS (Vorher/Nachher, privat)
-- ------------------------------------------------------------
create table if not exists public.progress_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  datum       date not null default (now() at time zone 'utc')::date,
  storage_pfad text not null,           -- Pfad im Bucket progress-photos
  notiz       text,
  created_at  timestamptz not null default now()
);

alter table public.progress_photos enable row level security;

create policy "Eigene Fotos lesen"    on public.progress_photos for select using (auth.uid() = user_id);
create policy "Eigene Fotos anlegen"  on public.progress_photos for insert with check (auth.uid() = user_id);
create policy "Eigene Fotos löschen"  on public.progress_photos for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 7. WORKOUTS (abgehakte Trainingseinheiten)
-- ------------------------------------------------------------
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  datum       date not null default (now() at time zone 'utc')::date,
  plan_name   text not null,            -- z. B. "Push", "Pull", "Beine", "Ganzkörper A"
  abgeschlossen boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists workouts_user_datum on public.workouts (user_id, datum);

alter table public.workouts enable row level security;

create policy "Eigene Workouts lesen"   on public.workouts for select using (auth.uid() = user_id);
create policy "Eigene Workouts anlegen" on public.workouts for insert with check (auth.uid() = user_id);
create policy "Eigene Workouts ändern"  on public.workouts for update using (auth.uid() = user_id);
create policy "Eigene Workouts löschen" on public.workouts for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 8. SÄTZE (Gewicht/Wiederholungen pro Übung)
-- ------------------------------------------------------------
create table if not exists public.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  uebung      text not null,
  satz_nr     int not null check (satz_nr between 1 and 20),
  gewicht_kg  numeric check (gewicht_kg >= 0),
  wiederholungen int check (wiederholungen between 0 and 200),
  erledigt    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists workout_sets_workout on public.workout_sets (workout_id);

alter table public.workout_sets enable row level security;

create policy "Eigene Sätze lesen"   on public.workout_sets for select using (auth.uid() = user_id);
create policy "Eigene Sätze anlegen" on public.workout_sets for insert with check (auth.uid() = user_id);
create policy "Eigene Sätze ändern"  on public.workout_sets for update using (auth.uid() = user_id);
create policy "Eigene Sätze löschen" on public.workout_sets for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE: private Buckets für Essens- und Fortschrittsfotos.
-- Dateien liegen unter <user_id>/<dateiname> – Policies erlauben
-- nur Zugriff auf den eigenen Ordner.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "Eigene Food-Fotos lesen" on storage.objects for select
  using (bucket_id = 'food-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Eigene Food-Fotos hochladen" on storage.objects for insert
  with check (bucket_id = 'food-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Eigene Food-Fotos löschen" on storage.objects for delete
  using (bucket_id = 'food-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Eigene Progress-Fotos lesen" on storage.objects for select
  using (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Eigene Progress-Fotos hochladen" on storage.objects for insert
  with check (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Eigene Progress-Fotos löschen" on storage.objects for delete
  using (bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------
-- updated_at automatisch pflegen
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
