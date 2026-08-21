-- Warum sah das Dashboard nach Schritt 04 nichts mehr?
--
-- NUR LESEN. Dieses Skript aendert NICHTS. Es beantwortet die Frage,
-- bevor wir noch einmal etwas zumachen -- der letzte Versuch hat den
-- Laden lahmgelegt, das reicht.
--
-- WICHTIG FUERS ABLESEN
-- Chrome uebersetzt die Supabase-Oberflaeche. Aus "superadmin" wird dann
-- "Superadministrator", aus "restaurant" wird "Restaurant". Fuer diese
-- Abfragen die Uebersetzung bitte ABSCHALTEN (Rechtsklick auf die Seite
-- -> "Fuer Deutsch nie uebersetzen"), sonst lesen wir Werte ab, die so
-- nicht in der Datenbank stehen.


-- =====================================================================
-- 1. Passt die Rolle GENAU so, wie die Regel sie erwartet?
-- =====================================================================
-- kmi_ist_superadmin() vergleicht buchstabengenau mit 'superadmin'.
-- Steht dort 'Superadmin' oder 'SUPERADMIN', greift die Regel nicht.
-- Die Laenge deckt auch unsichtbare Leerzeichen am Ende auf.
select email,
       role                        as rolle_roh,
       length(role)                as zeichen,
       role = 'superadmin'         as passt_auf_superadmin,
       lower(trim(role)) = 'superadmin' as wuerde_passen_wenn_egal,
       restaurant_id
  from customers
 order by email;


-- =====================================================================
-- 2. DIE ENTSCHEIDENDE FRAGE
-- =====================================================================
-- Die Regel laesst einen Wirt genau die Bestellungen sehen, deren
-- restaurant_id einem seiner Eintraege in customers entspricht.
--
-- Wenn hier bei einem Wirt 0 steht, obwohl er Bestellungen hat, dann
-- passen die beiden Kennungen nicht zueinander -- und DANN war das die
-- Ursache, nicht die Anmeldung.
--
-- Erwartet: bei jedem aktiven Betrieb eine Zahl groesser 0.
select c.email,
       c.restaurant_id,
       r.name                                              as betrieb,
       (select count(*) from orders o
         where o.restaurant_id = c.restaurant_id)          as bestellungen,
       (select count(*) from reservations v
         where v.restaurant_id = c.restaurant_id)          as reservierungen
  from customers c
  left join restaurants r on r.id = c.restaurant_id
 where c.restaurant_id is not null
 order by c.email;


-- =====================================================================
-- 3. Gibt es Bestellungen, die zu KEINEM Wirt gehoeren?
-- =====================================================================
-- Solche waeren nach Schritt 04 fuer niemanden mehr sichtbar gewesen --
-- auch nicht fuer den Betrieb, der sie bekommen hat.
select o.restaurant_id,
       r.name                as betrieb,
       count(*)              as bestellungen,
       max(o.created_at)     as letzte
  from orders o
  left join restaurants r on r.id = o.restaurant_id
 where not exists (select 1 from customers c where c.restaurant_id = o.restaurant_id)
 group by o.restaurant_id, r.name
 order by letzte desc nulls last;


-- =====================================================================
-- 4. Stehen die Helfer aus Schritt 02 ueberhaupt?
-- =====================================================================
-- Ohne sie liefert jede Regel aus Schritt 04 "nein" -- fuer alle.
-- Erwartet: drei Zeilen, alle mit sicherheitsdefinierer = true.
select p.proname                as helfer,
       p.prosecdef              as sicherheitsdefinierer,
       pg_get_userbyid(p.proowner) as gehoert
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('kmi_email', 'kmi_ist_superadmin', 'kmi_meine_haeuser')
 order by p.proname;


-- =====================================================================
-- 5. Der Gegentest -- IM BROWSER, nicht hier
-- =====================================================================
-- Im SQL-Editor bist du der Datenbank-Besitzer, nicht der angemeldete
-- Wirt. auth.jwt() ist hier leer, kmi_email() gibt deshalb IMMER null
-- zurueck -- das sagt nichts ueber die App aus.
--
-- Also: als Wirt im Dashboard anmelden, dann die Browser-Konsole
-- oeffnen (F12) und das hier eintippen:
--
--   fetch(SUPABASE_URL + '/rest/v1/rpc/kmi_email', {
--     method: 'POST',
--     headers: { apikey: SUPABASE_KEY,
--                Authorization: 'Bearer ' + kmiToken(),
--                'Content-Type': 'application/json' },
--     body: '{}'
--   }).then(r => r.json()).then(console.log)
--
-- Erwartet: die E-Mail des angemeldeten Wirts, klein geschrieben.
-- Kommt null, erreicht das Token die Datenbank nicht -- und DANN liegt
-- es an der Anmeldung, nicht an den Daten.
--
-- Damit das geht, muss der Helfer aufrufbar sein:
--   grant execute on function public.kmi_email() to anon, authenticated;
-- (stand schon in Schritt 02, hier nur zur Erinnerung)
