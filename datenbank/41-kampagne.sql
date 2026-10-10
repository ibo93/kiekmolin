-- SCHRITT 41: KAMPAGNE -- aus welchem Video ein Gast kam.
--
-- WOZU
-- Das Studio von Kurani Design haengt an jeden Video-Link und QR-Code einen
-- kurzen Code: kiekmolin.de/die-millis?ref=reel-pizzatag. Bucht oder
-- bestellt der Gast in derselben Sitzung, steht der Code an der Zeile. Im
-- Monatsbericht des Wirts steht dann "Reel Pizzatag: 11 Reservierungen,
-- 6 Bestellungen" -- nicht nur "4.200 Aufrufe".
--
-- WAS DRINSTEHT
-- Nur der Code des VIDEOS (kleine Buchstaben, Ziffern, Bindestrich, 3-48
-- Zeichen). Nichts ueber den Gast. Die Regel unten erzwingt das Muster auch
-- fuer Zeilen, die nicht ueber die Server-Funktionen kommen.
--
-- GEFAHRLOS
-- Zwei neue Spalten, leer erlaubt (null). Keine Zeile wird geaendert oder
-- geloescht, keine Lese- oder Schreibregel (RLS) angefasst. Bevor diese
-- Datei laeuft, werfen reservation-guest / order-save / paypal-zahlung das
-- Feld selbst wieder raus -- es geht keine Buchung verloren.
--
-- WER LIEST
-- Nur netlify/functions/kampagnen-zahlen.js mit dem Dienstschluessel -- und
-- die gibt NUR Zahlen heraus (Anzahl, Personen, Umsatz je Code), keine
-- Namen, Telefonnummern oder Adressen.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
select table_name as tabelle, column_name as spalte, data_type as typ
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('reservations', 'orders')
   and column_name = 'kampagne';
-- Leer = noch nicht da, unten anlegen. Zwei Zeilen = schon erledigt.


-- ---- TEIL B: ANLEGEN --------------------------------------------------
-- if not exists: zweimal ausfuehren schadet nicht.
alter table public.reservations add column if not exists kampagne text;
alter table public.orders       add column if not exists kampagne text;

-- Muster erzwingen. "not valid": alte Zeilen werden nicht geprueft (sie sind
-- ohnehin alle leer) -- so kann das Anlegen nicht an Altbestand scheitern.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_kampagne_muster') then
    alter table public.reservations add constraint reservations_kampagne_muster
      check (kampagne is null or kampagne ~ '^[a-z0-9][a-z0-9-]{2,47}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_kampagne_muster') then
    alter table public.orders add constraint orders_kampagne_muster
      check (kampagne is null or kampagne ~ '^[a-z0-9][a-z0-9-]{2,47}$') not valid;
  end if;
end $$;

-- Teil-Index: nur Zeilen MIT Code (wenige von vielen) -- klein und schnell.
create index if not exists reservations_kampagne_idx
    on public.reservations (restaurant_id, kampagne) where kampagne is not null;
create index if not exists orders_kampagne_idx
    on public.orders (restaurant_id, kampagne) where kampagne is not null;


-- ---- TEIL C: NACHSEHEN, OB ES GEKLAPPT HAT ---------------------------
select table_name as tabelle, column_name as spalte, data_type as typ
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('reservations', 'orders')
   and column_name = 'kampagne';
-- Erwartet: zwei Zeilen -- orders | kampagne | text  und  reservations | kampagne | text
