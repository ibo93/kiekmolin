-- AUSVERKAUFT UND PORTIONEN AUS DER KUECHE -- MORGEN FRUEH VON SELBST ZURUECK (09.11.2026).
--
-- Ibo hat das neue Kuechen-Display freigegeben ("Ja mach das"). Darin gibt
-- es "Gericht ausverkauft melden": der Koch tippt das Gericht an, und online
-- kann es sofort keiner mehr bestellen (is_available = false, wie bisher in
-- der Speisekarten-Verwaltung).
--
-- NEU ist nur der Tag. Ohne ihn blieb "ausverkauft" fuer immer stehen, bis
-- jemand daran dachte, es zurueckzunehmen -- und am naechsten Tag fehlte das
-- Lieblingsgericht auf der Karte. Mit ausverkauft_am gibt der naechtliche Lauf
-- (netlify/functions/ausverkauft-zurueck.js, 4 Uhr) alles frei, was an einem
-- frueheren Tag ausverkauft gemeldet wurde.
--
-- Gerichte, die in der Speisekarten-Verwaltung bewusst abgeschaltet wurden,
-- haben KEINEN Tag und bleiben aus. Nur, was die Kueche "heute" meldet, kommt
-- zurueck.
--
-- Rechte: unveraendert. Schreiben darf, wer die Speisekarte des Lokals
-- aendern darf (bestehende Regeln auf menu_items).
--
-- Einspielen: einmal im Supabase SQL-Editor ausfuehren. Mehrfach geht auch.
-- Ohne diese Datei klappt "ausverkauft" trotzdem -- das Kuechen-Display sagt
-- dann aber, dass es morgen NICHT von selbst zurueckkommt.

alter table public.menu_items add column if not exists ausverkauft_am date;
create index if not exists menu_items_ausverkauft_am on public.menu_items (ausverkauft_am) where ausverkauft_am is not null;

-- PORTIONEN ZAEHLEN (09.11.2026, Idee von den Mise-Fotos).
-- Die Kueche stellt ein, wie viele Portionen es heute noch gibt. Jede
-- Bestellung zieht ab (kmi_portionen_buchen, nur fuer den Server mit dem
-- Dienstschluessel), bei 0 ist das Gericht ausverkauft. Der naechtliche Lauf
-- setzt den Zaehler zurueck (portionen_am < heute). NULL = unbegrenzt.
alter table public.menu_items add column if not exists portionen_rest integer;
alter table public.menu_items add column if not exists portionen_am date;
alter table public.menu_items drop constraint if exists menu_items_portionen_nicht_negativ;
alter table public.menu_items add constraint menu_items_portionen_nicht_negativ check (portionen_rest is null or portionen_rest >= 0);

-- In EINEM Schritt: erst pruefen (Zeilen gesperrt), dann abziehen. Zwei Gaeste,
-- die gleichzeitig die letzte Portion bestellen, bekommen sie nicht beide.
create or replace function public.kmi_portionen_buchen(p_restaurant uuid, p_posten jsonb, p_art text default 'pruefen')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    v_rest integer;
    v_name text;
begin
    if p_art not in ('pruefen', 'erzwingen', 'zurueck') then
        raise exception 'p_art unbekannt: %', p_art;
    end if;
    if p_art = 'pruefen' then
        for r in select (e->>'id')::uuid as id, greatest(coalesce((e->>'menge')::int, 0), 0) as menge
                 from jsonb_array_elements(coalesce(p_posten, '[]'::jsonb)) e loop
            select portionen_rest, name into v_rest, v_name
              from public.menu_items where id = r.id and restaurant_id = p_restaurant for update;
            if v_rest is not null and v_rest < r.menge then
                return jsonb_build_object('ok', false, 'gericht', v_name, 'rest', v_rest);
            end if;
        end loop;
    end if;
    for r in select (e->>'id')::uuid as id, greatest(coalesce((e->>'menge')::int, 0), 0) as menge
             from jsonb_array_elements(coalesce(p_posten, '[]'::jsonb)) e loop
        if p_art = 'zurueck' then
            update public.menu_items
               set portionen_rest = portionen_rest + r.menge, is_available = true
             where id = r.id and restaurant_id = p_restaurant and portionen_rest is not null;
        else
            update public.menu_items
               set portionen_rest = greatest(portionen_rest - r.menge, 0),
                   is_available = (portionen_rest - r.menge) > 0
             where id = r.id and restaurant_id = p_restaurant and portionen_rest is not null;
        end if;
    end loop;
    return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.kmi_portionen_buchen(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.kmi_portionen_buchen(uuid, jsonb, text) to service_role;

-- PRUEFEN: muss drei Zeilen zeigen (ausverkauft_am, portionen_am, portionen_rest).
-- select column_name, data_type from information_schema.columns where table_name = 'menu_items' and column_name in ('ausverkauft_am', 'portionen_rest', 'portionen_am');
