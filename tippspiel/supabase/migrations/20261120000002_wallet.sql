-- TippArena – Guthaben
-- Einzige Stelle, an der wallets.balance geändert wird: wallet_apply().
-- Jede Änderung erzeugt genau eine Zeile in transactions (lückenloses Konto).

create or replace function public.wallet_apply(
  p_user uuid, p_amount bigint, p_kind public.tx_kind, p_bet uuid default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_balance bigint;
begin
  update wallets set balance = balance + p_amount, updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  -- balance >= 0 erzwingt der CHECK; zur Klarheit eigene Meldung:
  if v_balance < 0 then raise exception 'INSUFFICIENT_COINS'; end if;
  insert into transactions(user_id, amount, balance_after, kind, bet_id)
  values (p_user, p_amount, v_balance, p_kind, p_bet);
  return v_balance;
end $$;
-- privat: nur andere Definer-Funktionen und die service_role
revoke execute on function public.wallet_apply(uuid, bigint, public.tx_kind, uuid) from public, anon, authenticated;

-- ───── Neuer Nutzer: Profil + Wallet + 1.000 Coins ─────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  -- Vorschlag aus E-Mail/Google-Namen, bereinigt; bei Kollision Zufallsanhang.
  v_name := regexp_replace(coalesce(new.raw_user_meta_data->>'name',
                                    split_part(coalesce(new.email, ''), '@', 1)),
                           '[^A-Za-z0-9_.-]', '', 'g');
  if length(v_name) < 3 then v_name := 'spieler'; end if;
  v_name := left(v_name, 18);
  if exists (select 1 from profiles where username = v_name) then
    v_name := v_name || '_' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;

  insert into profiles(id, username) values (new.id, v_name);
  insert into wallets(user_id, balance) values (new.id, 0);
  perform wallet_apply(new.id, cfg('signup_coins')::bigint, 'signup_bonus');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───── Tagesbonus: 100 Coins, einmal pro Kalendertag (Berlin) ─────
-- Darf der Client selbst aufrufen: Betrag und Häufigkeit stehen hier fest,
-- der Client kann nichts davon beeinflussen.
create or replace function public.claim_daily_bonus() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w wallets; v_bal bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_w from wallets where user_id = v_uid for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_w.last_daily_bonus is not distinct from berlin_today() then
    return jsonb_build_object('granted', false, 'balance', v_w.balance);
  end if;
  update wallets set last_daily_bonus = berlin_today() where user_id = v_uid;
  v_bal := wallet_apply(v_uid, cfg('daily_bonus')::bigint, 'daily_bonus');
  return jsonb_build_object('granted', true, 'amount', cfg('daily_bonus'), 'balance', v_bal);
end $$;
grant execute on function public.claim_daily_bonus() to authenticated;

-- ───── Nachfüllen: bei 0 Coins auf 500, höchstens 1× in 7 Tagen ─────
create or replace function public.claim_refill() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w wallets; v_bal bigint; v_next timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_w from wallets where user_id = v_uid for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_w.balance > 0 then
    return jsonb_build_object('granted', false, 'reason', 'BALANCE_NOT_ZERO', 'balance', v_w.balance);
  end if;
  v_next := v_w.last_refill_at + make_interval(days => cfg('refill_days')::int);
  if v_w.last_refill_at is not null and v_next > now() then
    return jsonb_build_object('granted', false, 'reason', 'TOO_SOON', 'next_refill_at', v_next, 'balance', 0);
  end if;
  update wallets set last_refill_at = now() where user_id = v_uid;
  v_bal := wallet_apply(v_uid, cfg('refill_to')::bigint, 'refill');
  return jsonb_build_object('granted', true, 'balance', v_bal);
end $$;
grant execute on function public.claim_refill() to authenticated;
