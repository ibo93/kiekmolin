-- GESCHENKGUTSCHEINE (03.11.2026).
--
-- Ibo: "ja mach gutschein mit schoenen design". Zwei Wege zum Gutschein:
--   * ONLINE: Der Gast kauft auf der Lokalseite (z. B. 50 EUR) und bezahlt
--     mit PayPal -- das Geld geht DIREKT auf das PayPal-Konto des Wirts
--     (paypal_konten, wie beim Bestellen).
--   * VOR ORT (04.11.2026): Der Gast zahlt im Lokal bar oder mit Karte, der
--     Wirt legt den Gutschein im Dashboard an und druckt ihn (21 x 10 cm).
--   * DIREKT AN DEN BESCHENKTEN (04.11.2026): Wer online kauft, kann die
--     E-Mail des Beschenkten angeben -- er bekommt eine eigene Geschenk-Mail,
--     sofort oder am Wunschtag (z. B. Heiligabend) ab 8 Uhr.
-- Beide bekommen denselben Gutschein mit Code. Der Wirt loest ihn im Lokal
-- ein, auch in Teilbetraegen.
--
-- Nicht verwechseln mit der Tabelle coupons: das sind Rabatt-Codes
-- ("10 % fuer Stammgaeste"). Ein Geschenkgutschein ist bezahltes Guthaben.
--
-- WER DARF WAS
-- ============
-- RLS an, KEINE Regeln: weder Gast noch Wirt lesen oder schreiben die
-- Tabelle direkt. Alles laeuft ueber netlify/functions/geschenkgutschein.js
-- mit dem Dienstschluessel:
--   * Online anlegen NUR nach bestaetigter PayPal-Zahlung (Status UND Betrag).
--   * Vor Ort anlegen NUR durch angemeldete Leute dieses Lokals.
--   * Einloesen NUR durch angemeldete Leute dieses Lokals, in EINEM Schritt
--     (update ... where rest = <alter Rest>) -- doppelt einloesen geht nicht.
--   * Ansehen per Code (der Code ist das Geheimnis, wie bei einem
--     Papiergutschein): Betrag, Rest, Lokal, Gruss -- nie Kaeufer- oder
--     Empfaenger-Mail.
--
-- GUELTIGKEIT: 3 Jahre bis Jahresende (gesetzliche Regelverjaehrung,
-- § 195/199 BGB). Ein kuerzeres Datum waere in AGB meist unwirksam.
--
-- Einspielen: einmal im Supabase SQL-Editor ausfuehren. Mehrfach geht auch.
-- Ohne diese Datei sagt die App "Gutscheine sind noch nicht eingerichtet
-- (SQL 51)" -- es wird dann auch nichts kassiert.

create table if not exists public.geschenkgutscheine (
    id               uuid primary key default gen_random_uuid(),
    restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
    code             text not null unique,
    betrag           numeric(10,2) not null,
    rest             numeric(10,2) not null,
    status           text not null default 'aktiv',
    kaeufer_name     text,
    kaeufer_email    text,
    empfaenger_name  text,
    nachricht        text,
    motiv            text not null default 'klassisch',
    verkauft_ueber   text not null default 'online',   -- online (PayPal) | bar | karte (vor Ort)
    paypal_order_id  text unique,
    paypal_capture_id text,
    gueltig_bis      date not null,
    einloesungen     jsonb not null default '[]'::jsonb,
    erstellt         timestamptz not null default now(),
    geaendert        timestamptz not null default now(),
    constraint gg_betrag check (betrag > 0 and betrag <= 500),
    constraint gg_rest check (rest >= 0 and rest <= betrag),
    constraint gg_status check (status in ('aktiv', 'eingeloest', 'storniert'))
);
-- Vor Ort verkauft (04.11.2026): auch fuer Tabellen, die schon ohne die Spalte angelegt wurden.
alter table public.geschenkgutscheine add column if not exists verkauft_ueber text not null default 'online';
alter table public.geschenkgutscheine drop constraint if exists gg_verkauf;
alter table public.geschenkgutscheine add constraint gg_verkauf check (verkauft_ueber in ('online', 'bar', 'karte'));
-- Direkt an den Beschenkten (04.11.2026): eigene Mail, sofort oder am Wunschtag ab 8 Uhr
-- (netlify/functions/gutschein-versand.js, stuendlich). versendet_am = schon raus.
alter table public.geschenkgutscheine add column if not exists empfaenger_email text;
alter table public.geschenkgutscheine add column if not exists versand_am date;
alter table public.geschenkgutscheine add column if not exists versendet_am timestamptz;
create index if not exists geschenkgutscheine_versand on public.geschenkgutscheine (versand_am) where versendet_am is null and empfaenger_email is not null;
create index if not exists geschenkgutscheine_haus on public.geschenkgutscheine (restaurant_id, erstellt desc);

alter table public.geschenkgutscheine enable row level security;
-- Absichtlich KEINE Regeln (siehe oben).

-- PRUEFEN: muss eine Zeile "geschenkgutscheine | true" zeigen.
-- select relname, relrowsecurity from pg_class where relname = 'geschenkgutscheine';
