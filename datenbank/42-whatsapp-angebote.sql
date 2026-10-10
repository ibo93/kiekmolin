-- =====================================================================
-- SCHRITT 42: WHATSAPP-ANGEBOTE -- Einwilligung, Kampagnen, Einlösung.
--
-- Ibo, 09.10.2026: "wenn der Gastronom WhatsApp schickt an seine Kunden mit
-- Angebot-Code -- eine WhatsApp-Bestätigung, dass sie die Angebote erhalten
-- dürfen, und für Reservierungen auch; dass deren Name in der Kampagne
-- eingetragen wird, damit wir es trennen bei Liste und Monatsbericht".
--
-- WARUM ES DAS BRAUCHT
-- Werbung per WhatsApp braucht eine AUSDRUECKLICHE, vorherige Einwilligung
-- des Gastes (§ 7 Abs. 2 UWG), und der Wirt muss sie nachweisen koennen.
-- Bis hierhin fragte die App nirgends danach -- es gab nur review_consent
-- (eine einzige Bewertungs-Mail, SQL 33).
--
-- DREI TABELLEN
--   gast_einwilligungen       -- wer hat wann, wo, welchem Satz zugestimmt;
--                                Widerruf per Link (abmelde_token).
--   wa_kampagnen              -- ein Angebot des Wirts: Titel, Text, Rabatt.
--   wa_kampagnen_empfaenger   -- je Gast: Name, Quelle, persoenlicher Code,
--                                wann verschickt, wann eingeloest, Umsatz.
--
-- WER DARF WAS
--   gast_einwilligungen: schreibt NUR der Server (Funktion wa-einwilligung,
--     Dienstschluessel). Er prueft, dass es die Bestellung bzw. Reservierung
--     mit genau dieser Nummer gibt -- sonst koennte jeder fremde Nummern
--     eintragen. Der Inhaber LIEST seine, aendern kann er sie nicht (ein
--     Nachweis, den der Wirt selbst schreibt, ist keiner).
--   wa_kampagnen(_empfaenger): der Inhaber seine, der Superadmin alles.
--     Ein Empfaenger ohne gueltige Einwilligung wird von der Datenbank
--     abgewiesen (kmi_nur_mit_einwilligung) -- auch wenn die App irrt.
--   eingeloest_at / umsatz: schreibt order-save mit dem Dienstschluessel,
--     wenn eine Bestellung mit dem Code ankommt.
--
-- Wiederholbar: alles mit "if not exists" / "or replace".
-- =====================================================================

create table if not exists public.gast_einwilligungen (
    id              uuid        primary key default gen_random_uuid(),
    restaurant_id   uuid        not null references public.restaurants(id) on delete cascade,
    telefon         text        not null,      -- nur Ziffern, mit Laendervorwahl: 49176...
    name            text,
    kanal           text        not null default 'whatsapp' check (kanal in ('whatsapp')),
    quelle          text        not null check (quelle in ('bestellung', 'reservierung')),
    bezug_id        text,                      -- id der Bestellung / Reservierung
    text_fassung    text        not null,      -- der Satz, dem zugestimmt wurde
    erstmals_at     timestamptz not null default now(),
    erteilt_at      timestamptz not null default now(),
    widerrufen_at   timestamptz,
    abmelde_token   uuid        not null default gen_random_uuid(),
    unique (restaurant_id, telefon, kanal)
);
create index if not exists gast_einwilligungen_token on public.gast_einwilligungen (abmelde_token);

alter table public.gast_einwilligungen enable row level security;

drop policy if exists "Eigene Einwilligungen sieht der Inhaber" on public.gast_einwilligungen;
create policy "Eigene Einwilligungen sieht der Inhaber"
    on public.gast_einwilligungen for select to authenticated
    using (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

grant select on public.gast_einwilligungen to authenticated;
-- KEIN insert/update/delete fuer anon/authenticated: nur der Dienstschluessel.

create table if not exists public.wa_kampagnen (
    id              uuid        primary key default gen_random_uuid(),
    restaurant_id   uuid        not null references public.restaurants(id) on delete cascade,
    titel           text        not null,
    nachricht       text        not null,
    rabatt_prozent  integer     check (rabatt_prozent is null or rabatt_prozent between 1 and 90),
    gueltig_bis     date,
    erstellt_at     timestamptz not null default now()
);

create table if not exists public.wa_kampagnen_empfaenger (
    id              uuid        primary key default gen_random_uuid(),
    kampagne_id     uuid        not null references public.wa_kampagnen(id) on delete cascade,
    restaurant_id   uuid        not null references public.restaurants(id) on delete cascade,
    einwilligung_id uuid        references public.gast_einwilligungen(id) on delete set null,
    name            text,
    telefon         text        not null,
    quelle          text,                      -- 'bestellung' / 'reservierung' (aus der Einwilligung)
    code            text,                      -- persoenlicher Gutschein (Tabelle coupons)
    gesendet_at     timestamptz,
    eingeloest_at   timestamptz,
    bestell_id      text,
    umsatz          numeric(10, 2),
    unique (kampagne_id, telefon)
);
create index if not exists wa_kampagnen_empfaenger_code on public.wa_kampagnen_empfaenger (code);

alter table public.wa_kampagnen enable row level security;
alter table public.wa_kampagnen_empfaenger enable row level security;

drop policy if exists "Eigene Kampagnen" on public.wa_kampagnen;
create policy "Eigene Kampagnen"
    on public.wa_kampagnen for all to authenticated
    using      (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin())
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

drop policy if exists "Eigene Kampagnen-Empfaenger" on public.wa_kampagnen_empfaenger;
create policy "Eigene Kampagnen-Empfaenger"
    on public.wa_kampagnen_empfaenger for all to authenticated
    using      (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin())
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

grant select, insert, update, delete on public.wa_kampagnen to authenticated;
grant select, insert, update, delete on public.wa_kampagnen_empfaenger to authenticated;

-- Kein Empfaenger ohne gueltige Einwilligung -- egal, was die App schickt.
create or replace function public.kmi_nur_mit_einwilligung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
    if not exists (
        select 1 from public.gast_einwilligungen e
        where e.restaurant_id = new.restaurant_id
          and e.telefon = new.telefon
          and e.kanal = 'whatsapp'
          and e.widerrufen_at is null
    ) then
        raise exception 'Keine gueltige WhatsApp-Einwilligung fuer diese Nummer'
            using errcode = 'P0001';
    end if;
    return new;
end
$$;

drop trigger if exists kmi_nur_mit_einwilligung on public.wa_kampagnen_empfaenger;
create trigger kmi_nur_mit_einwilligung
    before insert on public.wa_kampagnen_empfaenger
    for each row execute function public.kmi_nur_mit_einwilligung();

-- ---- Gegenprobe: alles muss "ja" sein ------------------------------
select
    (select count(*) from information_schema.tables where table_schema = 'public'
        and table_name in ('gast_einwilligungen', 'wa_kampagnen', 'wa_kampagnen_empfaenger')) = 3 as "3 Tabellen da",
    (select relrowsecurity from pg_class where oid = 'public.gast_einwilligungen'::regclass) as "Einwilligungen mit RLS",
    (select count(*) from pg_trigger where tgname = 'kmi_nur_mit_einwilligung') = 1 as "Empfaenger nur mit Einwilligung";
