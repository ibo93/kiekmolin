-- Schritt 14 -- WARUM NIE EINE BENACHRICHTIGUNG ANKAM.
--
--
-- DER BEFUND
-- ----------
-- Aus den Datenbank-Protokollen:
--
--     column push_subscriptions.p256dh_key does not exist
--
-- Die Tabelle push_subscriptions sieht so aus:
--     id, customer_phone, customer_email, endpoint, keys (jsonb),
--     created_at, restaurant_id
--
-- Der Code schreibt und liest aber:
--     endpoint, p256dh_key, auth_key, user_agent, ...
--
-- Drei Spalten, die es nicht gibt. Die Tabelle wurde mit den beiden
-- Schluesseln in EINER jsonb-Spalte angelegt, der Code fuer zwei
-- getrennte Spalten geschrieben. Beides fuer sich in Ordnung, nur
-- passen sie nicht zusammen.
--
--
-- WAS DAS BEDEUTET
-- ----------------
-- Ein Geraet anmelden schlaegt fehl (400). Geraete auslesen schlaegt
-- fehl (400). Es wurde also nie ein Geraet gespeichert und nie eine
-- Meldung verschickt -- an niemanden, seit dem ersten Tag.
--
-- Der Betreiber hat monatelang gesucht, warum "die Benachrichtigungen
-- nicht durchkommen", und dabei zuerst an sein iPhone gedacht. Das war
-- naheliegend (auf iOS braucht Web Push wirklich die App auf dem
-- Home-Bildschirm) und trotzdem falsch. Es gab schlicht nichts zu
-- senden.
--
-- Betroffen sind ACHT Funktionen, nicht nur eine:
--     pending-reminder   Bestellung/Reservierung kommt herein
--     res-cancel         Gast sagt ab
--     waiter-call        Gast ruft den Kellner
--     loyalty-push       Stempelkarte
--     review-push        Bewertung nachfassen
--     marketing-push     Aktionen
--     waechter           Betriebs-Check
--     push-send          allgemeiner Versand
--
--
-- WARUM DIE DATENBANK ANGEPASST WIRD UND NICHT DER CODE
-- -----------------------------------------------------
-- Die acht Funktionen benutzen alle dieselben Namen -- p256dh_key,
-- auth_key. Drei Spalten hinzufuegen ist ein Schritt. Acht Dateien
-- umschreiben sind acht Gelegenheiten, eine zu vergessen; und die
-- vergessene faellt erst Wochen spaeter auf, wenn jemand nicht
-- benachrichtigt wird.
--
-- Die alte Spalte "keys" bleibt stehen. Sie wird nicht mehr befuellt,
-- aber vorhandene Zeilen werden daraus uebernommen. Loeschen kann man
-- sie spaeter, wenn sicher ist, dass nichts mehr daran haengt.
--
--
-- RUECKNAHME:
--     alter table public.push_subscriptions drop column if exists p256dh_key;
--     alter table public.push_subscriptions drop column if exists auth_key;
--     alter table public.push_subscriptions drop column if exists user_agent;
--     drop index if exists push_subscriptions_endpoint_key;


-- 1. Die drei fehlenden Spalten.
alter table public.push_subscriptions
    add column if not exists p256dh_key text,
    add column if not exists auth_key   text,
    add column if not exists user_agent text;


-- 2. Was in "keys" steht, uebernehmen. Falls es Zeilen aus einer
--    frueheren Fassung gibt, sollen die nicht verloren gehen.
update public.push_subscriptions
   set p256dh_key = coalesce(p256dh_key, keys ->> 'p256dh'),
       auth_key   = coalesce(auth_key,   keys ->> 'auth')
 where keys is not null;


-- 3. "keys" darf ab jetzt leer bleiben.
--    Steht dort NOT NULL, scheitert jede neue Anmeldung weiterhin --
--    der Code schickt diese Spalte gar nicht mit.
do $$
begin
    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'push_subscriptions'
           and column_name = 'keys'
           and is_nullable = 'NO'
    ) then
        alter table public.push_subscriptions alter column keys drop not null;
    end if;
end $$;


-- 4. Doppelte Endpunkte aufraeumen, den juengsten behalten.
--    Muss vor dem Index passieren, sonst scheitert er.
delete from public.push_subscriptions a
 using public.push_subscriptions b
 where a.endpoint = b.endpoint
   and a.created_at < b.created_at;


-- 5. Ein Geraet, eine Zeile.
--    Der Code meldet mit "?on_conflict=endpoint" an. Ohne diesen Index
--    antwortet PostgREST mit 400 -- der naechste Fehler, der sonst
--    direkt nach dem ersten gekommen waere.
create unique index if not exists push_subscriptions_endpoint_key
    on public.push_subscriptions (endpoint);


-- Gegenprobe. Erwartet: p256dh_key, auth_key und user_agent stehen dabei.
select column_name as spalte, data_type as art, is_nullable as darf_leer_sein
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'push_subscriptions'
 order by ordinal_position;


-- ============================================================
-- DANACH: DIE PROBE
-- ============================================================
-- 1. Auf dem Handy die App aufmachen (die vom Home-Bildschirm),
--    ins Dashboard, Benachrichtigungen erlauben.
-- 2. Dann hier nachsehen, ob das Geraet angekommen ist:
--
--        select created_at, restaurant_id,
--               left(coalesce(p256dh_key, ''), 12) as schluessel_anfang,
--               left(coalesce(user_agent, ''), 40) as geraet
--          from public.push_subscriptions
--         order by created_at desc
--         limit 10;
--
--    Steht hier eine Zeile mit einem Schluessel drin, ist die
--    Anmeldung zum ersten Mal durchgegangen.
--
-- 3. Von einem anderen Geraet eine Reservierung anlegen. Binnen einer
--    Minute muss die Meldung auf dem Handy sein.
--
--
-- DER SUPERADMIN -- SCHON MITGEBAUT
-- ---------------------------------
-- Die App speichert beim Anmelden die restaurant_id des Wirts. Der
-- Superadmin hat keine (restaurant_id ist bei ihm NULL), also fand ihn
-- keine der Funktionen, die nach restaurant_id sucht.
--
-- Auf Wunsch ("fuer mich waere es auch gut ... damit ich es alles
-- verfolgen kann") bekommt er jetzt die Meldungen aller Haeuser. Der
-- Weg dahin geht ueber die E-Mail, nicht ueber ein Haekchen:
--
--   Die App speichert beim Anmelden die Adresse des Superadmins in
--   customer_email. Der Server holt sich aus customers, WER Superadmin
--   ist, und schickt an die Geraete mit diesen Adressen.
--
-- Ein Haekchen "ich bin Admin" aus dem Browser waere mit dem
-- oeffentlichen Schluessel -- er steht im Seitenquelltext -- in einer
-- Zeile gefaelscht, und der Faelscher bekaeme jede Bestellung samt
-- Gastnamen aufs Handy. Ueber customers geht das nicht: dort kann sich
-- seit Schritt 11 niemand selbst zum Superadmin machen.
--
--
-- WAS DABEI OFFEN BLEIBT -- EHRLICH GESAGT
-- ----------------------------------------
-- push_subscriptions selbst ist noch offen: jeder mit dem oeffentlichen
-- Schluessel kann dort eine Zeile anlegen. Wer die E-Mail-Adresse des
-- Superadmins kennt, koennte ein eigenes Geraet unter dieser Adresse
-- eintragen und bekaeme ab da die Meldungen mit.
--
-- Das ist kein neues Loch -- die Tabelle stand vorher schon offen --
-- aber es wird durch diesen Schritt erstmals nutzbar. Sauber zu machen
-- ist es mit Regeln auf push_subscriptions, so wie bei den
-- Gaestedaten. Das ist ein eigener Schritt und gehoert nicht in eine
-- Datei, die eine kaputte Tabelle reparieren soll.
