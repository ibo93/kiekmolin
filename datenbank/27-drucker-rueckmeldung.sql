-- 27 — Der Drucker sagt uns, warum kein Bon kommt. Wir heben es endlich auf.
--
-- GEMESSEN AM 06.09.2026 IN DEN PROTOKOLLEN:
--
--   Drucker A: 24.676 Anfragen, Schluessel ok, 2 Bons gefunden (16:56, 17:06)
--   Drucker B:  1.437 Anfragen, kommt NIE am Schluessel vorbei
--   Drucker C:    342 Anfragen, kommt NIE am Schluessel vorbei
--
-- Bei A lief alles richtig: die Bestellung kam um 16:56 rein, Sekunden
-- spaeter hat der Drucker den Bon abgeholt. Trotzdem kam kein Zettel.
--
-- Der Grund WAR da. Der Epson schickt nach jedem Auftrag eine Rueckmeldung
-- mit Fehlercode (EPTR_REC_EMPTY = kein Papier, DeviceNotFound = falsche
-- Geraete-ID, SchemaError = XML abgelehnt). pos-print.js liest sie sogar --
-- und schrieb sie NUR nach console.log bei Netlify. Also dorthin, wo weder
-- der Wirt noch ich hinsehen koennen.
--
-- Bei B und C dasselbe Muster: sie werden bei JEDER Anfrage abgewiesen,
-- seit Stunden, und niemand erfaehrt es. Ein falscher Schluessel und ein
-- ruhiger Abend sehen von aussen gleich aus.
--
-- Die Meldungen gehen ab jetzt nach restaurant_events (die Tabelle gibt es
-- seit Schritt 20). Neu ist nur EIN Feld: wann zuletzt wegen eines falschen
-- Schluessels gewarnt wurde -- sonst schriebe ein abgewiesener Drucker
-- 1.437 gleiche Zeilen pro Tag. Am 27.08. hat uns genau das schon einmal
-- 96 E-Mails in einer Nacht eingebracht.
--
-- Die Spalte wird im ohnehin vorhandenen SELECT mitgelesen. Kosten: null
-- zusaetzliche Anfragen.

alter table public.restaurants
    add column if not exists printer_last_error_at timestamptz;

comment on column public.restaurants.printer_last_error_at is
    'Wann zuletzt wegen eines abgewiesenen Druckers gewarnt wurde. Begrenzt die Meldungen auf hoechstens eine pro Stunde.';
