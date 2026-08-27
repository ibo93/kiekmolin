-- SCHRITT 20: restaurant_events -- der Gast darf melden, wenn bei ihm
--             etwas schiefgeht.
--
-- GEFUNDEN AM 27.08.2026 IM PROTOKOLL, 10 mal:
--
--     42501  new row violates row-level security policy
--            for table "restaurant_events"
--
-- WAS DA SCHIEFLAEUFT
-- logRestaurantEvent() in index.html schreibt Stoerungen mit, die im
-- Betrieb auftreten -- eine Bestellung, die nicht gespeichert wurde,
-- eine Position, die verlorenging. Der Waechter (netlify/functions/
-- waechter.js) liest diese Zeilen alle 15 Minuten und meldet sie.
--
-- Nur: geschrieben werden sie aus dem BROWSER. Beim Wirt im Dashboard
-- klappt das, der ist angemeldet. Beim GAST nicht -- und der Gast ist
-- genau derjenige, bei dem die interessanten Stoerungen passieren.
--
-- Das ist besonders bitter, weil dieses Protokoll dafuer da ist, stille
-- Ausfaelle sichtbar zu machen. Es ist selbst einer geworden: die
-- Meldungen, auf die es ankommt, kamen nie an.
--
-- WARUM NUR ANLEGEN, NICHT LESEN
-- Wer diese Tabelle lesen darf, sieht die Stoerungen aller Betriebe --
-- mit Bestellnummern und Nutzdaten. Der Gast braucht das nicht. Er
-- braucht nur das Recht, eine Zeile hinzuzufuegen.
--
-- restaurant_id muss dabeistehen, sonst ist die Meldung nutzlos: eine
-- Stoerung ohne Haus kann niemand zuordnen.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
select case when rowsecurity then 'AN' else 'AUS' end as schutz
  from pg_tables
 where schemaname = 'public' and tablename = 'restaurant_events';

select cmd                as recht,
       policyname         as regel,
       roles::text        as rollen,
       case when 'anon' = any(roles) then 'ja' else 'NEIN' end as gilt_fuer_gaeste,
       with_check         as schreibbedingung
  from pg_policies
 where schemaname = 'public' and tablename = 'restaurant_events'
 order by cmd, policyname;
-- Erwartet VOR der Aenderung: keine Anlege-Regel mit anon.


-- ---- TEIL B: ANLEGEN --------------------------------------------------
drop policy if exists "Jeder darf eine Stoerung melden" on public.restaurant_events;

create policy "Jeder darf eine Stoerung melden"
    on public.restaurant_events for insert to anon, authenticated
    with check (restaurant_id is not null);


-- ---- TEIL C: NACHSEHEN, OB ES GEKLAPPT HAT ---------------------------
select cmd                as recht,
       policyname         as regel,
       case when 'anon' = any(roles) then 'ja' else 'NEIN' end as gilt_fuer_gaeste,
       with_check         as schreibbedingung
  from pg_policies
 where schemaname = 'public' and tablename = 'restaurant_events'
 order by cmd, policyname;
-- Erwartet: genau EINE Zeile mit gilt_fuer_gaeste = ja, und zwar die
-- fuer INSERT. Steht bei einer SELECT-Regel "ja", waere das ein Loch --
-- dann saehe jeder die Stoerungen aller Betriebe.
