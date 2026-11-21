-- TippArena – Grundschema
-- Spielgeld-Tippspiel. Keine Echtgeld-Funktionen, Coins können weder gekauft
-- noch ausgezahlt werden.
--
-- Grundsatz: Das Coin-Guthaben (wallets) und alles, was es verändert
-- (transactions, bets, bet_selections), ist für Clients NUR lesbar.
-- Geschrieben wird ausschließlich über SECURITY-DEFINER-Funktionen
-- (Migrationen 2–4), die entweder nur der service_role (Edge Functions)
-- gehören oder eine feste, nicht manipulierbare Logik haben (Tagesbonus).

-- ───────────────────────── Typen ─────────────────────────
create type public.event_status     as enum ('scheduled','live','finished','cancelled','postponed');
create type public.market_status    as enum ('open','suspended','settled');
create type public.outcome_status   as enum ('open','suspended','won','lost','void');
create type public.bet_type         as enum ('single','combo','system','builder');
create type public.bet_status       as enum ('open','won','lost','void','cashed_out');
create type public.selection_status as enum ('open','won','lost','void');
create type public.tx_kind          as enum ('signup_bonus','daily_bonus','refill','bet_stake',
                                             'bet_payout','bet_refund','cashout');

-- ───────────────────────── Hilfen ─────────────────────────
-- "Heute" ist der Kalendertag in Deutschland, nicht in UTC – sonst gäbe es
-- den Tagesbonus zwischen 0 und 1/2 Uhr nachts doppelt bzw. gar nicht.
create or replace function public.berlin_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Berlin')::date $$;

-- Einstellbare Grenzwerte, damit man sie ohne Migration ändern kann.
create table public.app_config (
  key   text primary key,
  value numeric not null,
  note  text
);
insert into public.app_config(key, value, note) values
  ('signup_coins',              1000, 'Startguthaben neuer Nutzer'),
  ('daily_bonus',                100, 'Tagesbonus beim Öffnen'),
  ('refill_to',                  500, 'Nachfüllen bei 0 Coins auf'),
  ('refill_days',                  7, 'Mindestabstand Nachfüllen in Tagen'),
  ('min_stake',                    1, 'Mindesteinsatz pro Wette'),
  ('max_stake',                10000, 'Höchsteinsatz pro Wette'),
  ('max_payout',             1000000, 'Höchstgewinn pro Wette'),
  ('max_selections',              15, 'Höchstzahl Tipps in einer Kombi'),
  ('live_odds_max_age_s',        300, 'Live-Quoten älter als das → keine Wette'),
  ('cashout_margin',            0.95, 'Anteil des fairen Werts beim Cash-Out'),
  ('builder_factor',            0.90, 'Abschlag je weiterem Tipp im Wetten-Konfigurator');

create or replace function public.cfg(p_key text) returns numeric
language sql stable as $$ select value from public.app_config where key = p_key $$;

-- ───────────────────────── Nutzer ─────────────────────────
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text unique check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  avatar_url       text,
  favorite_sports  text[] not null default '{}',
  favorite_leagues text[] not null default '{}',
  push_prefs       jsonb  not null default '{"bet_won":true,"event_start":true,"boost":true}',
  created_at       timestamptz not null default now()
);

create table public.wallets (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  balance          bigint not null default 0 check (balance >= 0),
  last_daily_bonus date,
  last_refill_at   timestamptz,
  updated_at       timestamptz not null default now()
);

create table public.transactions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        bigint not null,           -- + Gutschrift / - Belastung
  balance_after bigint not null,
  kind          public.tx_kind not null,
  bet_id        uuid,
  created_at    timestamptz not null default now()
);
create index on public.transactions(user_id, created_at desc);

create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Sport-Daten ─────────────────────────
create table public.sports (
  key    text primary key,                 -- 'soccer', 'basketball' …
  title  text not null,
  icon   text not null default '•',
  sort   int  not null default 100,
  active boolean not null default true
);

create table public.leagues (
  key       text primary key,              -- The-Odds-API sport_key, z. B. 'soccer_germany_bundesliga'
  sport_key text not null references public.sports(key),
  title     text not null,
  country   text,
  sort      int  not null default 100,
  active    boolean not null default true,
  has_draw  boolean not null default true  -- 3-Weg (1/X/2) oder 2-Weg
);

create table public.events (
  id                text primary key,      -- The-Odds-API event id
  league_key        text not null references public.leagues(key),
  sport_key         text not null references public.sports(key),
  home_team         text not null,
  away_team         text not null,
  commence_time     timestamptz not null,
  status            public.event_status not null default 'scheduled',
  home_score        int,
  away_score        int,
  ht_home_score     int,                   -- Halbzeit; liefert die Odds API NICHT → s. Abrechnung
  ht_away_score     int,
  minute            text,                  -- Anzeige, z. B. "67'" oder "2. Satz"
  is_top            boolean not null default false,
  last_odds_update  timestamptz,
  last_score_update timestamptz,
  settled_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index on public.events(commence_time);
create index on public.events(status);
create index on public.events(league_key, commence_time);

create table public.markets (
  id       uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  key      text not null,                  -- h2h, double_chance, totals, btts, spreads, draw_no_bet, h2h_h1, totals_h1
  line     numeric(6,2),                   -- 2.5 bei totals, Handicap der Heimelf bei spreads
  name     text not null,                  -- Anzeigename
  status   public.market_status not null default 'open',
  source   text not null default 'api' check (source in ('api','derived')),
  sort     int not null default 100,
  unique nulls not distinct (event_id, key, line)
);
create index on public.markets(event_id);

create table public.outcomes (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid not null references public.markets(id) on delete cascade,
  event_id         text not null references public.events(id) on delete cascade, -- für Realtime-Filter
  name             text not null,          -- home/draw/away, over/under, yes/no, 1X/12/X2
  label            text not null,          -- Anzeige: "Bayern", "Über 2,5"
  price            numeric(8,3) not null check (price >= 1.01),
  previous_price   numeric(8,3),
  point            numeric(6,2),
  status           public.outcome_status not null default 'open',
  price_changed_at timestamptz,
  updated_at       timestamptz not null default now(),
  unique (market_id, name)
);
create index on public.outcomes(event_id);

-- Vorherige Quote merken → Client kann grün/rot blinken lassen.
create or replace function public.outcomes_track_price() returns trigger
language plpgsql as $$
begin
  if new.price is distinct from old.price then
    new.previous_price   := old.price;
    new.price_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger outcomes_track_price before update on public.outcomes
  for each row execute function public.outcomes_track_price();

create table public.boosts (
  id             uuid primary key default gen_random_uuid(),
  outcome_id     uuid not null references public.outcomes(id) on delete cascade,
  event_id       text not null references public.events(id) on delete cascade,
  original_price numeric(8,3) not null,
  boosted_price  numeric(8,3) not null check (boosted_price > original_price),
  title          text not null,
  valid_date     date not null default public.berlin_today(),
  created_at     timestamptz not null default now(),
  unique (outcome_id, valid_date)
);
create index on public.boosts(valid_date);

-- ───────────────────────── Wetten ─────────────────────────
create table public.bets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  type             public.bet_type not null,
  system_k         int,                    -- bei Systemwette: k aus n
  lines            int not null default 1, -- Anzahl Einzelreihen (System)
  stake            bigint not null check (stake > 0),
  stake_per_line   numeric(14,4) not null,
  total_odds       numeric(14,3) not null, -- bei System: Summe aller Reihenquoten / lines
  odds_factor      numeric(8,4) not null default 1, -- Abschlag Wetten-Konfigurator (sonst 1)
  potential_payout bigint not null,
  status           public.bet_status not null default 'open',
  payout           bigint not null default 0,
  placed_at        timestamptz not null default now(),
  settled_at       timestamptz,
  check ((type = 'system') = (system_k is not null))
);
create index on public.bets(user_id, placed_at desc);
create index on public.bets(status, settled_at);

create table public.bet_selections (
  id           uuid primary key default gen_random_uuid(),
  bet_id       uuid not null references public.bets(id) on delete cascade,
  position     smallint not null default 0,  -- feste Reihenfolge für Systemreihen
  outcome_id   uuid not null references public.outcomes(id) on delete restrict,
  event_id     text not null references public.events(id) on delete restrict,
  market_key   text not null,
  label        text not null,              -- Schnappschuss für die Anzeige
  market_name  text not null,
  event_name   text not null,
  price        numeric(8,3) not null,      -- angenommene Quote (inkl. Boost)
  boosted      boolean not null default false,
  status       public.selection_status not null default 'open',
  settled_at   timestamptz,
  unique (bet_id, outcome_id)
);
create index on public.bet_selections(outcome_id);
create index on public.bet_selections(event_id);

-- ───────────────────────── Gruppen ─────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 3 and 40),
  invite_code text not null unique,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.group_members(user_id);

-- Hilfsfunktion ohne RLS-Rekursion (group_members-Policy fragt group_members).
create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from group_members where group_id = p_group and user_id = auth.uid())
$$;

-- ───────────────────────── Rechte & RLS ─────────────────────────
-- Erst alles wegnehmen, dann gezielt erlauben. So kann eine vergessene
-- Policy nie zu einem Schreibrecht auf Guthaben werden.
revoke all on all tables in schema public from anon, authenticated;

alter table public.app_config         enable row level security;
alter table public.profiles           enable row level security;
alter table public.wallets            enable row level security;
alter table public.transactions       enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.sports             enable row level security;
alter table public.leagues            enable row level security;
alter table public.events             enable row level security;
alter table public.markets            enable row level security;
alter table public.outcomes           enable row level security;
alter table public.boosts             enable row level security;
alter table public.bets               enable row level security;
alter table public.bet_selections     enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;

-- Öffentliche Sportdaten: jeder darf lesen, niemand schreiben.
grant select on public.app_config, public.sports, public.leagues, public.events,
                public.markets, public.outcomes, public.boosts to anon, authenticated;
create policy read_all on public.app_config for select using (true);
create policy read_all on public.sports     for select using (true);
create policy read_all on public.leagues    for select using (true);
create policy read_all on public.events     for select using (true);
create policy read_all on public.markets    for select using (true);
create policy read_all on public.outcomes   for select using (true);
create policy read_all on public.boosts     for select using (true);

-- Profil: eigenes lesen; nur bestimmte Spalten ändern.
grant select on public.profiles to authenticated;
grant update (username, avatar_url, favorite_sports, favorite_leagues, push_prefs)
  on public.profiles to authenticated;
create policy own_read   on public.profiles for select using (id = auth.uid());
create policy own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Guthaben & Buchungen: nur lesen, nur eigene.
grant select on public.wallets, public.transactions to authenticated;
create policy own_read on public.wallets      for select using (user_id = auth.uid());
create policy own_read on public.transactions for select using (user_id = auth.uid());

-- Wetten: nur lesen, nur eigene. Platzieren läuft über die Edge Function.
grant select on public.bets, public.bet_selections to authenticated;
create policy own_read on public.bets for select using (user_id = auth.uid());
create policy own_read on public.bet_selections for select
  using (exists (select 1 from public.bets b where b.id = bet_id and b.user_id = auth.uid()));

-- Push-Abos: eigene anlegen/lesen/löschen.
grant select, insert, delete on public.push_subscriptions to authenticated;
create policy own_all on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gruppen: sichtbar für Mitglieder. Anlegen/Beitreten nur per Funktion.
grant select on public.groups, public.group_members to authenticated;
create policy member_read on public.groups        for select using (public.is_group_member(id));
create policy member_read on public.group_members for select using (public.is_group_member(group_id));

-- Supabase gibt neuen Funktionen standardmäßig EXECUTE für alle.
-- Wir drehen das um: Funktionen sind privat, bis sie ausdrücklich freigegeben werden.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.berlin_today(), public.cfg(text), public.is_group_member(uuid)
  to anon, authenticated;
