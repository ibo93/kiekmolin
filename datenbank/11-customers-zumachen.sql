-- Schritt 11 -- customers. DER LETZTE UND DER GEFAEHRLICHSTE.
--
--
-- WARUM DAS KEIN AUFRAEUMEN IST, SONDERN DER EIGENTLICHE SCHRITT
-- --------------------------------------------------------------
-- Nach Schritt 10 sind orders, order_items und reservations zu. Das
-- klingt fertig. Ist es nicht.
--
-- Auf customers liegt eine Regel namens "offen" mit cmd = ALL. Die
-- laesst jeden alles. Und customers ist die Tabelle, aus der sich
-- ergibt, WER zu WELCHEM Betrieb gehoert -- kmi_meine_haeuser() liest
-- genau dort nach.
--
-- Damit laesst sich Schritt 10 aushebeln, und zwar in vier Zeilen:
--
--     POST /rest/v1/customers
--     apikey: <oeffentlicher Schluessel aus dem Seitenquelltext>
--     { "email": "<eigene Google-Adresse>",
--       "restaurant_id": "<fremde Restaurant-ID>", "role": "restaurant" }
--
-- Danach einmal mit Google anmelden -- und die Datenbank haelt einen
-- fuer den Wirt dieses Betriebs. Alle Bestellungen, alle
-- Reservierungen, alle Gastdaten. Die Regeln aus 09 greifen dabei
-- korrekt; sie fragen nur die falsche Auskunft ab.
--
-- Die Restaurant-IDs stehen oeffentlich in der App. Der Schluessel
-- steht im Seitenquelltext. Es braucht nichts weiter.
--
-- SOLANGE DIESE DATEI NICHT GELAUFEN IST, IST DAS DATENLOCH NICHT ZU.
-- Es ist nur enger geworden.
--
--
-- ZWEITE LUECKE, IM SELBEN ZUSAMMENHANG
-- -------------------------------------
-- kmi_meine_haeuser() fragt nur nach email und restaurant_id. Nicht
-- nach is_active, nicht nach role. Eine Zeile, die noch gar nicht
-- freigeschaltet ist, zaehlt also schon. Deshalb wuerde selbst eine
-- ganz normale Anmeldung ueber das Gastronom-Formular reichen, wenn man
-- dabei eine fremde restaurant_id einsetzt.
--
-- Teil B repariert das. Danach zaehlt eine Zeile erst, wenn der
-- Superadmin sie freigeschaltet hat.
--
--
-- VORHER: DIE APP MUSS LIVE SEIN
-- ------------------------------
-- Der Passwort-Login (fuenf Klicks aufs Logo) erzeugte bis zum
-- 21.08.2026 KEINE Supabase-Sitzung. Er setzte nur einen Merker im
-- Browser; jede Abfrage danach lief mit dem oeffentlichen Schluessel.
--
-- Laeuft diese Datei, BEVOR die neue Fassung von admin-login live ist,
-- steht der Verwaltungsbereich leer da -- derselbe Ausfall wie am
-- 20.08. bei den Wirten, nur eine Etage hoeher.
--
--     ZUERST mergen und Netlify bauen lassen.
--     DANN einmal mit Passwort anmelden und pruefen, ob das Dashboard
--     Zahlen zeigt.
--     ERST DANN diese Datei.
--
--
-- RUECKNAHME -- VOR DEM AUSFUEHREN IN EIN ZWEITES FENSTER LEGEN
-- ------------------------------------------------------------
--     alter table public.customers disable row level security;
--
-- Sofort wirksam, kein Datenverlust. Die Regeln bleiben liegen.
--
--
-- ============================================================
-- TEIL A -- ERST PRUEFEN. AENDERT NICHTS.
-- ============================================================
-- Teil B macht is_active zur Bedingung. Steht bei einem Wirt aus
-- Versehen false, verliert genau dieser Wirt seinen Zugang -- und das
-- faellt erst auf, wenn er anruft.
--
-- Am 20.08. wurde ohne diese Probe zugemacht. Deshalb hier zuerst.

-- A1. Alle Wirte und der Superadmin. ERWARTET: bei jedem, der arbeiten
--     koennen soll, steht is_active = true und eine restaurant_id.
select email, role, is_active, restaurant_id
  from public.customers
 where role in ('restaurant', 'superadmin')
 order by role, email;

-- A2. Zeilen, die nach Teil B ihren Zugang verlieren wuerden.
--     ERWARTET: leer. Kommt hier jemand vor, den du kennst, dann
--     ZUERST is_active auf true setzen -- nicht Teil B anpassen.
select email, role, is_active, restaurant_id
  from public.customers
 where restaurant_id is not null
   and (is_active is distinct from true
        or role not in ('restaurant', 'superadmin'))
 order by email;

-- A3. Gibt es schon Zeilen, die auf einen fremden Betrieb zeigen?
--     Also mehrere verschiedene E-Mails auf demselben Betrieb.
--     ERWARTET: leer oder nur Faelle, die du erklaeren kannst
--     (z.B. zwei Inhaber desselben Ladens).
select restaurant_id, count(*) as zeilen,
       string_agg(email || ' [' || coalesce(role, '-') || ', aktiv='
                  || coalesce(is_active::text, '-') || ']', ' | ') as wer
  from public.customers
 where restaurant_id is not null
 group by restaurant_id
having count(*) > 1;


-- ============================================================
-- TEIL B -- DIE ZUORDNUNG ENGER FASSEN
-- ============================================================
-- Ruecknahme: die Fassung ohne die beiden zusaetzlichen Bedingungen
-- steht in 02-restaurants-zumachen.sql und kann von dort
-- zurueckgespielt werden.

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
      and lower(trim(c.email)) = public.kmi_email()
      -- NEU: eine Zeile zaehlt erst, wenn sie freigeschaltet ist.
      and c.is_active is true
      -- NEU: und nur eine Rolle, die ueberhaupt einen Betrieb fuehrt.
      and c.role in ('restaurant', 'superadmin');
$$;


-- ============================================================
-- TEIL C -- ROLLE UND ZUORDNUNG FESTNAGELN
-- ============================================================
-- Mit Regeln allein ist das nicht dicht zu bekommen: in "with check"
-- kommt man an den alten Wert einer Zeile nicht heran, kann also nicht
-- pruefen, ob jemand seine eigene Rolle gerade hochsetzt. Dafuer
-- braucht es einen Ausloeser.
--
-- WAS ER ZULAESST
--   - Der Dienstschluessel (Netlify-Funktionen) darf alles. Er laeuft
--     auf dem Server, nicht im Browser.
--   - Der Superadmin darf alles.
--   - Jeder andere darf eine Anmeldung einreichen: role = 'restaurant',
--     is_active = false. Diese Zeile bewirkt nichts, bis der Superadmin
--     sie freischaltet -- Teil B sorgt dafuer.
--   - Jeder andere darf an role, restaurant_id und is_active einer
--     bestehenden Zeile NICHTS aendern. Auch nicht an der eigenen.

create or replace function public.kmi_rolle_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Ohne Anmeldung ueberhaupt (z.B. Wartungsarbeiten im SQL-Editor)
    -- greift der Ausloeser nicht.
    if auth.jwt() is null then return new; end if;
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
    if public.kmi_ist_superadmin() then return new; end if;

    if tg_op = 'INSERT' then
        -- Anmeldung ja, Vollmacht nein.
        new.role := case when new.role = 'restaurant' then 'restaurant' else null end;
        new.is_active := false;
        return new;
    end if;

    -- UPDATE: die drei Felder bleiben, wie sie waren.
    new.role          := old.role;
    new.restaurant_id := old.restaurant_id;
    new.is_active     := old.is_active;
    return new;
end
$$;

drop trigger if exists kmi_rolle_schuetzen on public.customers;
create trigger kmi_rolle_schuetzen
    before insert or update on public.customers
    for each row execute function public.kmi_rolle_schuetzen();


-- ============================================================
-- TEIL D -- DIE REGELN
-- ============================================================
-- Die alte Regel "offen" faellt weg. Sie war als Notbehelf gedacht und
-- ist seitdem stehen geblieben.

drop policy if exists "offen" on public.customers;
drop policy if exists "Angemeldete legen ihre Kundenzeile an" on public.customers;

-- LESEN: die eigene Zeile, oder alles als Superadmin.
-- Die eigene Zeile MUSS lesbar bleiben -- checkIfGastronom() fragt
-- genau danach, wenn sich jemand mit Google anmeldet.
drop policy if exists "Die eigene Zeile lesen" on public.customers;
create policy "Die eigene Zeile lesen"
    on public.customers for select
    using (
        lower(trim(email)) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

-- ANLEGEN: jeder darf eine Anmeldung einreichen. Was dabei
-- hineingeschrieben werden darf, entscheidet der Ausloeser aus Teil C,
-- nicht diese Regel.
drop policy if exists "Jeder darf sich anmelden" on public.customers;
create policy "Jeder darf sich anmelden"
    on public.customers for insert
    with check (true);

-- AENDERN: die eigene Zeile (Name, Telefon) oder alles als Superadmin.
-- role, restaurant_id und is_active haelt der Ausloeser fest.
drop policy if exists "Die eigene Zeile aendern" on public.customers;
create policy "Die eigene Zeile aendern"
    on public.customers for update
    using (
        lower(trim(email)) = public.kmi_email()
        or public.kmi_ist_superadmin()
    );

-- LOESCHEN: nur der Superadmin.
drop policy if exists "Nur der Superadmin loescht Kunden" on public.customers;
create policy "Nur der Superadmin loescht Kunden"
    on public.customers for delete
    using (public.kmi_ist_superadmin());

alter table public.customers enable row level security;


-- Gegenprobe. Erwartet: zugesperrt = true, und vier Regeln.
select rowsecurity as zugesperrt
  from pg_tables
 where schemaname = 'public' and tablename = 'customers';

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'customers'
 order by cmd;


-- ============================================================
-- DANACH: DREI PROBEN IM BROWSER, NICHT HIER
-- ============================================================
-- Im SQL-Editor laeuft man als Datenbank-Besitzer und kommt an allem
-- vorbei. Was zaehlt, sieht man nur in der App:
--
--   1. Mit Passwort anmelden (fuenf Klicks aufs Logo). Zeigt das
--      Dashboard Zahlen? Kommt die Kundenliste?
--   2. Mit Google anmelden. Dasselbe.
--   3. Bei zwei verschiedenen Betrieben nachsehen, ob Bestellungen und
--      Reservierungen ankommen.
--
-- Klemmt irgendetwas davon: NICHT suchen, erst zurueck.
--     alter table public.customers disable row level security;
--
--
-- WAS DANACH NOCH OFFEN BLEIBT
-- ----------------------------
-- 1. Das Gastronom-Formular legt die restaurants-Zeile weiterhin direkt
--    aus dem Browser an, mit dem oeffentlichen Schluessel. Wer will,
--    kann darueber beliebig viele Betriebe erzeugen. Sie stehen auf
--    is_active = false und sind damit unsichtbar, aber sauber ist es
--    nicht. Gehoert in eine Netlify-Funktion.
-- 2. Dasselbe Formular fragt vorher, ob es die E-Mail schon gibt. Nach
--    dieser Datei sieht es fremde Zeilen nicht mehr und haelt eine
--    belegte Adresse fuer frei -- es entsteht dann eine zweite
--    Anmeldung statt einer Fehlermeldung. Beide stehen auf pending und
--    landen beim Superadmin; aergerlich, nicht gefaehrlich.
-- 3. Der Passwort-Login hat keine Versuchsbegrenzung.
