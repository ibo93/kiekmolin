-- Schritt 10 -- NUR NOCH DER SCHALTER.
--
-- STAND AM 20.08.2026, 23:02 UHR
-- ------------------------------
-- Eine Abfrage auf pg_policies hat gezeigt: die zwoelf Regeln aus 09
-- sind alle da -- vier auf order_items, vier auf orders, vier auf
-- reservations, mit exakt den Namen aus dem Skript.
--
-- Trotzdem stand in pg_tables bei allen dreien rowsecurity = false.
--
-- WARUM DAS KEIN WIDERSPRUCH IST
-- ------------------------------
-- "alter table ... disable row level security" loescht keine Regeln.
-- Es legt nur den Schalter um. Die Regeln bleiben liegen und tun
-- nichts. Genau das ist passiert: 09 lief durch, danach wurden die
-- drei Ruecknahme-Zeilen aus dem Kopf von 09 ausgefuehrt.
--
-- Deshalb ist hier nichts mehr zu bauen. Es fehlt der Schalter.
--
--
-- ZU customers
-- ------------
-- Auf customers steht rowsecurity = true, aber die Tabelle hat eine
-- Regel namens "offen" mit cmd = ALL. Die laesst jeden durch. Die
-- Tabelle ist also faktisch offen, obwohl der Schalter an ist -- und
-- kann in diesem Zustand niemanden aussperren. customers bleibt
-- weiterhin aussen vor; das ist ein eigener Schritt.
--
--
-- RUECKNAHME -- VOR DEM AUSFUEHREN IN EIN ZWEITES FENSTER LEGEN
-- -------------------------------------------------------------
--     alter table public.order_items  disable row level security;
--     alter table public.reservations disable row level security;
--     alter table public.orders       disable row level security;
--
-- Sofort wirksam, kein Datenverlust, die Regeln bleiben liegen.


alter table public.order_items  enable row level security;
alter table public.reservations enable row level security;
alter table public.orders       enable row level security;


-- Gegenprobe. Erwartet: drei Zeilen, ueberall zugesperrt = true.
select tablename, rowsecurity as zugesperrt
  from pg_tables
 where schemaname = 'public'
   and tablename in ('orders', 'order_items', 'reservations')
 order by tablename;


-- ============================================================
-- DANACH: DIE EIGENTLICHE PROBE LAEUFT IM BROWSER
-- ============================================================
-- Die Abfrage oben sagt nur, dass der Schalter an ist. Sie sagt
-- nicht, ob die Wirte ihre Zeilen noch sehen -- im SQL-Editor laeuft
-- man als Datenbank-Besitzer und kommt an allem vorbei.
--
-- Also: Dashboard aufmachen und nachsehen, ob Bestellungen und
-- Reservierungen ankommen. Am besten bei zwei verschiedenen Betrieben.
--
-- Kommt nichts an, sind es die drei Zeilen von oben mit "disable".
-- Nicht suchen, nicht reparieren -- erst zurueck, dann nachsehen.
