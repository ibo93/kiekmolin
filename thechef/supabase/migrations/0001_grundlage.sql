-- The Chef – Grundlage: Tabellen, Rechte (RLS), Funktionen.
--
-- Ein Betrieb = ein Mandant. JEDE Tabelle trägt betrieb_id, damit jede
-- Regel dieselbe einfache Form hat:  betrieb_id = meine_betrieb_id().
-- Eine Regel, die über drei Joins geht, ist eine Regel, die man falsch
-- liest.
--
-- Namen (Bereiche, Positionen, Produkte) liegen als jsonb je Sprache:
--   {"de": "Hähnchenbrust", "tr": "Tavuk göğsü", "ku": "Singê mirîşkê", ...}
-- Chef und Mitarbeiter sehen dieselben Daten in ihrer eigenen Sprache.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────── Betrieb & Nutzer

create table betriebe (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  zeitzone text not null default 'Europe/Berlin',
  scan_erinnerung_uhrzeit time not null default '22:00',
  -- Spätester Zeitpunkt für das Abend-Briefing. Früher, sobald alle
  -- Bereiche des Tages gescannt sind.
  briefing_spaetestens time not null default '23:30',
  foto_loeschfrist_tage int not null default 30 check (foto_loeschfrist_tage between 1 and 365),
  -- Genauigkeits-Test: Mitarbeiter zählt selbst, ohne die KI-Zahl zu sehen.
  genauigkeitstest boolean not null default false,
  erstellt_am timestamptz not null default now()
);

create table nutzer (
  id uuid primary key references auth.users(id) on delete cascade,
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  name text not null default '',
  rolle text not null check (rolle in ('chef', 'mitarbeiter')),
  sprache text not null default 'de' check (sprache in ('de', 'tr', 'ku', 'ar', 'en', 'ckb')),
  darstellung jsonb not null default '{}'::jsonb,
  push_an boolean not null default true,
  plattform_admin boolean not null default false,
  erstellt_am timestamptz not null default now()
);
create index on nutzer (betrieb_id);

create table einladungen (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  code text not null unique,
  rolle text not null default 'mitarbeiter' check (rolle in ('chef', 'mitarbeiter')),
  erstellt_von uuid references nutzer(id) on delete set null,
  gueltig_bis timestamptz not null default now() + interval '14 days',
  benutzt_von uuid references nutzer(id) on delete set null,
  benutzt_am timestamptz,
  erstellt_am timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────── Einrichtung

create table bereiche (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  namen jsonb not null,
  art text not null default 'sonstig' check (art in ('kuehlhaus', 'tiefkuehler', 'trocken', 'sonstig')),
  reihenfolge int not null default 0,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);
create index on bereiche (betrieb_id);

create table scan_positionen (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  namen jsonb not null,
  referenzfoto_pfad text,
  reihenfolge int not null default 0,
  aktiv boolean not null default true
);
create index on scan_positionen (bereich_id);

create table produkte (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  namen jsonb not null,
  -- Welche Namen hat der Chef bestätigt? KI-Vorschläge stehen hier nicht drin.
  namen_bestaetigt text[] not null default '{}',
  kategorie text not null default 'sonstiges' check (kategorie in
    ('fleisch', 'fisch', 'gemuese', 'obst', 'milch', 'brot', 'tiefkuehl', 'trocken', 'getraenke', 'sonstiges')),
  -- WIE gezählt wird: die KI zählt Einheiten, nie Gewicht.
  zaehleinheit text not null default 'stueck' check (zaehleinheit in
    ('kiste', 'packung', 'stueck', 'becher', 'beutel', 'flasche', 'dose', 'eimer', 'sack', 'karton', 'glas', 'netz', 'spiess')),
  menge_pro_einheit numeric check (menge_pro_einheit is null or menge_pro_einheit > 0),
  basiseinheit text not null default 'stueck' check (basiseinheit in ('kg', 'l', 'stueck')),
  referenzfoto_pfad text,
  -- in Zähleinheiten
  mindestbestand numeric not null default 0 check (mindestbestand >= 0),
  standard_haltbarkeit_tage int check (standard_haltbarkeit_tage is null or standard_haltbarkeit_tage > 0),
  -- € je Zähleinheit (optional, für Warenwert)
  preis_pro_einheit numeric check (preis_pro_einheit is null or preis_pro_einheit >= 0),
  -- Wo liegt es normalerweise? Hilft der Erkennung, den Katalog klein zu halten.
  bereich_ids uuid[] not null default '{}',
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);
create index on produkte (betrieb_id);

-- ─────────────────────────────────────────────────────────── Scan

create table scans (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  nutzer_id uuid references nutzer(id) on delete set null,
  -- Vom Gerät vergeben. Ein offline gemachter Scan wird beim zweiten
  -- Hochladeversuch nicht doppelt angelegt.
  lokal_id text not null,
  aufgenommen_am timestamptz not null default now(),
  zeitpunkt timestamptz not null default now(),
  status text not null default 'hochgeladen' check (status in ('offline', 'hochgeladen', 'erkannt', 'bestaetigt', 'fehler')),
  fehler text,
  bestaetigt_am timestamptz,
  unique (betrieb_id, lokal_id)
);
create index on scans (betrieb_id, bereich_id, zeitpunkt desc);

create table scan_fotos (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  scan_id uuid not null references scans(id) on delete cascade,
  position_id uuid references scan_positionen(id) on delete set null,
  foto_pfad text,
  breite int,
  hoehe int,
  aufgenommen_am timestamptz not null default now(),
  loeschen_am timestamptz not null,
  geloescht boolean not null default false
);
create index on scan_fotos (scan_id);
create index on scan_fotos (position_id, aufgenommen_am desc);

create table scan_erkennungen (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  scan_id uuid not null references scans(id) on delete cascade,
  scan_foto_id uuid references scan_fotos(id) on delete set null,
  produkt_id uuid references produkte(id) on delete cascade,
  anzahl_erkannt numeric not null check (anzahl_erkannt >= 0),
  sicherheit numeric not null check (sicherheit between 0 and 1),
  mhd date,
  -- Ausschnitt im Foto, Werte 0..1: {"x":..,"y":..,"b":..,"h":..}
  box jsonb,
  anzahl_bestaetigt numeric check (anzahl_bestaetigt is null or anzahl_bestaetigt >= 0),
  bestaetigt boolean not null default false,
  -- Vom Mitarbeiter hinzugefügt (KI hat es nicht gesehen)
  von_hand boolean not null default false
);
create index on scan_erkennungen (scan_id);

-- ─────────────────────────────────────────────────────────── Bestand

-- Jede Zeile ist ein Stand zu einem Zeitpunkt. Der aktuelle Bestand ist
-- die jüngste Zeile je (Produkt, Bereich). Nichts wird überschrieben –
-- daraus lernt der Assistent den Verbrauch.
create table bestand (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  produkt_id uuid not null references produkte(id) on delete cascade,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  menge_einheiten numeric not null check (menge_einheiten >= 0),
  -- Chargen nach FIFO: [{"menge":4,"eingang":"2026-09-25","mhd":"2026-09-28","quelle":"etikett"}]
  chargen jsonb not null default '[]'::jsonb,
  mhd date,
  mhd_quelle text check (mhd_quelle in ('etikett', 'berechnet')),
  quelle text not null default 'scan' check (quelle in ('scan', 'lieferschein', 'kasse', 'korrektur')),
  scan_id uuid references scans(id) on delete set null,
  zeitpunkt timestamptz not null default now()
);
create index on bestand (betrieb_id, produkt_id, bereich_id, zeitpunkt desc);

create table weggeworfen (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  produkt_id uuid not null references produkte(id) on delete cascade,
  menge_einheiten numeric not null check (menge_einheiten > 0),
  -- Zum Zeitpunkt des Wegwerfens festgehalten; spätere Preisänderung ändert die Vergangenheit nicht.
  wert_eur numeric,
  nutzer_id uuid references nutzer(id) on delete set null,
  zeitpunkt timestamptz not null default now()
);
create index on weggeworfen (betrieb_id, zeitpunkt desc);

-- Was über die automatische Liste (Bestand < Mindestbestand) hinaus drauf
-- soll, und was abgehakt ist.
create table einkauf_eintraege (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  datum date not null,
  produkt_id uuid not null references produkte(id) on delete cascade,
  menge_extra numeric not null default 0 check (menge_extra >= 0),
  abgehakt boolean not null default false,
  quelle text not null default 'hand' check (quelle in ('hand', 'assistent', 'auto')),
  erstellt_am timestamptz not null default now(),
  unique (betrieb_id, datum, produkt_id)
);

-- ─────────────────────────────────────────────────────────── Assistent

create table hinweise (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  art text not null check (art in ('laeuft_ab', 'abgelaufen', 'knapp', 'leer', 'nicht_gescannt')),
  prioritaet int not null,
  -- Strukturiert, NICHT fertiger Text: jeder Nutzer liest ihn in seiner Sprache.
  daten jsonb not null,
  aktion text check (aktion in ('einkaufsliste', 'erledigt', 'scannen')),
  erledigt boolean not null default false,
  scan_id uuid references scans(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
create index on hinweise (betrieb_id, erledigt, erstellt_am desc);

create table assistent_verlauf (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  nutzer_id uuid references nutzer(id) on delete set null,
  frage text not null,
  antwort jsonb not null,
  genutzte_daten jsonb not null default '[]'::jsonb,
  -- true, wenn die Prüfung eine Zahl ohne Beleg gefunden und die Antwort verworfen hat
  verworfen boolean not null default false,
  zeitpunkt timestamptz not null default now()
);
create index on assistent_verlauf (nutzer_id, zeitpunkt desc);

create table briefings (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  datum date not null,
  gescannt boolean not null,
  fehlende_bereiche uuid[] not null default '{}',
  punkte jsonb not null default '[]'::jsonb,
  -- Tagesgericht je Sprache, einmal erzeugt: {"de": {...}, "tr": {...}}
  tagesgericht jsonb not null default '{}'::jsonb,
  gesendet_am timestamptz,
  erstellt_am timestamptz not null default now(),
  unique (betrieb_id, datum)
);

create table ki_kosten (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid references betriebe(id) on delete cascade,
  art text not null check (art in ('scan', 'assistent', 'briefing', 'sprache', 'uebersetzung', 'tagesgericht')),
  modell text not null,
  tokens_ein int not null default 0,
  tokens_aus int not null default 0,
  kosten_usd numeric not null default 0,
  kosten_eur numeric not null default 0,
  bezug uuid,
  zeitpunkt timestamptz not null default now()
);
create index on ki_kosten (betrieb_id, zeitpunkt desc);

create table push_abos (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  nutzer_id uuid not null references nutzer(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  erstellt_am timestamptz not null default now()
);

-- Welche Benachrichtigung ging wann raus – damit nichts doppelt klingelt,
-- auch wenn der Zeitplan alle 15 Minuten läuft.
create table benachrichtigungen (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  art text not null,
  datum date not null,
  schluessel text not null default '',
  gesendet_am timestamptz not null default now(),
  unique (betrieb_id, art, datum, schluessel)
);

-- ─────────────────────────────────────────────────────────── Später (vorbereitet, noch ohne Oberfläche)

create table lieferanten (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  name text not null,
  telefon text,
  email text,
  whatsapp text
);
create table lieferscheine (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  lieferant_id uuid references lieferanten(id) on delete set null,
  foto_pfad text,
  datum date not null default current_date,
  status text not null default 'neu'
);
create table lieferschein_positionen (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  lieferschein_id uuid not null references lieferscheine(id) on delete cascade,
  produkt_id uuid references produkte(id) on delete set null,
  menge_einheiten numeric,
  preis_pro_einheit numeric,
  mhd date
);
create table rezepte (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  namen jsonb not null
);
create table rezept_zutaten (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  rezept_id uuid not null references rezepte(id) on delete cascade,
  produkt_id uuid not null references produkte(id) on delete cascade,
  menge_basis numeric not null
);
create table verkaeufe (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  rezept_id uuid references rezepte(id) on delete set null,
  anzahl int not null,
  zeitpunkt timestamptz not null default now()
);
create table temperatur_protokoll (
  id uuid primary key default gen_random_uuid(),
  betrieb_id uuid not null references betriebe(id) on delete cascade,
  bereich_id uuid references bereiche(id) on delete set null,
  grad numeric not null,
  foto_pfad text,
  scan_id uuid references scans(id) on delete set null,
  zeitpunkt timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────── Hilfsfunktionen für RLS

create function meine_betrieb_id() returns uuid
language sql stable security definer set search_path = public as $$
  select betrieb_id from nutzer where id = auth.uid()
$$;

create function bin_chef() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rolle = 'chef' from nutzer where id = auth.uid()), false)
$$;

-- ─────────────────────────────────────────────────────────── RLS

alter table betriebe enable row level security;
alter table nutzer enable row level security;
alter table einladungen enable row level security;
alter table bereiche enable row level security;
alter table scan_positionen enable row level security;
alter table produkte enable row level security;
alter table scans enable row level security;
alter table scan_fotos enable row level security;
alter table scan_erkennungen enable row level security;
alter table bestand enable row level security;
alter table weggeworfen enable row level security;
alter table einkauf_eintraege enable row level security;
alter table hinweise enable row level security;
alter table assistent_verlauf enable row level security;
alter table briefings enable row level security;
alter table ki_kosten enable row level security;
alter table push_abos enable row level security;
alter table benachrichtigungen enable row level security;
alter table lieferanten enable row level security;
alter table lieferscheine enable row level security;
alter table lieferschein_positionen enable row level security;
alter table rezepte enable row level security;
alter table rezept_zutaten enable row level security;
alter table verkaeufe enable row level security;
alter table temperatur_protokoll enable row level security;

-- Betrieb: alle lesen, nur der Chef ändert. Angelegt wird nur über betrieb_anlegen().
create policy betrieb_lesen on betriebe for select using (id = meine_betrieb_id());
create policy betrieb_aendern on betriebe for update using (id = meine_betrieb_id() and bin_chef())
  with check (id = meine_betrieb_id());

-- Nutzer: das Team sehen; ändern nur die eigene Zeile (und nur erlaubte Spalten, siehe grant unten).
create policy nutzer_lesen on nutzer for select using (betrieb_id = meine_betrieb_id());
create policy nutzer_selbst on nutzer for update using (id = auth.uid()) with check (id = auth.uid());
-- Chef darf Mitarbeiter entfernen, aber nicht sich selbst
create policy nutzer_entfernen on nutzer for delete using (betrieb_id = meine_betrieb_id() and bin_chef() and id <> auth.uid());

create policy einladung_chef on einladungen for all
  using (betrieb_id = meine_betrieb_id() and bin_chef())
  with check (betrieb_id = meine_betrieb_id() and bin_chef());

-- Einrichtung: alle lesen, nur der Chef schreibt.
do $$
declare t text;
begin
  foreach t in array array['bereiche', 'scan_positionen', 'produkte', 'lieferanten', 'rezepte', 'rezept_zutaten'] loop
    execute format('create policy %1$s_lesen on %1$I for select using (betrieb_id = meine_betrieb_id())', t);
    execute format('create policy %1$s_chef_neu on %1$I for insert with check (betrieb_id = meine_betrieb_id() and bin_chef())', t);
    execute format('create policy %1$s_chef_aendern on %1$I for update using (betrieb_id = meine_betrieb_id() and bin_chef()) with check (betrieb_id = meine_betrieb_id())', t);
    execute format('create policy %1$s_chef_loeschen on %1$I for delete using (betrieb_id = meine_betrieb_id() and bin_chef())', t);
  end loop;
end $$;

-- Tagesarbeit: das ganze Team liest und schreibt.
do $$
declare t text;
begin
  foreach t in array array['scans', 'scan_fotos', 'scan_erkennungen', 'bestand', 'weggeworfen',
                           'einkauf_eintraege', 'lieferscheine', 'lieferschein_positionen', 'verkaeufe', 'temperatur_protokoll'] loop
    execute format('create policy %1$s_lesen on %1$I for select using (betrieb_id = meine_betrieb_id())', t);
    execute format('create policy %1$s_neu on %1$I for insert with check (betrieb_id = meine_betrieb_id())', t);
    execute format('create policy %1$s_aendern on %1$I for update using (betrieb_id = meine_betrieb_id()) with check (betrieb_id = meine_betrieb_id())', t);
  end loop;
end $$;
-- Löschen in der Tagesarbeit nur durch den Chef
create policy weggeworfen_chef_loeschen on weggeworfen for delete using (betrieb_id = meine_betrieb_id() and bin_chef());
create policy einkauf_loeschen on einkauf_eintraege for delete using (betrieb_id = meine_betrieb_id());

-- Hinweise & Briefings: Team liest, Hinweise abhaken darf jeder. Geschrieben wird vom Server.
create policy hinweise_lesen on hinweise for select using (betrieb_id = meine_betrieb_id());
create policy hinweise_erledigen on hinweise for update using (betrieb_id = meine_betrieb_id()) with check (betrieb_id = meine_betrieb_id());
create policy briefings_lesen on briefings for select using (betrieb_id = meine_betrieb_id());

-- Assistent-Verlauf: jeder sieht nur seine eigenen Fragen.
create policy verlauf_eigen on assistent_verlauf for select using (nutzer_id = auth.uid());

-- KI-Kosten: nur der Chef des Betriebs – und der Plattform-Admin alles.
create policy kosten_chef on ki_kosten for select using (
  (betrieb_id = meine_betrieb_id() and bin_chef())
  or exists (select 1 from nutzer where id = auth.uid() and plattform_admin)
);

-- Push-Abos: nur die eigenen.
create policy push_eigen on push_abos for all
  using (nutzer_id = auth.uid())
  with check (nutzer_id = auth.uid() and betrieb_id = meine_betrieb_id());

-- benachrichtigungen: keine Policy = nur der Server (service_role) kommt ran.

-- Spaltenrechte: Ein Mitarbeiter darf seine Sprache ändern, aber nicht sich zum Chef machen.
revoke update on nutzer from authenticated;
grant update (name, sprache, darstellung, push_an) on nutzer to authenticated;
revoke update on betriebe from authenticated;
grant update (name, zeitzone, scan_erinnerung_uhrzeit, briefing_spaetestens, foto_loeschfrist_tage, genauigkeitstest)
  on betriebe to authenticated;

-- ─────────────────────────────────────────────────────────── Ansichten

create view aktueller_bestand with (security_invoker = true) as
  select distinct on (b.produkt_id, b.bereich_id)
    b.id, b.betrieb_id, b.produkt_id, b.bereich_id, b.menge_einheiten, b.chargen,
    b.mhd, b.mhd_quelle, b.quelle, b.scan_id, b.zeitpunkt
  from bestand b
  order by b.produkt_id, b.bereich_id, b.zeitpunkt desc, b.id;

-- ─────────────────────────────────────────────────────────── Funktionen

-- Lesbarer Code ohne 0/O und 1/I – wird am Telefon vorgelesen.
create function einladungscode() returns text language plpgsql as $$
declare
  zeichen text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text := '';
begin
  for i in 1..6 loop
    c := c || substr(zeichen, 1 + floor(random() * length(zeichen))::int, 1);
  end loop;
  return c;
end $$;

create function betrieb_anlegen(p_name text, p_nutzername text, p_sprache text default 'de')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  neu uuid;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if exists (select 1 from nutzer where id = auth.uid()) then
    raise exception 'du gehörst schon zu einem Betrieb';
  end if;
  insert into betriebe (name) values (p_name) returning id into neu;
  insert into nutzer (id, betrieb_id, name, rolle, sprache)
    values (auth.uid(), neu, coalesce(p_nutzername, ''), 'chef', coalesce(p_sprache, 'de'));
  return neu;
end $$;

create function einladung_erstellen(p_rolle text default 'mitarbeiter')
returns text language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  if not bin_chef() then raise exception 'nur der Chef lädt ein'; end if;
  loop
    c := einladungscode();
    exit when not exists (select 1 from einladungen where code = c);
  end loop;
  insert into einladungen (betrieb_id, code, rolle, erstellt_von)
    values (meine_betrieb_id(), c, p_rolle, auth.uid());
  return c;
end $$;

create function einladung_annehmen(p_code text, p_name text, p_sprache text default 'de')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e einladungen;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if exists (select 1 from nutzer where id = auth.uid()) then
    raise exception 'du gehörst schon zu einem Betrieb';
  end if;
  select * into e from einladungen
    where code = upper(trim(p_code)) and benutzt_von is null and gueltig_bis > now()
    for update;
  if not found then raise exception 'Code ungültig oder schon benutzt'; end if;
  insert into nutzer (id, betrieb_id, name, rolle, sprache)
    values (auth.uid(), e.betrieb_id, coalesce(p_name, ''), e.rolle, coalesce(p_sprache, 'de'));
  update einladungen set benutzt_von = auth.uid(), benutzt_am = now() where id = e.id;
  return e.betrieb_id;
end $$;

-- FIFO-Chargen fortschreiben. Gleiche Regeln wie chargen.ts (App & Demo);
-- tests/datenbank-test.ts prüft beide mit denselben Fällen.
--
--   mehr als vorher  → Differenz ist eine neue Charge (Eingang = jetzt)
--   weniger          → von der ältesten Charge wird zuerst verbraucht
--   Etikett gelesen  → bei neuer Charge deren MHD; sonst ersetzt es ein
--                      nur berechnetes MHD der ältesten Charge
create function chargen_fortschreiben(
  p_alt jsonb, p_menge numeric, p_jetzt timestamptz, p_mhd_etikett date, p_haltbarkeit int
) returns jsonb language plpgsql immutable as $$
declare
  summe numeric := 0;
  rest numeric;
  c jsonb;
  neu jsonb := '[]'::jsonb;
  m numeric;
  berechnet date;
begin
  select coalesce(sum((x->>'menge')::numeric), 0) into summe from jsonb_array_elements(coalesce(p_alt, '[]'::jsonb)) x;

  if p_menge > summe then
    neu := coalesce(p_alt, '[]'::jsonb);
    berechnet := case when p_haltbarkeit is null then null else (p_jetzt::date + p_haltbarkeit) end;
    neu := neu || jsonb_build_array(jsonb_build_object(
      'menge', p_menge - summe,
      'eingang', p_jetzt::date,
      'mhd', coalesce(p_mhd_etikett, berechnet),
      'quelle', case when p_mhd_etikett is not null then 'etikett' when berechnet is not null then 'berechnet' else null end
    ));
    return neu;
  end if;

  -- verbrauchen: älteste zuerst (Reihenfolge im Array = Eingang)
  rest := summe - p_menge;
  for c in select * from jsonb_array_elements(coalesce(p_alt, '[]'::jsonb)) loop
    m := (c->>'menge')::numeric;
    if rest >= m then
      rest := rest - m;
    else
      neu := neu || jsonb_build_array(jsonb_set(c, '{menge}', to_jsonb(m - rest)));
      rest := 0;
    end if;
  end loop;

  if p_mhd_etikett is not null and jsonb_array_length(neu) > 0
     and coalesce(neu->0->>'quelle', '') <> 'etikett' then
    neu := jsonb_set(jsonb_set(neu, '{0,mhd}', to_jsonb(p_mhd_etikett)), '{0,quelle}', '"etikett"');
  end if;
  return neu;
end $$;

-- Scan bestätigen: die gezählten Mengen werden zum Bestand.
-- p_positionen: [{"produkt_id": "...", "anzahl": 4, "mhd": "2026-09-30" | null}]
-- Läuft mit den Rechten des Aufrufers (RLS gilt).
create function scan_bestaetigen(p_scan_id uuid, p_positionen jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  s scans;
  jetzt timestamptz := now();
  r record;
  alt aktueller_bestand;
  ch jsonb;
  anzahl_produkte int := 0;
begin
  select * into s from scans where id = p_scan_id for update;
  if not found then raise exception 'Scan nicht gefunden'; end if;
  if s.status = 'bestaetigt' then
    return jsonb_build_object('produkte', 0, 'schon_bestaetigt', true);
  end if;

  -- Summe je Produkt (mehrere Fotos/Positionen im selben Bereich)
  for r in
    with eingabe as (
      select (x->>'produkt_id')::uuid as produkt_id,
             coalesce((x->>'anzahl')::numeric, 0) as anzahl,
             nullif(x->>'mhd', '')::date as mhd
      from jsonb_array_elements(p_positionen) x
    ),
    gezaehlt as (
      select produkt_id, sum(anzahl) as anzahl, min(mhd) as mhd from eingabe group by produkt_id
    ),
    -- Was vorher in diesem Bereich lag und jetzt nicht mehr gesehen wurde, ist 0.
    vorher as (
      select produkt_id, 0::numeric as anzahl, null::date as mhd from aktueller_bestand
      where bereich_id = s.bereich_id and menge_einheiten > 0
        and produkt_id not in (select produkt_id from gezaehlt)
    )
    select g.*, p.standard_haltbarkeit_tage from (select * from gezaehlt union all select * from vorher) g
    join produkte p on p.id = g.produkt_id
  loop
    select * into alt from aktueller_bestand where produkt_id = r.produkt_id and bereich_id = s.bereich_id;
    ch := chargen_fortschreiben(case when alt.id is null then '[]'::jsonb else alt.chargen end,
                                r.anzahl, jetzt, r.mhd, r.standard_haltbarkeit_tage);
    insert into bestand (betrieb_id, produkt_id, bereich_id, menge_einheiten, chargen, mhd, mhd_quelle, quelle, scan_id, zeitpunkt)
    values (s.betrieb_id, r.produkt_id, s.bereich_id, r.anzahl, ch,
            (select min((x->>'mhd')::date) from jsonb_array_elements(ch) x),
            (select x->>'quelle' from jsonb_array_elements(ch) x where x->>'mhd' is not null
               order by (x->>'mhd')::date limit 1),
            'scan', s.id, jetzt);
    if r.anzahl > 0 then anzahl_produkte := anzahl_produkte + 1; end if;
  end loop;

  -- Erkennungen als bestätigt markieren (für die Genauigkeits-Messung)
  update scan_erkennungen e set
    anzahl_bestaetigt = coalesce((
      select sum(coalesce((x->>'anzahl')::numeric, 0)) from jsonb_array_elements(p_positionen) x
      where (x->>'produkt_id')::uuid = e.produkt_id), 0),
    bestaetigt = true
  where e.scan_id = s.id;

  update scans set status = 'bestaetigt', bestaetigt_am = jetzt where id = s.id;
  return jsonb_build_object('produkte', anzahl_produkte, 'zeitpunkt', jetzt);
end $$;

grant execute on function betrieb_anlegen(text, text, text) to authenticated;
grant execute on function einladung_erstellen(text) to authenticated;
grant execute on function einladung_annehmen(text, text, text) to authenticated;
grant execute on function scan_bestaetigen(uuid, jsonb) to authenticated;
revoke execute on function einladungscode() from public;
