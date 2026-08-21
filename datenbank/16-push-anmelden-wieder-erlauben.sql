-- Schritt 16 -- MEIN FEHLER AUS SCHRITT 15.
--
--
-- WAS DIE PRUEFSEITE GEMELDET HAT
-- -------------------------------
--     HTTP 401 -- code 42501
--     new row violates row-level security policy
--     for table "push_subscriptions"
--
-- Die Anmeldung eines Geraets wird von den Regeln abgewiesen, die ich
-- in Schritt 15 selbst geschrieben habe.
--
--
-- WARUM, GENAU
-- ------------
-- Die App meldet ein Geraet mit einem Upsert an:
--
--     POST /rest/v1/push_subscriptions?on_conflict=endpoint
--     Prefer: resolution=merge-duplicates
--
-- Das ist in der Datenbank ein "insert ... on conflict do update".
-- Postgres prueft dabei NICHT nur die INSERT-Regel, sondern auch die
-- UPDATE-Regel -- und die hiess bei mir:
--
--     using (public.kmi_ist_superadmin())
--
-- Fehlt bei einer UPDATE-Regel das "with check", gilt das "using" auch
-- dafuer. Fuer jeden, der nicht Superadmin ist -- also fuer jedes
-- Handy eines Wirts und fuer jeden Gast -- war damit Schluss.
--
-- Die INSERT-Regel allein ("with check (true)") war grosszuegig genug.
-- Sie kam nur nie zum Zug.
--
--
-- WAS ICH FALSCH GEDACHT HABE
-- ---------------------------
-- Ich habe die vier Regeln nach dem Muster von customers gebaut: lesen,
-- anlegen, aendern, loeschen -- und Aendern dem Superadmin vorbehalten.
-- Bei customers stimmt das. Bei push_subscriptions nicht, weil dort
-- jedes Anmelden technisch ein Aendern sein kann.
--
-- Ein Muster zu uebertragen, ohne zu pruefen, wie die App die Tabelle
-- tatsaechlich benutzt, war der Fehler.
--
--
-- WAS JETZT GILT
-- --------------
-- ANLEGEN und AENDERN: jeder. Ohne das kann sich kein Geraet anmelden,
--   und ohne angemeldetes Geraet gibt es keine Benachrichtigung.
--
--   Missbrauch verhindert weiterhin der Ausloeser aus Schritt 15: er
--   nagelt restaurant_id und customer_email auf das fest, wozu der
--   Angemeldete wirklich gehoert. Wer sich als fremder Betrieb oder als
--   Superadmin eintragen will, bekommt dort ein NULL.
--
--   Bleibt: wer den endpoint eines fremden Geraets kennt, koennte
--   dessen Zeile ueberschreiben. Der endpoint kommt vom Push-Dienst des
--   Herstellers, ist mehrere hundert Zeichen lang und nirgends
--   ablesbar. Das ist ein hinnehmbarer Rest -- eine Tabelle, in die
--   sich niemand eintragen kann, ist kein Schutz, sondern ein Ausfall.
--
-- LESEN und LOESCHEN: weiterhin nur der Superadmin. Das ist der Teil,
--   auf den es ankommt -- dort stehen Telefonnummern und E-Mail-
--   Adressen von Gaesten. Die Netlify-Funktionen lesen mit dem
--   Dienstschluessel und gehen an allen Regeln vorbei.
--
--
-- RUECKNAHME -- IN EIN ZWEITES FENSTER LEGEN:
--     alter table public.push_subscriptions disable row level security;


drop policy if exists "Nur der Superadmin aendert Geraete" on public.push_subscriptions;

-- Beides ausdruecklich hinschreiben. Steht nur "using" da, gilt es
-- stillschweigend auch als "with check" -- genau diese Stille war der
-- Fehler in Schritt 15.
create policy "Jedes Geraet darf sich neu eintragen"
    on public.push_subscriptions for update
    using (true)
    with check (true);

-- Die INSERT-Regel war schon richtig; hier nur zur Sicherheit noch
-- einmal, falls Schritt 15 nur halb durchlief.
drop policy if exists "Jedes Geraet darf sich anmelden" on public.push_subscriptions;
create policy "Jedes Geraet darf sich anmelden"
    on public.push_subscriptions for insert
    with check (true);


-- Gegenprobe. Erwartet: vier Regeln, und bei UPDATE steht jetzt
-- "Jedes Geraet darf sich neu eintragen".
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'push_subscriptions'
 order by cmd;


-- ============================================================
-- DANACH: DIE PRUEFSEITE NOCH EINMAL
-- ============================================================
-- Auf dem Handy, aus der App vom Home-Bildschirm heraus:
--
--     kiekmolin.de/push-check.html
--
-- Der Punkt "In der Datenbank eingetragen" muss gruen werden. Danach
-- steht die Zeile hier:
--
--     select created_at, customer_email, restaurant_id,
--            left(coalesce(p256dh_key, ''), 12) as schluessel_anfang
--       from public.push_subscriptions
--      order by created_at desc limit 5;
