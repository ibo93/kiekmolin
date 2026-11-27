-- EINMAL im SQL-Editor des TippArena-Projekts ausführen, NACHDEM
-- die Edge Function "sync" deployed ist und die Secrets gesetzt sind.
-- Die beiden Werte stehen im Vault, nicht im Klartext in einer Migration.
--
--   select vault.create_secret('https://<PROJEKT-REF>.supabase.co', 'project_url');
--   select vault.create_secret('<derselbe Wert wie Secret CRON_SECRET>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('tipparena-sync', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000)
$$);
