-- NOTFALL: Zugriffskontrolle komplett abschalten. SOFORT AUSFUEHREN.
--
-- Nach Schritt 04 kamen im Dashboard keine Bestellungen und
-- Reservierungen mehr an.
--
-- WARUM DIESER WEG UND KEIN FEINERER
-- Ein Versuch, die Regeln "richtig" umzuschreiben, kann selbst wieder
-- schiefgehen -- ein Tippfehler im Policy-Namen, eine Tabelle vergessen,
-- und der Laden steht weiter. Diese vier Zeilen schalten die Pruefung
-- ganz ab. Sie koennen nicht halb wirken.
--
-- Das ist der Zustand VOR der ganzen Aktion. Die Daten waren nie weg --
-- sie waren nur hinter einer Tuer, die sich nicht mehr oeffnen liess.
--
-- JA, DAS MACHT DAS DATENLOCH WIEDER AUF. Bewusst. Ein Laden, der keine
-- Bestellungen sieht, ist der groessere Schaden -- und zwar sofort.
-- Zugemacht wird spaeter, nachdem geklaert ist, warum die Zuordnung
-- Wirt -> Betrieb nicht gegriffen hat.

alter table public.orders        disable row level security;
alter table public.order_items   disable row level security;
alter table public.reservations  disable row level security;
alter table public.customers     disable row level security;


-- Gegenprobe. Erwartet: vier Zeilen, ueberall rls_an = false.
select c.relname as tabelle, c.relrowsecurity as rls_an
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('orders', 'order_items', 'reservations', 'customers');


-- ============================================================
-- DANACH: WARUM IST ES SCHIEFGEGANGEN?
-- ============================================================
-- Diese drei Abfragen beantworten es. Ergebnisse an Claude schicken,
-- dann laesst sich 04 reparieren statt raten.
--
-- 1) Mit welcher E-Mail meldet sich der Wirt an, und welche steht in
--    customers? Wenn die sich unterscheiden (Gross-/Kleinschreibung,
--    andere Adresse), findet kmi_meine_haeuser() nichts.
--
--    select id, email, role, restaurant_id from customers order by email;
--
-- 2) Gibt es die Helfer aus Schritt 02 ueberhaupt?
--
--    select proname from pg_proc
--     where proname in ('kmi_email','kmi_ist_superadmin','kmi_meine_haeuser');
--
-- 3) Was sagen die Helfer, waehrend der Wirt angemeldet ist? (Im
--    SQL-Editor laeuft man als Datenbank-Besitzer, nicht als Wirt --
--    diese Abfrage gehoert deshalb in die BROWSER-Konsole der
--    angemeldeten App:)
--
--    fetch(SUPABASE_URL + '/rest/v1/rpc/kmi_meine_haeuser', {
--      method:'POST',
--      headers:{ apikey: SUPABASE_KEY,
--                Authorization: 'Bearer ' + kmiToken(),
--                'Content-Type':'application/json' },
--      body:'{}'
--    }).then(r=>r.json()).then(console.log)
--
--    Kommt eine leere Liste zurueck, ist genau das die Ursache.
