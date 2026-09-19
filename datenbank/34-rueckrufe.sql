-- =====================================================================
-- 34 -- Rueckruf-Wuensche (callbacks). OPTIONAL.
-- =====================================================================
--
-- BEFUND (18.09.2026, edge_logs): 15 x GET /rest/v1/callbacks -> 404.
-- Nur Lesezugriffe, kein einziges Schreiben.
--
-- UND DAS IST KEIN FEHLER. Anders als bei google_reviews ist dieser 404
-- vorgesehen und abgefangen:
--
--   telefon-retter/lib/supabase.js, offeneRueckrufe():
--     } catch (_e) { /* Tabelle gibt es evtl. (noch) nicht - dann nur
--                       der Fallback */ }
--
-- Der Telefon-Agent legt einen Rueckruf-Wunsch zuerst hier ab und, wenn
-- das nicht geht, als pending-Reservierung mit "(RUECKRUF)" im Namen --
-- so landet er im Dashboard des Wirts. Dieser Weg funktioniert. Es geht
-- also nichts verloren, solange diese Datei nicht eingespielt ist.
--
-- WAS SIE BRINGT: der Rueckruf steht dann in einer eigenen Tabelle, mit
-- eigenem Status (offen / erledigt), statt als Schein-Reservierung um
-- 00:00 Uhr fuer eine Person im Kalender des Wirts.
--
-- Die Spalten sind nicht erfunden, sie stehen in beiden Aufrufstellen:
--   schreiben: telefon-retter/lib/dialog.js  -> toolRueckruf()
--   lesen:     telefon-retter/lib/supabase.js -> offeneRueckrufe()
--   erledigen: telefon-retter/lib/supabase.js -> rueckrufErledigt()
--
-- EINSPIELEN: Supabase -> SQL Editor -> einfuegen -> Run. Nur wenn der
-- Telefon-Retter wirklich Anrufe annimmt. Sonst liegen lassen.
-- =====================================================================

create table if not exists public.callbacks (
    id            uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    phone         text not null,
    name          text,
    topic         text,
    source        text        not null default 'telefon',
    status        text        not null default 'open',
    created_at    timestamptz not null default now(),
    done_at       timestamptz
);

-- Nur zwei Zustaende. Ein dritter, den keiner kennt, waere ein Rueckruf,
-- den niemand mehr sieht.
alter table public.callbacks
    drop constraint if exists callbacks_status_check;
alter table public.callbacks
    add constraint callbacks_status_check check (status in ('open', 'done'));

comment on table public.callbacks is
    'Rueckruf-Wuensche aus dem Telefon-Agenten. Enthaelt Telefonnummern -- Personendaten.';

-- Die Abfrage der Agentur-App: offene, neueste zuerst.
create index if not exists callbacks_offen_idx
    on public.callbacks (created_at desc)
    where status = 'open';

-- --- Zugriff ---------------------------------------------------------
-- HIER STEHT EINE TELEFONNUMMER DRIN. Deshalb: RLS an, und KEINE
-- einzige Regel. Damit kommt weder "anon" noch ein angemeldeter Nutzer
-- heran -- nur der Dienstschluessel, und der liegt ausschliesslich in
-- den Netlify-Variablen und auf dem Agentur-Rechner.
--
-- Das ist Absicht und keine Vergesslichkeit: der Wirt sieht seine
-- Rueckrufe in der Agentur-App, nicht ueber die oeffentliche API.
alter table public.callbacks enable row level security;

drop policy if exists "callbacks anon lesen" on public.callbacks;
drop policy if exists "callbacks anon anlegen" on public.callbacks;

-- --- Gegenprobe ------------------------------------------------------
--   select relrowsecurity from pg_class where relname = 'callbacks';
--     -> muss true sein
--   select count(*) from pg_policies where tablename = 'callbacks';
--     -> muss 0 sein
