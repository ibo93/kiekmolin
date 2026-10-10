-- Ein Gerät (Apple-Token bzw. Browser-Abo) gehört dem, der zuletzt darauf
-- angemeldet ist. Vorher traf das Speichern auf einem geteilten Küchen-iPad
-- die Zeile des ALTEN Nutzers: die Regel push_eigen verweigerte das Update
-- (Fehler beim Einschalten), und das Gerät bekam weiter die Mitteilungen
-- des alten Nutzers. Gefunden beim Durchsehen am 02.10.2026.
create or replace function push_abo_speichern(p_art text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := meine_betrieb_id();
begin
  if auth.uid() is null or b is null then raise exception 'nicht_angemeldet'; end if;
  if coalesce(trim(p_endpoint), '') = '' then raise exception 'push_ohne_ziel'; end if;
  delete from push_abos where endpoint = p_endpoint;
  insert into push_abos (betrieb_id, nutzer_id, art, endpoint, p256dh, auth)
  values (b, auth.uid(), p_art, p_endpoint, p_p256dh, p_auth);
end $$;
revoke all on function push_abo_speichern(text, text, text, text) from public;
grant execute on function push_abo_speichern(text, text, text, text) to authenticated;
