-- TippArena – Testdaten
-- Sportarten + Ligen (Schlüssel = The-Odds-API sport_key) und Demo-Spiele,
-- damit die App ohne API-Schlüssel sofort etwas zeigt.
-- Demo-Spiele haben IDs mit 'demo_' – die Odds-Funktion löscht sie, sobald
-- echte Spiele da sind (Schritt 2).

insert into public.sports(key, title, icon, sort) values
  ('soccer',           'Fußball',     '⚽', 10),
  ('basketball',       'Basketball',  '🏀', 20),
  ('tennis',           'Tennis',      '🎾', 30),
  ('icehockey',        'Eishockey',   '🏒', 40),
  ('americanfootball', 'Football',    '🏈', 50),
  ('handball',         'Handball',    '🤾', 60)
on conflict (key) do update set title = excluded.title, icon = excluded.icon, sort = excluded.sort;

insert into public.leagues(key, sport_key, title, country, sort, has_draw) values
  ('soccer_germany_bundesliga',     'soccer', 'Bundesliga',        'Deutschland', 10, true),
  ('soccer_germany_bundesliga2',    'soccer', '2. Bundesliga',     'Deutschland', 11, true),
  ('soccer_germany_dfb_pokal',      'soccer', 'DFB-Pokal',         'Deutschland', 12, true),
  ('soccer_uefa_champs_league',     'soccer', 'Champions League',  'Europa',      20, true),
  ('soccer_uefa_europa_league',     'soccer', 'Europa League',     'Europa',      21, true),
  ('soccer_epl',                    'soccer', 'Premier League',    'England',     30, true),
  ('soccer_spain_la_liga',          'soccer', 'La Liga',           'Spanien',     31, true),
  ('soccer_italy_serie_a',          'soccer', 'Serie A',           'Italien',     32, true),
  ('soccer_france_ligue_one',       'soccer', 'Ligue 1',           'Frankreich',  33, true),
  ('basketball_nba',                'basketball', 'NBA',           'USA',         10, false),
  ('basketball_euroleague',         'basketball', 'EuroLeague',    'Europa',      20, false),
  ('tennis_atp_finals',             'tennis', 'ATP Finals',        'International', 10, false),
  ('icehockey_nhl',                 'icehockey', 'NHL',            'USA',         10, false),
  ('icehockey_sweden_hockey_league','icehockey', 'SHL',            'Schweden',    20, false),
  ('americanfootball_nfl',          'americanfootball', 'NFL',     'USA',         10, false),
  ('handball_germany_bundesliga',   'handball', 'Handball-Bundesliga', 'Deutschland', 10, false)
on conflict (key) do update set title = excluded.title, sport_key = excluded.sport_key,
  country = excluded.country, sort = excluded.sort, has_draw = excluded.has_draw;

-- ───── Demo-Spiele ─────
-- Fiktive Vereinsnamen, damit nichts nach echten Quoten aussieht.
do $$
declare
  r record; v_m uuid; ph numeric; pd numeric; pa numeric;
  demo constant jsonb := '[
    {"id":"demo_1","lg":"soccer_germany_bundesliga","h":"FC Nordhafen","a":"SV Moorwald","t":"3 hours","top":true,"h2h":[1.85,3.60,4.20]},
    {"id":"demo_2","lg":"soccer_germany_bundesliga","h":"Eintracht Deichstadt","a":"TSV Kliffburg","t":"5 hours","top":true,"h2h":[2.40,3.30,2.90]},
    {"id":"demo_3","lg":"soccer_uefa_champs_league","h":"Real Costa","a":"AC Lagune","t":"26 hours","top":true,"h2h":[2.10,3.40,3.40]},
    {"id":"demo_4","lg":"soccer_epl","h":"Riverside United","a":"Kingsbridge FC","t":"28 hours","top":false,"h2h":[1.55,4.20,5.75]},
    {"id":"demo_5","lg":"soccer_germany_bundesliga2","h":"Hafen 04","a":"Grünfeld 1912","t":"-35 minutes","live":[1,0,"35''"],"top":false,"h2h":[1.60,3.90,5.40]},
    {"id":"demo_6","lg":"soccer_spain_la_liga","h":"Atlético Sol","a":"Deportivo Mar","t":"-70 minutes","live":[1,1,"68''"],"top":true,"h2h":[2.75,2.60,3.10]},
    {"id":"demo_7","lg":"basketball_nba","h":"Harbor Hawks","a":"Desert Suns","t":"8 hours","top":false,"h2h":[1.70,null,2.15]},
    {"id":"demo_8","lg":"icehockey_nhl","h":"Polar Bears","a":"Lake Wolves","t":"-40 minutes","live":[2,1,"2. Drittel"],"top":false,"h2h":[1.80,null,2.00]},
    {"id":"demo_9","lg":"tennis_atp_finals","h":"M. Berger","a":"L. Duarte","t":"4 hours","top":false,"h2h":[1.45,null,2.70]}
  ]';
begin
  for r in select * from jsonb_to_recordset(demo)
            as x(id text, lg text, h text, a text, t text, top boolean, h2h numeric[], live jsonb) loop
    insert into events(id, league_key, sport_key, home_team, away_team, commence_time, status,
                       home_score, away_score, minute, is_top, last_odds_update, last_score_update)
    select r.id, r.lg, l.sport_key, r.h, r.a, now() + r.t::interval,
           case when r.live is null then 'scheduled' else 'live' end::event_status,
           (r.live->>0)::int, (r.live->>1)::int, r.live->>2, r.top, now(), now()
      from leagues l where l.key = r.lg
    on conflict (id) do nothing;

    ph := r.h2h[1]; pd := r.h2h[2]; pa := r.h2h[3];

    insert into markets(event_id, key, name, sort) values (r.id, 'h2h', 'Endergebnis', 10)
      on conflict do nothing returning id into v_m;
    continue when v_m is null;
    insert into outcomes(market_id, event_id, name, label, price) values
      (v_m, r.id, 'home', r.h, ph), (v_m, r.id, 'away', r.a, pa);
    if pd is not null then
      insert into outcomes(market_id, event_id, name, label, price) values (v_m, r.id, 'draw', 'Unentschieden', pd);
    end if;

    -- Nur Fußball bekommt die vollen Märkte
    continue when r.lg not like 'soccer%';

    insert into markets(event_id, key, name, source, sort) values (r.id, 'double_chance', 'Doppelte Chance', 'derived', 20)
      returning id into v_m;
    insert into outcomes(market_id, event_id, name, label, price) values
      (v_m, r.id, '1X', r.h || ' oder Unentschieden', round(greatest(1.01, 1/(1/ph + 1/pd) * 0.95), 2)),
      (v_m, r.id, '12', r.h || ' oder ' || r.a,      round(greatest(1.01, 1/(1/ph + 1/pa) * 0.95), 2)),
      (v_m, r.id, 'X2', 'Unentschieden oder ' || r.a, round(greatest(1.01, 1/(1/pd + 1/pa) * 0.95), 2));

    insert into markets(event_id, key, line, name, sort) values (r.id, 'totals', 2.5, 'Über/Unter 2,5 Tore', 30)
      returning id into v_m;
    insert into outcomes(market_id, event_id, name, label, price, point) values
      (v_m, r.id, 'over', 'Über 2,5', 1.90, 2.5), (v_m, r.id, 'under', 'Unter 2,5', 1.90, 2.5);

    insert into markets(event_id, key, line, name, sort) values (r.id, 'totals', 1.5, 'Über/Unter 1,5 Tore', 31)
      returning id into v_m;
    insert into outcomes(market_id, event_id, name, label, price, point) values
      (v_m, r.id, 'over', 'Über 1,5', 1.33, 1.5), (v_m, r.id, 'under', 'Unter 1,5', 3.20, 1.5);

    insert into markets(event_id, key, name, source, sort) values (r.id, 'btts', 'Beide Teams treffen', 'derived', 40)
      returning id into v_m;
    insert into outcomes(market_id, event_id, name, label, price) values
      (v_m, r.id, 'yes', 'Ja', 1.80), (v_m, r.id, 'no', 'Nein', 1.95);

    insert into markets(event_id, key, line, name, sort) values (r.id, 'spreads', -1, 'Handicap ' || r.h || ' −1', 50)
      returning id into v_m;
    insert into outcomes(market_id, event_id, name, label, price, point) values
      (v_m, r.id, 'home', r.h || ' −1', round(ph * 1.9, 2), -1),
      (v_m, r.id, 'away', r.a || ' +1', round(greatest(1.05, 1/(1 - 1/(ph*1.9)) * 0.95), 2), 1);

    insert into markets(event_id, key, name, source, sort) values (r.id, 'h2h_h1', 'Halbzeit-Ergebnis', 'derived', 60)
      returning id into v_m;
    insert into outcomes(market_id, event_id, name, label, price) values
      (v_m, r.id, 'home', r.h, round(ph * 1.45, 2)), (v_m, r.id, 'draw', 'Unentschieden', 2.10),
      (v_m, r.id, 'away', r.a, round(pa * 1.45, 2));
  end loop;
end $$;

select public.create_daily_boosts(3);
