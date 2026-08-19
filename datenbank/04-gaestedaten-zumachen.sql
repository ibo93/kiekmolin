-- Schritt 4 -- die Gaestedaten zumachen. Das ist der wichtige Schritt.
--
-- LAEUFT ERST, WENN 03 GELAUFEN UND DER ZUGEHOERIGE CODE DEPLOYED IST.
-- Reihenfolge, nicht verhandelbar:
--   1. datenbank/03-bestellung-verfolgen.sql ausfuehren
--   2. SUPABASE_SERVICE_KEY in Netlify setzen (Site settings -> Environment)
--   3. Diesen Code deployen
--   4. Erst dann dieses Skript
-- Andersherum sieht der Gast seine eigene Bestellung nicht mehr.
--
--
-- Der Befund
-- ----------
-- orders, order_items, reservations und customers sind heute fuer jeden
-- lesbar, der den oeffentlichen Schluessel kennt -- und der steht im
-- Seitenquelltext. Darin stehen: Name, Telefonnummer, E-Mail,
-- Lieferadresse und Bestellhistorie jedes Gastes.
--
-- Die App hat das nicht nur zugelassen, sie hat es benutzt. In
-- "Meine Bestellungen" stand ein Feld "Telefonnummer" unter der
-- Ueberschrift "Anmelden". Angemeldet hat sich damit nie jemand -- die
-- Nummer ging unveraendert als Suchbegriff an die Datenbank:
--
--     orders?customer_phone=ilike.*<letzte 8 Ziffern>*&limit=30
--
-- Wer eine fremde Nummer eintippte, bekam deren letzte 30 Bestellungen.
-- Mit Namen. Mit Lieferadresse.
--
--
-- Was der Code jetzt stattdessen macht
-- ------------------------------------
-- Jede Bestellung hat ein Geheimnis (Schritt 03). Das Geraet, das
-- bestellt hat, merkt es sich. Alles, was ein Gast sehen darf, laeuft
-- ueber Server-Endpunkte, die nur genau das herausgeben:
--
--   order-track.js       die eigenen Bestellungen -- nur mit Geheimnis
--   order-exists.js      ja/nein: ist meine Bestellung angekommen?
--   order-counts.js      "X Bestellungen heute" -- nur Summen
--   res-availability.js  freie Zeiten -- nur Uhrzeit/Status/Tisch
--
-- Damit braucht der Gast keinen Lesezugriff mehr auf diese Tabellen.
-- Anlegen muss er weiterhin duerfen -- sonst kann er nicht bestellen.
--
--
-- Wer was duerfen soll
-- --------------------
--   Gast (nicht angemeldet)  bestellen und reservieren -- aber nichts lesen
--   Wirt (angemeldet)        alles zu SEINEM Haus lesen und aendern
--   Superadmin               alles, auch loeschen
--
--
-- VOR DEM AUSFUEHREN -- drei Dinge pruefen
-- ----------------------------------------
-- 1. Haben alle Bestellungen ein Geheimnis? (Gegenprobe aus Schritt 03)
--      select count(*) filter (where track_token is null) from orders;
--    Erwartet: 0
--
-- 2. Steht der Standard auf der Spalte, damit NEUE Bestellungen auch
--    eines bekommen? (Gegenprobe 1 aus Schritt 03)
--
-- 3. Ist SUPABASE_SERVICE_KEY in Netlify gesetzt? Ohne ihn antworten die
--    vier Endpunkte mit 503 -- absichtlich, damit eine fehlende
--    Einrichtung nicht wie "du hast nichts bestellt" aussieht. Aber der
--    Gast sieht dann eben nichts.
--
-- 4. Laufen die Agentur-Werkzeuge mit dem Dienstschluessel? sichtbarkeit/
--    und telefon-retter/ haengen an DERSELBEN Datenbank und lesen dort
--    auch Bestellungen und Reservierungen. Mit dem oeffentlichen
--    Schluessel bekommen sie ab hier leere Listen -- ohne Fehlermeldung.
--      node -e "console.log(require('./sichtbarkeit/lib/supabase').schluesselRolle())"
--      node -e "console.log(require('./telefon-retter/lib/supabase').schluesselRolle())"
--    Erwartet beide Male: service_role


-- EINE STELLE, DIE DANACH SCHWAECHER IST -- ehrlich gesagt
-- --------------------------------------------------------
-- submitGastroRegistration() prueft vor dem Anlegen, ob es die E-Mail
-- schon gibt:
--     customers?email=eq.<eingetippte Adresse>&select=id
-- Die Leseregel unten laesst nur die EIGENE Zeile durch. Das Feld ist
-- zwar aus dem Google-Login vorbefuellt, aber aenderbar -- tippt jemand
-- eine fremde Adresse ein, findet die Pruefung nichts und die
-- Registrierung laeuft durch. Vorher waere sie aufgefallen.
--
-- Das ist bewusst so gelassen: die Alternative waere, customers wieder
-- fuer jeden lesbar zu machen, und dann koennte man die Kundenliste
-- abgreifen. Ein moeglicher Doppeleintrag ist der kleinere Schaden.
--
-- Der richtige Riegel gehoert ohnehin in die Datenbank, nicht in die
-- App. Nachsehen, ob er schon da ist:
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.customers'::regclass and contype in ('u','p');
--
-- Steht dort nichts mit (email), dann -- nach einer Pruefung auf schon
-- vorhandene Doppelte --:
--
--   select lower(email), count(*) from customers
--    group by 1 having count(*) > 1;
--
--   create unique index if not exists customers_email_uniq
--       on public.customers (lower(email));


-- =====================================================================
-- 1. Helfer
-- =====================================================================
-- kmi_email(), kmi_ist_superadmin() und kmi_meine_haeuser() kommen aus
-- Schritt 02 und stehen schon. Hier kommt nur einer dazu.
--
-- "security definer" ist Pflicht: eine Regel auf order_items, die in
-- orders nachschlaegt, liefe sonst gegen die RLS von orders -- und die
-- macht dieses Skript ja gerade zu. Der Helfer laeuft mit den Rechten
-- seines Besitzers und kommt deshalb durch.
--
-- "set search_path" gehoert zwingend dazu, sonst koennte jemand mit
-- einem eigenen Schema eine falsche orders-Tabelle unterschieben.

create or replace function public.kmi_bestellung_ist_meine(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.orders o
        where o.id = p_order_id
          and (o.restaurant_id in (select public.kmi_meine_haeuser())
               or public.kmi_ist_superadmin())
    );
$$;

grant execute on function public.kmi_bestellung_ist_meine(uuid) to anon, authenticated;


-- =====================================================================
-- 2. orders
-- =====================================================================
alter table public.orders enable row level security;

-- Erst alles wegraeumen, was heute drauf liegt. Policies sind ein ODER:
-- bleibt eine einzige offene Regel stehen, war die ganze Arbeit umsonst.
do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'orders'
    loop
        execute format('drop policy %I on public.orders', r.policyname);
    end loop;
end $$;

-- Lesen: nur der Wirt, und nur sein Haus. KEIN anon.
create policy "Bestellungen des eigenen Hauses lesen"
    on public.orders for select to authenticated
    using (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    );

-- Anlegen: jeder. Das ist der Bestellvorgang selbst -- ohne diese Regel
-- kann niemand mehr bestellen.
--
-- restaurant_id muss gesetzt sein. Das ist keine Schikane: eine
-- Bestellung ohne Haus taucht in keinem Dashboard auf, kocht also
-- niemand -- sie waere nur Muell in der Tabelle.
create policy "Jeder darf bestellen"
    on public.orders for insert to anon, authenticated
    with check (restaurant_id is not null);

-- Aendern: nur der Wirt (annehmen, ablehnen, Status setzen).
-- Der Gast sagt ueber /.netlify/functions/ ab -- die laeuft mit dem
-- Dienstschluessel und faellt nicht unter RLS.
create policy "Nur der Wirt aendert Bestellungen"
    on public.orders for update to authenticated
    using (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    )
    with check (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    );

-- Loeschen: nur der Superadmin. Eine Bestellung ist ein Beleg.
create policy "Nur der Superadmin loescht Bestellungen"
    on public.orders for delete to authenticated
    using (public.kmi_ist_superadmin());


-- =====================================================================
-- 3. order_items
-- =====================================================================
-- Die einzelnen Positionen. Sie haengen an der Bestellung und muessen
-- genauso zu sein -- sonst liest man eben dort mit, was jemand bestellt
-- hat.
alter table public.order_items enable row level security;

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'order_items'
    loop
        execute format('drop policy %I on public.order_items', r.policyname);
    end loop;
end $$;

create policy "Positionen des eigenen Hauses lesen"
    on public.order_items for select to authenticated
    using (public.kmi_bestellung_ist_meine(order_id));

-- Anlegen: jeder. Die App schreibt die Positionen direkt nach der
-- Bestellung -- zu diesem Zeitpunkt ist der Gast nicht angemeldet.
create policy "Jeder darf Positionen anlegen"
    on public.order_items for insert to anon, authenticated
    with check (order_id is not null);

create policy "Nur der Wirt aendert Positionen"
    on public.order_items for update to authenticated
    using (public.kmi_bestellung_ist_meine(order_id))
    with check (public.kmi_bestellung_ist_meine(order_id));

create policy "Nur der Superadmin loescht Positionen"
    on public.order_items for delete to authenticated
    using (public.kmi_ist_superadmin());


-- =====================================================================
-- 4. reservations
-- =====================================================================
alter table public.reservations enable row level security;

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'reservations'
    loop
        execute format('drop policy %I on public.reservations', r.policyname);
    end loop;
end $$;

-- Lesen: nur der Wirt. Die freien Zeiten holt der Gast ueber
-- res-availability.js -- da kommen Uhrzeit, Personenzahl, Status und
-- Tisch heraus, aber kein Name.
create policy "Reservierungen des eigenen Hauses lesen"
    on public.reservations for select to authenticated
    using (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    );

create policy "Jeder darf reservieren"
    on public.reservations for insert to anon, authenticated
    with check (restaurant_id is not null);

create policy "Nur der Wirt aendert Reservierungen"
    on public.reservations for update to authenticated
    using (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    )
    with check (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    );

create policy "Nur der Superadmin loescht Reservierungen"
    on public.reservations for delete to authenticated
    using (public.kmi_ist_superadmin());


-- =====================================================================
-- 5. customers
-- =====================================================================
-- Hier stehen die Wirte selbst: Name, E-Mail, Telefon, Rolle, und
-- welchem Haus sie zugeordnet sind. Auch die Preisvereinbarungen.
alter table public.customers enable row level security;

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'customers'
    loop
        execute format('drop policy %I on public.customers', r.policyname);
    end loop;
end $$;

-- Lesen: die eigene Zeile, oder der Superadmin alles.
--
-- checkIfGastronom() laeuft direkt nach dem Google-Login und fragt
-- genau die eigene Zeile ab -- das geht damit weiter.
create policy "Eigene Kundenzeile lesen"
    on public.customers for select to authenticated
    using (
        lower(email) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

-- Anlegen: nur angemeldet. Die Registrierung verlangt ohnehin vorher
-- einen Google-Login (startRestaurantRegistration bricht sonst ab).
create policy "Angemeldete legen ihre Kundenzeile an"
    on public.customers for insert to authenticated
    with check (true);

create policy "Eigene Kundenzeile aendern"
    on public.customers for update to authenticated
    using (
        lower(email) = public.kmi_email()
        or public.kmi_ist_superadmin()
    )
    with check (
        lower(email) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

create policy "Nur der Superadmin loescht Kunden"
    on public.customers for delete to authenticated
    using (public.kmi_ist_superadmin());


-- =====================================================================
-- 6. Gegenprobe
-- =====================================================================
-- Erwartet: 16 Regeln -- pro Tabelle je eine fuer select, insert, update
-- und delete. In der Spalte "fuer_alle" steht ueberall "nein", ausser
-- bei genau drei Zeilen: den Anlege-Regeln von orders, order_items und
-- reservations. Die MUESSEN anon enthalten, sonst kann kein Gast mehr
-- bestellen oder reservieren.
--
-- Steht bei einer SELECT-Regel "JA -- anon", ist das Loch noch offen.
select tablename as tabelle,
       policyname as regel,
       cmd as recht,
       roles::text as rollen,
       case when 'anon' = any(roles) then 'JA -- anon' else 'nein' end as fuer_alle
  from pg_policies
 where schemaname = 'public'
   and tablename in ('orders', 'order_items', 'reservations', 'customers')
 order by tablename, cmd, policyname;


-- Und die harte Probe: laeuft RLS ueberhaupt?
-- Erwartet: vier Zeilen, ueberall rls_an = true.
select c.relname as tabelle, c.relrowsecurity as rls_an
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('orders', 'order_items', 'reservations', 'customers');


-- =====================================================================
-- 7. Danach von Hand nachsehen (3 Minuten, lohnt sich)
-- =====================================================================
-- a) Als GAST (privates Fenster, nicht angemeldet):
--      - eine Bestellung aufgeben        -> muss gehen
--      - "Meine Bestellungen" oeffnen     -> die eigene muss dastehen
--      - eine Reservierung anlegen        -> muss gehen, freie Zeiten
--                                            muessen erscheinen
--
-- b) Als WIRT (angemeldet):
--      - Dashboard oeffnen                -> Bestellungen muessen kommen
--      - eine Bestellung annehmen         -> Status muss sich aendern
--
-- c) Die Probe aufs Exempel -- im Browser eines NICHT angemeldeten
--    Fensters die Konsole oeffnen und eintippen:
--
--      fetch(SUPABASE_URL + '/rest/v1/orders?select=customer_name&limit=5',
--            { headers: { apikey: SUPABASE_KEY,
--                         Authorization: 'Bearer ' + SUPABASE_KEY } })
--        .then(r => r.json()).then(console.log)
--
--    Erwartet: eine LEERE Liste []. Kommen Namen zurueck, ist noch eine
--    offene Regel stehengeblieben -- dann Abschnitt 6 nochmal ansehen.
