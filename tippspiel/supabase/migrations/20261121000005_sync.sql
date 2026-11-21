-- TippArena – Abruf echter Spiele & Quoten (The Odds API)
-- Schreibt nur die service_role (Edge Function "sync").

alter table public.leagues
  add column odds_priority    int not null default 100,   -- kleiner = wichtiger (Kontingent)
  add column last_odds_sync   timestamptz,
  add column last_scores_sync timestamptz,
  add column source           text not null default 'seed';

alter table public.events
  add column lambda_home   numeric(6,3),                   -- Modell-Torerwartung (für Live-Quoten)
  add column lambda_away   numeric(6,3),
  add column bookmakers    int,                            -- aus wie vielen Buchmachern der Konsens stammt
  add column odds_source   text not null default 'seed' check (odds_source in ('seed','api','model'));

-- Jeder API-Abruf wird protokolliert: Kosten, Restkontingent, Fehler.
-- Sonst sähe ein leeres Kontingent aus wie "heute keine Spiele" (stiller Ausfall).
create table public.api_usage (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  endpoint   text not null,
  status     int,
  cost       int,
  remaining  int,
  used       int,
  items      int,
  note       text
);
create index on public.api_usage(at desc);
alter table public.api_usage enable row level security;   -- keine Policy: Clients sehen nichts

insert into public.app_config(key, value, note) values
  ('odds_max_leagues',   12, 'So viele Ligen werden regelmäßig abgerufen (nach Priorität)'),
  ('odds_calls_per_run',  4, 'Höchstens so viele Quoten-Abrufe pro Lauf'),
  ('scores_interval_min',10, 'Ergebnis-Abruf je Liga mit laufendem Spiel alle X Minuten'),
  ('credits_fallback',  500, 'Angenommenes Kontingent, solange kein Abruf die Kopfzeile geliefert hat')
on conflict (key) do nothing;

-- Ein Spiel samt Märkten in EINER Transaktion schreiben.
-- p_event:   {id, league_key, sport_key, home_team, away_team, commence_time, bookmakers, lambda_home, lambda_away, odds_source}
-- p_markets: [{key, line, name, source, sort, outcomes:[{name,label,price,point}]}]
-- Märkte, die nicht mehr geliefert werden, werden gesperrt (nicht gelöscht – Wetten hängen daran).
create or replace function public.upsert_event_markets(p_event jsonb, p_markets jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_m jsonb; v_o jsonb; v_mid uuid; v_keep uuid[] := '{}'; v_n int := 0; v_status event_status;
begin
  select status into v_status from events where id = p_event->>'id';
  if v_status in ('finished','cancelled') then return 0; end if;   -- abgerechnete Spiele nie mehr anfassen

  insert into events(id, league_key, sport_key, home_team, away_team, commence_time,
                     bookmakers, lambda_home, lambda_away, odds_source, last_odds_update)
  values (p_event->>'id', p_event->>'league_key', p_event->>'sport_key', p_event->>'home_team',
          p_event->>'away_team', (p_event->>'commence_time')::timestamptz,
          (p_event->>'bookmakers')::int, (p_event->>'lambda_home')::numeric, (p_event->>'lambda_away')::numeric,
          coalesce(p_event->>'odds_source','api'), now())
  on conflict (id) do update set
    commence_time    = excluded.commence_time,
    bookmakers       = coalesce(excluded.bookmakers, events.bookmakers),
    lambda_home      = coalesce(excluded.lambda_home, events.lambda_home),
    lambda_away      = coalesce(excluded.lambda_away, events.lambda_away),
    odds_source      = excluded.odds_source,
    last_odds_update = now();

  for v_m in select * from jsonb_array_elements(p_markets) loop
    insert into markets(event_id, key, line, name, source, sort, status)
    values (p_event->>'id', v_m->>'key', nullif(v_m->>'line','')::numeric, v_m->>'name',
            v_m->>'source', (v_m->>'sort')::int, 'open')
    on conflict (event_id, key, line) do update set name = excluded.name, source = excluded.source,
      sort = excluded.sort, status = case when markets.status = 'settled' then markets.status else 'open' end
    returning id into v_mid;
    v_keep := v_keep || v_mid;

    for v_o in select * from jsonb_array_elements(v_m->'outcomes') loop
      insert into outcomes(market_id, event_id, name, label, price, point)
      values (v_mid, p_event->>'id', v_o->>'name', v_o->>'label', (v_o->>'price')::numeric,
              nullif(v_o->>'point','')::numeric)
      on conflict (market_id, name) do update set label = excluded.label, price = excluded.price,
        point = excluded.point,
        status = case when outcomes.status in ('won','lost','void') then outcomes.status else 'open' end;
      v_n := v_n + 1;
    end loop;
  end loop;

  update markets set status = 'suspended'
   where event_id = p_event->>'id' and status = 'open' and not (id = any(v_keep));
  return v_n;
end $$;

-- Spielstand übernehmen. Beendet → abrechnen. Rückgabe: hat sich der Stand geändert?
create or replace function public.apply_score(p_event text, p_home int, p_away int,
                                              p_completed boolean, p_minute text) returns boolean
language plpgsql security definer set search_path = public as $$
declare e events; v_changed boolean;
begin
  select * into e from events where id = p_event for update;
  if not found or e.status in ('finished','cancelled') then return false; end if;
  v_changed := e.home_score is distinct from p_home or e.away_score is distinct from p_away;

  update events set home_score = p_home, away_score = p_away, minute = p_minute,
         status = case when p_completed then 'finished'::event_status
                       when p_home is not null then 'live'::event_status else status end,
         last_score_update = now()
   where id = p_event;

  -- Tor gefallen → Märkte sofort sperren, bis neue Quoten gerechnet sind
  if v_changed and not p_completed then
    update markets set status = 'suspended' where event_id = p_event and status = 'open';
  end if;
  if p_completed then perform settle_event(p_event); end if;
  return v_changed;
end $$;

-- Demo-Spiele entfernen, sobald echte da sind (nur die ohne Wetten).
create or replace function public.remove_demo_events() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not exists (select 1 from events where odds_source = 'api') then return 0; end if;
  delete from events e where e.id like 'demo\_%'
     and not exists (select 1 from bet_selections s where s.event_id = e.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.upsert_event_markets(jsonb, jsonb), public.apply_score(text,int,int,boolean,text),
                           public.remove_demo_events() from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant all on public.api_usage to service_role;
