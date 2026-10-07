-- ============================================================
-- TELEFON-RETTER v2 -- DATENBANKSCHEMA, ENTWURF AUS PHASE 0
--
-- NICHT EINSPIELEN. Das ist der Vorschlag zum Anschauen. Ab Phase 1
-- wird daraus eine Migration in supabase/migrations/ -- in einem
-- EIGENEN Supabase-Projekt in Frankfurt, nicht im Kiek-mol-in-Projekt.
--
-- Erklaerung in Worten: docs/datenbank.md
--
-- Grundregeln:
--   * Jede Tabelle mit Betriebsdaten hat tenant_id und RLS.
--   * Geld immer in Cent (integer), nie als Kommazahl.
--   * Zeiten als timestamptz; Oeffnungszeiten als Ortszeit des Betriebs.
--   * Der Agent-Server schreibt NUR ueber agent_*-Funktionen.
--   * Kein enum-Typ, sondern text + check: laesst sich spaeter ohne
--     Umbau erweitern.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;   -- Hilfsfunktionen, nicht ueber die API erreichbar


-- ------------------------------------------------------------
-- 1. BETRIEBE UND MENSCHEN
-- ------------------------------------------------------------

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  street        text,
  postal_code   text,
  city          text,
  bundesland    text not null default 'NI',      -- fuer Feiertage
  timezone      text not null default 'Europe/Berlin',
  status        text not null default 'einrichtung'
                check (status in ('einrichtung', 'aktiv', 'pausiert', 'gekuendigt')),
  agent_enabled boolean not null default false,  -- Admin: Agent an/aus
  is_test       boolean not null default false,  -- Testbetrieb mit Testdaten
  created_at    timestamptz not null default now()
);

-- Wer gehoert zu welchem Betrieb, mit welchen Rechten
create table public.tenant_members (
  tenant_id  uuid not null references public.tenants on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null check (role in ('inhaber', 'mitarbeiter')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Ibo als Anbieter: sieht alle Betriebe (Admin-Bereich)
create table public.platform_admins (
  user_id    uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- Agent-Nummern: die ANGERUFENE Nummer bestimmt den Betrieb
create table public.phone_numbers (
  e164          text primary key check (e164 ~ '^\+[1-9][0-9]{6,14}$'),
  tenant_id     uuid not null references public.tenants on delete restrict,
  provider      text not null check (provider in ('twilio', 'sipgate', 'telnyx', 'andere')),
  provider_ref  text,                             -- SID/ID beim Anbieter
  is_test       boolean not null default false,
  created_at    timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2. EINSTELLUNGEN (der Wirt aendert sie selbst in der App)
-- ------------------------------------------------------------

create table public.tenant_settings (
  tenant_id                 uuid primary key references public.tenants on delete cascade,

  -- Agent
  greeting_text             text not null default 'Herzlich willkommen bei {betrieb}.',
  ai_notice_text            text not null default 'Sie sprechen mit einem KI-Assistenten.',
  voice_provider            text not null default 'elevenlabs',
  voice_id                  text,
  tone                      text not null default 'freundlich'
                            check (tone in ('freundlich', 'locker', 'foermlich')),
  languages                 text[] not null default array['de'],
  upselling_enabled         boolean not null default false,

  -- Wann der Agent rangeht (Weg 2 aus docs/architektur.md)
  answer_mode               text not null default 'ueberlauf'
                            check (answer_mode in ('immer', 'ueberlauf', 'zeiten')),
  answer_schedule           jsonb,                -- nur bei 'zeiten'
  ring_first_number         text,                 -- Weg 2: erst hier klingeln
  ring_first_seconds        int check (ring_first_seconds between 5 and 60),

  -- Mensch
  forward_number            text,                 -- NIE die Hauptnummer (Schleife)
  forward_enabled           boolean not null default true,

  -- Bestellungen
  orders_enabled            boolean not null default true,
  pickup_enabled            boolean not null default true,
  delivery_enabled          boolean not null default false,
  pickup_minutes            int not null default 20 check (pickup_minutes between 0 and 240),
  delivery_minutes          int not null default 45 check (delivery_minutes between 0 and 300),
  orders_paused_until       timestamptz,          -- Pausenknopf
  orders_pause_reason       text,

  -- Reservierungen
  reservations_enabled      boolean not null default true,
  reservation_slot_minutes  int not null default 15 check (reservation_slot_minutes in (15, 30, 60)),
  reservation_duration_min  int not null default 120,
  max_covers_per_slot       int,                  -- Plaetze pro Zeitfenster
  max_party_size_agent      int not null default 8,  -- groessere Gruppen -> Rueckruf
  reservation_lead_minutes  int not null default 60,

  -- Datenschutz
  transcript_enabled        boolean not null default true,
  recording_enabled         boolean not null default false,
  retention_transcript_days int not null default 30 check (retention_transcript_days between 1 and 365),
  retention_recording_days  int not null default 7  check (retention_recording_days between 1 and 90),
  retention_contact_days    int not null default 180,

  -- Nachrichten an den Gast
  sms_reservation_enabled   boolean not null default true,
  sms_order_enabled         boolean not null default false,

  -- Benachrichtigungen an den Wirt
  notify_new_order          boolean not null default true,
  notify_new_reservation    boolean not null default true,
  notify_callback           boolean not null default true,

  closed_on_public_holidays boolean not null default false,
  updated_at                timestamptz not null default now()
);

-- Oeffnungszeiten: mehrere Bereiche pro Tag (Mittag + Abend)
create table public.opening_hours (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- 1 = Montag
  opens_at    time not null,
  closes_at   time not null,             -- darf < opens_at sein (ueber Mitternacht)
  applies_to  text not null default 'alles'
              check (applies_to in ('alles', 'bestellung', 'reservierung', 'lieferung')),
  last_order_minutes_before_close int not null default 0
);

-- Sonderschliessungen, Betriebsferien, abweichende Zeiten
create table public.closures (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  starts_on   date not null,
  ends_on     date not null check (ends_on >= starts_on),
  opens_at    time,                       -- NULL = ganz geschlossen
  closes_at   time,
  reason      text,
  created_at  timestamptz not null default now()
);

-- Gesetzliche Feiertage je Bundesland (jaehrlich per Skript gefuellt)
create table public.public_holidays (
  bundesland  text not null,
  day         date not null,
  name        text not null,
  primary key (bundesland, day)
);

-- Liefergebiete
create table public.delivery_zones (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants on delete cascade,
  name                  text not null,
  postal_codes          text[] not null default '{}',
  places                text[] not null default '{}',   -- Ortsteile, z. B. 'Norddeich'
  min_order_cents       int not null default 0 check (min_order_cents >= 0),
  delivery_fee_cents    int not null default 0 check (delivery_fee_cents >= 0),
  free_from_cents       int check (free_from_cents >= 0),
  extra_minutes         int not null default 0,
  active                boolean not null default true
);

-- Standardfragen: Parken, Zahlungsarten, Gutscheine, Catering ...
-- Was hier nicht steht, beantwortet der Agent NICHT -- dann Rueckruf.
create table public.faq_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  topic       text not null,             -- 'parken', 'zahlung', 'gutschein', 'catering', 'halal', ...
  question    text not null,
  answer      text not null,
  sort_order  int not null default 0,
  active      boolean not null default true
);


-- ------------------------------------------------------------
-- 3. SPEISEKARTE
--
-- Lehre aus Kiek mol in (23-groessen-extras.sql): Groessen standen
-- dort als JSON im Gericht, Extras getrennt -- ohne Verbindung. Hier
-- sind Groessen eigene Zeilen, und eine Extra-Gruppe kann an eine
-- Groesse gebunden werden.
-- ------------------------------------------------------------

create table public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants on delete cascade,
  name          text not null,
  description   text,
  sort_order    int not null default 0,
  active        boolean not null default true,
  available_from time,                   -- z. B. Mittagstisch
  available_to   time
);

create table public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants on delete cascade,
  category_id    uuid not null references public.menu_categories on delete restrict,
  number         text,                   -- Karten-Nr. ("Die 27 bitte")
  name           text not null,
  aliases        text[] not null default '{}',   -- "Margarita", "Magherita" fuer die Erkennung
  description    text,
  price_cents    int check (price_cents >= 0),   -- NULL = nur ueber Groessen
  allergens      text[] not null default '{}'    -- LMIV, 14 Pflichtallergene, als Wort
                 check (allergens <@ array['gluten','krebstiere','eier','fisch','erdnuss','soja',
                                           'milch','schalenfruechte','sellerie','senf','sesam',
                                           'sulfite','lupinen','weichtiere']),
                 -- Wie in Kiek mol in (LMIV_ALLERGENS): Woerter, keine Buchstaben.
                 -- Buchstaben (A, B, C ...) zaehlt jede gedruckte Karte anders --
                 -- sie sind Anzeige, kein Datenformat.
  additives      text[] not null default '{}',   -- Zusatzstoffe, Ziffern
  is_vegetarian  boolean not null default false,
  is_vegan       boolean not null default false,
  is_halal       boolean,                        -- NULL = unbekannt -> Agent sagt "weiss ich nicht"
  spicy_level    smallint check (spicy_level between 0 and 3),
  sold_out_on    date,                           -- "heute ausverkauft"
  active         boolean not null default true,
  sort_order     int not null default 0,
  external_ref   text,                           -- spaeter: Kiek-mol-in-ID
  updated_at     timestamptz not null default now()
);

-- Groessen: klein / gross / 32 cm ...
create table public.menu_item_variants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  item_id     uuid not null references public.menu_items on delete cascade,
  name        text not null,
  price_cents int not null check (price_cents >= 0),
  sort_order  int not null default 0,
  unique (item_id, name)
);

-- Extra-Gruppen: "Extra Zutaten", "Sosse", "Beilage"
create table public.modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  name        text not null,
  min_select  int not null default 0 check (min_select >= 0),
  max_select  int check (max_select is null or max_select >= min_select),
  sort_order  int not null default 0
);

create table public.modifiers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  group_id    uuid not null references public.modifier_groups on delete cascade,
  name        text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  allergens   text[] not null default '{}',   -- gleiche Woerter wie bei menu_items
  additives   text[] not null default '{}',
  active      boolean not null default true,
  sort_order  int not null default 0
);

-- Welche Gruppe gilt fuer welches Gericht -- und optional nur fuer eine Groesse
create table public.menu_item_modifier_groups (
  item_id     uuid not null references public.menu_items on delete cascade,
  group_id    uuid not null references public.modifier_groups on delete cascade,
  variant_id  uuid references public.menu_item_variants on delete cascade,  -- NULL = alle Groessen
  tenant_id   uuid not null references public.tenants on delete cascade,
  unique nulls not distinct (item_id, group_id, variant_id)
);


-- ------------------------------------------------------------
-- 4. GESPRAECHE (Anrufe heute, WhatsApp ab Phase 4)
-- ------------------------------------------------------------

create table public.conversations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants on delete cascade,
  channel           text not null check (channel in ('telefon', 'whatsapp', 'test')),
  provider_ref      text,                 -- Call-SID / Chat-ID
  caller            text,                 -- E.164; NULL bei unterdrueckter Nummer
  called_number     text,
  status            text not null default 'laeuft'
                    check (status in ('laeuft', 'beendet', 'abgebrochen', 'fehler')),
  outcome           text check (outcome in ('bestellung', 'reservierung', 'aenderung', 'storno',
                                            'frage', 'weitergeleitet', 'rueckruf', 'aufgelegt',
                                            'missbrauch', 'ausserhalb_zeiten')),
  language          text,                 -- erkannte Sprache, z. B. 'de', 'tr'
  summary           text,                 -- KI-Zusammenfassung fuer das Protokoll
  live_snapshot     jsonb,                -- Warenkorb waehrend des Gespraechs (Dashboard + Live Activity)
  ai_notice_played  boolean not null default false,   -- Beleg fuer Art. 50 AI Act
  recording_consent boolean,
  recording_path    text,                 -- Storage-Pfad, nur wenn Aufnahme an
  transfer_target   text,
  transfer_ok       boolean,
  was_transferred_in boolean not null default false,  -- Schleifenschutz
  abuse_score       smallint check (abuse_score between 0 and 100),
  started_at        timestamptz not null default now(),
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  int generated always as
                    (case when ended_at is null then null
                          else greatest(0, extract(epoch from ended_at - started_at)::int) end) stored,
  latency_p50_ms    int,                  -- gemessene Antwortzeit (Gast still -> erster Ton)
  latency_p90_ms    int,
  cost_telephony_microusd bigint,         -- Kosten je Anruf, in Millionstel Dollar
  cost_ai_microusd        bigint,
  usage             jsonb                 -- Tokens, Zeichen, Minuten je Anbieter
);

-- Transkript, Zeile fuer Zeile
create table public.conversation_turns (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations on delete cascade,
  tenant_id        uuid not null references public.tenants on delete cascade,
  seq              int not null,
  speaker          text not null check (speaker in ('gast', 'agent', 'werkzeug', 'system')),
  text             text,
  tool_name        text,
  tool_payload     jsonb,
  at_ms            int,                  -- ms seit Gespraechsbeginn
  created_at       timestamptz not null default now(),
  unique (conversation_id, seq)
);


-- ------------------------------------------------------------
-- 5. BESTELLUNGEN
--
-- Preise werden beim Anlegen aus der Karte KOPIERT (name_snapshot,
-- unit_price_cents). Aendert der Wirt spaeter die Karte, bleibt die
-- Bestellung, wie sie bestaetigt wurde.
-- ------------------------------------------------------------

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants on delete cascade,
  conversation_id     uuid references public.conversations on delete set null,
  order_number        int not null,       -- pro Betrieb und Tag fortlaufend
  business_day        date not null,
  channel             text not null check (channel in ('telefon', 'whatsapp', 'manuell', 'test')),
  fulfillment         text not null check (fulfillment in ('abholung', 'lieferung')),
  status              text not null default 'neu'
                      check (status in ('neu', 'angenommen', 'in_zubereitung', 'fertig',
                                        'abgeholt', 'geliefert', 'abgelehnt', 'storniert')),
  customer_name       text not null,
  customer_phone      text,
  street              text,
  house_number        text,
  postal_code         text,
  city                text,
  address_note        text,               -- "3. Stock, Klingel Meyer"
  delivery_zone_id    uuid references public.delivery_zones on delete set null,
  requested_for       timestamptz,        -- NULL = so schnell wie moeglich
  promised_at         timestamptz,        -- dem Gast genannte Zeit
  subtotal_cents      int not null check (subtotal_cents >= 0),
  delivery_fee_cents  int not null default 0 check (delivery_fee_cents >= 0),
  total_cents         int not null check (total_cents = subtotal_cents + delivery_fee_cents),
  note                text,
  confirmed_by_caller boolean not null default false,  -- "Stimmt das so?" -> "Ja"
  reject_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, business_day, order_number),
  check (fulfillment = 'abholung' or (street is not null and postal_code is not null))
);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders on delete cascade,
  tenant_id         uuid not null references public.tenants on delete cascade,
  menu_item_id      uuid references public.menu_items on delete set null,
  variant_id        uuid references public.menu_item_variants on delete set null,
  name_snapshot     text not null,
  variant_snapshot  text,
  quantity          int not null check (quantity between 1 and 99),
  unit_price_cents  int not null check (unit_price_cents >= 0),   -- inkl. Extras
  line_total_cents  int not null check (line_total_cents = unit_price_cents * quantity),
  note              text,                 -- "ohne Zwiebeln"
  sort_order        int not null default 0
);

create table public.order_item_modifiers (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items on delete cascade,
  tenant_id      uuid not null references public.tenants on delete cascade,
  modifier_id    uuid references public.modifiers on delete set null,
  name_snapshot  text not null,
  price_cents    int not null check (price_cents >= 0)
);

-- Wer hat wann den Status geaendert
create table public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders on delete cascade,
  tenant_id    uuid not null references public.tenants on delete cascade,
  from_status  text,
  to_status    text not null,
  actor_user   uuid references auth.users on delete set null,   -- NULL = Agent/System
  note         text,
  created_at   timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 6. RESERVIERUNGEN
-- ------------------------------------------------------------

create table public.dining_tables (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  name        text not null,              -- "Tisch 4"
  seats       int not null check (seats between 1 and 40),
  area        text not null default 'innen',   -- innen / terrasse / saal
  combinable  boolean not null default true,
  active      boolean not null default true
);

create table public.reservations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants on delete cascade,
  conversation_id  uuid references public.conversations on delete set null,
  channel          text not null check (channel in ('telefon', 'whatsapp', 'manuell', 'test')),
  status           text not null default 'bestaetigt'
                   check (status in ('angefragt', 'bestaetigt', 'storniert', 'erschienen', 'nicht_erschienen')),
  starts_at        timestamptz not null,
  duration_minutes int not null default 120,
  party_size       int not null check (party_size between 1 and 200),
  guest_name       text not null,
  guest_phone      text,
  high_chairs      smallint not null default 0,
  area_wish        text,                  -- "draussen"
  occasion         text,                  -- "Geburtstag"
  note             text,
  table_id         uuid references public.dining_tables on delete set null,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 7. RUECKRUFE, SPERRLISTE, NACHRICHTEN, GERAETE, PROTOKOLLE
-- ------------------------------------------------------------

create table public.callbacks (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants on delete cascade,
  conversation_id  uuid references public.conversations on delete set null,
  name             text,
  phone            text not null,
  reason           text not null,         -- "Beschwerde", "Gruppe 14 Personen", "nicht verstanden"
  status           text not null default 'offen' check (status in ('offen', 'erledigt')),
  done_by          uuid references auth.users on delete set null,
  created_at       timestamptz not null default now(),
  done_at          timestamptz
);

create table public.blocked_numbers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants on delete cascade,   -- NULL = fuer alle Betriebe (nur Admin)
  phone       text not null,
  reason      text,
  until       timestamptz,                -- NULL = dauerhaft
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

-- SMS heute, WhatsApp spaeter
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants on delete cascade,
  channel          text not null check (channel in ('sms', 'whatsapp')),
  to_phone         text not null,
  body             text not null,
  order_id         uuid references public.orders on delete set null,
  reservation_id   uuid references public.reservations on delete set null,
  provider_ref     text,
  status           text not null default 'wartet'
                   check (status in ('wartet', 'gesendet', 'zugestellt', 'fehler')),
  error            text,
  cost_microusd    bigint,
  created_at       timestamptz not null default now()
);

-- iPhones/iPads fuer Push und Live Activities
create table public.devices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  tenant_id      uuid not null references public.tenants on delete cascade,
  apns_token     text not null,
  token_kind     text not null check (token_kind in ('alert', 'liveactivity_start')),
  environment    text not null check (environment in ('sandbox', 'production')),
  last_seen_at   timestamptz not null default now(),
  unique (apns_token, token_kind)
);

-- Keine stillen Abstuerze: jeder Fehler mit Gespraechs-ID
create table public.error_log (
  id               bigint generated always as identity primary key,
  tenant_id        uuid references public.tenants on delete cascade,
  conversation_id  uuid references public.conversations on delete set null,
  source           text not null,         -- 'agent', 'edge', 'app', 'wache'
  code             text not null,
  message          text not null,
  context          jsonb,
  created_at       timestamptz not null default now()
);

-- Wer hat welche Einstellung geaendert
create table public.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.tenants on delete cascade,
  actor_user  uuid references auth.users on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 8. INDIZES (die Abfragen, die die App wirklich stellt)
-- ------------------------------------------------------------

create index on public.tenant_members (user_id) where active;
create index on public.orders (tenant_id, business_day desc, status);
create index on public.reservations (tenant_id, starts_at) where status in ('angefragt', 'bestaetigt');
create index on public.reservations (tenant_id, guest_phone);
create index on public.conversations (tenant_id, started_at desc);
create index on public.conversations (tenant_id) where status = 'laeuft';
create index on public.conversation_turns (conversation_id, seq);
create index on public.callbacks (tenant_id) where status = 'offen';
create index on public.menu_items (tenant_id, category_id, sort_order);
create index on public.blocked_numbers (phone);


-- ------------------------------------------------------------
-- 9. ZUGRIFF (Row Level Security)
--
-- Lehre aus Kiek mol in: RLS ohne Leserecht liefert [] statt eines
-- Fehlers -- das sieht aus wie "keine Bestellungen". Darum wird in
-- Phase 1 JEDE Regel mit echten Rollen getestet (supabase/tests/):
-- Inhaber A liest bei B nichts, Mitarbeiter aendert keine
-- Einstellungen, anonym liest gar nichts.
-- ------------------------------------------------------------

create or replace function app.my_tenants()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select tenant_id from public.tenant_members
  where user_id = (select auth.uid()) and active
$$;

create or replace function app.is_owner(t uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.tenant_members
                 where tenant_id = t and user_id = (select auth.uid())
                   and role = 'inhaber' and active)
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

-- Alle Betriebstabellen: RLS an, Lesen fuer Mitglieder + Admin
do $$
declare t text;
begin
  foreach t in array array[
    'tenant_settings', 'phone_numbers', 'opening_hours', 'closures', 'delivery_zones',
    'faq_entries', 'menu_categories', 'menu_items', 'menu_item_variants', 'modifier_groups',
    'modifiers', 'menu_item_modifier_groups', 'conversations', 'conversation_turns',
    'orders', 'order_items', 'order_item_modifiers', 'order_events', 'dining_tables',
    'reservations', 'callbacks', 'messages', 'devices', 'error_log', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "lesen: eigene Betriebe" on public.%I
                      for select to authenticated
                      using (tenant_id in (select app.my_tenants()) or (select app.is_platform_admin()))$p$, t);
  end loop;
end $$;

alter table public.tenants          enable row level security;
alter table public.tenant_members   enable row level security;
alter table public.platform_admins  enable row level security;
alter table public.public_holidays  enable row level security;
alter table public.blocked_numbers  enable row level security;

create policy "lesen: eigene Betriebe" on public.tenants for select to authenticated
  using (id in (select app.my_tenants()) or (select app.is_platform_admin()));
create policy "lesen: eigene Mitgliedschaft" on public.tenant_members for select to authenticated
  using (user_id = (select auth.uid()) or app.is_owner(tenant_id) or (select app.is_platform_admin()));
create policy "lesen: nur Admin" on public.platform_admins for select to authenticated
  using ((select app.is_platform_admin()));
create policy "lesen: alle Angemeldeten" on public.public_holidays for select to authenticated
  using (true);
create policy "lesen: eigene + globale Sperren" on public.blocked_numbers for select to authenticated
  using (tenant_id in (select app.my_tenants()) or (tenant_id is null and (select app.is_platform_admin())));

-- Schreiben: Inhaber pflegt Karte, Zeiten, Einstellungen
do $$
declare t text;
begin
  foreach t in array array[
    'tenant_settings', 'opening_hours', 'closures', 'delivery_zones', 'faq_entries',
    'menu_categories', 'menu_items', 'menu_item_variants', 'modifier_groups', 'modifiers',
    'menu_item_modifier_groups', 'dining_tables'
  ] loop
    execute format($p$create policy "aendern: Inhaber" on public.%I
                      for all to authenticated
                      using (app.is_owner(tenant_id) or (select app.is_platform_admin()))
                      with check (app.is_owner(tenant_id) or (select app.is_platform_admin()))$p$, t);
  end loop;
end $$;

-- Mitarbeiter: Status von Bestellungen/Reservierungen, Rueckrufe erledigen,
-- Reservierungen von Hand eintragen. Die genauen erlaubten Spalten kommen in
-- Phase 1 als Funktionen (set_order_status ...), nicht als offenes UPDATE.
create policy "eintragen: Mitglieder" on public.reservations for insert to authenticated
  with check (tenant_id in (select app.my_tenants()) and channel = 'manuell');
create policy "sperren: Mitglieder" on public.blocked_numbers for insert to authenticated
  with check (tenant_id in (select app.my_tenants()));
create policy "geraet: eigenes" on public.devices for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and tenant_id in (select app.my_tenants()));

-- Der Agent-Server (geheimer Schluessel) umgeht RLS. Er darf trotzdem
-- nur die agent_*-Funktionen aufrufen -- das pruefen Tests und Review.


-- ------------------------------------------------------------
-- 10. FUNKTIONEN -- in Phase 1/2 ausgeschrieben, hier nur die Liste
--
-- Fuer den Agenten (security definer, nur service_role darf aufrufen):
--   agent_betrieb_fuer_nummer(angerufen)        -> Betrieb + Einstellungen
--   agent_karte(tenant)                          -> Karte als JSON, IMMER gleich sortiert
--                                                   (sonst greift der Prompt-Cache nicht)
--   agent_ist_geoeffnet(tenant, zeitpunkt, art)  -> ja/nein + naechste Oeffnung
--   agent_liefergebiet(tenant, plz, ort)         -> Gebiet, Mindestwert, Gebuehr
--   agent_warenkorb_pruefen(tenant, positionen)  -> Zeilen mit Preisen aus der Karte,
--                                                   fehlende Pflicht-Extras, ausverkauft
--   agent_bestellung_zusammenfassen(...)         -> der feste Vorlesetext mit Summe
--   agent_bestellung_anlegen(gespraech, ...)     -> rechnet SELBST nach, vergibt Nummer
--   agent_verfuegbarkeit(tenant, beginn, personen) -> ja/nein + Alternativen
--   agent_reservierung_anlegen / _finden / _aendern / _stornieren
--   agent_rueckruf_anlegen(...)
--   agent_gespraech_start / _aktualisieren / _ende
--   agent_nummer_gesperrt(tenant, nummer)
--
-- Fuer die App:
--   set_order_status(order, status, minuten)     -> mit order_events-Eintrag
--   pause_orders(tenant, bis, grund)
--   onboarding_betrieb_anlegen(...)              -> nur Admin; legt Betrieb,
--                                                   Einstellungen, Inhaber an
--
-- Aufraeumen (pg_cron, taeglich nachts):
--   app.aufraeumen() -> loescht Transkripte/Aufnahmen nach den Fristen
--                       des Betriebs, entfernt Telefonnummern aus alten
--                       Gespraechen, Bestellungen und Reservierungen
-- ------------------------------------------------------------
