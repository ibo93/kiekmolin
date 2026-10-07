-- SCHRITT 37: Mahnungen -- und der Absender, den es noch nirgends gab.
--
-- Ibo am 25.09.2026: "das muss selber was steuern ich kann es dann klicken".
--
-- Also: die App schreibt die Mahnung, er drueckt einen Knopf, sie geht raus.
-- Getippt wird nichts.
--
-- ============================================================
-- WARUM ZWEI TABELLEN
-- ============================================================
--
-- anbieter  -- WER mahnt. Eine einzige Zeile.
--
--     Am 25.09.2026 nachgesehen: im ganzen Projekt stehen Ibos Firmendaten
--     NIRGENDS. In 32-vertrag.sql klafft zweimal
--     [[ANBIETER: Firmierung, Inhaber, Anschrift, Kontakt]].
--
--     Eine Mahnung ohne vollstaendigen Absender und ohne Bankverbindung ist
--     keine Mahnung -- der Empfaenger weiss nicht, an wen er zahlen soll.
--     Deshalb steht das hier, EINMAL, und der Vertrag kann spaeter
--     dieselbe Zeile benutzen statt eines zweiten Platzhalters.
--
-- mahnungen -- WAS gemahnt wurde. Haengt nur an, loescht nie.
--
--     Das ist der Beleg. Sagt ein Wirt spaeter "du hast mich ohne
--     Vorwarnung abgeschaltet", steht hier Datum, Betrag, Frist und der
--     Wortlaut, der wirklich rausging. Ohne diese Liste steht Aussage
--     gegen Aussage -- und die Zahlsperre waere unbenutzbar.
--
-- ============================================================
-- WARUM DIE FRIST NICHT IN customers STEHT
-- ============================================================
-- Eine Spalte "mahnung_frist" wuerde bei jeder neuen Mahnung
-- ueberschrieben. Dann waere die Vorgeschichte weg -- genau das Problem,
-- das zahlsperre_seit schon hat. Die Frist ist IMMER die der letzten
-- gesendeten Mahnung, und die steht hier.
--
-- ============================================================
-- NIEMAND AUSSER DEM DIENSTSCHLUESSEL
-- ============================================================
-- Beide Tabellen mit RLS an und OHNE Policy. Der Wirt darf seine eigene
-- Mahnung nicht lesen koennen und erst recht nicht die der anderen -- und
-- in anbieter steht Ibos IBAN.

select case when to_regclass('public.mahnungen') is null
            then 'VORHER: Tabellen fehlen noch' else 'VORHER: Tabellen sind da' end as befund;


-- ---- TEIL A: WER MAHNT ------------------------------------------------
create table if not exists public.anbieter (
    id             int primary key default 1,
    firmierung     text,
    inhaber        text,
    strasse        text,
    plz            text,
    ort            text,
    email          text,
    telefon        text,
    iban           text,
    bic            text,
    bank           text,
    steuernummer   text,
    -- Kleinunternehmer nach § 19 UStG: dann wird in der Mahnung KEINE
    -- Umsatzsteuer ausgewiesen. Am 20.09.2026 von Ibo bestaetigt (siehe
    -- build-seo-pages.js). Steht hier trotzdem als Schalter -- das kann
    -- sich aendern, und dann darf es niemand vergessen.
    kleinunternehmer boolean not null default true,
    -- Wie viele Tage Frist die Mahnung setzt. 14 ist ueblich; unter 7 wird
    -- schnell als unangemessen kurz angesehen.
    frist_tage     int not null default 14,
    geaendert_am   timestamptz not null default now(),
    -- Nur EINE Zeile. Zwei Absender waeren zwei Wahrheiten.
    constraint anbieter_nur_eine_zeile check (id = 1)
);

insert into public.anbieter (id) values (1) on conflict (id) do nothing;

alter table public.anbieter enable row level security;
-- Keine Policy. Nur der Dienstschluessel kommt daran -- hier steht die IBAN.

comment on table public.anbieter is
    'Ibos Firmendaten, einmal. Fuer Mahnungen -- und fuer den '
    '[[ANBIETER]]-Platzhalter in 32-vertrag.sql, wenn der freigeschaltet wird.';


-- ---- TEIL B: WAS GEMAHNT WURDE ----------------------------------------
create table if not exists public.mahnungen (
    id             uuid primary key default gen_random_uuid(),
    customer_id    uuid not null,
    restaurant_id  uuid,
    -- 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = letzte Mahnung.
    -- Die App zaehlt selbst hoch; von Hand setzt das niemand.
    stufe          int  not null default 1,
    erstellt_am    timestamptz not null default now(),
    -- NULL, solange die Mail nicht durchging. Das ist der Unterschied
    -- zwischen "geschrieben" und "zugestellt" -- und nur das Zweite
    -- setzt eine Frist in Gang.
    versendet_am   timestamptz,
    versand_fehler text,
    empfaenger     text,
    frist_bis      date,
    betrag         numeric(10,2),
    rechnung_ref   text,
    betreff        text,
    text           text
);

create index if not exists mahnungen_kunde_idx
    on public.mahnungen (customer_id, erstellt_am desc);

alter table public.mahnungen enable row level security;
-- Keine Policy. Siehe oben.

comment on table public.mahnungen is
    'Haengt nur an, loescht nie. Der Beleg dafuer, dass vor einer '
    'Zahlsperre gemahnt wurde -- mit Datum, Frist und Wortlaut.';


-- ---- TEIL C: GEGENPROBE -----------------------------------------------
select
  (select count(*) from public.anbieter)                       as anbieter_muss_1_sein,
  (select count(*) from pg_policies
     where schemaname='public' and tablename in ('anbieter','mahnungen'))
                                                               as policies_muessen_0_sein,
  (select count(*) from pg_tables
     where schemaname='public' and tablename in ('anbieter','mahnungen')
       and rowsecurity is true)                                as rls_muss_2_sein;


-- ============================================================
-- DANACH: DIE FIRMENDATEN EINTRAGEN
-- ============================================================
-- Nicht hier im SQL -- im Dashboard unter Kunden steht dafuer ein
-- Formular. Solange etwas fehlt, weigert sich die App, eine Mahnung zu
-- bauen, und sagt WELCHES Feld fehlt. Dieselbe Regel wie beim Vertrag:
-- lieber gar nichts als ein Schreiben mit einer Luecke drin.
