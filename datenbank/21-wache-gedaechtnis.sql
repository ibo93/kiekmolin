-- DAMIT DIE WACHE SICH ETWAS MERKEN KANN.
--
-- Gemeldet am 27.08.2026: "die wache nervt zu viel kommt das mit die
-- signale".
--
-- Nachgemessen im Postfach: zwischen dem 26.08. 22:30 und dem 27.08.
-- 07:45 deutscher Zeit kamen 96 E-Mails -- alle 15 Minuten zwei bis
-- drei, die ganze Nacht, alle mit demselben Satz.
--
-- Zwei Ursachen, beide hausgemacht:
--
--   1. Die Wache gab 500 zurueck, wenn etwas klemmte. Netlify haelt
--      einen Durchlauf mit 500 fuer misslungen und startet ihn neu --
--      gemessen DREI Durchlaeufe je Viertelstunde statt einem
--      (05:45:25, 05:45:28, 05:45:36 Uhr UTC).
--   2. Die Ruhezeit von sechs Stunden lag in /tmp. Eine Netlify-
--      Funktion bekommt fast jedes Mal einen frischen Behaelter --
--      /tmp war bei jedem Start leer, also war jede Meldung "neu".
--
-- Punkt 1 ist im Programm behoben. Punkt 2 braucht einen Platz, der
-- einen Neustart ueberlebt: diese Tabelle.
--
-- Sie merkt sich je Pruefung: klemmt es gerade, seit wann, wie oft
-- hintereinander, und wann zuletzt jemand benachrichtigt wurde.
-- Daraus folgt die neue Regel:
--
--   erste Meldung sofort -- danach hoechstens eine Erinnerung am Tag,
--   und eine Entwarnung, sobald es wieder geht.

create table if not exists public.wache_status (
    kennung          text primary key,
    zustand          text        not null default 'ok',   -- 'ok' | 'klemmt'
    fehlversuche     integer     not null default 0,
    seit             timestamptz,
    zuletzt_gemeldet timestamptz,
    text             text,
    updated_at       timestamptz not null default now()
);

-- NIEMAND AUSSER DEM DIENSTSCHLUESSEL.
-- Wer hier schreiben koennte, koennte die Wache stummschalten -- und
-- eine stumme Wache ist schlimmer als keine, weil man sich auf sie
-- verlaesst. RLS an, keine einzige Policy: der Dienstschluessel geht
-- an RLS vorbei, alle anderen sehen eine leere Tabelle.
alter table public.wache_status enable row level security;

drop policy if exists "wache_status lesen"    on public.wache_status;
drop policy if exists "wache_status schreiben" on public.wache_status;

comment on table public.wache_status is
    'Gedaechtnis der Gastweg-Wache. Nur der Dienstschluessel. Verhindert, dass dieselbe Stoerung alle 15 Minuten erneut gemeldet wird.';
