-- GESCHENKGUTSCHEINE (03.11.2026).
--
-- Ibo: "ja mach gutschein mit schoenen design". Ein Gast kauft auf der
-- Lokalseite einen Gutschein (z. B. 50 EUR), bezahlt mit PayPal -- das Geld
-- geht DIREKT auf das PayPal-Konto des Wirts (paypal_konten, wie beim
-- Bestellen) -- und bekommt einen Gutschein mit Code zum Verschenken. Der
-- Wirt loest ihn im Lokal ein, auch in Teilbetraegen.
--
-- Nicht verwechseln mit der Tabelle coupons: das sind Rabatt-Codes
-- ("10 % fuer Stammgaeste"). Ein Geschenkgutschein ist bezahltes Guthaben.
--
-- WER DARF WAS
-- ============
-- RLS an, KEINE Regeln: weder Gast noch Wirt lesen oder schreiben die
-- Tabelle direkt. Alles laeuft ueber netlify/functions/geschenkgutschein.js
-- mit dem Dienstschluessel:
--   * Anlegen NUR nach bestaetigter PayPal-Zahlung (Status UND Betrag).
--   * Einloesen NUR durch angemeldete Leute dieses Lokals, in EINEM Schritt
--     (update ... where rest = <alter Rest>) -- doppelt einloesen geht nicht.
--   * Ansehen per Code (der Code ist das Geheimnis, wie bei einem
--     Papiergutschein): Betrag, Rest, Lokal, Gruss -- nie Kaeufer-Mail.
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
create index if not exists geschenkgutscheine_haus on public.geschenkgutscheine (restaurant_id, erstellt desc);

alter table public.geschenkgutscheine enable row level security;
-- Absichtlich KEINE Regeln (siehe oben).

-- PRUEFEN: muss eine Zeile "geschenkgutscheine | true" zeigen.
-- select relname, relrowsecurity from pg_class where relname = 'geschenkgutscheine';
