-- 26 — Hinweis unter der Kategorie ("alle Pizzen mit Tomatensauce, Käse, Oregano")
--
-- Gemeldet am 06.09.2026: bei jeder Pizza stand dieselbe Zeile in der
-- Beschreibung, oder sie fehlte ganz. Was fuer ALLE Gerichte einer
-- Kategorie gilt, gehoert einmal an die Kategorie -- nicht 40 mal an
-- die einzelnen Gerichte, wo es beim naechsten Preisupdate wieder
-- auseinanderlaeuft.
--
-- Leer heisst: es wird nichts angezeigt. Der Normalfall darf sich durch
-- diese Spalte nicht aendern.

alter table public.menu_categories
    add column if not exists beschreibung text;

comment on column public.menu_categories.beschreibung is
    'Hinweis, der dem Gast ueber den Gerichten dieser Kategorie steht. Leer = kein Hinweis.';
