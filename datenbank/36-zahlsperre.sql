-- SCHRITT 36: zahlsperre -- wenn eine Rechnung offen bleibt.
--
-- Ibo am 24.09.2026: "wenn Kunden nicht bezahlen, dass ich mit einem Knopf
-- es schliesse, nur der Admin ... drei Stufen ist gut ... ich will es
-- selber steuern".
--
-- DREI STUFEN, VON HAND GESETZT:
--
--     keine     alles normal
--     hinweis   roter Balken im Dashboard. Nur der Wirt sieht ihn.
--     pause     der Gast kann NICHT mehr bestellen. Reservierungen laufen
--               weiter, das Dashboard bleibt offen -- damit der Wirt die
--               letzten Bestellungen abarbeiten kann.
--     aus       Bestellen und Reservieren zu.
--
-- WARUM DAS DASHBOARD NIE GESPERRT WIRD: Bestellungen kaemen weiter
-- herein, der Gast saehe eine normale Seite -- und niemand wuerde kochen.
-- Der Gast wartet auf Essen, das nie kommt, und schreibt die Bewertung
-- ueber das Restaurant UND ueber kiekmolin.de. Man bestraft den Gast, um
-- den Wirt zu treffen.
--
-- ============================================================
-- WARUM EINE SPALTE UND KEINE EIGENE TABELLE
-- ============================================================
-- Die Gaesteseite und das Dashboard lesen den Betrieb ohnehin. Eine
-- eigene Tabelle hiesse: eine zusaetzliche Abfrage auf jeder Seite,
-- nur um zu erfahren, dass alles normal ist.
--
-- ABER: der Wirt darf seine eigene Zeile in restaurants aendern -- so
-- speichert er seine Zahlungsarten. Eine normale Spalte koennte er also
-- selbst zuruecksetzen. Deshalb wird das Schreibrecht AUF DIESE EINE
-- SPALTE entzogen. Lesen darf sie jeder, setzen nur der Dienstschluessel.

select case when exists (select 1 from information_schema.columns
                          where table_name='restaurants' and column_name='zahlsperre')
            then 'VORHER: zahlsperre gibt es schon'
            else 'VORHER: zahlsperre fehlt noch' end as befund;

alter table public.restaurants
    add column if not exists zahlsperre       text        not null default 'keine',
    add column if not exists zahlsperre_seit  timestamptz,
    add column if not exists zahlsperre_notiz text;

alter table public.restaurants
    drop constraint if exists restaurants_zahlsperre_check;
alter table public.restaurants
    add constraint restaurants_zahlsperre_check
    check (zahlsperre in ('keine', 'hinweis', 'pause', 'aus'));

-- DAS HERZSTUECK: der Wirt darf alles an seiner Zeile aendern, nur das
-- nicht. Spaltenrechte wirken unabhaengig von RLS -- ein UPDATE, das
-- diese Spalte anfasst, wird abgewiesen, egal welche Regel sonst greift.
revoke update (zahlsperre, zahlsperre_seit, zahlsperre_notiz)
    on public.restaurants from anon, authenticated;

comment on column public.restaurants.zahlsperre is
    'keine|hinweis|pause|aus. Von Hand durch den Superadmin gesetzt, nur '
    'ueber die Function zahlsperre mit dem Dienstschluessel. Lesen darf '
    'jeder -- die Gaesteseite muss wissen, ob sie Bestellungen annimmt.';

-- Nachher: steht die Spalte, ist die Voreinstellung "keine", und ist das
-- Schreibrecht wirklich weg?
select
  (select count(*) from information_schema.columns
     where table_name='restaurants' and column_name like 'zahlsperre%')    as spalten_muessen_3_sein,
  (select count(*) from public.restaurants where zahlsperre <> 'keine')    as gesperrte_betriebe,
  (select count(*) from information_schema.column_privileges
     where table_name='restaurants' and column_name='zahlsperre'
       and privilege_type='UPDATE' and grantee in ('anon','authenticated')) as schreibrecht_muss_0_sein;
