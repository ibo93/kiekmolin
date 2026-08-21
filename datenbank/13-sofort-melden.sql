-- Schritt 13 -- ZWEI SPALTEN, DAMIT DER WIRT SOFORT BESCHEID WEISS.
--
--
-- WARUM
-- -----
-- "wenn eine bestellung oder resevierung reinkommt soll der gastronomen
--  auch das als benachrichtigung auf sein handy bekommen ... wenn abends
--  oder morgens eine resevierung reinkommt kann er so bestaetigen ...
--  von zuhause"
--
-- Es gab bisher nur eine MAHNUNG: pending-reminder meldete sich, wenn
-- etwas 20 Minuten lang unbeantwortet lag, und lief alle 10 Minuten.
-- Eine Reservierung um 21 Uhr erreichte den Wirt also fruehestens um
-- 21:20 -- und nur, wenn er bis dahin nicht reagiert hatte.
--
-- Eine Meldung BEIM EINGANG gab es nirgends. Im Dashboard sah er sie
-- sofort ueber den Echtzeit-Kanal, aber nur solange das Dashboard offen
-- war. Zu Hause kam nichts an.
--
--
-- WAS HIER PASSIERT
-- -----------------
-- Je eine neue Spalte auf orders und reservations, die leer sein darf.
-- Keine Regel wird angefasst, keine Zeile veraendert.
--
-- push_sent_at  =  wann die SOFORT-Meldung raus ist
-- reminder_sent_at (gibt es schon)  =  wann die ERINNERUNG raus ist
--
-- Zwei getrennte Spalten, weil es zwei verschiedene Meldungen sind.
-- Mit nur einer koennte der Melder nicht unterscheiden, ob er schon
-- "ist da" gesagt hat oder schon "liegt immer noch rum".
--
--
-- BESTEHENDE ZEILEN
-- -----------------
-- Alles, was jetzt schon offen in der Datenbank liegt, hat push_sent_at
-- = leer und wuerde beim ersten Durchlauf als "neu" gemeldet. Damit der
-- Wirt nicht mit alten Sachen ueberschuettet wird, werden die
-- bestehenden Zeilen unten gleich als gemeldet abgehakt.
--
--
-- RUECKNAHME:
--     alter table public.orders       drop column if exists push_sent_at;
--     alter table public.reservations drop column if exists push_sent_at;

alter table public.orders
    add column if not exists push_sent_at timestamptz;

alter table public.reservations
    add column if not exists push_sent_at timestamptz;


-- Was heute schon dasteht, gilt als gemeldet. Sonst kommen beim ersten
-- Durchlauf alle offenen Altfaelle auf einmal aufs Handy.
update public.orders
   set push_sent_at = now()
 where push_sent_at is null;

update public.reservations
   set push_sent_at = now()
 where push_sent_at is null;


-- Gegenprobe. Erwartet: zwei Zeilen, beide timestamp with time zone.
select table_name as tabelle, column_name as spalte, data_type as art
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('orders', 'reservations')
   and column_name = 'push_sent_at'
 order by table_name;


-- ============================================================
-- DANACH: DIE PROBE GEHT NUR MIT EINEM ECHTEN HANDY
-- ============================================================
-- 1. Auf dem Handy: Kiek mol in als App auf den Home-Bildschirm legen
--    (Teilen -> Zum Home-Bildschirm). Auf dem iPhone kommen Web-Pushs
--    NUR so an -- im Safari-Tab passiert gar nichts, ohne Fehlermeldung.
-- 2. Aus der App heraus ins Dashboard, Benachrichtigungen erlauben.
-- 3. Von einem anderen Geraet aus eine Reservierung anlegen.
-- 4. Binnen einer Minute muss die Meldung auf dem Handy sein.
--
-- Kommt nichts an, liegt es fast immer an Schritt 1.
