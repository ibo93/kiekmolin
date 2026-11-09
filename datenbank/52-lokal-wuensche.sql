-- ─────────────────────────────────────────────────────────────
-- 52 · GAESTE WUENSCHEN SICH EIN LOKAL (Ibo, 07.11.2026)
--
-- Gaeste druecken "Ich wuensche mir dieses Lokal auf Kiek mol in".
-- Gezaehlt wird pro Tag und Lokal -- OHNE Personenbezug: keine IP,
-- kein Name des Gastes, kein Cookie. Nur Tag, Lokal, Ort, Anzahl.
--
-- Wozu: "7 Ihrer Gaeste wuenschen sich Sie auf Kiek mol in" ist das
-- staerkste Argument im Brief und beim Besuch.
--
-- Schreiben und Lesen NUR ueber die Function lokal-wunsch (Service-Key).
-- Gaeste/anon kommen nicht direkt an die Tabelle (RLS an, keine Policy).
--
-- Einspielen: Supabase -> SQL Editor -> diese Datei einfuegen -> Run.
-- Ohne diese Datei sagt der Knopf ehrlich "hat nicht geklappt"
-- (kein stilles "Danke", siehe CLAUDE.md Regel 6).
-- ─────────────────────────────────────────────────────────────

select case when to_regclass('public.lokal_wunsch') is null
            then 'VORHER: lokal_wunsch gibt es noch nicht'
            else 'VORHER: lokal_wunsch ist schon da' end as befund;

create table if not exists public.lokal_wunsch (
    tag     date    not null,
    slug    text    not null,
    name    text    not null default '',
    ort     text    not null default '',
    anzahl  integer not null default 0,
    primary key (tag, slug)
);

alter table public.lokal_wunsch enable row level security;

comment on table public.lokal_wunsch is
    'Gaeste wuenschen sich ein Lokal auf Kiek mol in. Tagesweise, ohne '
    'Personenbezug. Schreibt/liest nur die Function lokal-wunsch.';

create or replace function public.lokal_wuenschen(p_slug text, p_name text, p_ort text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(length(p_slug), 0) < 2 then
        return;                       -- Unbrauchbares still verwerfen, nicht werfen
    end if;
    insert into public.lokal_wunsch (tag, slug, name, ort, anzahl)
    values (current_date, left(p_slug, 120), left(coalesce(p_name, ''), 80), left(coalesce(p_ort, ''), 60), 1)
    on conflict (tag, slug)
    do update set anzahl = public.lokal_wunsch.anzahl + 1;
end;
$$;

create or replace function public.lokal_wuensche_summe(p_slug text)
returns integer
language sql
security definer
set search_path = public
as $$
    select coalesce(sum(anzahl), 0)::integer from public.lokal_wunsch where slug = left(p_slug, 120);
$$;

revoke all on function public.lokal_wuenschen(text, text, text) from public, anon, authenticated;
revoke all on function public.lokal_wuensche_summe(text) from public, anon, authenticated;

-- Fuer Ibo: Welche Lokale wuenschen sich Gaeste am meisten?
-- select slug, max(name) as name, max(ort) as ort, sum(anzahl) as wuensche
--   from public.lokal_wunsch group by slug order by wuensche desc limit 50;

select
    (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'lokal_wunsch') as tabelle_da,
    (select count(*) from information_schema.routines where routine_schema = 'public' and routine_name in ('lokal_wuenschen', 'lokal_wuensche_summe')) as funktionen_da;
