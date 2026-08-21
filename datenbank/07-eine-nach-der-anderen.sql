-- Schritt 7 -- zumachen, aber EINE TABELLE NACH DER ANDEREN.
--
-- ============================================================
-- NICHT AM STUECK AUSFUEHREN.
-- ============================================================
-- Dieses Skript hat vier Abschnitte. Jeder ist einzeln zu markieren
-- und auszufuehren, und nach jedem wird geprueft, bevor es weitergeht.
--
-- Beim ersten Versuch (Schritt 04) lief alles auf einmal. Als es
-- schiefging, war unklar welche der vier Tabellen schuld war -- und der
-- Laden stand, waehrend wir suchten. Das passiert nicht nochmal.
--
-- Die Reihenfolge ist nach Schadensgroesse sortiert: vorne das, was am
-- wenigsten kaputtmachen kann.
--
--
-- VORBEDINGUNG
-- ------------
-- datenbank/06-erst-pruefen.sql ist gelaufen UND die Tabelle in
-- Abschnitt 2 zeigt bei JEDEM Wirt:
--     sichtbar_bestellungen = vorhanden_bestellungen
-- Steht dort irgendwo eine 0, wo etwas vorhanden ist: NICHT WEITER.
--
-- Und der Browser-Gegentest aus Abschnitt 4 gibt die E-Mail des
-- angemeldeten Wirts zurueck, nicht null.
--
--
-- WENN ETWAS SCHIEFGEHT
-- ---------------------
-- Jeder Abschnitt hat seine Ruecknahme in der ersten Zeile. Eine Zeile,
-- sofort wirksam:
--     alter table public.<tabelle> disable row level security;
-- Damit ist genau diese Tabelle wieder offen, die anderen bleiben, wie
-- sie sind.


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

-- JETZT PRUEFEN, BEVOR ES WEITERGEHT:
--   [ ] Dashboard oeffnen -- Bestellungen sind noch da
--   [ ] Eine Bestellung anklicken -- die Gerichte stehen drin
--   [ ] Als Gast bestellen -- geht durch
-- Erst wenn alle drei stimmen: Abschnitt 2.


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

-- JETZT PRUEFEN:
--   [ ] Dashboard -- Reservierungen sind da, Kalender und Tischplan auch
--   [ ] Eine Reservierung bestaetigen -- geht
--   [ ] Als Gast reservieren -- freie Zeiten erscheinen, Anfrage geht durch
-- Erst dann: Abschnitt 3.


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

-- JETZT PRUEFEN -- das ist die wichtigste Runde:
--   [ ] Dashboard -- Bestellungen sind da
--   [ ] Eine Bestellung annehmen -- Status aendert sich
--   [ ] Als Gast bestellen -- geht durch
--   [ ] Als Gast "Meine Bestellungen" -- die eigene steht da
--   [ ] Der Live-Banner erscheint
-- Erst dann: Abschnitt 4.


-- =====================================================================
-- ABSCHNITT 4 -- customers
-- =====================================================================
-- Ruecknahme:  alter table public.customers disable row level security;
--
-- ZULETZT UND MIT BEDACHT. Hier haengt checkIfGastronom() dran -- die
-- Funktion, die nach dem Login entscheidet, ob jemand Wirt oder Admin
-- ist. Geht das schief, kommt niemand mehr ins Dashboard, auch du
-- nicht. Die Ruecknahme oben deshalb bitte vorher irgendwo offen haben.

do $$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'customers'
    loop
        execute format('drop policy %I on public.customers', r.policyname);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- ZUERST DIE ROLLENSPERRE -- sonst ist alles Uebrige umsonst.
-- ---------------------------------------------------------------------
-- Hier stand vorher:
--     create policy "Angemeldete legen ihre Kundenzeile an"
--         on public.customers for insert to authenticated
--         with check (true);
--
-- Das war ein Loch, durch das das ganze Zumachen gefallen waere.
-- kmi_ist_superadmin() fragt customers.role ab. Wer sich anmelden kann
-- -- und das kann jeder mit einem Google-Konto -- haette sich eine
-- Zeile mit der eigenen E-Mail und role = 'superadmin' angelegt und
-- danach JEDE Bestellung, JEDE Reservierung und JEDEN Kunden gelesen.
-- Dieselbe Luecke bei UPDATE: die eigene Zeile aendern durfte man, und
-- role gehoert zur eigenen Zeile.
--
-- Mit Regeln allein ist das nicht dicht zu bekommen: in einer
-- with-check-Bedingung kommt man an den ALTEN Wert nicht heran. Also
-- ein Ausloeser, der role und restaurant_id festnagelt.
create or replace function public.kmi_rolle_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Der SQL-Editor und Migrationen laufen ohne Anmelde-Token. Ohne
    -- diese Zeile wuerdest DU dir beim Anlegen eines Wirts die Rolle
    -- wieder wegloeschen.
    if auth.jwt() is null then return new; end if;
    -- Die Netlify-Funktionen laufen mit dem Dienstschluessel. Der geht
    -- an RLS vorbei, aber NICHT an Ausloesern -- deshalb hier nochmal.
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
    -- Und der echte Superadmin darf Rollen vergeben.
    if public.kmi_ist_superadmin() then return new; end if;

    if tg_op = 'INSERT' then
        -- Ein Gast, der sich anmeldet, bekommt eine blanke Zeile.
        new.role := null;
        new.restaurant_id := null;
        return new;
    end if;
    -- Bei Aenderungen bleiben beide Felder, wie sie waren. Kein Fehler,
    -- kein Abbruch -- der Rest der Aenderung geht durch, nur diese zwei
    -- Felder ruehrt sich niemand selbst.
    new.role := old.role;
    new.restaurant_id := old.restaurant_id;
    return new;
end $$;

drop trigger if exists kmi_rolle_schuetzen on public.customers;
create trigger kmi_rolle_schuetzen
    before insert or update on public.customers
    for each row execute function public.kmi_rolle_schuetzen();

-- ---------------------------------------------------------------------
-- Und jetzt die Regeln.
-- ---------------------------------------------------------------------
-- Lesen: die eigene Zeile, oder der Superadmin alles.
create policy "Eigene Kundenzeile lesen"
    on public.customers for select to authenticated
    using (
        lower(trim(email)) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

-- Anlegen nur mit der EIGENEN E-Mail. Ohne das koennte jeder
-- Angemeldete Zeilen auf fremde Adressen anlegen -- und ueber die
-- Stammkundenkarte oder die Bestellhistorie an fremde Daten kommen.
create policy "Angemeldete legen ihre eigene Kundenzeile an"
    on public.customers for insert to authenticated
    with check (
        lower(trim(email)) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

create policy "Eigene Kundenzeile aendern"
    on public.customers for update to authenticated
    using (
        lower(trim(email)) = public.kmi_email()
        or public.kmi_ist_superadmin()
    )
    with check (
        lower(trim(email)) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

create policy "Nur der Superadmin loescht Kunden"
    on public.customers for delete to authenticated
    using (public.kmi_ist_superadmin());

alter table public.customers enable row level security;

-- JETZT PRUEFEN:
--   [ ] Abmelden, wieder anmelden -- kommst du ins Dashboard?
--   [ ] Ein Wirt meldet sich an -- sieht er sein Haus?
--   [ ] Admin-Bereich: Kundenliste ist da (nur als Superadmin)
--   [ ] Einen Wirt anlegen und ihm ein Haus zuordnen -- geht noch
--       (der Ausloeser laesst dich als Superadmin durch)
--
-- UND DIE ROLLENSPERRE SELBST PRUEFEN. Als normaler Gast angemeldet,
-- in der Browser-Konsole:
--
--   fetch(SUPABASE_URL + '/rest/v1/customers', {
--     method: 'PATCH',
--     headers: { apikey: SUPABASE_KEY,
--                Authorization: 'Bearer ' + kmiToken(),
--                'Content-Type': 'application/json',
--                Prefer: 'return=representation' },
--     body: JSON.stringify({ role: 'superadmin' })
--   }).then(r => r.json()).then(console.log)
--
-- Erwartet: die Zeile kommt zurueck, aber role steht weiter auf null.
-- Steht dort 'superadmin', ist der Ausloeser nicht aktiv -- dann sofort
-- die Ruecknahme oben fahren.


-- =====================================================================
-- GEGENPROBE -- nach allen vier Abschnitten
-- =====================================================================
-- Erwartet: 16 Regeln. In "fuer_alle" steht "nein" -- ausser bei genau
-- drei Anlege-Regeln (orders, order_items, reservations), die anon
-- enthalten MUESSEN, damit Gaeste bestellen und reservieren koennen.
-- Steht bei einer SELECT-Regel "JA -- anon", ist das Loch noch offen.
select tablename as tabelle,
       cmd       as recht,
       policyname as regel,
       case when 'anon' = any(roles) then 'JA -- anon' else 'nein' end as fuer_alle
  from pg_policies
 where schemaname = 'public'
   and tablename in ('orders','order_items','reservations','customers')
 order by tablename, cmd;

-- Und die Rollensperre muss stehen -- ohne sie ist alles darueber
-- umsonst. Erwartet: genau eine Zeile.
select tgname as ausloeser,
       tgenabled as aktiv          -- 'O' heisst: laeuft
  from pg_trigger
 where tgrelid = 'public.customers'::regclass
   and tgname = 'kmi_rolle_schuetzen';

-- Und die harte Probe: als NICHT angemeldeter Gast in der
-- Browser-Konsole eines privaten Fensters:
--
--   fetch(SUPABASE_URL + '/rest/v1/orders?select=customer_name&limit=5',
--         { headers: { apikey: SUPABASE_KEY,
--                      Authorization: 'Bearer ' + SUPABASE_KEY } })
--     .then(r => r.json()).then(console.log)
--
-- Erwartet: eine LEERE Liste [].
