-- 1) Was die KI zu den Fotos sagt (zu dunkel, unscharf … / Ware, die nicht
--    im Katalog steht). Bisher gab scan-erkennen das zurück, und die App warf
--    es weg – der Mitarbeiter erfuhr nie, dass er nochmal fotografieren sollte.
alter table scans add column if not exists erkennung_hinweise jsonb;

-- 2) Löschfrist geändert → gilt auch für Fotos, die schon hochgeladen sind.
--    Vorher bekam nur ein NEUES Foto die neue Frist: wer von 30 auf 7 Tage
--    ging, behielt die alten Fotos trotzdem 30 Tage. Auf den Fotos können
--    Mitarbeiter zu sehen sein (THECHEF.md, Datenschutz).
--    Ist die neue Frist schon abgelaufen, löscht der nächtliche Zeitplan.
create or replace function loeschfrist_anwenden() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.foto_loeschfrist_tage is distinct from old.foto_loeschfrist_tage then
    update scan_fotos
       set loeschen_am = aufgenommen_am + make_interval(days => new.foto_loeschfrist_tage)
     where betrieb_id = new.id and not geloescht;
  end if;
  return new;
end $$;
revoke all on function loeschfrist_anwenden() from public;

drop trigger if exists loeschfrist_anwenden on betriebe;
create trigger loeschfrist_anwenden
  after update of foto_loeschfrist_tage on betriebe
  for each row execute function loeschfrist_anwenden();
