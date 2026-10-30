-- SITZDAUER AN DEN TISCHEN (29.10.2026).
--
-- Ibo: "eine KI-Kamera ... misst, wie lange die sitzen, wie es sich fuellt".
-- Statt einer Kamera (DSGVO, Personal wird mitgefilmt) nehmen wir, was der
-- Wirt ohnehin tippt: "Ist da" (status seated) und "Fertig" (finished).
-- Bisher wurde nur der Status gespeichert, nicht WANN.
--
-- Die DATENBANK setzt die Uhrzeit selbst (Trigger), egal ob der Status im
-- Tischplan, in der Liste, ueber die Funktion update_reservation_details
-- oder spaeter von einer Kasse kommt. Die App muss dafuer nichts schreiben
-- -- und solange dieses Skript nicht lief, geht beim Statuswechsel nichts
-- kaputt (die App liest die Spalten nur, und meldet es, wenn sie fehlen).
--
-- Mehrfach ausfuehrbar.

alter table public.reservations add column if not exists seated_at timestamptz;
alter table public.reservations add column if not exists finished_at timestamptz;

create or replace function public.kmi_res_zeiten() returns trigger
language plpgsql as $$
begin
    -- Platz genommen: erste Uhrzeit behalten (zweimal "Ist da" verschiebt nichts).
    if new.status = 'seated' then
        if new.seated_at is null then new.seated_at := now(); end if;
        -- Versehentlich "Fertig" und zurueck auf "Ist da": Ende wieder offen.
        if tg_op = 'UPDATE' and old.status in ('finished', 'completed') then new.finished_at := null; end if;
    end if;
    if new.status in ('finished', 'completed') and new.finished_at is null then
        new.finished_at := now();
    end if;
    return new;
end $$;

drop trigger if exists kmi_res_zeiten on public.reservations;
create trigger kmi_res_zeiten
    before insert or update of status on public.reservations
    for each row execute function public.kmi_res_zeiten();

-- PRUEFEN: beide Zeilen muessen erscheinen.
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'reservations'
--    and column_name in ('seated_at', 'finished_at');
