-- STEMPELKARTE -- neu gebaut, vom Server gefuehrt (21.10.2026).
--
-- Ibo: "mach das so gut, dass es fuer Kunden einfach ist und keine Fehler".
--
-- WAS VORHER FALSCH WAR (gemessen im Code, 21.10.2026)
-- ====================================================
--   1. Der BROWSER des Gastes schrieb die Stempel direkt in loyalty_stamps.
--      Jeder konnte sich 999 Gratis-Essen eintragen.
--   2. Bei jeder Bestellung lief ein zweiter Stempel-Aufruf mit
--      vertauschten Werten (Restaurant-ID als Telefonnummer).
--   3. Einloesen ging gar nicht -- versprochen wurde es trotzdem.
--   4. Der Stempel kam beim Absenden, auch fuer Bestellungen, die der Wirt
--      danach abgelehnt hat.
--   5. Keine Datei im Repo legte die Tabelle an.
--
-- WIE ES JETZT GEHT
-- =================
-- * Den Stempel vergibt die DATENBANK selbst (Trigger an orders), sobald
--   der Wirt die Bestellung annimmt -- egal ob im Dashboard, ueber die
--   Kasse oder sofort-bestaetigt. Genau einmal je Bestellung (eindeutiger
--   Eintrag in stempel_buchungen). Wird eine angenommene Bestellung
--   abgesagt, geht der Stempel zurueck.
-- * Einloesen: der Gast hakt im Warenkorb "einloesen" an
--   (orders.stempel_einloesen). Abgezogen wird beim Annehmen, in EINEM
--   Schritt (update ... where guthaben > 0) -- doppelt einloesen geht
--   nicht. Das Ergebnis steht in orders.stempel_ergebnis.
-- * Niemand ausser dem Server liest oder schreibt die Tabellen direkt
--   (RLS an, keine Regeln). Gast und Wirt gehen ueber die Funktionen
--   kmi_stempel_* unten, der Wirt nur fuer seine eigenen Haeuser.
-- * Der Wirt stellt ein, nach wie vielen Stempeln es was gibt
--   (stempel_ziel, 3-30) und was (stempel_belohnung).
--
-- EIN FEHLER HIER DARF NIE EINE BESTELLUNG AUFHALTEN. Der Trigger faengt
-- jeden Fehler ab und schreibt nur eine Warnung ins Postgres-Protokoll.
--
-- Einspielen: einmal im Supabase SQL-Editor ausfuehren. Mehrfach geht auch.
-- Ohne diese Datei zeigt die App beim Gast keine Stempelkarte und im
-- Dashboard den Satz, dass diese Datei fehlt -- nicht still "0 Stempel".

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.stempelkarten (
    restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
    telefon           text not null,              -- nur Ziffern, siehe kmi_tel()
    stempel           integer not null default 0, -- auf der aktuellen Karte
    guthaben          integer not null default 0, -- verdient, noch nicht eingeloest
    gesamt            integer not null default 0, -- alle Stempel je
    eingeloest        integer not null default 0,
    letzte_bestellung timestamptz,
    letzter_push      timestamptz,
    erstellt          timestamptz not null default now(),
    geaendert         timestamptz not null default now(),
    primary key (restaurant_id, telefon),
    constraint stempel_nicht_negativ check (stempel >= 0 and guthaben >= 0 and gesamt >= 0 and eingeloest >= 0)
);

create table if not exists public.stempel_buchungen (
    id            bigserial primary key,
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    telefon       text not null,
    order_id      text,
    art           text not null check (art in ('stempel', 'storno', 'einloesung', 'einloesung_zurueck', 'hand_stempel', 'hand_einloesung', 'umzug')),
    erstellt      timestamptz not null default now()
);
-- Je Bestellung hoechstens EIN Stempel, EINE Einloesung, EIN Storno.
create unique index if not exists stempel_buchungen_einmal
    on public.stempel_buchungen (order_id, art) where order_id is not null;
create index if not exists stempel_buchungen_haus on public.stempel_buchungen (restaurant_id, erstellt desc);

alter table public.stempelkarten     enable row level security;
alter table public.stempel_buchungen enable row level security;
-- Absichtlich KEINE Regeln: direkter Zugriff mit dem anon-Schluessel oder
-- einer Gast-Sitzung ist damit zu. Nur der Dienstschluessel und die
-- security-definer-Funktionen unten kommen heran.

alter table public.restaurants add column if not exists stempel_ziel      smallint not null default 10;
alter table public.restaurants add column if not exists stempel_belohnung text     not null default 'ein Gratis-Gericht';
alter table public.restaurants drop constraint if exists stempel_ziel_bereich;
alter table public.restaurants add constraint stempel_ziel_bereich check (stempel_ziel between 3 and 30);
alter table public.restaurants drop constraint if exists stempel_belohnung_laenge;
alter table public.restaurants add constraint stempel_belohnung_laenge check (char_length(stempel_belohnung) between 2 and 60);

alter table public.orders add column if not exists stempel_einloesen boolean not null default false;
alter table public.orders add column if not exists stempel_ergebnis  text;   -- 'eingeloest' | 'kein_guthaben' | 'zurueck'

-- ---------------------------------------------------------------------
-- 2. Telefonnummer vereinheitlichen
-- ---------------------------------------------------------------------
-- "0491 123 45", "+49 491 12345" und "0049491 12345" sind derselbe Gast.
create or replace function public.kmi_tel(p text)
returns text language sql immutable as $$
    select case
        when d is null or d = '' then null
        when d like '0049%' then '0' || substr(d, 5)
        -- ab 10 Ziffern: "+49 491 12345" (Festnetz mit kurzer Vorwahl) hat genau 10
        when d like '49%' and length(d) >= 10 then '0' || substr(d, 3)
        else d end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- ---------------------------------------------------------------------
-- 3. Buchen (nur intern -- vom Trigger und von den Wirt-Funktionen)
-- ---------------------------------------------------------------------
create or replace function public.kmi_stempel_plus(p_rid uuid, p_tel text, p_bestellung boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ziel integer;
begin
    select coalesce(stempel_ziel, 10) into ziel from restaurants where id = p_rid;
    insert into stempelkarten as k (restaurant_id, telefon, stempel, gesamt, letzte_bestellung)
    values (p_rid, p_tel, 1, 1, case when p_bestellung then now() end)
    on conflict (restaurant_id, telefon) do update
        set stempel = k.stempel + 1, gesamt = k.gesamt + 1,
            letzte_bestellung = case when p_bestellung then now() else k.letzte_bestellung end,
            geaendert = now();
    -- Karte voll: Belohnung gutschreiben, neue Karte beginnen
    update stempelkarten set guthaben = guthaben + stempel / ziel, stempel = stempel % ziel
     where restaurant_id = p_rid and telefon = p_tel and stempel >= ziel;
end $$;

create or replace function public.kmi_stempel_minus(p_rid uuid, p_tel text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ziel integer;
begin
    select coalesce(stempel_ziel, 10) into ziel from restaurants where id = p_rid;
    update stempelkarten set
        guthaben = case when stempel = 0 and guthaben > 0 then guthaben - 1 else guthaben end,
        stempel  = case when stempel > 0 then stempel - 1 when guthaben > 0 then ziel - 1 else 0 end,
        gesamt   = greatest(gesamt - 1, 0), geaendert = now()
     where restaurant_id = p_rid and telefon = p_tel;
end $$;

-- ---------------------------------------------------------------------
-- 4. Trigger an orders
-- ---------------------------------------------------------------------
create or replace function public.kmi_stempel_bestellung()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
    angenommen text[] := array['accepted', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'completed'];
    abgesagt   text[] := array['cancelled', 'canceled', 'rejected', 'declined'];
    rid uuid; tel text; aktiv boolean; ist_an boolean; war_an boolean; n integer;
begin
    begin
        tel := kmi_tel(new.customer_phone);
        if tel is null or length(tel) < 6 or new.restaurant_id is null then return new; end if;
        rid := new.restaurant_id::text::uuid;
        ist_an := coalesce(new.status, '') = any(angenommen);
        war_an := tg_op = 'UPDATE' and coalesce(old.status, '') = any(angenommen);
        select coalesce(features::text, '') like '%loyalty_points%' into aktiv from restaurants where id = rid;

        if ist_an and not war_an then
            -- ERST einloesen, DANN stempeln: die zehnte Bestellung fuellt die
            -- Karte, ihr Gratis-Gericht gibt es beim NAECHSTEN Mal.
            if new.stempel_einloesen then
                update stempelkarten set guthaben = guthaben - 1, eingeloest = eingeloest + 1, geaendert = now()
                 where restaurant_id = rid and telefon = tel and guthaben > 0;
                get diagnostics n = row_count;
                if n > 0 then
                    insert into stempel_buchungen (restaurant_id, telefon, order_id, art) values (rid, tel, new.id::text, 'einloesung') on conflict do nothing;
                end if;
                update orders set stempel_ergebnis = case when n > 0 then 'eingeloest' else 'kein_guthaben' end where id = new.id;
            end if;
            if aktiv then
                insert into stempel_buchungen (restaurant_id, telefon, order_id, art) values (rid, tel, new.id::text, 'stempel') on conflict do nothing;
                get diagnostics n = row_count;
                if n > 0 then perform kmi_stempel_plus(rid, tel, true); end if;
            end if;
        elsif war_an and coalesce(new.status, '') = any(abgesagt) then
            if exists (select 1 from stempel_buchungen where order_id = new.id::text and art = 'stempel') then
                insert into stempel_buchungen (restaurant_id, telefon, order_id, art) values (rid, tel, new.id::text, 'storno') on conflict do nothing;
                get diagnostics n = row_count;
                if n > 0 then perform kmi_stempel_minus(rid, tel); end if;
            end if;
            if exists (select 1 from stempel_buchungen where order_id = new.id::text and art = 'einloesung') then
                insert into stempel_buchungen (restaurant_id, telefon, order_id, art) values (rid, tel, new.id::text, 'einloesung_zurueck') on conflict do nothing;
                get diagnostics n = row_count;
                if n > 0 then
                    update stempelkarten set guthaben = guthaben + 1, eingeloest = greatest(eingeloest - 1, 0), geaendert = now()
                     where restaurant_id = rid and telefon = tel;
                    update orders set stempel_ergebnis = 'zurueck' where id = new.id;
                end if;
            end if;
        end if;
    exception when others then
        -- Die Bestellung geht IMMER durch. Der Fehler steht in postgres_logs.
        raise warning 'kmi_stempel_bestellung % fuer Bestellung %: %', sqlstate, new.id, sqlerrm;
    end;
    return new;
end $$;

drop trigger if exists kmi_stempel_bestellung on public.orders;
create trigger kmi_stempel_bestellung
    after insert or update of status on public.orders
    for each row execute function public.kmi_stempel_bestellung();

-- ---------------------------------------------------------------------
-- 5. Fuer den Gast: Stand je Haus und alle Karten
-- ---------------------------------------------------------------------
-- Gibt nur Zahlen heraus, keinen Namen, keine Bestellungen.
create or replace function public.kmi_stempel_stand(p_restaurant uuid, p_telefon text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
    select json_build_object(
        'aktiv',     coalesce(r.features::text, '') like '%loyalty_points%',
        'ziel',      coalesce(r.stempel_ziel, 10),
        'belohnung', coalesce(r.stempel_belohnung, 'ein Gratis-Gericht'),
        'stempel',   coalesce(k.stempel, 0),
        'guthaben',  coalesce(k.guthaben, 0),
        'gesamt',    coalesce(k.gesamt, 0))
    from restaurants r
    left join stempelkarten k on k.restaurant_id = r.id and k.telefon = kmi_tel(p_telefon)
    where r.id = p_restaurant;
$$;

create or replace function public.kmi_stempel_meine(p_telefon text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce(json_agg(json_build_object(
        'restaurant_id', k.restaurant_id,
        'aktiv',     coalesce(r.features::text, '') like '%loyalty_points%',
        'ziel',      coalesce(r.stempel_ziel, 10),
        'belohnung', coalesce(r.stempel_belohnung, 'ein Gratis-Gericht'),
        'stempel', k.stempel, 'guthaben', k.guthaben, 'gesamt', k.gesamt,
        'zuletzt', k.letzte_bestellung) order by k.letzte_bestellung desc nulls last), '[]'::json)
    from stempelkarten k join restaurants r on r.id = k.restaurant_id
    where k.telefon = kmi_tel(p_telefon) and length(kmi_tel(p_telefon)) >= 6 and k.gesamt > 0;
$$;

grant execute on function public.kmi_stempel_stand(uuid, text) to anon, authenticated;
grant execute on function public.kmi_stempel_meine(text)       to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Fuer den Wirt: Stammgaeste, von Hand stempeln/einloesen, Einstellungen
-- ---------------------------------------------------------------------
create or replace function public.kmi_stempel_darf(p_restaurant uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce(public.kmi_ist_superadmin(), false)
        or p_restaurant in (select public.kmi_meine_haeuser());
$$;

create or replace function public.kmi_stempel_liste(p_restaurant uuid)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
    if not kmi_stempel_darf(p_restaurant) then raise exception 'keine Berechtigung fuer dieses Lokal' using errcode = '42501'; end if;
    return (select coalesce(json_agg(json_build_object(
        'telefon', k.telefon, 'stempel', k.stempel, 'guthaben', k.guthaben, 'gesamt', k.gesamt,
        'eingeloest', k.eingeloest, 'zuletzt', k.letzte_bestellung,
        'name', (select o.customer_name from orders o where o.restaurant_id::text = p_restaurant::text
                   and kmi_tel(o.customer_phone) = k.telefon and coalesce(o.customer_name, '') <> ''
                 order by o.created_at desc limit 1))
        order by k.guthaben desc, k.letzte_bestellung desc nulls last), '[]'::json)
        from (select * from stempelkarten where restaurant_id = p_restaurant order by guthaben desc, letzte_bestellung desc nulls last limit 500) k);
end $$;

-- Von Hand: Gast war im Lokal (Stempel) oder loest an der Theke ein.
create or replace function public.kmi_stempel_hand(p_restaurant uuid, p_telefon text, p_art text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare tel text := kmi_tel(p_telefon); n integer;
begin
    if not kmi_stempel_darf(p_restaurant) then raise exception 'keine Berechtigung fuer dieses Lokal' using errcode = '42501'; end if;
    if tel is null or length(tel) < 6 then raise exception 'Telefonnummer zu kurz' using errcode = '22023'; end if;
    if p_art = 'stempel' then
        perform kmi_stempel_plus(p_restaurant, tel, false);
        insert into stempel_buchungen (restaurant_id, telefon, art) values (p_restaurant, tel, 'hand_stempel');
    elsif p_art = 'einloesen' then
        update stempelkarten set guthaben = guthaben - 1, eingeloest = eingeloest + 1, geaendert = now()
         where restaurant_id = p_restaurant and telefon = tel and guthaben > 0;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'kein Guthaben zum Einloesen' using errcode = '22023'; end if;
        insert into stempel_buchungen (restaurant_id, telefon, art) values (p_restaurant, tel, 'hand_einloesung');
    else
        raise exception 'unbekannte Aktion %', p_art using errcode = '22023';
    end if;
    return kmi_stempel_stand(p_restaurant, tel);
end $$;

grant execute on function public.kmi_stempel_liste(uuid)            to authenticated;
grant execute on function public.kmi_stempel_hand(uuid, text, text) to authenticated;
revoke execute on function public.kmi_stempel_plus(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.kmi_stempel_minus(uuid, text)         from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Alte Stempel uebernehmen (loyalty_stamps -> stempelkarten)
-- ---------------------------------------------------------------------
-- Nur Zeilen mit echter Restaurant-ID (die vertauschten Zeilen mit dem
-- Namen als Restaurant fallen weg). Laeuft nur, solange die neue Karte
-- des Gastes noch leer ist -- mehrfaches Ausfuehren zaehlt nichts doppelt.
do $$
begin
    if to_regclass('public.loyalty_stamps') is null then return; end if;
    execute $q$
        insert into public.stempelkarten (restaurant_id, telefon, stempel, guthaben, gesamt, eingeloest, letzte_bestellung, letzter_push)
        select r.id, x.tel,
               max(x.cnt) % coalesce(max(r.stempel_ziel), 10),
               greatest(max(x.verdient) - max(x.benutzt), 0),
               max(x.cnt), max(x.benutzt), max(x.zuletzt), max(x.push)
          from (select public.kmi_tel(customer_phone) as tel, restaurant_id::text as rid,
                       coalesce(stamps_count, 0) as cnt, coalesce(free_meals_earned, 0) as verdient,
                       coalesce(free_meals_used, 0) as benutzt, last_order_at as zuletzt, last_push_at as push
                  from public.loyalty_stamps) x
          join public.restaurants r on r.id::text = x.rid
         where x.tel is not null and length(x.tel) >= 6 and x.cnt > 0
         group by r.id, x.tel
        on conflict (restaurant_id, telefon) do nothing
    $q$;
exception when others then
    raise notice 'Alte Stempel nicht uebernommen: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Gegenprobe -- alle Zeilen muessen "ja" sagen
-- ---------------------------------------------------------------------
select 'Tabelle stempelkarten' as pruefung, case when to_regclass('public.stempelkarten') is not null then 'ja' else 'NEIN' end as ok
union all select 'Trigger an orders', case when exists (select 1 from pg_trigger where tgname = 'kmi_stempel_bestellung') then 'ja' else 'NEIN' end
union all select 'Gast kommt nicht direkt an die Tabelle (RLS an)', case when (select relrowsecurity from pg_class where oid = 'public.stempelkarten'::regclass) then 'ja' else 'NEIN' end
union all select 'Einstellungen am Restaurant', case when exists (select 1 from information_schema.columns where table_name = 'restaurants' and column_name = 'stempel_ziel') then 'ja' else 'NEIN' end
union all select 'Uebernommene Karten: ' || (select count(*) from public.stempelkarten)::text, 'ja';
