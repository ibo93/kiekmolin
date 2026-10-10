-- =====================================================================
-- SCHRITT 43: PUSH-ANGEBOTE NUR MIT ZUSTIMMUNG -- und der KASSEN-UMSATZ.
--
-- TEIL 1: push_subscriptions.angebote
-- Gaeste erlauben Push, um ihren Bestellstatus zu sehen ("du siehst jede
-- Status-Aenderung"). marketing-push ("Angebot an alle Gaeste") und
-- loyalty-push (Stempel-Erinnerungen, "wir vermissen dich") nutzten genau
-- diese Erlaubnis fuer Werbung. Ein anderer Zweck braucht eine eigene
-- Zustimmung -- gefunden am 09.10.2026 bei der Arbeit an den WhatsApp-
-- Angeboten (datenbank/42). Ab jetzt: Werbe-Push nur an angebote = true.
-- Standard false: wer nichts anhakt, bekommt nur seinen Status.
--
-- TEIL 2: kassen_umsatz
-- Ibo: "ich will Umsatz sehen jeden Tag". Die App kennt nur, was ueber sie
-- bestellt wurde. Der Wirt traegt abends EINE Zahl ein -- was die Kasse
-- im Lokal gemacht hat --, dann stimmen Startseite, Tagesbericht und
-- Monatsbericht. Eine Zeile je Lokal und Tag; nochmal eintragen ersetzt.
--
-- Wiederholbar: "if not exists" / "drop ... if exists".
-- =====================================================================

alter table public.push_subscriptions add column if not exists angebote boolean not null default false;
alter table public.push_subscriptions add column if not exists angebote_at timestamptz;
comment on column public.push_subscriptions.angebote is
    'Gast hat zugestimmt, Angebote und Stempel-Erinnerungen per Push zu bekommen. Nur dann senden marketing-push und loyalty-push.';

create table if not exists public.kassen_umsatz (
    id            uuid        primary key default gen_random_uuid(),
    restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
    tag           date        not null,
    betrag        numeric(10, 2) not null check (betrag >= 0 and betrag < 1000000),
    notiz         text,
    erfasst_at    timestamptz not null default now(),
    unique (restaurant_id, tag)
);

alter table public.kassen_umsatz enable row level security;

drop policy if exists "Eigener Kassen-Umsatz" on public.kassen_umsatz;
create policy "Eigener Kassen-Umsatz"
    on public.kassen_umsatz for all to authenticated
    using      (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin())
    with check (restaurant_id in (select public.kmi_meine_haeuser()) or public.kmi_ist_superadmin());

grant select, insert, update, delete on public.kassen_umsatz to authenticated;

-- ---- Gegenprobe: alles muss "ja" sein ------------------------------
select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'angebote') as "Push: Spalte angebote",
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kassen_umsatz') as "Tabelle kassen_umsatz",
    (select relrowsecurity from pg_class where oid = 'public.kassen_umsatz'::regclass) as "Kasse mit RLS";
