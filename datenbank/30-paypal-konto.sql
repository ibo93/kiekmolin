-- 30 — Das PayPal-Konto des Restaurants. Zahlung ZUERST, dann Bestellung.
--
-- Ibo am 13.09.2026: "es bei paypal gehen wenn die bestellung mit paypal
-- geht und dann kommt die bestellung bei restaurant an wie bei allen
-- anderen bestellungen."
--
-- Mit einem PayPal.Me-Link ging das nicht: ein Link hat keinen Rueckkanal,
-- PayPal meldet uns nie, dass jemand bezahlt hat. Der Wirt hat ein
-- GESCHAEFTSKONTO -- damit geht der richtige Weg:
--
--   Gast waehlt PayPal -> unser Server legt bei PayPal eine Zahlung an
--   -> Gast bezahlt im PayPal-Fenster -> PayPal bestaetigt UNSEREM SERVER
--   -> erst DANN wird die Bestellung geschrieben.
--
-- Kein Geld, keine Bestellung. Keine Bestellung ohne Geld.
--
-- WARUM EINE EIGENE TABELLE UND NICHT features
-- Hier liegt ein SECRET. Die Spalte features liest die Gastseite mit dem
-- oeffentlichen Schluessel -- alles darin ist oeffentlich. Ein Secret
-- gehoert dort so wenig hin wie der Service-Key in den Browser.
--
-- Diese Tabelle bekommt darum GAR KEINE Rechte fuer anon und
-- authenticated. Nur die Netlify-Funktion kommt heran, und die benutzt
-- den Service-Key. Wer das aendert, oeffnet das PayPal-Konto eines
-- fremden Betriebs.
--
-- Das Geld geht DIREKT an den Wirt. Es laeuft nie ueber Kurani Design --
-- sonst waere Ibo ein Zahlungsdienstleister, mit allem was daran haengt.

create table if not exists public.paypal_konten (
    restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
    client_id     text not null,
    secret        text not null,
    -- false = Sandbox (Testkonto), true = echtes Geld.
    -- Absichtlich der vorsichtige Standard: wer vergisst umzuschalten,
    -- verliert kein Geld, sondern merkt beim Testen, dass nichts ankommt.
    live          boolean not null default false,
    aktualisiert  timestamptz not null default now()
);

alter table public.paypal_konten enable row level security;

-- KEINE policy fuer anon oder authenticated. Ohne policy heisst bei
-- eingeschaltetem RLS: niemand darf. Der Service-Key umgeht RLS und ist
-- damit der einzige Weg hinein.
drop policy if exists "paypal_konten_niemand" on public.paypal_konten;

comment on table public.paypal_konten is
    'PayPal-Zugangsdaten je Restaurant. NUR ueber den Service-Key erreichbar -- enthaelt ein Secret. Niemals in features oder eine andere oeffentlich lesbare Spalte legen.';

-- ---- Nachsehen, dass wirklich niemand herankommt -------------------
select tablename,
       case when rowsecurity then 'RLS AN' else 'RLS AUS -- SOFORT PRUEFEN' end as schutz,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'paypal_konten') as regeln
  from pg_tables
 where schemaname = 'public' and tablename = 'paypal_konten';


-- ---- Die Bestellung muss sich merken, dass sie bezahlt ist ----------
--
-- payment_reference ist der PayPal-Vorgang. Er ist EINDEUTIG -- daran
-- erkennen wir, ob eine Zahlung schon gebucht wurde. Ohne diesen Riegel
-- erzeugt jeder zweite Klick, jedes Neuladen und jede Zurueck-Taste eine
-- weitere Bestellung fuer dasselbe Geld.

alter table public.orders
    add column if not exists payment_status text,
    add column if not exists payment_reference text;

create unique index if not exists orders_payment_reference_uniq
    on public.orders (payment_reference)
    where payment_reference is not null;

comment on column public.orders.payment_status is
    'paid = das Geld ist bestaetigt eingegangen. Leer = wie bisher (Barzahlung, Karte bei Lieferung, PayPal-Link).';
comment on column public.orders.payment_reference is
    'Vorgangsnummer des Zahlungsdienstes (PayPal). Eindeutig -- verhindert doppelte Bestellungen fuer dieselbe Zahlung.';
