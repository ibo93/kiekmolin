-- ============================================================
-- ALLES, WAS NOCH FEHLT -- in EINEM Stueck.
--
-- Stand 25.09.2026. Ibo: "brauch den sql.."
--
-- SO GEHT ES
-- ----------
-- Supabase oeffnen -> SQL Editor -> New query -> diese Datei komplett
-- hineinkopieren -> Run.
--
-- Unten steht eine Gegenprobe. Die letzte Tabelle, die danach im Editor
-- erscheint, sagt in Klartext, ob alles sitzt -- da muss ueberall "ja"
-- oder die genannte Zahl stehen.
--
-- MEHRMALS AUSFUEHREN SCHADET NICHT
-- ---------------------------------
-- Jeder Teil ist so geschrieben, dass er nichts kaputt macht, wenn er
-- schon gelaufen ist: "if not exists", "drop ... if exists",
-- "on conflict do nothing". Wenn du unsicher bist, ob etwas durchlief:
-- einfach nochmal laufen lassen.
--
-- WAS DRIN IST
-- ------------
--   TEIL 1  (33-bewertungsanfrage.sql)
--            Einwilligung fuer die EINE Bewertungsanfrage per Mail
--   TEIL 2  (35-lead-zaehler.sql)
--            Zaehler fuer die Restaurantseiten (gesehen/geklickt/gesendet)
--   TEIL 3  (36-zahlsperre.sql)
--            Die Zahlsperre -- drei Stufen, vom Wirt nicht zurueckzusetzen
--   TEIL 4  (37-mahnung.sql)
--            Absender + Mahnungen -- das Glied vor der Sperre
--
-- WAS NICHT DRIN IST
-- ------------------
-- 32-vertrag.sql. Da stehen noch zwei [[PLATZHALTER]] und kein Anwalt
-- hat die Texte gelesen. Die App WEIGERT SICH, einen Vertrag mit einem
-- Platzhalter freizuschalten -- das ist Absicht und bleibt so, bis die
-- Pruefung durch ist.
-- ============================================================



-- ==========================================================
-- TEIL 1 VON 4  ---  33-bewertungsanfrage.sql
-- Einwilligung fuer die EINE Bewertungsanfrage per Mail
-- ==========================================================

-- =====================================================================
-- 33 -- Bewertungsanfrage: die zwei Spalten, die review-mail braucht
-- =====================================================================
--
-- BEFUND (18./19.09.2026, in den postgres_logs von Supabase):
--
--     column orders.review_consent does not exist
--     column reservations.review_consent does not exist
--
-- Stündlich, seit die Funktion existiert. Es ist noch NIE eine
-- Bewertungsanfrage rausgegangen -- und gemeldet hat sich das nie, weil
-- review-mail den Ausfall sauber wegfängt und weiterläuft. Ein stiller
-- Ausfall: die Funktion lief, tat aber nichts.
--
-- WARUM ES DIE EINWILLIGUNG BRAUCHT UND NICHT NUR DEN VERSAND
--
-- Der BGH hat 2018 entschieden (VI ZR 225/17): eine Bewertungsbitte in
-- einer Kundenzufriedenheits-Mail ist Werbung. Die Ausnahme in
-- § 7 Abs. 3 UWG greift nur, wenn der Gast BEI der Adresserhebung
-- darauf hingewiesen wurde und widersprechen konnte. Deshalb steht das
-- Häkchen jetzt im Bestell- und im Reservierformular -- leer
-- voreingestellt -- und diese Spalte hält fest, was er dort gewählt hat.
--
-- Ohne review_consent = true geht keine Mail raus. Das ist keine
-- Vorsicht, das ist die Bedingung.
--
-- EINSPIELEN: Supabase -> SQL Editor -> einfügen -> Run.
-- Zweimal laufen lassen ist harmlos (IF NOT EXISTS).
--
-- Reihenfolge: diese Datei darf VOR oder NACH dem Deploy laufen. Beide
-- Schreibwege (order-save und reservation-guest) werfen das Feld raus,
-- wenn die Spalte fehlt, und speichern trotzdem -- eine Bestellung darf
-- nicht an einer fehlenden Bewertungsspalte scheitern.
-- =====================================================================

-- --- Bestellungen ----------------------------------------------------
alter table public.orders
    add column if not exists review_consent boolean not null default false;

alter table public.orders
    add column if not exists review_email_sent_at timestamptz;

-- --- Reservierungen --------------------------------------------------
alter table public.reservations
    add column if not exists review_consent boolean not null default false;

alter table public.reservations
    add column if not exists review_email_sent_at timestamptz;

-- --- Wozu die Spalten da sind, in der Datenbank selbst ---------------
comment on column public.orders.review_consent is
    'Gast hat beim Bestellen zugestimmt, EINMAL per E-Mail um eine Bewertung gebeten zu werden (§ 7 Abs. 3 UWG). Ohne true verschickt review-mail nichts.';
comment on column public.orders.review_email_sent_at is
    'Wann die Bewertungsanfrage rausging. Wird atomar gesetzt, damit keine zweite Mail folgt.';
comment on column public.reservations.review_consent is
    'Gast hat beim Reservieren zugestimmt, EINMAL per E-Mail um eine Bewertung gebeten zu werden (§ 7 Abs. 3 UWG). Ohne true verschickt review-mail nichts.';
comment on column public.reservations.review_email_sent_at is
    'Wann die Bewertungsanfrage rausging. Wird atomar gesetzt, damit keine zweite Mail folgt.';

-- --- Nur die Zeilen, die review-mail wirklich sucht -------------------
-- Die Funktion fragt stündlich nach "zugestimmt und noch nicht
-- verschickt". Ohne Index liest Postgres dafür die ganze Tabelle.
create index if not exists orders_bewertungsanfrage_idx
    on public.orders (created_at)
    where review_consent and review_email_sent_at is null;

create index if not exists reservations_bewertungsanfrage_idx
    on public.reservations (created_at)
    where review_consent and review_email_sent_at is null;

-- --- Gegenprobe ------------------------------------------------------
-- Muss vier Zeilen liefern. Kommt weniger, ist etwas nicht durchgelaufen.
--
--   select table_name, column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('orders', 'reservations')
--      and column_name in ('review_consent', 'review_email_sent_at')
--    order by table_name, column_name;
--
-- Und danach, nach dem ersten Gast mit Häkchen:
--
--   select count(*) from public.orders where review_consent;


-- ==========================================================
-- TEIL 2 VON 4  ---  35-lead-zaehler.sql
-- Zaehler fuer die Restaurantseiten (gesehen/geklickt/gesendet)
-- ==========================================================

-- SCHRITT 35: lead_zaehler -- kommt ueber die Restaurantseiten ueberhaupt jemand?
--
-- Auf hunderten Seiten steht der gruene Kasten "Ist das dein Restaurant?".
-- Er zeigt auf /gastro. Niemand konnte sagen, ob dieser Kasten 10 oder
-- 10.000 Mal gesehen wurde.
--
-- Ibo am 24.09.2026: "wir muessen mehr Werbung machen und Kunden holen".
-- Werbung ohne Zaehler ist Geld ausgeben mit verbundenen Augen: hinterher
-- weiss niemand, was gewirkt hat. Deshalb zuerst der Zaehler.
--
-- Drei Schritte, mehr nicht:
--     gesehen    die Restaurantseite wurde geladen
--     geklickt   jemand hat den Inhaber-Knopf gedrueckt
--     gesendet   das Formular auf /gastro ging ab
--
-- ABSICHTLICH KEINE PERSONENDATEN. Keine IP, kein Besucher-Kennzeichen,
-- kein Verlauf. Nur: an welchem Tag, auf welcher Seite, wie oft. Damit
-- braucht es keine Einwilligung und keinen Bannersalat -- und es beantwortet
-- die einzige Frage, die zaehlt.

-- Vorher/Nachher sichtbar machen.
select case when to_regclass('public.lead_zaehler') is null
            then 'VORHER: lead_zaehler gibt es noch nicht'
            else 'VORHER: lead_zaehler ist schon da' end as befund;

create table if not exists public.lead_zaehler (
    tag      date    not null,
    slug     text    not null,
    schritt  text    not null,
    anzahl   integer not null default 0,
    primary key (tag, slug, schritt)
);

alter table public.lead_zaehler
    drop constraint if exists lead_zaehler_schritt_check;
alter table public.lead_zaehler
    add constraint lead_zaehler_schritt_check
    check (schritt in ('gesehen', 'geklickt', 'gesendet'));

-- RLS an, KEINE Regel: niemand kommt mit dem oeffentlichen Schluessel heran.
-- Geschrieben und gelesen wird nur ueber die Netlify-Function mit dem
-- Service-Key. Ein Zaehler, den jeder hochdrehen kann, ist kein Zaehler.
alter table public.lead_zaehler enable row level security;
drop policy if exists "lead_zaehler_niemand" on public.lead_zaehler;

comment on table public.lead_zaehler is
    'Wie oft der Inhaber-Kasten gesehen/geklickt wurde und wie oft das '
    'Formular abging. Tagesweise, ohne Personenbezug. Schreibt nur die '
    'Function lead-zaehler mit dem Service-Key.';

-- Hochzaehlen in EINEM Schritt. Ohne diese Funktion muesste die Netlify-
-- Function erst lesen und dann schreiben -- und zwei gleichzeitige Besucher
-- wuerden sich gegenseitig ueberschreiben. Am Ende stuende eine zu kleine
-- Zahl da, und niemand haette einen Fehler gesehen.
create or replace function public.lead_zaehlen(p_slug text, p_schritt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_schritt not in ('gesehen', 'geklickt', 'gesendet') then
        return;                      -- Unbekanntes still verwerfen, nicht werfen
    end if;
    insert into public.lead_zaehler (tag, slug, schritt, anzahl)
    values (current_date, left(coalesce(p_slug, '-'), 120), p_schritt, 1)
    on conflict (tag, slug, schritt)
    do update set anzahl = public.lead_zaehler.anzahl + 1;
end;
$$;

revoke all on function public.lead_zaehlen(text, text) from public, anon, authenticated;

-- Nachher: steht die Tabelle, ist RLS an, und gibt es KEINE Regel?
select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_name = 'lead_zaehler') as tabelle_da,
    (select relrowsecurity from pg_class
      where oid = 'public.lead_zaehler'::regclass)                   as rls_an,
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'lead_zaehler')    as regeln_muessen_0_sein;


-- ==========================================================
-- TEIL 3 VON 4  ---  36-zahlsperre.sql
-- Die Zahlsperre -- drei Stufen, vom Wirt nicht zurueckzusetzen
-- ==========================================================

-- SCHRITT 36: zahlsperre -- wenn eine Rechnung offen bleibt.
--
-- Ibo am 24.09.2026: "wenn Kunden nicht bezahlen, dass ich mit einem Knopf
-- es schliesse, nur der Admin ... drei Stufen ist gut ... ich will es
-- selber steuern".
--
-- DREI STUFEN, VON HAND GESETZT:
--
--     keine     alles normal
--     hinweis   roter Balken im Dashboard. Nur der Wirt sieht ihn.
--     pause     der Gast kann NICHT mehr bestellen. Reservierungen laufen
--               weiter, das Dashboard bleibt offen -- damit der Wirt die
--               letzten Bestellungen abarbeiten kann.
--     aus       Bestellen und Reservieren zu.
--
-- WARUM DAS DASHBOARD NIE GESPERRT WIRD: Bestellungen kaemen weiter
-- herein, der Gast saehe eine normale Seite -- und niemand wuerde kochen.
-- Der Gast wartet auf Essen, das nie kommt, und schreibt die Bewertung
-- ueber das Restaurant UND ueber kiekmolin.de. Man bestraft den Gast, um
-- den Wirt zu treffen.
--
-- ============================================================
-- WARUM EINE SPALTE UND KEINE EIGENE TABELLE
-- ============================================================
-- Die Gaesteseite und das Dashboard lesen den Betrieb ohnehin. Eine
-- eigene Tabelle hiesse: eine zusaetzliche Abfrage auf jeder Seite,
-- nur um zu erfahren, dass alles normal ist.
--
-- ABER: der Wirt darf seine eigene Zeile in restaurants aendern -- so
-- speichert er seine Zahlungsarten. Eine normale Spalte koennte er also
-- selbst zuruecksetzen. Deshalb wird das Schreibrecht AUF DIESE EINE
-- SPALTE entzogen. Lesen darf sie jeder, setzen nur der Dienstschluessel.

select case when exists (select 1 from information_schema.columns
                          where table_name='restaurants' and column_name='zahlsperre')
            then 'VORHER: zahlsperre gibt es schon'
            else 'VORHER: zahlsperre fehlt noch' end as befund;

alter table public.restaurants
    add column if not exists zahlsperre       text        not null default 'keine',
    add column if not exists zahlsperre_seit  timestamptz,
    add column if not exists zahlsperre_notiz text;

alter table public.restaurants
    drop constraint if exists restaurants_zahlsperre_check;
alter table public.restaurants
    add constraint restaurants_zahlsperre_check
    check (zahlsperre in ('keine', 'hinweis', 'pause', 'aus'));

-- DAS HERZSTUECK: der Wirt darf alles an seiner Zeile aendern, nur das
-- nicht. Spaltenrechte wirken unabhaengig von RLS -- ein UPDATE, das
-- diese Spalte anfasst, wird abgewiesen, egal welche Regel sonst greift.
revoke update (zahlsperre, zahlsperre_seit, zahlsperre_notiz)
    on public.restaurants from anon, authenticated;

comment on column public.restaurants.zahlsperre is
    'keine|hinweis|pause|aus. Von Hand durch den Superadmin gesetzt, nur '
    'ueber die Function zahlsperre mit dem Dienstschluessel. Lesen darf '
    'jeder -- die Gaesteseite muss wissen, ob sie Bestellungen annimmt.';

-- Nachher: steht die Spalte, ist die Voreinstellung "keine", und ist das
-- Schreibrecht wirklich weg?
select
  (select count(*) from information_schema.columns
     where table_name='restaurants' and column_name like 'zahlsperre%')    as spalten_muessen_3_sein,
  (select count(*) from public.restaurants where zahlsperre <> 'keine')    as gesperrte_betriebe,
  (select count(*) from information_schema.column_privileges
     where table_name='restaurants' and column_name='zahlsperre'
       and privilege_type='UPDATE' and grantee in ('anon','authenticated')) as schreibrecht_muss_0_sein;


-- ==========================================================
-- TEIL 4 VON 4  ---  37-mahnung.sql
-- Absender + Mahnungen -- das Glied vor der Sperre
-- ==========================================================

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


-- ============================================================
-- DIE GEGENPROBE -- das hier ist die Tabelle, die zaehlt
-- ============================================================
-- Im SQL-Editor siehst du nur das Ergebnis des LETZTEN Befehls.
-- Deshalb steht hier am Ende alles noch einmal in einer Zeile.
--
-- Erwartet: in jeder Spalte "ja" bzw. die genannte Zahl.
-- Steht irgendwo "FEHLT", ist dieser Teil nicht durchgelaufen.

select
  case when exists (select 1 from information_schema.columns
                     where table_name='orders' and column_name='review_consent')
       then 'ja' else 'FEHLT' end                                   as t33_bewertung,

  case when to_regclass('public.lead_zaehler') is not null
       then 'ja' else 'FEHLT' end                                   as t35_zaehler,

  case when exists (select 1 from information_schema.columns
                     where table_name='restaurants' and column_name='zahlsperre')
       then 'ja' else 'FEHLT' end                                   as t36_zahlsperre,

  -- Das Herzstueck von 36: der Wirt darf diese Spalte NICHT selbst
  -- zuruecksetzen. Hier muss 0 stehen.
  (select count(*) from information_schema.column_privileges
     where table_name='restaurants' and column_name='zahlsperre'
       and privilege_type='UPDATE' and grantee in ('anon','authenticated'))
                                                                    as t36_schreibrecht_muss_0_sein,

  case when to_regclass('public.anbieter') is not null
       then 'ja' else 'FEHLT' end                                   as t37_absender,
  case when to_regclass('public.mahnungen') is not null
       then 'ja' else 'FEHLT' end                                   as t37_mahnungen,

  -- Auf keiner der drei geschlossenen Tabellen darf eine Regel liegen:
  -- da stehen Zaehlerstaende, deine IBAN und die Mahnungen.
  (select count(*) from pg_policies
     where schemaname='public'
       and tablename in ('lead_zaehler','anbieter','mahnungen'))
                                                                    as regeln_muessen_0_sein;


-- ============================================================
-- UND DANACH
-- ============================================================
-- 1. Im Dashboard unter "Kunden" auf "Mahnung schreiben" druecken.
--    Es geht ein Formular auf und fragt nach deinen Firmendaten --
--    Firmierung, Inhaber, Anschrift, E-Mail, IBAN. Einmal ausfuellen,
--    dann gilt es fuer jede Mahnung.
--
-- 2. In Netlify pruefen, dass RESEND_API_KEY und EMAIL_FROM gesetzt
--    sind. Beides laeuft schon fuer die Bestell-Mails.
--
-- 3. Im Stripe-Fenster unter Developers -> Webhooks die zwei Ereignisse
--    ergaenzen: invoice.paid und invoice.payment_failed.
--
-- DIE ZAHLSPERRE NOCH NICHT BENUTZEN. Abschalten wegen offener Rechnung
-- braucht die Klausel aus 32-vertrag.sql -- und die ist nicht geprueft.
-- Die Mahnung darfst du schicken, das Abschalten noch nicht.
