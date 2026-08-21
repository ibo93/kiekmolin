-- Schritt 0 -- MUSS vor dem Deploy der Sitzungs-Token-Umstellung laufen.
--
-- Ausgangslage
-- ------------
-- Bisher ging jede Anfrage der App mit dem oeffentlichen Schluessel raus.
-- Fuer die Datenbank war damit JEDER Besucher die Rolle "anon" -- der Gast
-- ohne Konto genauso wie der angemeldete Wirt.
--
-- Ab der Umstellung schickt ein Angemeldeter sein Sitzungs-Token. Damit
-- wechselt seine Rolle von "anon" auf "authenticated". Eine Regel, die nur
-- fuer "anon" gilt, greift fuer ihn dann NICHT MEHR.
--
-- Betroffen sind 11 Regeln, unter anderem:
--   daily_specials  -- select/insert/update/delete, nur fuer anon
--   order_items     -- select/insert, nur fuer anon
--   orders          -- insert, nur fuer anon
--
-- Ohne diesen Schritt hiesse das konkret: der Wirt kann seine Tagesangebote
-- nicht mehr pflegen, und ein GAST, DER ANGEMELDET IST, kann nicht mehr
-- bestellen -- die Bestellpositionen werden abgelehnt. Der Gast ohne Konto
-- merkt nichts, weil er weiterhin "anon" ist. Genau so ein Fehler faellt im
-- eigenen Test nicht auf und dafuer samstags um acht.
--
-- Was dieses Skript tut
-- ---------------------
-- Es traegt bei genau diesen Regeln "authenticated" zusaetzlich ein.
-- Sonst nichts.
--
-- Das oeffnet NICHTS. Wer angemeldet ist, kommt heute schon ueberall hin --
-- seine Anfragen tragen ja bislang denselben oeffentlichen Schluessel wie
-- die aller anderen. Das Skript sorgt nur dafuer, dass er nach der
-- Umstellung nicht schlechter dasteht als vorher.
--
-- Das Zumachen kommt danach, Tabelle fuer Tabelle. Erst muss die App
-- ueberhaupt sagen koennen, wer da fragt.
--
-- Sicherheitsnetze
-- ----------------
-- * Angefasst werden NUR Regeln, die bereits fuer "anon" gelten. Eine Regel
--   fuer "service_role" bleibt unberuehrt -- sonst wuerde aus einer Regel
--   fuer den Dienstschluessel ploetzlich eine fuer jeden Angemeldeten.
-- * Bestehende Rollen bleiben erhalten, "authenticated" kommt dazu.
--   (Ein plumpes "to anon, authenticated" wuerde alles andere wegwerfen.)
-- * Mehrfach ausfuehrbar. Beim zweiten Lauf findet es nichts mehr zu tun.
-- * Keine Regel wird geloescht, keine neue angelegt, RLS wird nirgends
--   abgeschaltet.

do $$
declare
    r            record;
    neue_rollen  text;
    anzahl       int := 0;
begin
    for r in
        select schemaname, tablename, policyname, roles
        from pg_policies
        where schemaname = 'public'
          and 'anon' = any(roles)                      -- gilt heute fuer Anonyme
          and not ('authenticated' = any(roles))       -- aber noch nicht fuer Angemeldete
          and not ('public' = any(roles))              -- "public" schliesst beide ein
        order by tablename, policyname
    loop
        -- Bestehende Rollen behalten und "authenticated" ergaenzen.
        select string_agg(quote_ident(rolle), ', ')
          into neue_rollen
          from unnest(r.roles || 'authenticated'::name) as rolle;

        execute format('alter policy %I on %I.%I to %s',
                       r.policyname, r.schemaname, r.tablename, neue_rollen);

        anzahl := anzahl + 1;
        raise notice 'erweitert: %.%  ->  %', r.tablename, r.policyname, neue_rollen;
    end loop;

    if anzahl = 0 then
        raise notice 'Nichts zu tun -- keine Regel gilt nur fuer anon.';
    else
        raise notice '% Regel(n) erweitert.', anzahl;
    end if;
end $$;


-- Gegenprobe. Muss 0 Zeilen liefern, sonst ist die App nach der
-- Umstellung an dieser Stelle blind.
select tablename as tabelle, policyname as regel, cmd as aktion, roles::text as gilt_fuer
from pg_policies
where schemaname = 'public'
  and 'anon' = any(roles)
  and not ('authenticated' = any(roles))
  and not ('public' = any(roles))
order by tablename, policyname;
