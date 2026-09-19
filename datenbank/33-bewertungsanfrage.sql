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
