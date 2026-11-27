-- TippArena – Push-Benachrichtigungen
-- Ereignisse landen per Trigger in push_queue; die Edge Function "sync"
-- verschickt sie am Ende jedes Laufs (Web Push, VAPID).
-- Einstellungen je Nutzer: profiles.push_prefs {bet_won, event_start, boost}

create table public.push_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('bet_won','event_start','boost')),
  title      text not null,
  body       text not null,
  url        text not null default '/',
  dedupe     text,                          -- verhindert doppelte Meldung (z. B. Spielbeginn)
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  result     text,
  unique (user_id, dedupe)
);
create index on public.push_queue(sent_at) where sent_at is null;
alter table public.push_queue enable row level security;   -- nur service_role
revoke all on public.push_queue from anon, authenticated;

-- Nur einreihen, wenn der Nutzer diese Art Meldung will UND ein Gerät angemeldet hat.
create or replace function public.push_enqueue(p_user uuid, p_kind text, p_title text, p_body text,
                                               p_url text, p_dedupe text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select (push_prefs->>p_kind)::boolean from profiles where id = p_user), false) then return; end if;
  if not exists (select 1 from push_subscriptions where user_id = p_user) then return; end if;
  insert into push_queue(user_id, kind, title, body, url, dedupe)
  values (p_user, p_kind, p_title, p_body, p_url, p_dedupe)
  on conflict (user_id, dedupe) do nothing;
end $$;

-- Wette gewonnen (auch Teilgewinn einer Systemwette)
create or replace function public.trg_bet_won() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'won' and old.status = 'open' then
    perform push_enqueue(new.user_id, 'bet_won', 'Gewonnen! 🎉',
      'Deine Wette bringt ' || new.payout || ' Coins.', '/wetten', 'bet_won:' || new.id);
  end if;
  return new;
end $$;
create trigger push_bet_won after update of status on public.bets
  for each row execute function public.trg_bet_won();

-- Spiel beginnt: alle, die auf das Spiel getippt haben (offene Wetten)
create or replace function public.trg_event_start() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if new.status = 'live' and old.status = 'scheduled' then
    for v_user in select distinct b.user_id from bet_selections s join bets b on b.id = s.bet_id
                   where s.event_id = new.id and b.status = 'open' loop
      perform push_enqueue(v_user, 'event_start', 'Anpfiff ⚽',
        new.home_team || ' – ' || new.away_team || ' läuft. Dein Tipp ist dabei.',
        '/event/' || new.id, 'event_start:' || new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger push_event_start after update of status on public.events
  for each row execute function public.trg_event_start();

-- Boost-Alarm: einmal pro Tag an alle, die ihn wollen (beim ersten Boost des Tages)
create or replace function public.trg_boost() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  for v_user in select p.id from profiles p
                 where coalesce((p.push_prefs->>'boost')::boolean, false)
                   and exists (select 1 from push_subscriptions s where s.user_id = p.id) loop
    perform push_enqueue(v_user, 'boost', 'Boost des Tages ⚡', new.title || ' – jetzt erhöhte Quote',
      '/', 'boost:' || new.valid_date);
  end loop;
  return new;
end $$;
create trigger push_boost after insert on public.boosts
  for each row execute function public.trg_boost();

revoke execute on function public.push_enqueue(uuid,text,text,text,text,text) from public, anon, authenticated;
grant all on public.push_queue to service_role;
grant execute on all functions in schema public to service_role;
