-- Schritt 2 -- die offene Tuer bei restaurants schliessen.
--
-- LAEUFT ERST, WENN PR #176 DEPLOYED IST. Vorher schickt die App noch
-- ueberall den oeffentlichen Schluessel; dann sperrt dieses Skript den
-- Wirt aus seinem eigenen Dashboard aus.
--
--
-- Der Befund
-- ----------
-- Auf restaurants liegen heute drei Regeln:
--
--   "Allow all for restaurants"          ALL     {public}  true / true
--   "Insert restaurants"                 INSERT  {public}  -    / true
--   "Restaurants sind oeffentlich lesbar" SELECT {public}  is_active = true
--
-- Die dritte ist richtig und bleibt. Die erste ist das Problem: ALL heisst
-- SELECT + INSERT + UPDATE + DELETE in einer Regel, und "true" heisst
-- ohne jede Bedingung. Jeder, der den Schluessel aus dem Seitenquelltext
-- kennt, kann damit die Stammdaten aller 25 Betriebe aendern oder loeschen.
--
-- Dass daneben eine strenge SELECT-Regel steht, hilft nicht: Policies sind
-- ein ODER. Eine offene Regel hebt jede strenge daneben auf.
--
--
-- Wer was duerfen soll
-- --------------------
--   Gast (nicht angemeldet)  lesen, was aktiv ist                -- wie bisher
--   Wirt (angemeldet)        sein eigenes Haus lesen und aendern
--                            -- auch solange es noch nicht freigeschaltet ist
--   Wirt (angemeldet)        bei der Registrierung ein Haus anlegen
--   Superadmin               alles, auch loeschen
--
--
-- VOR DEM AUSFUEHREN: eine Zahl pruefen
-- -------------------------------------
-- Die bestehende Leseregel sagt "is_active = true". In SQL ist NULL nicht
-- gleich true. Steht bei einem Haus nichts drin, verschwindet es ab jetzt
-- aus der Gastansicht -- heute faellt das nicht auf, weil "Allow all"
-- ohnehin jede Zeile durchlaesst.
--
--   select count(*) filter (where is_active is true)  as aktiv,
--          count(*) filter (where is_active is false) as inaktiv,
--          count(*) filter (where is_active is null)  as ohne_angabe
--   from restaurants;
--
-- Steht bei "ohne_angabe" nicht 0, dann zuerst:
--   update restaurants set is_active = true where is_active is null;
-- (oder false -- je nachdem, ob die Haeuser live sein sollen.)


-- =====================================================================
-- 1. Wer bin ich?
-- =====================================================================
-- Diese Helfer beantworten drei Fragen: welche E-Mail ist angemeldet,
-- welche Haeuser gehoeren dieser E-Mail, und ist sie Superadmin.
--
-- Sie muessen "security definer" sein. Eine Regel auf restaurants, die in
-- customers nachschlaegt, wuerde sonst gegen die RLS von customers laufen
-- -- und sobald customers zugemacht ist (Schritt 3), findet sie nichts
-- mehr und sperrt jeden aus. Der Helfer umgeht das, weil er mit den
-- Rechten seines Besitzers laeuft.
--
-- "set search_path" gehoert zwingend dazu: ohne ihn koennte jemand mit
-- einem eigenen Schema eine falsche customers-Tabelle unterschieben.

create or replace function public.kmi_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
$$;

create or replace function public.kmi_ist_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.customers c
        where lower(c.email) = public.kmi_email()
          and c.role = 'superadmin'
    );
$$;

-- Mehrzahl mit Absicht: ein Inhaber kann mehrere Betriebe haben.
create or replace function public.kmi_meine_haeuser()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select c.restaurant_id
    from public.customers c
    where c.restaurant_id is not null
      and lower(c.email) = public.kmi_email();
$$;

grant execute on function public.kmi_email()          to anon, authenticated;
grant execute on function public.kmi_ist_superadmin() to anon, authenticated;
grant execute on function public.kmi_meine_haeuser()  to anon, authenticated;


-- =====================================================================
-- 2. Die offene Tuer zu
-- =====================================================================
-- "Restaurants sind oeffentlich lesbar" wird NICHT angefasst -- das ist
-- die Regel, die die Gastansicht traegt.

drop policy if exists "Allow all for restaurants" on public.restaurants;
drop policy if exists "Insert restaurants"        on public.restaurants;


-- =====================================================================
-- 3. Getrennte Regeln statt einer offenen
-- =====================================================================

-- Lesen fuer Angemeldete: das eigene Haus, auch wenn es noch nicht
-- freigeschaltet ist. Der Wartebildschirm nach der Registrierung liest
-- genau so ein Haus (is_active = false) -- ohne diese Regel saehe der
-- frisch registrierte Wirt nur einen Fehler.
--
-- Der Vergleich ueber email steht mit Absicht daneben: bei der
-- Registrierung wird das Haus angelegt, BEVOR die customers-Zeile
-- existiert. PostgREST gibt die neue Zeile mit "return=representation"
-- zurueck und braucht dafuer Leserecht auf genau diese Zeile. Ohne den
-- E-Mail-Vergleich kaeme dort eine leere Antwort zurueck -- und die
-- Registrierung braeche mit einem Fehler ab, den niemand versteht.
drop policy if exists "Eigenes Haus lesen" on public.restaurants;
create policy "Eigenes Haus lesen"
    on public.restaurants for select to authenticated
    using (
        id in (select public.kmi_meine_haeuser())
        or lower(coalesce(email, '')) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

-- Anlegen: nur wer angemeldet ist. Die Registrierung verlangt ohnehin
-- vorher einen Google-Login (startRestaurantRegistration bricht sonst ab).
-- Vorher durfte das jeder Unangemeldete -- damit konnte man die
-- Restaurantliste mit erfundenen Betrieben zumuellen.
drop policy if exists "Neues Haus anlegen" on public.restaurants;
create policy "Neues Haus anlegen"
    on public.restaurants for insert to authenticated
    with check (true);

-- Aendern: nur das eigene Haus. "using" entscheidet, welche Zeilen man
-- anfassen darf, "with check", wie sie danach aussehen duerfen -- beides
-- noetig, sonst koennte man sein Haus per Update jemand anderem
-- unterschieben.
drop policy if exists "Nur der Inhaber aendert sein Haus" on public.restaurants;
create policy "Nur der Inhaber aendert sein Haus"
    on public.restaurants for update to authenticated
    using (
        id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    )
    with check (
        id in (select public.kmi_meine_haeuser())
        or public.kmi_ist_superadmin()
    );

-- Loeschen: nur der Superadmin. deleteRestaurant() haengt im Admin-Bereich
-- und loescht die Reservierungen gleich mit -- das darf kein Wirt aus
-- Versehen und erst recht kein Fremder.
drop policy if exists "Nur der Superadmin loescht Haeuser" on public.restaurants;
create policy "Nur der Superadmin loescht Haeuser"
    on public.restaurants for delete to authenticated
    using (public.kmi_ist_superadmin());


-- =====================================================================
-- 4. Gegenprobe
-- =====================================================================
-- Erwartet: fuenf Regeln, und in der Spalte "offen_fuer_alle" steht
-- nur noch bei der oeffentlichen Leseregel etwas -- und die hat mit
-- "is_active = true" ihre Bedingung.

select policyname as regel,
       cmd        as aktion,
       roles::text as fuer,
       coalesce(qual::text, '-')       as lesen_bedingung,
       coalesce(with_check::text, '-') as schreib_bedingung,
       case when coalesce(qual::text, 'true') = 'true'
             and coalesce(with_check::text, 'true') = 'true'
            then 'OHNE BEDINGUNG' else '' end as warnung
from pg_policies
where schemaname = 'public' and tablename = 'restaurants'
order by cmd, policyname;
