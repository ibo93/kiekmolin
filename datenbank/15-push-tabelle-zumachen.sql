-- Schritt 15 -- push_subscriptions zumachen, und eine Spalte fuer die
--               Anmelde-Meldung.
--
--
-- TEIL 1: WARUM push_subscriptions ZUGEHT
-- ---------------------------------------
-- Die Tabelle stand bisher offen: jeder mit dem oeffentlichen
-- Schluessel -- er steht im Seitenquelltext -- konnte dort eine Zeile
-- anlegen, lesen, aendern und loeschen.
--
-- Das war schon vorher nicht schoen. Seit Schritt 14 ist es benutzbar:
-- der Superadmin bekommt die Meldungen aller Haeuser, und gefunden wird
-- sein Geraet ueber die E-Mail in customer_email. Wer diese Adresse
-- kennt, koennte ein eigenes Geraet darunter eintragen und bekaeme ab
-- da jede Bestellung und Reservierung samt Gastnamen aufs Handy.
--
-- Ausserdem liegen in der Tabelle Telefonnummern und E-Mail-Adressen
-- von Gaesten -- dieselben Daten, die wir in Schritt 9 bis 11
-- weggeschlossen haben. Sie hier offen zu lassen waere ein Loch neben
-- der frisch verschlossenen Tuer.
--
--
-- WAS WEITER GEHEN MUSS
-- ---------------------
-- Anmelden. Jeder Gast, jeder Wirt, auf jedem Geraet -- ohne Anmeldung
-- keine Benachrichtigung. Der Ausloeser unten sorgt dafuer, dass dabei
-- nichts eingetragen wird, was nicht eingetragen werden darf.
--
-- LESEN dagegen braucht im Browser NIEMAND. Die Geraeteliste holen
-- ausschliesslich die Netlify-Funktionen, und die laufen mit dem
-- Dienstschluessel an allen Regeln vorbei.
--
--
-- RUECKNAHME -- IN EIN ZWEITES FENSTER LEGEN:
--     alter table public.push_subscriptions disable row level security;


-- Der Ausloeser: eine Anmeldung darf sich nicht an einen fremden
-- Betrieb oder an die Adresse des Superadmins haengen.
--
-- Beides waere sonst in einer Zeile gemacht -- und der Faelscher
-- bekaeme die Meldungen mit. Der Dienstschluessel (Netlify) darf
-- weiterhin alles; er laeuft auf dem Server.
create or replace function public.kmi_push_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    _mail text;
begin
    if auth.jwt() is null then return new; end if;
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;

    _mail := public.kmi_email();

    -- Eine fremde Betriebs-Zuordnung ist nur erlaubt, wenn der
    -- Angemeldete wirklich zu diesem Betrieb gehoert.
    if new.restaurant_id is not null
       and not public.kmi_ist_superadmin()
       and new.restaurant_id not in (select public.kmi_meine_haeuser()) then
        new.restaurant_id := null;
    end if;

    -- Die E-Mail am Geraet muss die eigene sein. Wer nicht angemeldet
    -- ist, darf gar keine eintragen -- sonst genuegt es, die Adresse
    -- des Superadmins zu kennen.
    if new.customer_email is not null
       and lower(trim(new.customer_email)) is distinct from _mail then
        new.customer_email := null;
    end if;

    return new;
end
$$;

drop trigger if exists kmi_push_schuetzen on public.push_subscriptions;
create trigger kmi_push_schuetzen
    before insert or update on public.push_subscriptions
    for each row execute function public.kmi_push_schuetzen();


-- Die Regeln.
drop policy if exists "Jedes Geraet darf sich anmelden" on public.push_subscriptions;
create policy "Jedes Geraet darf sich anmelden"
    on public.push_subscriptions for insert
    with check (true);

-- Lesen: nur der Superadmin. Die Funktionen brauchen es nicht -- sie
-- laufen mit dem Dienstschluessel.
drop policy if exists "Nur der Superadmin sieht die Geraete" on public.push_subscriptions;
create policy "Nur der Superadmin sieht die Geraete"
    on public.push_subscriptions for select
    using (public.kmi_ist_superadmin());

-- Aendern und Loeschen: nur der Superadmin.
drop policy if exists "Nur der Superadmin aendert Geraete" on public.push_subscriptions;
create policy "Nur der Superadmin aendert Geraete"
    on public.push_subscriptions for update
    using (public.kmi_ist_superadmin());

drop policy if exists "Nur der Superadmin loescht Geraete" on public.push_subscriptions;
create policy "Nur der Superadmin loescht Geraete"
    on public.push_subscriptions for delete
    using (public.kmi_ist_superadmin());

alter table public.push_subscriptions enable row level security;


-- ============================================================
-- TEIL 2: EINE SPALTE FUER DIE ANMELDE-MELDUNG
-- ============================================================
-- Eine Gastronom-Anmeldung landete bisher stumm in der Datenbank.
-- Sichtbar war sie nur unter "offene Anmeldungen" -- und die Liste
-- sieht man nur, wenn man hinschaut. Wer sich nachts anmeldet, liegt
-- bis zum naechsten Blick.
--
-- Ab jetzt meldet der Melder sie aufs Handy des Superadmins. Damit das
-- nicht jede Minute wieder passiert, wird abgehakt.
--
-- RUECKNAHME:
--     alter table public.customers drop column if exists gemeldet_at;

alter table public.customers
    add column if not exists gemeldet_at timestamptz;

-- Was heute schon dasteht, gilt als gemeldet -- sonst kommen beim
-- ersten Durchlauf alle alten Anmeldungen auf einmal.
update public.customers
   set gemeldet_at = now()
 where gemeldet_at is null;


-- Gegenprobe. Erwartet: zugesperrt = true und vier Regeln.
select rowsecurity as zugesperrt
  from pg_tables
 where schemaname = 'public' and tablename = 'push_subscriptions';

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'push_subscriptions'
 order by cmd;


-- ============================================================
-- DANACH: EINE PROBE, DIE NUR IM BROWSER GEHT
-- ============================================================
-- Im Verwaltungsbereich Benachrichtigungen einmal aus- und wieder
-- einschalten. Danach muss hier eine Zeile mit deiner Adresse stehen:
--
--     select created_at, customer_email, restaurant_id,
--            left(coalesce(p256dh_key, ''), 12) as schluessel_anfang
--       from public.push_subscriptions
--      order by created_at desc limit 5;
--
-- Kommt keine Zeile dazu, ist der Ausloeser zu streng -- dann zurueck:
--     alter table public.push_subscriptions disable row level security;
