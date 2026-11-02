-- GAENGE ABRUFEN (31.10.2026).
--
-- Bei Tischbestellungen mit Vorspeise, Hauptgang und Nachtisch wartet ein
-- spaeterer Gang, bis die Bedienung ihn abruft. Hier steht, welcher Gang
-- gerade dran ist (1, 2 oder 3). Leer = der erste Gang der Bestellung.
-- Ohne diese Spalte zeigen Bestellkarte und Kueche die Gaenge trotzdem
-- getrennt an -- nur "Gang abrufen" meldet dann, dass dieses Skript fehlt.
--
-- Mehrfach ausfuehrbar.

alter table public.orders add column if not exists gang_jetzt smallint;

-- PRUEFEN: eine Zeile "gang_jetzt".
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'orders' and column_name = 'gang_jetzt';
