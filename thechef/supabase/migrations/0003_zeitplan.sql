-- Zeitplan: alle 15 Minuten die Edge Function "zeitplan" aufrufen.
-- Sie entscheidet je Betrieb in dessen Zeitzone, ob jetzt eine
-- Scan-Erinnerung, ein Abend-Briefing oder das Foto-Aufräumen dran ist.
--
-- VORHER im Supabase-Dashboard (Project Settings → Vault) zwei Secrets anlegen:
--   chef_projekt_url   = https://<projekt>.supabase.co
--   chef_zeitplan_key  = derselbe Wert wie das Function-Secret ZEITPLAN_SCHLUESSEL
-- Der Schlüssel steht so nicht im Quelltext.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'the-chef-zeitplan',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'chef_projekt_url') || '/functions/v1/zeitplan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-zeitplan-schluessel', (select decrypted_secret from vault.decrypted_secrets where name = 'chef_zeitplan_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
