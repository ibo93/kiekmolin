-- Schritt 6 -- HERAUSFINDEN, ob das Zumachen diesmal gutgeht.
--
-- DIESES SKRIPT AENDERT NICHTS AN DEN ZUGRIFFSRECHTEN.
-- Es legt nur Helfer an und beantwortet eine Frage:
--
--     "Wenn wir jetzt zumachen -- was wuerde jeder Wirt sehen?"
--
-- Beim ersten Versuch (Schritt 04) habe ich das nicht gefragt. Ich habe
-- umgeschaltet und geprueft, ob der GAST noch klarkommt. Ob die WIRTE
-- noch an ihre Bestellungen kommen, stand nirgends in der Gegenprobe.
-- Das Ergebnis war ein Dashboard ohne Bestellungen und ohne
-- Reservierungen, mitten im Betrieb.
--
-- Deshalb hier: erst die Antwort, dann die Entscheidung.
--
-- HINWEIS ZUM ABLESEN
-- Chrome uebersetzt die Supabase-Oberflaeche. Aus "superadmin" wird
-- "Superadministrator". Fuer diese Abfragen die Uebersetzung bitte
-- abschalten (Rechtsklick -> "Fuer Deutsch nie uebersetzen").


-- =====================================================================
-- 1. Die Helfer -- diesmal nachsichtiger und pruefbar
-- =====================================================================
-- Zwei Aenderungen gegenueber Schritt 02:
--
-- a) TOLERANTER. Vorher wurde die Rolle buchstabengenau mit
--    'superadmin' verglichen. Steht in der Datenbank 'Superadmin' oder
--    'superadmin ' (mit Leerzeichen), greift das nicht -- und niemand
--    sieht, warum. Jetzt: klein geschrieben und ohne Raender.
--
-- b) PRUEFBAR. Jeder Helfer gibt es jetzt zweimal: einmal fuer den
--    gerade Angemeldeten (wie bisher) und einmal fuer eine beliebige
--    E-Mail. Nur so laesst sich VORHER ausrechnen, was ein bestimmter
--    Wirt sehen wuerde -- im SQL-Editor ist man naemlich der
--    Datenbank-Besitzer, nicht der Wirt, und auth.jwt() ist dort leer.

create or replace function public.kmi_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
$$;

-- Fuer eine beliebige E-Mail: ist das ein Superadmin?
create or replace function public.kmi_ist_superadmin_fuer(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.customers c
        where lower(trim(c.email)) = lower(trim(coalesce(p_email, '')))
          and lower(trim(coalesce(c.role, ''))) = 'superadmin'
    );
$$;

-- Fuer eine beliebige E-Mail: welche Haeuser gehoeren ihr?
create or replace function public.kmi_meine_haeuser_fuer(p_email text)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select c.restaurant_id
    from public.customers c
    where c.restaurant_id is not null
      and lower(trim(c.email)) = lower(trim(coalesce(p_email, '')));
$$;

-- Die beiden Namen, die in den Regeln stehen -- jetzt nur noch
-- Durchreichen an die pruefbaren Fassungen.
create or replace function public.kmi_ist_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.kmi_ist_superadmin_fuer(public.kmi_email());
$$;

create or replace function public.kmi_meine_haeuser()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select * from public.kmi_meine_haeuser_fuer(public.kmi_email());
$$;

grant execute on function public.kmi_email()                        to anon, authenticated;
grant execute on function public.kmi_ist_superadmin()               to anon, authenticated;
grant execute on function public.kmi_meine_haeuser()                to anon, authenticated;
grant execute on function public.kmi_ist_superadmin_fuer(text)      to anon, authenticated;
grant execute on function public.kmi_meine_haeuser_fuer(text)       to anon, authenticated;


-- =====================================================================
-- 2. DIE ENTSCHEIDENDE TABELLE
-- =====================================================================
-- Fuer jeden Eintrag in customers: was waere nach dem Zumachen
-- sichtbar, und was ist tatsaechlich da?
--
-- SO IST ES RICHTIG:
--   sichtbar_bestellungen  =  vorhanden_bestellungen
--
-- STEHT IRGENDWO EINE 0 BEI "sichtbar", OBWOHL "vorhanden" GROESSER
-- IST -- DANN NICHT ZUMACHEN. Dann wuerde genau dieser Wirt sein
-- Dashboard leer vorfinden, so wie beim letzten Mal.
select c.email,
       coalesce(r.name, '(kein Betrieb zugeordnet)')     as betrieb,
       public.kmi_ist_superadmin_fuer(c.email)           as ist_superadmin,

       -- Was die neue Regel durchlassen wuerde
       (select count(*) from public.orders o
         where o.restaurant_id in (select public.kmi_meine_haeuser_fuer(c.email))
            or public.kmi_ist_superadmin_fuer(c.email))  as sichtbar_bestellungen,
       (select count(*) from public.reservations v
         where v.restaurant_id in (select public.kmi_meine_haeuser_fuer(c.email))
            or public.kmi_ist_superadmin_fuer(c.email))  as sichtbar_reservierungen,

       -- Was es fuer diesen Betrieb ueberhaupt gibt
       (select count(*) from public.orders o
         where o.restaurant_id = c.restaurant_id)        as vorhanden_bestellungen,
       (select count(*) from public.reservations v
         where v.restaurant_id = c.restaurant_id)        as vorhanden_reservierungen
  from public.customers c
  left join public.restaurants r on r.id = c.restaurant_id
 order by c.email;


-- =====================================================================
-- 3. Faellt irgendetwas hinten runter?
-- =====================================================================
-- Bestellungen, deren Betrieb keinem Eintrag in customers gehoert.
-- Die saehe nach dem Zumachen NIEMAND mehr -- ausser dem Superadmin.
-- Erwartet: keine Zeilen.
select coalesce(r.name, '(unbekannter Betrieb)') as betrieb,
       o.restaurant_id,
       count(*)          as verwaiste_bestellungen,
       max(o.created_at) as letzte
  from public.orders o
  left join public.restaurants r on r.id = o.restaurant_id
 where not exists (select 1 from public.customers c
                    where c.restaurant_id = o.restaurant_id)
 group by r.name, o.restaurant_id
 order by letzte desc nulls last;


-- =====================================================================
-- DIE URSACHE VON LETZTEM MAL IST GEFUNDEN -- IM CODE, NICHT HIER
-- =====================================================================
-- Nachtrag, nachdem der Fehler eingegrenzt war. Es lag NICHT an den
-- Daten. Die Tabelle unten wird trotzdem gebraucht, aber der Grund
-- gehoert hierher, damit ihn niemand ein zweites Mal sucht.
--
-- Es gibt zwei Wege ins Dashboard:
--
--   1. Passwort        (simpleLogin) -- setzt nur ein Flag im Browser.
--                      KEINE Supabase-Sitzung. Fuer die Datenbank ist
--                      dieser Benutzer ein Fremder, und jede Regel
--                      "to authenticated" laesst ihn aussen vor.
--   2. Google-Login    -- erzeugt eine echte Sitzung.
--
-- Der Verwaltungsbereich war NUR ueber Weg 1 erreichbar. Deshalb sah
-- das Dashboard nach Schritt 04 nichts mehr: es war nie angemeldet.
--
-- Im Code ist das behoben -- checkIfGastronom fuehrt einen Superadmin
-- jetzt ueber den Google-Login in den Verwaltungsbereich. VOR Schritt 07
-- muss dieser Stand aber deployed sein UND einmal so benutzt werden:
--
--     abmelden, dann per Google anmelden, nicht per Passwort.
--
-- Sonst passiert genau dasselbe wie beim letzten Mal.
--
-- (Auf demselben Weg kam heraus, dass das Admin-Passwort im Browser
--  gegen settings.admin_password verglichen wurde -- also mit dem
--  oeffentlichen Schluessel lesbar war. Auch behoben, siehe
--  netlify/functions/admin-login.js.)


-- =====================================================================
-- 4. Und der Gegentest aus der App -- IM BROWSER
-- =====================================================================
-- Die Tabelle oben rechnet mit E-Mails aus customers. Sie kann NICHT
-- wissen, mit welcher Adresse sich ein Wirt tatsaechlich anmeldet.
--
-- Also: als Wirt im Dashboard anmelden, F12 druecken, das hier
-- eintippen:
--
--   fetch(SUPABASE_URL + '/rest/v1/rpc/kmi_email', {
--     method: 'POST',
--     headers: { apikey: SUPABASE_KEY,
--                Authorization: 'Bearer ' + kmiToken(),
--                'Content-Type': 'application/json' },
--     body: '{}'
--   }).then(r => r.json()).then(console.log)
--
-- ERWARTET: die E-Mail des Wirts, klein geschrieben -- und sie muss in
-- der Tabelle aus Abschnitt 2 vorkommen.
--
-- Kommt null: das Token erreicht die Datenbank nicht. Dann liegt es an
-- der Anmeldung, nicht an den Daten, und Schritt 07 darf NICHT laufen.
--
-- Kommt eine Adresse, die oben NICHT in der Liste steht: dann meldet
-- sich der Wirt mit einer anderen E-Mail an, als in customers steht.
-- Das ist in einer Zeile behoben:
--   update customers set email = '<die aus der Konsole>' where id = '<seine id>';
