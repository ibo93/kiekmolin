-- AUSVERKAUFT AUS DER KUECHE -- UND MORGEN FRUEH VON SELBST ZURUECK (09.11.2026).
--
-- Ibo hat das neue Kuechen-Display freigegeben ("Ja mach das"). Darin gibt
-- es "Gericht ausverkauft melden": der Koch tippt das Gericht an, und online
-- kann es sofort keiner mehr bestellen (is_available = false, wie bisher in
-- der Speisekarten-Verwaltung).
--
-- NEU ist nur der Tag. Ohne ihn blieb "ausverkauft" fuer immer stehen, bis
-- jemand daran dachte, es zurueckzunehmen -- und am naechsten Tag fehlte das
-- Lieblingsgericht auf der Karte. Mit ausverkauft_am gibt der naechtliche Lauf
-- (netlify/functions/ausverkauft-zurueck.js, 4 Uhr) alles frei, was an einem
-- frueheren Tag ausverkauft gemeldet wurde.
--
-- Gerichte, die in der Speisekarten-Verwaltung bewusst abgeschaltet wurden,
-- haben KEINEN Tag und bleiben aus. Nur, was die Kueche "heute" meldet, kommt
-- zurueck.
--
-- Rechte: unveraendert. Schreiben darf, wer die Speisekarte des Lokals
-- aendern darf (bestehende Regeln auf menu_items).
--
-- Einspielen: einmal im Supabase SQL-Editor ausfuehren. Mehrfach geht auch.
-- Ohne diese Datei klappt "ausverkauft" trotzdem -- das Kuechen-Display sagt
-- dann aber, dass es morgen NICHT von selbst zurueckkommt.

alter table public.menu_items add column if not exists ausverkauft_am date;
create index if not exists menu_items_ausverkauft_am on public.menu_items (ausverkauft_am) where ausverkauft_am is not null;

-- PRUEFEN: muss eine Zeile "ausverkauft_am | date" zeigen.
-- select column_name, data_type from information_schema.columns where table_name = 'menu_items' and column_name = 'ausverkauft_am';
