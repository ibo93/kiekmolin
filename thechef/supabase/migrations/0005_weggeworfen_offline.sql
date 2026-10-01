-- Weggeworfen auch ohne Netz: die Meldung liegt erst auf dem Handy und wird
-- später hochgeladen. lokal_id macht das Hochladen wiederholbar – kommt dieselbe
-- Meldung zweimal an (Netz bricht nach dem Senden ab), zählt sie nur einmal.
alter table weggeworfen add column lokal_id uuid unique;
