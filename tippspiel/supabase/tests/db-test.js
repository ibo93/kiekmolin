// Prüft das Datenbank-Verhalten an einer ECHTEN Postgres-Datenbank –
// nicht den Quelltext. Baut eine frische DB aus shim + Migrationen + Seed.
//
//   TIPP_PG="-h /var/tmp/pgt -p 54329 -U postgres" node tippspiel/supabase/tests/db-test.js
//
// Ausgabe im Format der Kiek-mol-in-Tests: "OK  …" / "FAIL …"
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PGARGS = (process.env.TIPP_PG || '-h /var/tmp/pgt -p 54329 -U postgres').split(' ');
const DB = 'tipp_test';
let fails = 0;

function psql(sql, { db = DB, role = null, uid = null } = {}) {
  let pre = '';
  if (role) pre += `set role ${role};`;
  if (uid) pre += `set request.jwt.claim.sub = '${uid}';`;
  return execFileSync('psql', [...PGARGS, '-d', db, '-At', '-q', '-v', 'ON_ERROR_STOP=1', '-c', pre + sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function psqlFile(f) {
  execFileSync('psql', [...PGARGS, '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', f],
    { stdio: ['ignore', 'ignore', 'pipe'] });
}
function fails_with(fn) {
  try { fn(); return null; } catch (e) { return String(e.stderr || e.message); }
}
function check(name, cond, info) {
  if (cond) console.log('OK   ' + name);
  else { fails++; console.log('FAIL ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
const J = (s) => JSON.parse(s);

// ───── frische Datenbank ─────
psql(`drop database if exists ${DB}`, { db: 'postgres' });
psql(`create database ${DB}`, { db: 'postgres' });
psqlFile(path.join(ROOT, 'tests/supabase-shim.sql'));
for (const f of require('fs').readdirSync(path.join(ROOT, 'migrations')).sort())
  psqlFile(path.join(ROOT, 'migrations', f));
psqlFile(path.join(ROOT, 'seed.sql'));

const newUser = (email) => psql(`insert into auth.users(email) values ('${email}') returning id`);
const balance = (u) => Number(psql(`select balance from wallets where user_id='${u}'`));
const outcome = (ev, key, name, line = null) => psql(
  `select o.id||'|'||o.price from outcomes o join markets m on m.id=o.market_id
    where o.event_id='${ev}' and m.key='${key}' and o.name='${name}'
      and m.line ${line === null ? 'is null' : '= ' + line}`).split('|');
const place = (u, bets) => J(psql(`select place_bets('${u}', '${JSON.stringify(bets)}'::jsonb)`));
const sel = (o) => ({ outcome_id: o[0], price: Number(o[1]) });

// Seed legt zufällige Boosts an – für feste Rechenwerte ersetzen wir sie
// durch einen bekannten Boost (demo_7 Heim 1,70 → 2,00).
check('Seed legt Boosts des Tages an', Number(psql(`select count(*) from boosts`)) >= 1);
psql(`delete from boosts`);
psql(`insert into boosts(outcome_id, event_id, original_price, boosted_price, title)
      select o.id, o.event_id, o.price, 2.00, 'Test-Boost' from outcomes o join markets m on m.id=o.market_id
       where o.event_id='demo_7' and m.key='h2h' and o.name='home'`);

// ───── 1. Neuer Nutzer ─────
const A = newUser('anna@example.org');
const B = newUser('ben@example.org');
check('Neuer Nutzer startet mit 1.000 Coins', balance(A) === 1000, balance(A));
check('Startguthaben steht als Buchung im Konto',
  psql(`select count(*) from transactions where user_id='${A}' and kind='signup_bonus' and amount=1000`) === '1');
check('Benutzername aus E-Mail', psql(`select username from profiles where id='${A}'`) === 'anna');

// ───── 2. Tagesbonus ─────
let r = J(psql(`select claim_daily_bonus()`, { role: 'authenticated', uid: A }));
check('Tagesbonus beim ersten Öffnen +100', r.granted === true && balance(A) === 1100, r);
r = J(psql(`select claim_daily_bonus()`, { role: 'authenticated', uid: A }));
check('Tagesbonus am selben Tag kein zweites Mal', r.granted === false && balance(A) === 1100, r);
psql(`update wallets set last_daily_bonus = berlin_today() - 1 where user_id='${A}'`);
r = J(psql(`select claim_daily_bonus()`, { role: 'authenticated', uid: A }));
check('Tagesbonus am nächsten Tag wieder', r.granted === true && balance(A) === 1200, r);

// ───── 3. Nachfüllen ─────
r = J(psql(`select claim_refill()`, { role: 'authenticated', uid: B }));
check('Nachfüllen nur bei 0 Coins', r.granted === false && r.reason === 'BALANCE_NOT_ZERO', r);
psql(`select wallet_apply('${B}', -1000, 'bet_stake')`);
r = J(psql(`select claim_refill()`, { role: 'authenticated', uid: B }));
check('Nachfüllen bei 0 → 500', r.granted === true && balance(B) === 500, r);
psql(`select wallet_apply('${B}', -500, 'bet_stake')`);
r = J(psql(`select claim_refill()`, { role: 'authenticated', uid: B }));
check('Nachfüllen höchstens 1× pro Woche', r.granted === false && r.reason === 'TOO_SOON' && balance(B) === 0, r);
psql(`update wallets set last_refill_at = now() - interval '8 days' where user_id='${B}'`);
r = J(psql(`select claim_refill()`, { role: 'authenticated', uid: B }));
check('Nach 7 Tagen wieder Nachfüllen', r.granted === true && balance(B) === 500, r);

// ───── 4. Guthaben nur serverseitig ─────
let err = fails_with(() => psql(`update wallets set balance = 999999 where user_id='${A}'`, { role: 'authenticated', uid: A }));
check('Client kann Guthaben nicht ändern', err && /permission denied/.test(err) && balance(A) === 1200, err);
err = fails_with(() => psql(`insert into transactions(user_id,amount,balance_after,kind) values ('${A}',5,5,'refill')`, { role: 'authenticated', uid: A }));
check('Client kann keine Buchung anlegen', err && /permission denied/.test(err), err);
err = fails_with(() => psql(`insert into bets(user_id,type,stake,stake_per_line,total_odds,potential_payout) values ('${A}','single',1,1,100,100)`, { role: 'authenticated', uid: A }));
check('Client kann keine Wette direkt anlegen', err && /permission denied/.test(err), err);
err = fails_with(() => psql(`select wallet_apply('${A}', 5000, 'refill')`, { role: 'authenticated', uid: A }));
check('Client darf wallet_apply nicht aufrufen', err && /permission denied/.test(err), err);
err = fails_with(() => psql(`select place_bets('${A}', '[]')`, { role: 'authenticated', uid: A }));
check('Client darf place_bets nicht direkt aufrufen (nur Edge Function)', err && /permission denied/.test(err), err);
err = fails_with(() => psql(`select settle_event('demo_1')`, { role: 'authenticated', uid: A }));
check('Client darf nicht abrechnen', err && /permission denied/.test(err), err);
check('Fremdes Guthaben unsichtbar (RLS)',
  psql(`select count(*) from wallets`, { role: 'authenticated', uid: A }) === '1');
err = fails_with(() => psql(`select count(*) from wallets`, { role: 'anon' }));
check('Anonym sieht kein Guthaben', err && /permission denied/.test(err), err);
check('Anonym sieht Spiele und Quoten',
  Number(psql(`select count(*) from outcomes`, { role: 'anon' })) > 50);
psql(`update profiles set username='Anna_K' where id='${A}'`, { role: 'authenticated', uid: A });
check('Eigenen Benutzernamen ändern geht', psql(`select username from profiles where id='${A}'`) === 'Anna_K');
psql(`update profiles set username='Hacker' where id='${B}'`, { role: 'authenticated', uid: A });
check('Fremden Benutzernamen ändern geht nicht', psql(`select username from profiles where id='${B}'`) === 'ben');

// ───── 5. Wette platzieren ─────
const h1 = outcome('demo_1', 'h2h', 'home');       // 1.85
const a2 = outcome('demo_2', 'h2h', 'away');       // 2.90
const d3 = outcome('demo_3', 'h2h', 'draw');       // 3.40
r = place(A, [{ type: 'single', stake: 100, selections: [sel(h1)] }]);
check('Einzelwette wird angenommen', r.ok === true && balance(A) === 1100, r);
const betSingle = r.bet_ids && r.bet_ids[0];

r = place(A, [{ type: 'single', stake: 10, selections: [{ outcome_id: h1[0], price: 1.70 }] }]);
check('Geänderte Quote → ODDS_CHANGED, nichts abgebucht',
  r.ok === false && r.code === 'ODDS_CHANGED' && r.changes[0].new_price === 1.85 && balance(A) === 1100, r);

r = place(A, [{ type: 'single', stake: 5000, selections: [sel(h1)] }]);
check('Zu wenig Coins → INSUFFICIENT_COINS', r.ok === false && r.code === 'INSUFFICIENT_COINS' && balance(A) === 1100, r);

r = place(A, [{ type: 'single', stake: 10.5, selections: [sel(h1)] }]);
check('Kommabeträge abgelehnt', r.ok === false && r.code === 'INVALID_STAKE', r);
r = place(A, [{ type: 'single', stake: 0, selections: [sel(h1)] }]);
check('Einsatz 0 abgelehnt', r.ok === false && r.code === 'INVALID_STAKE', r);

r = place(A, [{ type: 'single', stake: 10, selections: [sel(h1)] },
              { type: 'single', stake: 2000, selections: [sel(a2)] }]);
check('Mehrere Einzelwetten: alle oder keine', r.ok === false && balance(A) === 1100, r);

const h1o = outcome('demo_1', 'totals', 'over', 2.5);
r = place(A, [{ type: 'combo', stake: 10, selections: [sel(h1), sel(h1o)] }]);
check('Kombi aus demselben Spiel abgelehnt', r.ok === false && r.code === 'SAME_EVENT_IN_COMBO', r);

// Exakte Quote: 1,85 × 2,90 = 5,365 → 100 Coins → 536
r = place(A, [{ type: 'combo', stake: 100, selections: [sel(h1), sel(a2)] }]);
const betCombo = r.bet_ids && r.bet_ids[0];
check('Kombi: Gesamtquote = Produkt',
  r.ok && psql(`select total_odds||'|'||potential_payout from bets where id='${betCombo}'`) === '5.365|536', r);

// Wetten-Konfigurator
const dc1 = outcome('demo_1', 'double_chance', '1X');
r = place(A, [{ type: 'builder', stake: 10, selections: [sel(h1), sel(dc1)] }]);
check('Konfigurator: Sieg + Doppelte Chance verboten (gleiche Vorhersage)', r.ok === false && r.code === 'BUILDER_CONFLICT', r);
const bt1 = outcome('demo_1', 'btts', 'yes');      // 1.80
r = place(A, [{ type: 'builder', stake: 10, selections: [sel(h1), sel(bt1)] }]);
const betBuilder = r.bet_ids && r.bet_ids[0];
// 1,85 × 1,80 × 0,9 = 2,997
check('Konfigurator: Quote = Produkt × 0,9 je weiterem Tipp',
  r.ok && psql(`select total_odds from bets where id='${betBuilder}'`) === '2.997', r);
r = place(A, [{ type: 'builder', stake: 10, selections: [sel(h1), sel(a2)] }]);
check('Konfigurator nur innerhalb eines Spiels', r.ok === false && r.code === 'BUILDER_CONFLICT', r);

// Systemwette 2 aus 3: 3 Reihen
r = place(A, [{ type: 'system', system_k: 2, stake: 90, selections: [sel(h1), sel(a2), sel(d3)] }]);
const betSystem = r.bet_ids && r.bet_ids[0];
check('System 2 aus 3 = 3 Reihen à 30',
  r.ok && psql(`select lines||'|'||stake_per_line from bets where id='${betSystem}'`) === '3|30.0000', r);
r = place(A, [{ type: 'system', system_k: 3, stake: 90, selections: [sel(h1), sel(a2), sel(d3)] }]);
check('System k muss kleiner n sein', r.ok === false && r.code === 'INVALID_BET_SHAPE', r);

// Spielbeginn / Live
psql(`update events set commence_time = now() - interval '1 minute' where id='demo_4'`);
r = place(A, [{ type: 'single', stake: 10, selections: [sel(outcome('demo_4', 'h2h', 'home'))] }]);
check('Angepfiffen, aber noch nicht live → EVENT_STARTED',
  r.ok === false && r.selections[0].reason === 'EVENT_STARTED', r);
const live = outcome('demo_5', 'h2h', 'home');
r = place(A, [{ type: 'single', stake: 10, selections: [sel(live)] }]);
check('Live-Wette mit frischen Quoten geht', r.ok === true, r);
psql(`update events set last_odds_update = now() - interval '10 minutes' where id='demo_5'`);
r = place(A, [{ type: 'single', stake: 10, selections: [sel(live)] }]);
check('Live-Wette mit alten Quoten → ODDS_STALE', r.ok === false && r.selections[0].reason === 'ODDS_STALE', r);
psql(`update outcomes set status='suspended' where id='${a2[0]}'`);
r = place(A, [{ type: 'single', stake: 10, selections: [sel(a2)] }]);
check('Gesperrter Markt → SUSPENDED', r.ok === false && r.selections[0].reason === 'SUSPENDED', r);
psql(`update outcomes set status='open' where id='${a2[0]}'`);

// Boost
const boost = psql(`select outcome_id||'|'||original_price||'|'||boosted_price from boosts limit 1`).split('|');
check('Boost-Quote liegt über der Originalquote', boost.length === 3 && Number(boost[2]) > Number(boost[1]), boost);
if (boost.length === 3) {
  r = place(B, [{ type: 'single', stake: 10, selections: [{ outcome_id: boost[0], price: Number(boost[1]) }] }]);
  check('Boost: alte Quote wird nicht mehr angenommen', r.ok === false && r.code === 'ODDS_CHANGED', r);
  r = place(B, [{ type: 'single', stake: 10, selections: [{ outcome_id: boost[0], price: Number(boost[2]) }] }]);
  check('Boost: erhöhte Quote wird angenommen und markiert',
    r.ok && psql(`select boosted from bet_selections where bet_id='${r.bet_ids[0]}'`) === 't', r);
}

// ───── 6. Cash-Out ─────
psql(`update outcomes set price = 1.50 where id='${h1[0]}'`);     // Favorit wird wahrscheinlicher
const cv = Number(psql(`select value from my_cashout_values() where bet_id='${betSingle}'`, { role: 'authenticated', uid: A }));
// 100 × 1,85/1,50 × 0,95 = 117,16… → 117
check('Cash-Out-Wert aus aktueller Quote', cv === 117, cv);
check('Quotenänderung wird gemerkt (für Blinken)',
  psql(`select previous_price from outcomes where id='${h1[0]}'`) === '1.850');
r = J(psql(`select cashout_bet('${A}', '${betSingle}', 130)`));
check('Cash-Out mit zu hohem Erwartungswert → CASHOUT_CHANGED', r.ok === false && r.code === 'CASHOUT_CHANGED' && r.value === 117, r);
r = J(psql(`select cashout_bet('${B}', '${betSingle}', 117)`));
check('Fremde Wette nicht auszahlbar', r.ok === false && r.code === 'BET_NOT_FOUND', r);
const before = balance(A);
r = J(psql(`select cashout_bet('${A}', '${betSingle}', 117)`));
check('Cash-Out zahlt aus', r.ok === true && balance(A) === before + 117, r);
r = J(psql(`select cashout_bet('${A}', '${betSingle}', 117)`));
check('Cash-Out nur einmal', r.ok === false && r.code === 'CASHOUT_UNAVAILABLE', r);
psql(`update outcomes set status='suspended' where id='${a2[0]}'`);
check('Kein Cash-Out bei gesperrtem Markt',
  psql(`select coalesce(value::text,'null') from my_cashout_values() where bet_id='${betCombo}'`, { role: 'authenticated', uid: A }) === 'null');
psql(`update outcomes set status='open' where id='${a2[0]}'`);

// ───── 7. Abrechnung ─────
// demo_1 endet 2:1 (Heimsieg, beide treffen), HZ-Stand unbekannt
psql(`update events set status='finished', home_score=2, away_score=1 where id='demo_1'`);
const preSettle = balance(A);
psql(`select settle_event('demo_1')`);
check('Cash-Out-Wette wird bei Abrechnung nicht nochmal bezahlt',
  psql(`select status||'|'||payout from bets where id='${betSingle}'`) === 'cashed_out|117');
// Konfigurator 10 × 1,85 × 1,80 × 0,9 = 29,97 → 29
check('settle_bet direkt auf ausgezahlter Wette tut nichts',
  psql(`select settle_bet('${betSingle}')`) === 'f' &&
  psql(`select status||'|'||payout from bets where id='${betSingle}'`) === 'cashed_out|117');
check('Konfigurator gewonnen: 29 Coins',
  psql(`select status||'|'||payout from bets where id='${betBuilder}'`) === 'won|29');
check('Gutschrift landet im Guthaben', balance(A) === preSettle + 29, balance(A) - preSettle);
check('Kombi bleibt offen, solange Spiel 2 läuft',
  psql(`select status from bets where id='${betCombo}'`) === 'open');
check('Halbzeit-Tipp ohne HZ-Stand → void',
  psql(`select distinct o.status from outcomes o join markets m on m.id=o.market_id where m.key='h2h_h1' and o.event_id='demo_1'`) === 'void');
psql(`select settle_event('demo_1')`);
check('Zweimal abrechnen zahlt nicht doppelt', balance(A) === preSettle + 29);

// demo_2 endet 0:1 (Auswärtssieg) → Kombi gewonnen: 100 × 5,365 = 536
psql(`update events set status='finished', home_score=0, away_score=1 where id='demo_2'`);
psql(`select settle_event('demo_2')`);
check('Kombi gewonnen: exakt 536 (keine Rundungsfehler)',
  psql(`select status||'|'||payout from bets where id='${betCombo}'`) === 'won|536');

// demo_3 endet 1:0 → Remis-Tipp verloren. System 2/3: nur Reihe (1,85×2,90) trifft → 30 × 5,365 = 160
psql(`update events set status='finished', home_score=1, away_score=0 where id='demo_3'`);
psql(`select settle_event('demo_3')`);
check('System 2 aus 3 mit einem Fehler: 160',
  psql(`select status||'|'||payout from bets where id='${betSystem}'`) === 'won|160');

// Abgesagt → Einsatz zurück
const h6 = outcome('demo_6', 'h2h', 'home');
psql(`update events set last_odds_update = now() where id='demo_6'`);
r = place(B, [{ type: 'single', stake: 40, selections: [sel(h6)] }]);
const bB = balance(B);
psql(`update events set status='cancelled' where id='demo_6'`);
psql(`select settle_event('demo_6')`);
check('Abgesagtes Spiel: Einsatz zurück',
  psql(`select status||'|'||payout from bets where id='${r.bet_ids[0]}'`) === 'void|40' && balance(B) === bB + 40);
check('Kontostand = Summe aller Buchungen (lückenlos)',
  psql(`select bool_and(w.balance = t.s) from wallets w join (select user_id, sum(amount) s from transactions group by user_id) t using (user_id)`) === 't');

check('Quotenprodukt exakt: 100 × 2,0 × 1,5 = 300 (nicht 299)',
  psql(`select floor(100 * array_product('{2.0,1.5}'::numeric[]))`) === '300');
check('Quotenprodukt exakt: 100 × 1,1 × 1,1 × 1,1 = 133',
  psql(`select floor(100 * array_product('{1.1,1.1,1.1}'::numeric[]))`) === '133');

// Ergebnis-Logik einzeln
const res = (k, n, p, h, a) => psql(`select outcome_result('${k}','${n}',${p === null ? 'null' : p},${h},${a},null,null)`);
check('Über 2,5 bei 2:1 gewonnen', res('totals', 'over', 2.5, 2, 1) === 'won');
check('Über 3 bei 2:1 → void (genau getroffen)', res('totals', 'over', 3, 2, 1) === 'void');
check('Handicap −1 bei 2:1 → void', res('spreads', 'home', -1, 2, 1) === 'void');
check('Handicap −1,5 bei 2:1 verloren', res('spreads', 'home', -1.5, 2, 1) === 'lost');
check('Handicap +1,5 Gast bei 2:1 gewonnen', res('spreads', 'away', 1.5, 2, 1) === 'won');
check('Doppelte Chance X2 bei 1:1 gewonnen', res('double_chance', 'X2', null, 1, 1) === 'won');
check('Beide treffen Nein bei 2:0 gewonnen', res('btts', 'no', null, 2, 0) === 'won');
check('Unbekannter Markt → void statt raten', res('corners', 'over', 9.5, 2, 1) === 'void');

// ───── 8. Rangliste & Gruppen ─────
const lb = psql(`select username||':'||profit from leaderboard('week')`, { role: 'authenticated', uid: A }).split('\n');
check('Rangliste nach Gewinn sortiert', lb.length >= 1 && lb[0].startsWith('Anna_K:'), lb);
const g = J(psql(`select create_group('Stammtisch Hafen')`, { role: 'authenticated', uid: A }));
check('Gruppe mit 8-stelligem Einladungscode', /^[A-Z2-9]{8}$/.test(g.invite_code), g);
check('Nicht-Mitglied sieht Gruppe nicht',
  psql(`select count(*) from groups`, { role: 'authenticated', uid: B }) === '0');
err = fails_with(() => psql(`select * from leaderboard('week', '${g.id}')`, { role: 'authenticated', uid: B }));
check('Nicht-Mitglied sieht Gruppen-Rangliste nicht', err && /NOT_A_MEMBER/.test(err), err);
r = J(psql(`select join_group('${g.invite_code.toLowerCase()}')`, { role: 'authenticated', uid: B }));
check('Beitreten per Link (Groß/Klein egal)', r.ok === true, r);
check('Mitglied sieht Gruppe + Mitgliederliste',
  psql(`select count(*) from group_member_list('${g.id}')`, { role: 'authenticated', uid: B }) === '2');
psql(`select leave_group('${g.id}')`, { role: 'authenticated', uid: A });
check('Besitzer verlässt Gruppe → Besitz geht weiter',
  psql(`select owner_id from groups where id='${g.id}'`) === B);

const st = J(psql(`select my_stats()`, { role: 'authenticated', uid: A }));
check('Profil-Statistik: Trefferquote & größter Gewinn',
  st.hit_rate !== null && st.biggest_win === 436 && st.favorite_league, st);

console.log(fails ? `\n${fails} ROT` : '\nalles grün');
process.exit(fails ? 1 : 0);
