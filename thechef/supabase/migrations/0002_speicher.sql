-- Foto-Speicher. Beide Buckets privat: auf Scan-Fotos können Mitarbeiter
-- zu sehen sein. Pfad beginnt IMMER mit der Betriebs-ID:
--   scan-fotos/<betrieb_id>/<scan_id>/<foto_id>.jpg
--   katalog/<betrieb_id>/produkte/<produkt_id>.jpg
--   katalog/<betrieb_id>/positionen/<position_id>.jpg

insert into storage.buckets (id, name, public)
values ('scan-fotos', 'scan-fotos', false), ('katalog', 'katalog', false)
on conflict (id) do nothing;

create policy "chef_fotos_lesen" on storage.objects for select to authenticated
  using (bucket_id in ('scan-fotos', 'katalog')
         and (storage.foldername(name))[1] = public.meine_betrieb_id()::text);

create policy "chef_fotos_hochladen" on storage.objects for insert to authenticated
  with check (bucket_id in ('scan-fotos', 'katalog')
              and (storage.foldername(name))[1] = public.meine_betrieb_id()::text);

-- Katalogfotos ersetzen/löschen nur der Chef; Scan-Fotos löscht nur der Server (Löschfrist).
create policy "chef_katalog_aendern" on storage.objects for update to authenticated
  using (bucket_id = 'katalog' and (storage.foldername(name))[1] = public.meine_betrieb_id()::text and public.bin_chef());
create policy "chef_katalog_loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'katalog' and (storage.foldername(name))[1] = public.meine_betrieb_id()::text and public.bin_chef());
