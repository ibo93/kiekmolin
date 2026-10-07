-- SCHRITT 35: lead_zaehler -- kommt ueber die Restaurantseiten ueberhaupt jemand?
--
-- Auf hunderten Seiten steht der gruene Kasten "Ist das dein Restaurant?".
-- Er zeigt auf /gastro. Niemand konnte sagen, ob dieser Kasten 10 oder
-- 10.000 Mal gesehen wurde.
--
-- Ibo am 24.09.2026: "wir muessen mehr Werbung machen und Kunden holen".
-- Werbung ohne Zaehler ist Geld ausgeben mit verbundenen Augen: hinterher
-- weiss niemand, was gewirkt hat. Deshalb zuerst der Zaehler.
--
-- Drei Schritte, mehr nicht:
--     gesehen    die Restaurantseite wurde geladen
--     geklickt   jemand hat den Inhaber-Knopf gedrueckt
--     gesendet   das Formular auf /gastro ging ab
--
-- ABSICHTLICH KEINE PERSONENDATEN. Keine IP, kein Besucher-Kennzeichen,
-- kein Verlauf. Nur: an welchem Tag, auf welcher Seite, wie oft. Damit
-- braucht es keine Einwilligung und keinen Bannersalat -- und es beantwortet
-- die einzige Frage, die zaehlt.

-- Vorher/Nachher sichtbar machen.
select case when to_regclass('public.lead_zaehler') is null
            then 'VORHER: lead_zaehler gibt es noch nicht'
            else 'VORHER: lead_zaehler ist schon da' end as befund;

create table if not exists public.lead_zaehler (
    tag      date    not null,
    slug     text    not null,
    schritt  text    not null,
    anzahl   integer not null default 0,
    primary key (tag, slug, schritt)
);

alter table public.lead_zaehler
    drop constraint if exists lead_zaehler_schritt_check;
alter table public.lead_zaehler
    add constraint lead_zaehler_schritt_check
    check (schritt in ('gesehen', 'geklickt', 'gesendet'));

-- RLS an, KEINE Regel: niemand kommt mit dem oeffentlichen Schluessel heran.
-- Geschrieben und gelesen wird nur ueber die Netlify-Function mit dem
-- Service-Key. Ein Zaehler, den jeder hochdrehen kann, ist kein Zaehler.
alter table public.lead_zaehler enable row level security;
drop policy if exists "lead_zaehler_niemand" on public.lead_zaehler;

comment on table public.lead_zaehler is
    'Wie oft der Inhaber-Kasten gesehen/geklickt wurde und wie oft das '
    'Formular abging. Tagesweise, ohne Personenbezug. Schreibt nur die '
    'Function lead-zaehler mit dem Service-Key.';

-- Hochzaehlen in EINEM Schritt. Ohne diese Funktion muesste die Netlify-
-- Function erst lesen und dann schreiben -- und zwei gleichzeitige Besucher
-- wuerden sich gegenseitig ueberschreiben. Am Ende stuende eine zu kleine
-- Zahl da, und niemand haette einen Fehler gesehen.
create or replace function public.lead_zaehlen(p_slug text, p_schritt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_schritt not in ('gesehen', 'geklickt', 'gesendet') then
        return;                      -- Unbekanntes still verwerfen, nicht werfen
    end if;
    insert into public.lead_zaehler (tag, slug, schritt, anzahl)
    values (current_date, left(coalesce(p_slug, '-'), 120), p_schritt, 1)
    on conflict (tag, slug, schritt)
    do update set anzahl = public.lead_zaehler.anzahl + 1;
end;
$$;

revoke all on function public.lead_zaehlen(text, text) from public, anon, authenticated;

-- Nachher: steht die Tabelle, ist RLS an, und gibt es KEINE Regel?
select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_name = 'lead_zaehler') as tabelle_da,
    (select relrowsecurity from pg_class
      where oid = 'public.lead_zaehler'::regclass)                   as rls_an,
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'lead_zaehler')    as regeln_muessen_0_sein;
