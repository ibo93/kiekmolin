// Quoten-Modell & API-Umsetzung prüfen.  node tippspiel/supabase/tests/model-test.ts
import { estimateMinute, fairProbs, finalOutcome, fitLambdas, pOver, soccerMarkets, toOdds } from '../functions/_shared/model.ts';
import { buildMarkets, commonLine, consensus, parseScore, syncIntervalMinutes, type ApiEvent } from '../functions/_shared/oddsapi.ts';

let fails = 0;
function check(name: string, cond: boolean, info?: unknown) {
  if (cond) console.log('OK   ' + name);
  else { fails++; console.log('FAIL ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ───── Grundlagen ─────
const fp = fairProbs([1.85, 3.6, 4.2]);
check('Faire Wahrscheinlichkeiten summieren sich zu 1', near(fp.reduce((a, b) => a + b), 1, 1e-9), fp);
check('Marge wird herausgerechnet (Heim < 1/1,85)', fp[0] < 1 / 1.85, fp[0]);
check('Quote aus 50 % mit 5 % Marge = 1,90', toOdds(0.5) === 1.9, toOdds(0.5));
check('Sicherer Ausgang → Mindestquote 1,01', toOdds(1) === 1.01);

// ───── Modell trifft echte Quoten ─────
const [pH, , pA] = fp;
const pOv = fairProbs([1.9, 1.9])[0];
const fit = fitLambdas(pH, pA, { line: 2.5, p: pOv });
const m0 = finalOutcome(fit.lh, fit.la);
check('Modell trifft Heimsieg-Wahrscheinlichkeit (±1,5 %)', near(m0.home, pH, 0.015), { model: m0.home, markt: pH });
check('Modell trifft Auswärtssieg (±1,5 %)', near(m0.away, pA, 0.015), { model: m0.away, markt: pA });
check('Modell trifft Über 2,5 (±2 %)', near(pOver(m0.total, 2.5), pOv, 0.02), pOver(m0.total, 2.5));
check('Favorit hat höhere Torerwartung', fit.lh > fit.la, fit);

// ───── Abgeleitete Märkte vor dem Spiel ─────
const pre = soccerMarkets('Heim', 'Gast', fit.lh, fit.la);
const get = (rows: typeof pre, key: string, name: string, line: number | null = null) =>
  rows.find((r) => r.key === key && (line === null || r.line === line))?.outcomes.find((o) => o.name === name)?.price;
const dc1x = get(pre, 'double_chance', '1X')!;
check('Doppelte Chance 1X niedriger als Heimsieg', dc1x < get(pre, 'h2h', 'home')!, dc1x);
check('Doppelte Chance 1X passt zur Wahrscheinlichkeit', near(dc1x, toOdds(m0.home + m0.draw), 0.011), dc1x);
check('Alle Märkte vorhanden', ['h2h', 'double_chance', 'draw_no_bet', 'totals', 'btts', 'h2h_h1', 'totals_h1']
  .every((k) => pre.some((r) => r.key === k)), pre.map((r) => r.key));
const allPrices = pre.flatMap((r) => r.outcomes.map((o) => o.price));
check('Keine Quote unter 1,01 oder NaN', allPrices.every((p) => p >= 1.01 && Number.isFinite(p)), allPrices);
// Jede Quotenzeile hat eine Marge > 0 (sonst verschenkt man Coins)
const overround = (r: (typeof pre)[0]) => r.outcomes.reduce((s, o) => s + 1 / o.price, 0);
check('Jeder abgeleitete 2-/3-Weg-Markt hat Marge', pre.filter((r) => r.key !== 'double_chance').every((r) => overround(r) > 1.0),
  pre.map((r) => [r.key, r.line, overround(r).toFixed(3)]));

// ───── Live ─────
const live80 = soccerMarkets('Heim', 'Gast', fit.lh, fit.la, { minute: 80, h: 1, a: 0 });
check('Live 1:0 in der 80. → Heimsieg unter 1,25', get(live80, 'h2h', 'home')! < 1.25, get(live80, 'h2h', 'home'));
check('Live 1:0 in der 80. → Gast-Sieg über 15', get(live80, 'h2h', 'away')! > 15, get(live80, 'h2h', 'away'));
check('Live: Halbzeit-Märkte nach der Pause weg', !live80.some((r) => r.key.endsWith('_h1')));
const live85 = soccerMarkets('Heim', 'Gast', fit.lh, fit.la, { minute: 85, h: 0, a: 0 });
check('Live 0:0 in der 85. → Unter 2,5 fast sicher', get(live85, 'totals', 'under', 2.5)! < 1.08, get(live85, 'totals', 'under', 2.5));
const live3 = soccerMarkets('Heim', 'Gast', fit.lh, fit.la, { minute: 60, h: 2, a: 1 });
check('Live 2:1 → Über 2,5 entschieden, Markt weg', !live3.some((r) => r.key === 'totals' && r.line === 2.5));
check('Live 2:1 → Beide treffen entschieden, Markt weg', !live3.some((r) => r.key === 'btts'));
const tor = soccerMarkets('Heim', 'Gast', fit.lh, fit.la, { minute: 30, h: 0, a: 1 });
const ohne = soccerMarkets('Heim', 'Gast', fit.lh, fit.la, { minute: 30, h: 0, a: 0 });
check('Tor für Gast → Gast-Quote fällt', get(tor, 'h2h', 'away')! < get(ohne, 'h2h', 'away')!, [get(tor, 'h2h', 'away'), get(ohne, 'h2h', 'away')]);

// ───── Spielminute (geschätzt) ─────
const t0 = Date.UTC(2026, 10, 21, 15, 30);
check('Minute 30 nach Anpfiff', estimateMinute(t0, t0 + 30 * 60000).label === "~30'");
check('50 min nach Anpfiff = Halbzeit', estimateMinute(t0, t0 + 50 * 60000).label === 'Halbzeit');
check('80 min nach Anpfiff ≈ 63. Minute', estimateMinute(t0, t0 + 80 * 60000).label === "~63'", estimateMinute(t0, t0 + 80 * 60000));

// ───── API-Antwort umsetzen ─────
const ev: ApiEvent = {
  id: 'e1', sport_key: 'soccer_germany_bundesliga', commence_time: '2026-11-22T14:30:00Z',
  home_team: 'FC Bayern München', away_team: 'Borussia Dortmund',
  bookmakers: [
    { key: 'b1', markets: [
      { key: 'h2h', outcomes: [{ name: 'FC Bayern München', price: 1.6 }, { name: 'Borussia Dortmund', price: 4.8 }, { name: 'Draw', price: 4.4 }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: 1.55, point: 3.5 }, { name: 'Under', price: 2.4, point: 3.5 }] },
      { key: 'spreads', outcomes: [{ name: 'FC Bayern München', price: 1.95, point: -1 }, { name: 'Borussia Dortmund', price: 1.85, point: 1 }] }] },
    { key: 'b2', markets: [
      { key: 'h2h', outcomes: [{ name: 'FC Bayern München', price: 1.62 }, { name: 'Borussia Dortmund', price: 4.6 }, { name: 'Draw', price: 4.5 }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: 1.57, point: 3.5 }, { name: 'Under', price: 2.35, point: 3.5 }] }] },
    { key: 'b3', markets: [
      { key: 'h2h', outcomes: [{ name: 'FC Bayern München', price: 9.0 }, { name: 'Borussia Dortmund', price: 4.7 }, { name: 'Draw', price: 4.3 }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 2.5 }, { name: 'Under', price: 1.9, point: 2.5 }] }] },
  ],
};
const c = consensus(ev, 'h2h');
check('Konsens = Median, Ausreißer (9,0) ignoriert', c['FC Bayern München'].price === 1.62, c);
check('Häufigste Über/Unter-Linie gewählt (3,5)', commonLine(ev, 'totals') === 3.5);
check('Handicap-Linie aus Heim-Sicht', commonLine(ev, 'spreads') === -1);
const b = buildMarkets(ev, 'soccer');
const h2h = b.markets.find((m) => m.key === 'h2h')!;
check('1X2 kommt ECHT von der API (source api)', h2h.source === 'api' && h2h.outcomes.length === 3, h2h);
check('Abgeleitete Märkte sind als abgeleitet markiert', b.markets.filter((m) => m.key === 'btts').every((m) => m.source === 'derived'));
check('Echte Linie 3,5 nicht doppelt abgeleitet',
  b.markets.filter((m) => m.key === 'totals' && m.line === 3.5).length === 1 &&
  b.markets.find((m) => m.key === 'totals' && m.line === 3.5)!.source === 'api');
check('Handicap Gast mit +1', b.markets.find((m) => m.key === 'spreads')?.outcomes[1].point === 1);
check('Anzahl Buchmacher gezählt', b.bookmakers === 3);
const nba = buildMarkets({ ...ev, bookmakers: [{ key: 'x', markets: [{ key: 'h2h', outcomes: [{ name: 'FC Bayern München', price: 1.5 }, { name: 'Borussia Dortmund', price: 2.6 }] }] }] }, 'basketball');
check('2-Weg-Sport: nur 2 Ausgänge, keine Fußball-Ableitungen', nba.markets.length === 1 && nba.markets[0].outcomes.length === 2, nba.markets);
check('Ohne Buchmacher keine Märkte', buildMarkets({ ...ev, bookmakers: [] }, 'soccer').markets.length === 0);

check('Spielstand lesen', JSON.stringify(parseScore({ id: 'e1', completed: true, home_team: 'A', away_team: 'B', commence_time: '',
  scores: [{ name: 'B', score: '1' }, { name: 'A', score: '3' }] })) === '{"home":3,"away":1}');
check('Kein Spielstand → null', parseScore({ id: 'e1', completed: false, home_team: 'A', away_team: 'B', commence_time: '', scores: null }) === null);

// ───── Kontingent ─────
const mid = new Date(Date.UTC(2026, 10, 15));
const iv = syncIntervalMinutes(500, 10, 3, mid);
check('Kostenloses Kontingent (500) reicht bis Monatsende', iv * 0 === 0 && iv >= 10 && (15 * 1440 / iv) * 10 * 3 <= 480, iv);
check('Kontingent leer → nicht mehr abrufen', syncIntervalMinutes(20, 10, 3, mid) === Infinity);

console.log(fails ? `\n${fails} ROT` : '\nalles grün');
process.exit(fails ? 1 : 0);
