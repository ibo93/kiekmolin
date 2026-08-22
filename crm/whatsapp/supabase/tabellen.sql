-- ==========================================================
--  Kurani CRM – WhatsApp-Anbindung
--  Supabase Dashboard -> SQL Editor -> alles einfuegen -> RUN
--  Laeuft auch mehrfach ohne Schaden.
-- ==========================================================

-- ----------------------------------------------------------
-- 1) Eingegangene und gesendete Nachrichten
-- ----------------------------------------------------------
create table if not exists public.wa_nachrichten (
  id            bigserial primary key,
  wa_id         text unique,              -- Meldungs-ID von Meta, verhindert Doppelte
  richtung      text not null check (richtung in ('rein','raus')),
  nummer        text not null,            -- Telefonnummer des Kunden
  name          text,                     -- Anzeigename aus dem WhatsApp-Profil
  text          text,
  art           text default 'text',      -- text | bild | audio | dokument | sonst
  medien_id     text,                     -- fuer Bilder/Sprachnachrichten
  empfangen_am  timestamptz not null default now(),

  -- Was die Automatik daraus gemacht hat
  bewertung     jsonb,                    -- {absicht, dringlichkeit, kunde_erkannt, ...}
  antwort_art   text,                     -- auto | entwurf | keine | gesperrt
  antwort_text  text,
  gesendet_am   timestamptz,
  gesehen       boolean not null default false,
  ins_crm       boolean not null default false
);

create index if not exists wa_nachrichten_nummer_idx on public.wa_nachrichten (nummer, empfangen_am desc);
create index if not exists wa_nachrichten_offen_idx  on public.wa_nachrichten (gesehen) where gesehen = false;

-- ----------------------------------------------------------
-- 2) Einstellungen der Automatik – eine einzige Zeile
-- ----------------------------------------------------------
create table if not exists public.wa_einstellungen (
  id             int primary key default 1 check (id = 1),
  stufe          int  not null default 1 check (stufe between 1 and 3),
  aktiv          boolean not null default false,
  ruhe_von       time default '20:00',    -- ausserhalb: nur melden, nicht beantworten
  ruhe_bis       time default '07:00',
  melde_text     text default 'Moin! Deine Nachricht ist angekommen. Ich schau gleich rein und melde mich.',
  signatur       text default '',
  gesperrte_woerter text[] default array['reklamation','anwalt','mahnung','kündigen','kuendigen','betrug','anzeige'],
  aktualisiert   timestamptz not null default now()
);

insert into public.wa_einstellungen (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------
-- 3) Zeilenschutz
--    Schreiben darf nur die Edge Function (service_role, umgeht RLS).
--    Lesen darf nur, wer angemeldet ist – also Ibos CRM.
-- ----------------------------------------------------------
alter table public.wa_nachrichten   enable row level security;
alter table public.wa_einstellungen enable row level security;

drop policy if exists "angemeldet liest nachrichten"   on public.wa_nachrichten;
drop policy if exists "angemeldet aendert nachrichten" on public.wa_nachrichten;
drop policy if exists "angemeldet liest einstellungen" on public.wa_einstellungen;
drop policy if exists "angemeldet aendert einstellungen" on public.wa_einstellungen;

create policy "angemeldet liest nachrichten" on public.wa_nachrichten
  for select using (auth.role() = 'authenticated');

create policy "angemeldet aendert nachrichten" on public.wa_nachrichten
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "angemeldet liest einstellungen" on public.wa_einstellungen
  for select using (auth.role() = 'authenticated');

create policy "angemeldet aendert einstellungen" on public.wa_einstellungen
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------
-- 4) Kontrolle
-- ----------------------------------------------------------
select relname as tabelle, relrowsecurity as zeilenschutz_aktiv
from pg_class
where relname in ('wa_nachrichten','wa_einstellungen');
