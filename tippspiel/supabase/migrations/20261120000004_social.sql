-- TippArena – Rangliste, Tippgruppen, Statistik, Realtime

-- ───── Rangliste ─────
-- Gewinn = Summe(Auszahlung − Einsatz) aller im Zeitraum abgerechneten Wetten.
-- p_period: 'week' (ab Montag, Berlin), 'month', 'all'
-- p_group : optional – dann nur Mitglieder dieser Gruppe (Aufrufer muss Mitglied sein)
create or replace function public.leaderboard(p_period text default 'week', p_group uuid default null,
                                              p_limit int default 100)
returns table(rank bigint, user_id uuid, username text, profit bigint,
              bets_settled bigint, bets_won bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz;
begin
  if p_group is not null and not is_group_member(p_group) then
    raise exception 'NOT_A_MEMBER';
  end if;
  v_from := case p_period
    when 'week'  then date_trunc('week',  now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
    when 'month' then date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
    when 'all'   then '-infinity'::timestamptz
    else null end;
  if v_from is null then raise exception 'INVALID_PERIOD'; end if;

  return query
  with agg as (
    select b.user_id,
           sum(b.payout - b.stake)::bigint as profit,
           count(*)                         as n,
           count(*) filter (where b.status in ('won','cashed_out') and b.payout > b.stake) as w
      from bets b
     where b.status <> 'open' and b.settled_at >= v_from
       and (p_group is null or exists (select 1 from group_members gm
                                        where gm.group_id = p_group and gm.user_id = b.user_id))
     group by b.user_id
  )
  select rank() over (order by a.profit desc), a.user_id, p.username, a.profit, a.n, a.w,
         a.user_id = auth.uid()
    from agg a join profiles p on p.id = a.user_id
   order by a.profit desc, p.username
   limit least(greatest(p_limit, 1), 500);
end $$;

-- ───── Tippgruppen ─────
create or replace function public.create_group(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if (select count(*) from groups where owner_id = v_uid) >= 10 then
    raise exception 'TOO_MANY_GROUPS';
  end if;
  loop
    -- 8 Zeichen ohne verwechselbare (0/O, 1/I/l)
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random()*31)::int, 1), '')
                 from generate_series(1, 8));
    exit when not exists (select 1 from groups where invite_code = v_code);
  end loop;
  insert into groups(name, invite_code, owner_id) values (trim(p_name), v_code, v_uid) returning id into v_id;
  insert into group_members(group_id, user_id, role) values (v_id, v_uid, 'owner');
  return jsonb_build_object('id', v_id, 'invite_code', v_code);
end $$;

-- Vorschau vor dem Beitreten (Name + Mitgliederzahl), ohne Mitglied zu sein
create or replace function public.group_preview(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'name', g.name,
           'members', (select count(*) from group_members m where m.group_id = g.id))
    from groups g where g.invite_code = upper(trim(p_code))
$$;

create or replace function public.join_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); g groups;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into g from groups where invite_code = upper(trim(p_code));
  if not found then return jsonb_build_object('ok', false, 'code', 'GROUP_NOT_FOUND'); end if;
  if (select count(*) from group_members where group_id = g.id) >= 500 then
    return jsonb_build_object('ok', false, 'code', 'GROUP_FULL');
  end if;
  insert into group_members(group_id, user_id) values (g.id, v_uid) on conflict do nothing;
  return jsonb_build_object('ok', true, 'id', g.id, 'name', g.name);
end $$;

create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_next uuid;
begin
  delete from group_members where group_id = p_group and user_id = v_uid;
  if not found then return; end if;
  if (select owner_id from groups where id = p_group) = v_uid then
    -- Besitz an das älteste Mitglied übergeben, sonst Gruppe löschen
    select user_id into v_next from group_members where group_id = p_group order by joined_at limit 1;
    if v_next is null then
      delete from groups where id = p_group;
    else
      update groups set owner_id = v_next where id = p_group;
      update group_members set role = 'owner' where group_id = p_group and user_id = v_next;
    end if;
  end if;
end $$;

create or replace function public.group_member_list(p_group uuid)
returns table(user_id uuid, username text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.username, m.role, m.joined_at
    from group_members m join profiles p on p.id = m.user_id
   where m.group_id = p_group and is_group_member(p_group)
   order by m.joined_at
$$;

-- ───── Profil-Statistik ─────
create or replace function public.my_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from bets where user_id = auth.uid()),
  fav as (
    select l.title, count(*) n from b
      join bet_selections s on s.bet_id = b.id
      join events e on e.id = s.event_id
      join leagues l on l.key = e.league_key
     group by l.title order by n desc limit 1)
  select jsonb_build_object(
    'bets_total',   (select count(*) from b),
    'bets_open',    (select count(*) from b where status = 'open'),
    'bets_won',     (select count(*) from b where status in ('won','cashed_out') and payout > stake),
    'bets_decided', (select count(*) from b where status in ('won','lost','cashed_out')),
    'hit_rate',     (select round(100.0 * count(*) filter (where status in ('won','cashed_out') and payout > stake)
                                  / nullif(count(*) filter (where status in ('won','lost','cashed_out')), 0), 1) from b),
    'biggest_win',  (select max(payout - stake) from b where payout > stake),
    'profit_total', (select coalesce(sum(payout - stake), 0) from b where status <> 'open'),
    'favorite_league', (select title from fav))
$$;

grant execute on function public.leaderboard(text, uuid, int), public.create_group(text),
                          public.group_preview(text), public.join_group(text),
                          public.leave_group(uuid), public.group_member_list(uuid),
                          public.my_stats()
  to authenticated;
grant execute on all functions in schema public to service_role;

-- ───── Realtime ─────
-- Quoten & Spielstände live; eigene Wetten/Guthaben (RLS gilt auch für Realtime).
alter publication supabase_realtime add table
  public.events, public.markets, public.outcomes, public.boosts, public.wallets, public.bets;
-- Für UPDATE-Payloads mit alter Quote:
alter table public.outcomes replica identity full;
