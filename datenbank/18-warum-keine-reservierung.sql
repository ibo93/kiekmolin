-- SCHRITT 18: NUR NACHSEHEN. Diese Datei aendert NICHTS.
--
-- Am 25.08.2026 meldete der Betreiber: "Es kommen keine Reservierungen
-- und Bestellung rein". Im Protokoll standen drei abgewiesene Versuche
-- von drei verschiedenen Geraeten:
--
--   11:08:16  Samsung Browser   POST /rest/v1/reservations -> 401
--   13:17:24  iPhone            POST /rest/v1/reservations -> 401
--   15:10:56  Android Chrome    POST /rest/v1/reservations -> 401
--
-- und dazu jeweils:
--
--   ERROR  42501  new row violates row-level security policy
--                 for table "reservations"
--
-- Das waren echte Gaeste. Drei verlorene Reservierungen an einem Tag.
--
-- ZWEI MOEGLICHE URSACHEN, UND SIE BRAUCHEN VERSCHIEDENE REPARATUREN:
--
--   (A) Die Anlege-Regel verlangt "restaurant_id is not null", und die
--       App schickt null. Dann liegt der Fehler in der App.
--
--   (B) Die App bittet mit "Prefer: return=representation" darum, die
--       neue Zeile zurueckzubekommen. Postgres wendet dafuer die
--       LESE-Regel an -- und die gilt bei uns nur fuer "authenticated".
--       Ein Gast ist "anon". Er darf anlegen, aber das Ergebnis nicht
--       sehen, und daran scheitert der ganze Vorgang.
--       Dann liegt der Fehler in MEINEN Regeln (Schritt 09).
--
-- Dasselbe Muster steht auf orders, order_items und reservations:
-- INSERT offen fuer anon, SELECT nur fuer authenticated.
--
-- Diese Datei beantwortet, welcher Fall es ist. Erst danach wird
-- repariert -- die falsche Reparatur kostet nur noch mehr Zeit.


-- ---- 1. Steht der Schalter ueberhaupt an? ----------------------------
select tablename as tabelle,
       case when rowsecurity then 'AN' else 'AUS' end as schutz
  from pg_tables
 where schemaname = 'public'
   and tablename in ('reservations', 'orders', 'order_items')
 order by tablename;


-- ---- 2. Welche Regeln gelten wirklich? -------------------------------
-- Wichtig ist die Spalte "rollen": bei den Anlege-Regeln MUSS dort anon
-- stehen, sonst kann kein Gast reservieren oder bestellen.
select tablename                       as tabelle,
       cmd                             as recht,
       policyname                      as regel,
       roles::text                     as rollen,
       case when 'anon' = any(roles) then 'ja' else 'NEIN' end as gilt_fuer_gaeste,
       qual                            as lesebedingung,
       with_check                      as schreibbedingung
  from pg_policies
 where schemaname = 'public'
   and tablename in ('reservations', 'orders', 'order_items')
 order by tablename, cmd, policyname;

-- ERWARTET, wenn Schritt 09 sauber gelaufen ist: 12 Zeilen. Genau drei
-- davon haben gilt_fuer_gaeste = ja -- die INSERT-Regeln der drei
-- Tabellen. Steht bei einer SELECT-Regel "ja", ist das Gaeste-Loch
-- wieder offen.
--
-- FEHLT die INSERT-Regel fuer reservations ganz oder steht dort NEIN,
-- dann ist es Fall (A2): die Regel wurde nie angelegt.


-- ---- 3. Kommt die App ohne restaurant_id? ----------------------------
-- Wenn es Zeilen ohne Haus gibt, schickt die App wirklich null, und
-- Fall (A) ist bestaetigt. Sind alle Zeilen sauber, spricht das fuer (B).
select count(*)                                          as reservierungen_gesamt,
       count(*) filter (where restaurant_id is null)     as ohne_haus,
       max(created_at)                                   as neueste
  from public.reservations;

select count(*)                                          as bestellungen_gesamt,
       count(*) filter (where restaurant_id is null)     as ohne_haus,
       max(created_at)                                   as neueste
  from public.orders;


-- ---- 4. Wann kam die letzte Reservierung durch? ----------------------
-- Der Tag, an dem das aufhoerte, ist der Tag, an dem der Schalter
-- umgelegt wurde. Das ist der Beweis, welche Aenderung es war.
select date_trunc('day', created_at)::date as tag,
       count(*)                            as reservierungen
  from public.reservations
 where created_at > now() - interval '30 days'
 group by 1
 order by 1 desc;

select date_trunc('day', created_at)::date as tag,
       count(*)                            as bestellungen
  from public.orders
 where created_at > now() - interval '30 days'
 group by 1
 order by 1 desc;
