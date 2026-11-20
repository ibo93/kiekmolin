-- TippArena – Wetten platzieren, Cash-Out, Abrechnung, Boosts
-- Alle Funktionen hier sind PRIVAT (nur service_role = Edge Functions),
-- außer my_cashout_values() – die rechnet nur und schreibt nichts.
-- Die Logik liegt in SQL statt in der Edge Function, damit Prüfung und
-- Abbuchung in EINER Transaktion mit Zeilensperre passieren: zwei schnelle
-- Klicks können so nicht zweimal dasselbe Guthaben verwetten.

-- ───── kleine Bausteine ─────

-- Alle k-Kombinationen aus 1..n (Systemwette)
create or replace function public.k_combinations(n int, k int) returns setof int[]
language sql immutable as $$
  with recursive c(arr, last) as (
    select array[i], i from generate_series(1, n) i
    union all
    select c.arr || j, j from c, generate_series(c.last + 1, n) j
     where cardinality(c.arr) < k
  )
  select arr from c where cardinality(arr) = k
$$;

-- Produkt eines numeric-Arrays. Bewusst echte Multiplikation statt exp(sum(ln)):
-- ln/exp liefert 2,9999999… statt 3 – und floor() macht daraus 1 Coin zu wenig.
create or replace function public.array_product(a numeric[]) returns numeric
language plpgsql immutable as $$
declare r numeric := 1; x numeric;
begin
  foreach x in array coalesce(a, '{}') loop r := r * x; end loop;
  return r;
end $$;

-- Märkte, die im Wetten-Konfigurator nicht zusammen dürfen (gleiche "Familie"),
-- weil sie dasselbe vorhersagen: Sieg + Doppelte Chance wäre sonst geschenkte Quote.
create or replace function public.market_family(p_key text) returns text
language sql immutable as $$
  select case
    when p_key in ('h2h','double_chance','draw_no_bet','spreads') then 'result'
    when p_key in ('totals')    then 'goals'
    when p_key in ('btts')      then 'btts'
    when p_key in ('h2h_h1')    then 'result_h1'
    when p_key in ('totals_h1') then 'goals_h1'
    else p_key end
$$;

-- Aktuell gültige Quote (Boost des Tages hat Vorrang)
create or replace function public.effective_price(p_outcome uuid) returns numeric
language sql stable as $$
  select coalesce(
    (select b.boosted_price from public.boosts b
      where b.outcome_id = p_outcome and b.valid_date = public.berlin_today()),
    (select o.price from public.outcomes o where o.id = p_outcome))
$$;

-- Ist ein Tipp gerade wettbar? NULL = ja, sonst Grund.
create or replace function public.outcome_block_reason(p_outcome uuid) returns text
language sql stable as $$
  select case
    when o.id is null                       then 'NOT_FOUND'
    when e.status in ('finished','cancelled','postponed') then 'EVENT_OVER'
    when o.status <> 'open' or m.status <> 'open' then 'SUSPENDED'
    when e.status = 'scheduled' and e.commence_time <= now() then 'EVENT_STARTED'
    when e.status = 'live' and (e.last_odds_update is null or
         e.last_odds_update < now() - make_interval(secs => public.cfg('live_odds_max_age_s')::int))
                                            then 'ODDS_STALE'
    else null end
  from (select p_outcome as id) x
  left join public.outcomes o on o.id = x.id
  left join public.markets  m on m.id = o.market_id
  left join public.events   e on e.id = o.event_id
$$;

-- ───── Wette(n) platzieren ─────
-- p_bets: [{ "type":"single|combo|system|builder", "system_k":2, "stake":50,
--            "selections":[{"outcome_id":"…","price":1.85}, …] }, …]
-- Mehrere Einzelwetten aus dem Wettschein kommen als mehrere Einträge –
-- alle oder keine (eine Transaktion).
-- Rückgabe: {ok:true, bet_ids, balance} oder {ok:false, code, …}
create or replace function public.place_bets(p_user uuid, p_bets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bet jsonb; v_sel jsonb;
  v_type bet_type; v_k int; v_n int; v_stake bigint;
  v_prices numeric[]; v_events text[]; v_families text[];
  v_odds numeric; v_factor numeric; v_lines int; v_potential numeric;
  v_total_stake bigint := 0;
  v_changes jsonb := '[]'; v_blocked jsonb := '[]';
  v_reason text; v_eff numeric; v_ev text; v_fam text;
  v_balance bigint; v_bet_id uuid; v_ids uuid[] := '{}'; v_pos int;
  v_plan jsonb := '[]';
begin
  if p_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) = 0
     or jsonb_array_length(p_bets) > 20 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  -- Durchgang 1: prüfen, nichts schreiben
  for v_bet in select * from jsonb_array_elements(p_bets) loop
    begin
      v_type  := (v_bet->>'type')::bet_type;
      v_k     := nullif(v_bet->>'system_k', '')::int;
      if (v_bet->>'stake')::numeric <> trunc((v_bet->>'stake')::numeric) then  -- nur ganze Coins
        return jsonb_build_object('ok', false, 'code', 'INVALID_STAKE');
      end if;
      v_stake := (v_bet->>'stake')::numeric::bigint;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end;
    if v_stake < cfg('min_stake') or v_stake > cfg('max_stake') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STAKE',
        'min', cfg('min_stake'), 'max', cfg('max_stake'));
    end if;
    if jsonb_typeof(v_bet->'selections') <> 'array' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end if;
    v_n := jsonb_array_length(v_bet->'selections');

    -- Form der Wette
    if (v_type = 'single'  and v_n <> 1)
    or (v_type in ('combo','builder') and (v_n < 2 or v_n > cfg('max_selections')))
    or (v_type = 'system'  and (v_n < 3 or v_n > 8 or v_k is null or v_k < 2 or v_k >= v_n))
    or (v_type <> 'system' and v_k is not null) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_BET_SHAPE');
    end if;

    v_prices := '{}'; v_events := '{}'; v_families := '{}';
    for v_sel in select * from jsonb_array_elements(v_bet->'selections') loop
      -- Zeile sperren: Quote darf sich zwischen Prüfen und Buchen nicht ändern
      perform 1 from outcomes where id = (v_sel->>'outcome_id')::uuid for share;
      v_reason := outcome_block_reason((v_sel->>'outcome_id')::uuid);
      if v_reason is not null then
        v_blocked := v_blocked || jsonb_build_object('outcome_id', v_sel->>'outcome_id', 'reason', v_reason);
        continue;
      end if;
      v_eff := effective_price((v_sel->>'outcome_id')::uuid);
      if v_eff is distinct from (v_sel->>'price')::numeric then
        v_changes := v_changes || jsonb_build_object('outcome_id', v_sel->>'outcome_id',
                       'old_price', (v_sel->>'price')::numeric, 'new_price', v_eff);
      end if;
      v_prices := v_prices || v_eff;
      select o.event_id, market_family(m.key) into v_ev, v_fam
        from outcomes o join markets m on m.id = o.market_id
       where o.id = (v_sel->>'outcome_id')::uuid;
      v_events := v_events || v_ev;
      v_families := v_families || v_fam;
    end loop;

    if jsonb_array_length(v_blocked) = 0 then
      -- Kombi/System: jedes Spiel nur einmal. Konfigurator: genau ein Spiel,
      -- jede Markt-Familie nur einmal.
      if v_type in ('combo','system')
         and (select count(distinct e) from unnest(v_events) e) <> v_n then
        return jsonb_build_object('ok', false, 'code', 'SAME_EVENT_IN_COMBO');
      end if;
      if v_type = 'builder' and (
           (select count(distinct e) from unnest(v_events) e) <> 1
        or (select count(distinct f) from unnest(v_families) f) <> v_n) then
        return jsonb_build_object('ok', false, 'code', 'BUILDER_CONFLICT');
      end if;

      v_factor := case when v_type = 'builder' then power(cfg('builder_factor'), v_n - 1) else 1 end;
      if v_type = 'system' then
        select count(*), sum(array_product(array(select v_prices[i] from unnest(c) i)))
          into v_lines, v_potential from k_combinations(v_n, v_k) c;
        v_odds := v_potential / v_lines;              -- Durchschnittsquote je Reihe
        v_potential := v_stake::numeric / v_lines * v_potential;
      else
        v_lines := 1;
        v_odds := greatest(1.01, array_product(v_prices) * v_factor);
        v_potential := v_stake * v_odds;
      end if;
      if v_potential > cfg('max_payout') then
        return jsonb_build_object('ok', false, 'code', 'MAX_PAYOUT_EXCEEDED', 'max', cfg('max_payout'));
      end if;
      v_plan := v_plan || jsonb_build_object('type', v_type, 'k', v_k, 'stake', v_stake,
                 'lines', v_lines, 'odds', round(v_odds, 3), 'factor', v_factor,
                 'potential', floor(v_potential), 'selections', v_bet->'selections');
      v_total_stake := v_total_stake + v_stake;
    end if;
  end loop;

  if jsonb_array_length(v_blocked) > 0 then
    return jsonb_build_object('ok', false, 'code', 'SELECTION_UNAVAILABLE', 'selections', v_blocked);
  end if;
  if jsonb_array_length(v_changes) > 0 then
    return jsonb_build_object('ok', false, 'code', 'ODDS_CHANGED', 'changes', v_changes);
  end if;

  select balance into v_balance from wallets where user_id = p_user for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_balance < v_total_stake then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_COINS',
                              'balance', v_balance, 'needed', v_total_stake);
  end if;

  -- Durchgang 2: buchen
  for v_bet in select * from jsonb_array_elements(v_plan) loop
    insert into bets(user_id, type, system_k, lines, stake, stake_per_line,
                     total_odds, odds_factor, potential_payout)
    values (p_user, (v_bet->>'type')::bet_type, (v_bet->>'k')::int, (v_bet->>'lines')::int,
            (v_bet->>'stake')::bigint, (v_bet->>'stake')::numeric / (v_bet->>'lines')::int,
            (v_bet->>'odds')::numeric, (v_bet->>'factor')::numeric, (v_bet->>'potential')::bigint)
    returning id into v_bet_id;

    v_pos := 0;
    for v_sel in select * from jsonb_array_elements(v_bet->'selections') loop
      insert into bet_selections(bet_id, position, outcome_id, event_id, market_key, label,
                                 market_name, event_name, price, boosted)
      select v_bet_id, v_pos, o.id, o.event_id, m.key, o.label, m.name,
             e.home_team || ' – ' || e.away_team, effective_price(o.id),
             exists(select 1 from boosts b where b.outcome_id = o.id and b.valid_date = berlin_today())
        from outcomes o join markets m on m.id = o.market_id join events e on e.id = o.event_id
       where o.id = (v_sel->>'outcome_id')::uuid;
      v_pos := v_pos + 1;
    end loop;

    v_balance := wallet_apply(p_user, -(v_bet->>'stake')::bigint, 'bet_stake', v_bet_id);
    v_ids := v_ids || v_bet_id;
  end loop;

  return jsonb_build_object('ok', true, 'bet_ids', to_jsonb(v_ids), 'balance', v_balance);
end $$;

-- ───── Abrechnung ─────

-- Ergebnis eines einzelnen Tipps aus dem Spielstand.
-- Halbzeit-Märkte: Die Odds API liefert KEINEN Halbzeitstand. Fehlt er,
-- wird der Tipp "void" (Einsatz zurück) – lieber erstatten als raten.
create or replace function public.outcome_result(
  p_key text, p_name text, p_point numeric,
  ft_h int, ft_a int, ht_h int, ht_a int
) returns public.outcome_status
language plpgsql immutable as $$
declare h int; a int; d numeric; won boolean;
begin
  if p_key like '%\_h1' then h := ht_h; a := ht_a; else h := ft_h; a := ft_a; end if;
  if h is null or a is null then return 'void'; end if;

  case
    when p_key in ('h2h','h2h_h1') then
      won := case p_name when 'home' then h > a when 'away' then a > h when 'draw' then h = a end;
    when p_key = 'draw_no_bet' then
      if h = a then return 'void'; end if;
      won := case p_name when 'home' then h > a when 'away' then a > h end;
    when p_key = 'double_chance' then
      won := case p_name when '1X' then h >= a when '12' then h <> a when 'X2' then a >= h end;
    when p_key in ('totals','totals_h1') then
      if p_point is null then return 'void'; end if;
      if h + a = p_point then return 'void'; end if;
      won := case p_name when 'over' then h + a > p_point when 'under' then h + a < p_point end;
    when p_key = 'btts' then
      won := case p_name when 'yes' then h > 0 and a > 0 when 'no' then not (h > 0 and a > 0) end;
    when p_key = 'spreads' then
      if p_point is null then return 'void'; end if;
      d := case p_name when 'home' then h + p_point - a when 'away' then a + p_point - h end;
      if d = 0 then return 'void'; end if;
      won := d > 0;
    else
      return 'void';            -- unbekannter Markt: erstatten statt raten
  end case;

  if won is null then return 'void'; end if;
  return case when won then 'won'::outcome_status else 'lost'::outcome_status end;
end $$;

-- Auszahlung einer Wette berechnen. NULL = noch nicht entscheidbar.
create or replace function public.bet_result(p_bet uuid, out status bet_status, out payout bigint)
language plpgsql stable set search_path = public as $$
declare b bets; v_st selection_status[]; v_pr numeric[]; v_sum numeric := 0; c int[]; v_line numeric; v_dead boolean;
begin
  select * into b from bets where id = p_bet;
  select array_agg(s.status order by s.position), array_agg(s.price order by s.position)
    into v_st, v_pr from bet_selections s where s.bet_id = p_bet;

  if b.type <> 'system' then
    if 'lost' = any(v_st) then status := 'lost'; payout := 0; return; end if;
    if 'open' = any(v_st) then return; end if;
    if not ('won' = any(v_st)) then status := 'void'; payout := b.stake; return; end if;
    -- Konfigurator-Abschlag nur für die tatsächlich gewerteten Tipps
    v_line := array_product(array(select v_pr[i] from generate_subscripts(v_st, 1) i where v_st[i] = 'won'));
    if b.type = 'builder' then
      v_line := greatest(1.01, v_line * power(cfg('builder_factor'),
                  (select count(*) from unnest(v_st) x where x = 'won') - 1));
    end if;
    status := 'won';
    payout := least(floor(b.stake * v_line), cfg('max_payout')::bigint);
    return;
  end if;

  -- Systemwette: erst wenn alles entschieden ist
  if 'open' = any(v_st) then return; end if;
  if not ('won' = any(v_st) or 'lost' = any(v_st)) then
    status := 'void'; payout := b.stake; return;
  end if;
  for c in select * from k_combinations(cardinality(v_st), b.system_k) loop
    v_dead := exists(select 1 from unnest(c) i where v_st[i] = 'lost');
    if not v_dead then
      v_sum := v_sum + b.stake_per_line *
        array_product(array(select case when v_st[i] = 'won' then v_pr[i] else 1 end from unnest(c) i));
    end if;
  end loop;
  payout := least(floor(v_sum), cfg('max_payout')::bigint);
  status := case when payout > 0 then 'won'::bet_status else 'lost'::bet_status end;
end $$;

create or replace function public.settle_bet(p_bet uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare b bets; r record;
begin
  select * into b from bets where id = p_bet for update;
  if not found or b.status <> 'open' then return false; end if;
  select * into r from bet_result(p_bet);
  if r.status is null then return false; end if;
  update bets set status = r.status, payout = r.payout, settled_at = now() where id = p_bet;
  if r.payout > 0 then
    perform wallet_apply(b.user_id, r.payout,
      case when r.status = 'void' then 'bet_refund'::tx_kind else 'bet_payout'::tx_kind end, p_bet);
  end if;
  return true;
end $$;

-- Ein Spiel abrechnen: Tipps werten, dann alle betroffenen Wetten.
-- Idempotent: zweimal aufrufen schadet nicht (settle_bet prüft status='open').
create or replace function public.settle_event(p_event text) returns int
language plpgsql security definer set search_path = public as $$
declare e events; v_bet uuid; v_n int := 0;
begin
  select * into e from events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if e.status = 'cancelled' then
    update outcomes set status = 'void' where event_id = p_event and status in ('open','suspended');
  elsif e.status = 'finished' then
    if e.home_score is null or e.away_score is null then raise exception 'SCORE_MISSING'; end if;
    update outcomes o
       set status = outcome_result(m.key, o.name, coalesce(o.point, m.line),
                                   e.home_score, e.away_score, e.ht_home_score, e.ht_away_score)
      from markets m
     where m.id = o.market_id and o.event_id = p_event and o.status in ('open','suspended');
  else
    return 0;                                   -- läuft noch / verschoben: nichts tun
  end if;
  update markets set status = 'settled' where event_id = p_event;

  update bet_selections s
     set status = o.status::text::selection_status, settled_at = now()
    from outcomes o
   where o.id = s.outcome_id and s.event_id = p_event and s.status = 'open';

  for v_bet in
    select distinct s.bet_id from bet_selections s join bets b on b.id = s.bet_id
     where s.event_id = p_event and b.status = 'open'
  loop
    if settle_bet(v_bet) then v_n := v_n + 1; end if;
  end loop;

  update events set settled_at = now() where id = p_event;
  return v_n;
end $$;

-- ───── Cash-Out ─────
-- Fairer Wert je Tipp: gewonnen → angenommene Quote; offen → angenommen/aktuell;
-- void → 1; verloren → 0. Davon cashout_margin (95 %).
create or replace function public.cashout_value(p_bet uuid) returns bigint
language plpgsql stable set search_path = public as $$
declare b bets; f numeric[] := '{}'; s record; v numeric := 0; c int[]; v_line numeric; v_open int := 0;
begin
  select * into b from bets where id = p_bet;
  if not found or b.status <> 'open' then return null; end if;

  -- aktuelle Quote INKL. Boost: sonst wäre ein Boost sofort mit Gewinn auszahlbar
  -- (angenommen 2,52 / aktuell 2,10 → Cash-Out über dem Einsatz, ohne Risiko)
  for s in select bs.*, effective_price(bs.outcome_id) as cur from bet_selections bs
            where bs.bet_id = p_bet order by bs.position loop
    if s.status = 'open' then
      if outcome_block_reason(s.outcome_id) is not null then return null; end if;  -- gesperrt
      f := f || (s.price / s.cur);
      v_open := v_open + 1;
    elsif s.status = 'won'  then f := f || s.price;
    elsif s.status = 'void' then f := f || 1::numeric;
    else f := f || 0::numeric;
    end if;
  end loop;
  if v_open = 0 then return null; end if;

  if b.type = 'system' then
    for c in select * from k_combinations(cardinality(f), b.system_k) loop
      v := v + b.stake_per_line * array_product(array(select f[i] from unnest(c) i));
    end loop;
  else
    if 0 = any(f) then return null; end if;
    v := b.stake * b.odds_factor * array_product(f);
  end if;
  v := floor(least(v, cfg('max_payout')) * cfg('cashout_margin'));
  return case when v >= 1 then v::bigint else null end;
end $$;

create or replace function public.cashout_bet(p_user uuid, p_bet uuid, p_expected bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bets; v bigint; v_bal bigint;
begin
  select * into b from bets where id = p_bet for update;
  if not found or b.user_id <> p_user then
    return jsonb_build_object('ok', false, 'code', 'BET_NOT_FOUND');
  end if;
  v := cashout_value(p_bet);
  if v is null then return jsonb_build_object('ok', false, 'code', 'CASHOUT_UNAVAILABLE'); end if;
  -- Gestiegen: zum Vorteil des Nutzers annehmen. Gefallen: neu bestätigen lassen.
  if v < p_expected then
    return jsonb_build_object('ok', false, 'code', 'CASHOUT_CHANGED', 'value', v);
  end if;
  update bets set status = 'cashed_out', payout = v, settled_at = now() where id = p_bet;
  v_bal := wallet_apply(p_user, v, 'cashout', p_bet);
  return jsonb_build_object('ok', true, 'payout', v, 'balance', v_bal);
end $$;

-- Für die Anzeige in "Meine Wetten" – rechnet nur, schreibt nichts.
create or replace function public.my_cashout_values()
returns table(bet_id uuid, value bigint)
language sql stable security definer set search_path = public as $$
  select b.id, cashout_value(b.id) from bets b
   where b.user_id = auth.uid() and b.status = 'open'
$$;

-- ───── Boosts des Tages ─────
-- Wählt Heim-/Auswärtssiege der nächsten 36 h mit Quote 1,5–4,0
-- (Top-Spiele zuerst) und erhöht sie um 15–25 %.
create or replace function public.create_daily_boosts(p_count int default 3) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if exists (select 1 from boosts where valid_date = berlin_today()) then return 0; end if;
  insert into boosts(outcome_id, event_id, original_price, boosted_price, title)
  select o.id, o.event_id, o.price,
         round(o.price * (1.15 + random()::numeric * 0.10), 2),
         'Boost: ' || o.label || ' gewinnt'
    from outcomes o
    join markets m on m.id = o.market_id and m.key = 'h2h' and m.status = 'open'
    join events  e on e.id = o.event_id and e.status = 'scheduled'
   where o.status = 'open' and o.name in ('home','away')
     and o.price between 1.5 and 4.0
     and e.commence_time between now() + interval '30 minutes' and now() + interval '36 hours'
   order by e.is_top desc, random()
   limit p_count
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───── Rechte ─────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.berlin_today(), public.cfg(text), public.is_group_member(uuid),
                          public.claim_daily_bonus(), public.claim_refill(),
                          public.my_cashout_values(), public.effective_price(uuid),
                          public.outcome_block_reason(uuid)
  to authenticated;
grant execute on function public.berlin_today(), public.cfg(text), public.effective_price(uuid)
  to anon;
grant execute on all functions in schema public to service_role;
