-- Schritt 9 -- DAS GAENZE IN EINEM DURCHGANG.
--
-- Fuer den Fall, dass Abschnitt-fuer-Abschnitt zu umstaendlich ist.
-- Inhaltlich identisch mit 08, nur ohne die Pausen dazwischen.
--
--
-- WAS DAS HIER TUT
-- ----------------
-- Es macht drei Tabellen zu: order_items, reservations, orders.
-- Danach kann sie nur noch lesen, wer angemeldet ist UND zu dem Betrieb
-- gehoert. Bestellen und Reservieren bleibt fuer jeden moeglich -- das
-- muss so, sonst steht der Laden.
--
-- customers wird NICHT angefasst. Daran haengt die Frage, wer ins
-- Dashboard darf; das machen wir spaeter und in Ruhe.
--
--
-- WARUM ES DIESMAL AM STUECK GEHEN DARF
-- -------------------------------------
-- Beim ersten Versuch (04) lief alles auf einmal und es ging schief.
-- Zwei Dinge sind heute anders:
--   1. 06 ist gelaufen und war gruen. Die Summen der fuenf Wirte ergaben
--      genau die Gesamtzahl des Superadmins (158 Bestellungen, 355
--      Reservierungen). Jede Zeile gehoert also genau einem Wirt und
--      wird ihm auch gezeigt. Das war beim ersten Mal NICHT geprueft --
--      dort wurde der Gast getestet, nicht die Wirte.
--   2. customers ist draussen. Genau die Tabelle war das Risiko, sich
--      selbst auszusperren.
--
--
-- WENN ETWAS NICHT STIMMT
-- -----------------------
-- Diese drei Zeilen machen alles rueckgaengig. Sofort wirksam, kein
-- Datenverlust. Am besten JETZT in ein zweites Editor-Fenster legen,
-- bevor du unten auf "Laufen" drueckst:
--
--     alter table public.order_items  disable row level security;
--     alter table public.reservations disable row level security;
--     alter table public.orders       disable row level security;
--
--
-- ZUERST: STIMMT DIE E-MAIL DES SUPERADMINS?
-- -----------------------------------------
-- AM 20.08.2026 GENAU HIER GESCHEITERT.
-- In customers stand als Superadmin ibo@kiekmolin.de. Angemeldet wird
-- sich aber mit dem Google-Konto ibo.kuran93@gmail.com. Fuer die
-- Datenbank sind das zwei verschiedene Menschen: kmi_email() liefert
-- die Google-Adresse, die steht in keiner Zeile, also ist der
-- Angemeldete weder Wirt noch Superadmin -- und sieht nichts.
--
-- Die Reservierungen waren nicht weg. Sie waren nur nicht mehr fuer
-- IHN sichtbar.
--
-- Gefunden wurde es in den Anmelde-Protokollen von Supabase
-- (auth_audit_logs): dort steht bei jeder Anmeldung actor_username.
-- Bei den fuenf Wirten passt sie -- La Piazza meldet sich als
-- lapiazzagreetsiel@gmail.com an, und genau so steht es in customers.
-- Nur die Zeile des Superadmins passte nicht.
--
-- Also VOR dem Zumachen einmal abgleichen:
--
--     select email, role, restaurant_id from public.customers
--      order by role nulls last, email;
--
-- Und dann in Supabase unter Authentication -> Users nachsehen, mit
-- welchen Adressen sich tatsaechlich jemand anmeldet. Jede Adresse aus
-- der Anmeldung MUSS in customers stehen, sonst sieht dieser Mensch
-- nach dem Zumachen nichts mehr.
--
-- Korrigiert wird es in einer Zeile, zum Beispiel:
--
--     update public.customers
--        set email = 'ibo.kuran93@gmail.com'
--      where email = 'ibo@kiekmolin.de';
--
--
-- SO GEHT ES
-- ----------
--   1. Alles hier markieren (Cmd+A) und einfuegen
--   2. Auf "Laufen" druecken
--   3. Dashboard aufmachen: sind Bestellungen und Reservierungen da?
--   4. Bescheid sagen -- ich schaue dann in die Fehlerprotokolle
--
-- Sind die Zahlen weg: die drei Zeilen oben einfuegen, laufen lassen,
-- fertig. Es ist nichts kaputt, nur zu.


-- =====================================================================
-- ABSCHNITT 1 -- order_items      (kleinster Schaden)
-- =====================================================================
-- Ruecknahme:  alter table public.order_items disable row level security;
--
-- Warum zuerst: die Bestellpositionen liest im Dashboard fast nichts
-- direkt -- die Gerichte stehen zusaetzlich in der items-Spalte der
-- Bestellung. Geht hier etwas schief, faellt es auf, ohne dass der
-- Betrieb steht.

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'order_items'
    loop
        execute format('drop policy %I on public.order_items', r.policyname);
    end loop;
end $$;

-- Der Helfer prueft ueber die Bestellung, zu der die Position gehoert.
-- security definer, weil orders gleich selbst zu ist.
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

create policy "Positionen des eigenen Hauses lesen"
    on public.order_items for select to authenticated
    using (public.kmi_bestellung_ist_meine(order_id));

-- Anlegen muss offen bleiben: die App schreibt die Positionen direkt
-- nach der Bestellung, da ist der Gast nicht angemeldet.
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

alter table public.order_items enable row level security;

-- =====================================================================
-- ABSCHNITT 2 -- reservations
-- =====================================================================
-- Ruecknahme:  alter table public.reservations disable row level security;
--
-- Die freien Zeiten holt der Gast seit PR #180 ueber
-- /.netlify/functions/res-availability -- die laeuft mit dem
-- Dienstschluessel und faellt nicht unter RLS. Das muss deployed sein.

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'reservations'
    loop
        execute format('drop policy %I on public.reservations', r.policyname);
    end loop;
end $$;

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

alter table public.reservations enable row level security;

-- =====================================================================
-- ABSCHNITT 3 -- orders           (das Herzstueck)
-- =====================================================================
-- Ruecknahme:  alter table public.orders disable row level security;
--
-- Hier haengt der laufende Betrieb dran. Am besten zu einer ruhigen
-- Zeit -- nicht Freitag um sieben.

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'orders'
    loop
        execute format('drop policy %I on public.orders', r.policyname);
    end loop;
end $$;

create policy "Bestellungen des eigenen Hauses lesen"
    on public.orders for select to authenticated
    using (
        restaurant_id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    );

create policy "Jeder darf bestellen"
    on public.orders for insert to anon, authenticated
    with check (restaurant_id is not null);

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

create policy "Nur der Superadmin loescht Bestellungen"
    on public.orders for delete to authenticated
    using (public.kmi_ist_superadmin());

alter table public.orders enable row level security;


-- =====================================================================
-- GEGENPROBE -- laeuft gleich mit
-- =====================================================================
-- Erwartet: 12 Zeilen. In "fuer_alle" steht ueberall "nein" -- ausser
-- bei genau drei Anlege-Regeln (INSERT), die "JA -- anon" zeigen
-- MUESSEN, damit Gaeste weiter bestellen und reservieren koennen.
--
-- Steht bei einer SELECT-Zeile "JA -- anon", ist das Loch noch offen.
select tablename  as tabelle,
       cmd        as recht,
       policyname as regel,
       case when 'anon' = any(roles) then 'JA -- anon' else 'nein' end as fuer_alle
  from pg_policies
 where schemaname = 'public'
   and tablename in ('orders','order_items','reservations')
 order by tablename, cmd;
