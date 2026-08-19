-- NOTFALL-RUECKNAHME von Schritt 04.
--
-- NUR AUSFUEHREN, WENN 04 GELAUFEN IST, DER CODE ABER NOCH NICHT
-- DEPLOYED. Dann liest die alte App noch direkt in orders und
-- reservations -- und bekommt seit 04 nichts mehr.
--
-- WAS DER GAST GERADE SIEHT
--   "Meine Bestellungen"          -> leer
--   freie Reservierungszeiten     -> erscheinen nicht
--   Banner zur laufenden Bestellung -> weg
-- Bestellen und reservieren geht weiter, das Dashboard auch.
--
--
-- EHRLICH: DAS HIER MACHT DAS LOCH WIEDER AUF
-- ------------------------------------------
-- Nach diesem Skript kann wieder jeder mit dem oeffentlichen Schluessel
-- Namen, Telefonnummern und Lieferadressen aus orders und reservations
-- lesen. Genau der Zustand, den wir beseitigen wollten.
--
-- Es ist also die ZWEITBESTE Loesung. Die beste ist: den Code
-- deployen (PR #180 mergen, Netlify baut von selbst) und 04 stehen
-- lassen. Das dauert wenige Minuten und schliesst das Loch dauerhaft.
--
-- Nimm dieses Skript nur, wenn der Deploy jetzt gerade nicht geht und
-- die App in der Zwischenzeit laufen muss.
--
-- customers bleibt ZU. Dort steht nichts, was die Gastansicht braucht,
-- und die Kundenliste ist das Wertvollste in der ganzen Datenbank.


-- Lesen wieder fuer alle -- so wie es vor Schritt 04 war.
drop policy if exists "Bestellungen des eigenen Hauses lesen" on public.orders;
create policy "Bestellungen des eigenen Hauses lesen"
    on public.orders for select to anon, authenticated
    using (true);

drop policy if exists "Positionen des eigenen Hauses lesen" on public.order_items;
create policy "Positionen des eigenen Hauses lesen"
    on public.order_items for select to anon, authenticated
    using (true);

drop policy if exists "Reservierungen des eigenen Hauses lesen" on public.reservations;
create policy "Reservierungen des eigenen Hauses lesen"
    on public.reservations for select to anon, authenticated
    using (true);


-- Gegenprobe. Erwartet: drei Zeilen, alle mit anon.
select tablename as tabelle, policyname as regel, roles::text as rollen
  from pg_policies
 where schemaname = 'public'
   and cmd = 'SELECT'
   and tablename in ('orders', 'order_items', 'reservations');


-- WENN DER CODE SPAETER DEPLOYED IST
-- ----------------------------------
-- Einfach 04-gaestedaten-zumachen.sql nochmal laufen lassen. Es raeumt
-- vorher alle Regeln weg und setzt die strengen neu -- diese Ruecknahme
-- hier wird dabei mit entfernt. Danach die Probe aufs Exempel aus 04
-- (Abschnitt 7c) machen.
