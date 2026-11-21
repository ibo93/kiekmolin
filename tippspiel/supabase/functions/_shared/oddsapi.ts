// The Odds API (v4) → unsere Tabellen. Rein rechnerisch, in Node testbar.
//
// Antwortformat laut Doku (noch NICHT gegen eine echte Antwort gemessen –
// von dieser Umgebung aus ist der Host gesperrt):
//   GET /v4/sports                    → [{ key, group, title, description, active }]
//   GET /v4/sports/{key}/odds?regions=eu&markets=h2h,totals,spreads&oddsFormat=decimal
//     → [{ id, sport_key, commence_time, home_team, away_team,
//          bookmakers: [{ key, markets: [{ key, outcomes: [{ name, price, point? }] }] }] }]
//   GET /v4/sports/{key}/scores?daysFrom=1
//     → [{ id, completed, home_team, away_team, scores: [{ name, score }] | null }]
//   Kopfzeilen: x-requests-remaining, x-requests-used, x-requests-last

import { fairProbs, fitLambdas, soccerMarkets, toOdds, type MarketRow } from './model.ts';

export interface ApiOutcome { name: string; price: number; point?: number }
export interface ApiEvent {
  id: string; sport_key: string; commence_time: string; home_team: string; away_team: string;
  bookmakers?: { key: string; markets: { key: string; outcomes: ApiOutcome[] }[] }[];
}
export interface ApiScore {
  id: string; completed: boolean; home_team: string; away_team: string; commence_time: string;
  scores: { name: string; score: string }[] | null;
}
export interface ApiSport { key: string; group: string; title: string; description: string; active: boolean; has_outrights?: boolean }

// Gruppenname der API → unsere Sportart
const GROUPS: Record<string, { key: string; title: string; icon: string; sort: number }> = {
  'Soccer': { key: 'soccer', title: 'Fußball', icon: '⚽', sort: 10 },
  'Basketball': { key: 'basketball', title: 'Basketball', icon: '🏀', sort: 20 },
  'Tennis': { key: 'tennis', title: 'Tennis', icon: '🎾', sort: 30 },
  'Ice Hockey': { key: 'icehockey', title: 'Eishockey', icon: '🏒', sort: 40 },
  'American Football': { key: 'americanfootball', title: 'Football', icon: '🏈', sort: 50 },
  'Handball': { key: 'handball', title: 'Handball', icon: '🤾', sort: 60 },
  'Baseball': { key: 'baseball', title: 'Baseball', icon: '⚾', sort: 70 },
  'Rugby League': { key: 'rugby', title: 'Rugby', icon: '🏉', sort: 80 },
  'Rugby Union': { key: 'rugby', title: 'Rugby', icon: '🏉', sort: 80 },
  'Cricket': { key: 'cricket', title: 'Cricket', icon: '🏏', sort: 90 },
  'Mixed Martial Arts': { key: 'mma', title: 'MMA', icon: '🥊', sort: 95 },
  'Boxing': { key: 'boxing', title: 'Boxen', icon: '🥊', sort: 96 },
};
export function mapSport(group: string) { return GROUPS[group] ?? null; }

/** Ligen, die bei knappem Kontingent zuerst geholt werden (kleinere Zahl = wichtiger) */
export const PRIORITY: Record<string, number> = {
  soccer_germany_bundesliga: 1, soccer_uefa_champs_league: 2, soccer_epl: 3, soccer_germany_bundesliga2: 4,
  soccer_spain_la_liga: 5, soccer_italy_serie_a: 6, soccer_france_ligue_one: 7, soccer_uefa_europa_league: 8,
  soccer_germany_dfb_pokal: 9, soccer_turkey_super_league: 10, soccer_netherlands_eredivisie: 11,
  basketball_nba: 12, icehockey_nhl: 13, americanfootball_nfl: 14, soccer_uefa_europa_conference_league: 15,
  soccer_germany_liga3: 16, soccer_portugal_primeira_liga: 17, soccer_austria_bundesliga: 18,
  soccer_switzerland_superleague: 19, basketball_euroleague: 20,
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Konsens-Quote aller Buchmacher: Median je Ausgang.
 * Median statt Durchschnitt, damit ein einzelner Ausreißer nichts verzerrt.
 */
export function consensus(ev: ApiEvent, marketKey: string, point?: number) {
  const by = new Map<string, number[]>();
  for (const b of ev.bookmakers ?? []) for (const m of b.markets) {
    if (m.key !== marketKey) continue;
    for (const o of m.outcomes) {
      if (point !== undefined && o.point !== undefined) {
        // bei spreads gilt die Linie aus Heim-Sicht; Gast hat -point
        const mine = marketKey === 'spreads' && o.name !== ev.home_team ? -o.point : o.point;
        if (mine !== point) continue;
      }
      if (!by.has(o.name)) by.set(o.name, []);
      by.get(o.name)!.push(o.price);
    }
  }
  const out: Record<string, { price: number; n: number }> = {};
  by.forEach((ps, name) => { out[name] = { price: r2(median(ps)), n: ps.length }; });
  return out;
}

/** Häufigste Linie eines Markts (z. B. 2.5 bei totals) */
export function commonLine(ev: ApiEvent, marketKey: string): number | undefined {
  const count = new Map<number, number>();
  for (const b of ev.bookmakers ?? []) for (const m of b.markets) {
    if (m.key !== marketKey) continue;
    const o = m.outcomes.find((x) => marketKey !== 'spreads' || x.name === ev.home_team);
    if (o?.point !== undefined) count.set(o.point, (count.get(o.point) ?? 0) + 1);
  }
  let best: number | undefined, n = 0;
  count.forEach((c, p) => { if (c > n || (c === n && best !== undefined && Math.abs(p - 2.5) < Math.abs(best - 2.5))) { best = p; n = c; } });
  return best;
}

export interface BuildResult { markets: MarketRow[]; lambdas: { lh: number; la: number } | null; bookmakers: number }

/**
 * Märkte eines Spiels bauen:
 *  - h2h / totals / spreads: ECHTE Konsens-Quoten der Buchmacher (source 'api')
 *  - Fußball zusätzlich: Doppelte Chance, Beide treffen, Halbzeit … aus dem
 *    Modell, das an die echten Quoten angepasst ist (source 'derived')
 */
export function buildMarkets(ev: ApiEvent, sportKey: string): BuildResult {
  const H = ev.home_team, A = ev.away_team;
  const books = (ev.bookmakers ?? []).length;
  const rows: MarketRow[] = [];
  const h2h = consensus(ev, 'h2h');
  const hasDraw = !!h2h['Draw'];

  if (h2h[H] && h2h[A]) {
    rows.push({ key: 'h2h', line: null, name: 'Endergebnis', source: 'api', sort: 10, outcomes: [
      { name: 'home', label: H, price: h2h[H].price },
      ...(hasDraw ? [{ name: 'draw', label: 'Unentschieden', price: h2h['Draw'].price }] : []),
      { name: 'away', label: A, price: h2h[A].price }] });
  }

  const tl = commonLine(ev, 'totals');
  let overInfo: { line: number; p: number } | undefined;
  if (tl !== undefined) {
    const t = consensus(ev, 'totals', tl);
    if (t['Over'] && t['Under']) {
      const unit = sportKey === 'soccer' ? 'Tore' : 'Punkte';
      const f = String(tl).replace('.', ',');
      rows.push({ key: 'totals', line: tl, name: `Über/Unter ${f} ${unit}`, source: 'api', sort: 30, outcomes: [
        { name: 'over', label: `Über ${f}`, price: t['Over'].price, point: tl },
        { name: 'under', label: `Unter ${f}`, price: t['Under'].price, point: tl }] });
      overInfo = { line: tl, p: fairProbs([t['Over'].price, t['Under'].price])[0] };
    }
  }

  const sl = commonLine(ev, 'spreads');
  if (sl !== undefined) {
    const s = consensus(ev, 'spreads', sl);
    if (s[H] && s[A]) {
      const f = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + String(Math.abs(x)).replace('.', ',');
      rows.push({ key: 'spreads', line: sl, name: `Handicap ${f(sl)} / ${f(-sl)}`, source: 'api', sort: 50, outcomes: [
        { name: 'home', label: `${H} ${f(sl)}`, price: s[H].price, point: sl },
        { name: 'away', label: `${A} ${f(-sl)}`, price: s[A].price, point: -sl }] });
    }
  }

  let lambdas: BuildResult['lambdas'] = null;
  if (sportKey === 'soccer' && hasDraw && h2h[H] && h2h[A]) {
    const [pH, , pA] = fairProbs([h2h[H].price, h2h['Draw'].price, h2h[A].price]);
    const fit = fitLambdas(pH, pA, overInfo);
    lambdas = { lh: fit.lh, la: fit.la };
    const derived = soccerMarkets(H, A, fit.lh, fit.la, { totalsLines: [1.5, 2.5, 3.5].filter((l) => l !== tl) })
      .filter((m) => m.key !== 'h2h');                  // 1X2 kommt echt von der API
    rows.push(...derived);
  }
  return { markets: rows.sort((a, b) => a.sort - b.sort), lambdas, bookmakers: books };
}

/** Endstand aus der Scores-Antwort (null, wenn keine Zahlen) */
export function parseScore(s: ApiScore): { home: number; away: number } | null {
  if (!s.scores) return null;
  const h = s.scores.find((x) => x.name === s.home_team), a = s.scores.find((x) => x.name === s.away_team);
  const hn = Number(h?.score), an = Number(a?.score);
  if (!h || !a || !Number.isFinite(hn) || !Number.isFinite(an)) return null;
  return { home: hn, away: an };
}

/**
 * Kontingent einteilen: Wie viele Minuten zwischen zwei Abrufen einer Liga,
 * damit das Monatskontingent bis zum Monatsende reicht?
 * credits/Abruf = Anzahl Märkte × Regionen (Doku).
 */
export function syncIntervalMinutes(remaining: number, leagues: number, creditsPerCall: number, now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const minutesLeft = Math.max(60, (end - now.getTime()) / 60000);
  const callsPossible = Math.max(0, remaining - 20) / creditsPerCall;   // 20 Reserve für Ergebnisse
  if (callsPossible < 1 || leagues < 1) return Infinity;
  return Math.max(10, Math.ceil(minutesLeft / (callsPossible / leagues)));
}

export { toOdds };
