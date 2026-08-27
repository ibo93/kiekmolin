-- SCHRITT 19: restaurants.min_order_value -- die Spalte, auf die das
--             ganze Dashboard zeigt und die es nie gab.
--
-- GEFUNDEN AM 27.08.2026 IM PROTOKOLL
--
--     GET /rest/v1/restaurants?select=min_order_value  ->  400
--
-- Damit loest sich alles auf, was an dem Tag davor unerklaerlich war:
--
--   * Der Wirt stellt im Dashboard 15 Euro ein und sieht danach 15 Euro.
--     Der Wert steht aber nur in seinem Browser: saveMinOrderValue()
--     schreibt zuerst in localStorage und DANN in die Datenbank -- und
--     dieser zweite Schritt scheiterte still an der fehlenden Spalte.
--
--   * Der Gast sieht nichts. Sein Browser hat diesen Speicher nicht, und
--     aus der Datenbank kommt nichts. Fuer ihn ist der Mindestwert 0:
--     kein Hinweis im Warenkorb, keine Sperre beim Bestellen.
--     Deshalb konnte jemand fuer 12 Euro liefern lassen, obwohl 15
--     hinterlegt schienen.
--
--   * Und die Serverpruefung, die ich dagegen gebaut habe, konnte nie
--     greifen -- sie fragte dieselbe Spalte ab.
--
-- Die haesslichste Sorte Fehler: sie funktioniert fuer genau die eine
-- Person, die sie prueft, und fuer niemanden sonst.
--
-- free_delivery_from hat dasselbe Schicksal -- die Schwelle fuer
-- kostenlose Lieferung war beim Gast ebenfalls immer 0.
--
-- GEFAHRLOS
-- Zwei neue Spalten mit Standardwert 0. Das heisst "kein Mindestwert"
-- und "keine Gratis-Schwelle" -- also genau der Zustand, den alle
-- Betriebe heute schon haben. Keine Zeile wird geloescht, keine Regel
-- geaendert, kein Wirt ueberrascht.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
select column_name as spalte, data_type as typ, column_default as standard
  from information_schema.columns
 where table_schema = 'public' and table_name = 'restaurants'
   and column_name in ('min_order_value', 'free_delivery_from', 'delivery_fee', 'delivery_radius')
 order by column_name;
-- Erwartet VOR dem Anlegen: nur delivery_fee und delivery_radius.


-- ---- TEIL B: ANLEGEN --------------------------------------------------
-- if not exists: zweimal ausfuehren schadet nicht.
alter table public.restaurants
    add column if not exists min_order_value numeric(10,2) not null default 0;

alter table public.restaurants
    add column if not exists free_delivery_from numeric(10,2) not null default 0;


-- ---- TEIL C: NACHSEHEN, OB ES GEKLAPPT HAT ---------------------------
select column_name as spalte, data_type as typ, column_default as standard
  from information_schema.columns
 where table_schema = 'public' and table_name = 'restaurants'
   and column_name in ('min_order_value', 'free_delivery_from')
 order by column_name;
-- Erwartet: zwei Zeilen, beide numeric, beide Standard 0.

select name                as betrieb,
       delivery_fee        as liefergebuehr,
       min_order_value     as mindestbestellwert,
       free_delivery_from  as gratis_ab
  from public.restaurants
 where is_active is not false
 order by name;
-- Erwartet: ueberall 0 beim Mindestbestellwert.
--
-- DANACH IM DASHBOARD NEU EINTRAGEN.
-- Die 15 Euro, die dort stehen, kommen aus dem Browser des Wirts. Erst
-- ein erneutes Speichern legt sie wirklich in der Datenbank ab -- und
-- erst dann sieht sie der Gast. Die Meldung unten muss danach
-- "Mindestbestellwert: 15 EUR" lauten und NICHT "Nur auf diesem Geraet
-- gespeichert".
