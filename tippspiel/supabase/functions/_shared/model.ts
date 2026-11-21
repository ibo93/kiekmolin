// Quoten-Modell (rein rechnerisch, ohne Deno/Netz – in Node testbar).
//
// Grundidee wie bei Buchmachern: Tore sind Poisson-verteilt. Aus den ECHTEN
// Marktquoten vor dem Spiel (1/X/2 + Über/Unter) bestimmen wir die
// Torerwartung beider Teams (λ). Damit rechnen wir
//  - abgeleitete Märkte, die die API nicht liefert (Doppelte Chance,
//    Beide treffen, Halbzeit, Draw No Bet), und
//  - Live-Quoten: Restspielzeit + echter Spielstand → neue Wahrscheinlichkeiten.

export type Probs = Record<string, number>;
export const MARGIN = 0.05;            // Buchmacher-Aufschlag für abgeleitete Quoten
const MAX_GOALS = 10;

function poisson(k: number, l: number): number {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Wahrscheinlichkeitsmatrix der WEITEREN Tore: m[i][j] = P(Heim +i, Gast +j) */
export function scoreMatrix(lh: number, la: number): number[][] {
  const ph = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poisson(k, lh));
  const pa = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poisson(k, la));
  return ph.map((x) => pa.map((y) => x * y));
}

/** Aus Quoten die faire Wahrscheinlichkeit (Buchmacher-Marge herausgerechnet) */
export function fairProbs(odds: number[]): number[] {
  const inv = odds.map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / s);
}

/** Faire Wahrscheinlichkeit → Quote mit Marge, auf 2 Stellen, mindestens 1,01 */
export function toOdds(p: number, margin = MARGIN): number {
  if (p <= 0.0001) return 101;
  return Math.max(1.01, Math.round((1 / (p * (1 + margin))) * 100) / 100);
}

/** Endstand-Wahrscheinlichkeiten aus aktuellem Stand + Rest-λ */
export function finalOutcome(lh: number, la: number, h = 0, a = 0) {
  const m = scoreMatrix(lh, la);
  const r = { home: 0, draw: 0, away: 0, btts: 0, total: [] as number[] };
  for (let i = 0; i <= MAX_GOALS; i++) for (let j = 0; j <= MAX_GOALS; j++) {
    const p = m[i][j], H = h + i, A = a + j;
    if (H > A) r.home += p; else if (H === A) r.draw += p; else r.away += p;
    if (H > 0 && A > 0) r.btts += p;
    r.total[H + A] = (r.total[H + A] ?? 0) + p;
  }
  return r;
}

export function pOver(total: number[], line: number) {
  let s = 0;
  total.forEach((p, t) => { if (p && t > line) s += p; });
  return s;
}

/**
 * λ so wählen, dass das Modell die echten Marktquoten trifft.
 * pHome/pAway aus 1X2 (fair), optional pOver für eine Linie.
 * Grobe Gitter-Suche + Verfeinerung: robust, ~5 ms je Spiel.
 */
export function fitLambdas(pHome: number, pAway: number, over?: { line: number; p: number }) {
  const err = (lh: number, la: number) => {
    const r = finalOutcome(lh, la);
    let e = (r.home - pHome) ** 2 + (r.away - pAway) ** 2;
    if (over) e += (pOver(r.total, over.line) - over.p) ** 2;
    return e;
  };
  let best = { lh: 1.4, la: 1.1, e: Infinity };
  for (let lh = 0.1; lh <= 4.01; lh += 0.1) for (let la = 0.1; la <= 4.01; la += 0.1) {
    const e = err(lh, la); if (e < best.e) best = { lh, la, e };
  }
  for (let step = 0.05; step >= 0.005; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dh, da] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const lh = best.lh + dh, la = best.la + da;
        if (lh < 0.05 || la < 0.05) continue;
        const e = err(lh, la);
        if (e < best.e - 1e-12) { best = { lh, la, e }; moved = true; }
      }
    }
  }
  return { lh: best.lh, la: best.la, fitError: best.e };
}

// ───── Spielzeit ─────
// Die Odds API liefert KEINE Spielminute. Wir schätzen sie aus dem Anpfiff
// (45 + 15 Pause + 45). Anzeige deshalb mit "~".
export function estimateMinute(commenceMs: number, nowMs: number) {
  const el = (nowMs - commenceMs) / 60000;
  if (el < 0) return { minute: 0, phase: 'pre' as const, label: null };
  if (el < 45) return { minute: el, phase: '1h' as const, label: `~${Math.max(1, Math.floor(el))}'` };
  if (el < 47) return { minute: 45, phase: '1h' as const, label: "~45'+" };
  if (el < 62) return { minute: 45, phase: 'ht' as const, label: 'Halbzeit' };
  const m = el - 17;  // 2 min Nachspielzeit + 15 Pause
  if (m < 90) return { minute: m, phase: '2h' as const, label: `~${Math.floor(m)}'` };
  return { minute: 90, phase: '2h' as const, label: "~90'+" };
}

export interface MarketRow { key: string; line: number | null; name: string; source: 'api' | 'derived'; sort: number;
  outcomes: { name: string; label: string; price: number; point?: number | null }[] }

/**
 * Alle Fußball-Märkte aus λ + Spielstand + Minute.
 * minute=0 → vor dem Spiel. Halbzeit-Märkte nur bis zur Pause.
 */
export function soccerMarkets(home: string, away: string, lh: number, la: number,
                              opts: { minute?: number; h?: number; a?: number; totalsLines?: number[] } = {}): MarketRow[] {
  const minute = Math.min(90, Math.max(0, opts.minute ?? 0));
  const h = opts.h ?? 0, a = opts.a ?? 0;
  const rest = (90 - minute) / 90;
  const r = finalOutcome(lh * rest, la * rest, h, a);
  const fmt = (x: number) => String(x).replace('.', ',');
  const rows: MarketRow[] = [];

  rows.push({ key: 'h2h', line: null, name: 'Endergebnis', source: 'derived', sort: 10, outcomes: [
    { name: 'home', label: home, price: toOdds(r.home) },
    { name: 'draw', label: 'Unentschieden', price: toOdds(r.draw) },
    { name: 'away', label: away, price: toOdds(r.away) }] });
  rows.push({ key: 'double_chance', line: null, name: 'Doppelte Chance', source: 'derived', sort: 20, outcomes: [
    { name: '1X', label: '1 oder X', price: toOdds(r.home + r.draw) },
    { name: '12', label: '1 oder 2', price: toOdds(r.home + r.away) },
    { name: 'X2', label: 'X oder 2', price: toOdds(r.draw + r.away) }] });
  const dnb = fairProbs([1 / r.home, 1 / r.away]);
  rows.push({ key: 'draw_no_bet', line: null, name: 'Sieg ohne Unentschieden', source: 'derived', sort: 25, outcomes: [
    { name: 'home', label: home, price: toOdds(dnb[0]) }, { name: 'away', label: away, price: toOdds(dnb[1]) }] });

  const lines = opts.totalsLines ?? [1.5, 2.5, 3.5];
  lines.forEach((line, i) => {
    if (h + a > line) return;                      // schon entschieden → Markt weglassen
    const po = pOver(r.total, line);
    rows.push({ key: 'totals', line, name: `Über/Unter ${fmt(line)} Tore`, source: 'derived', sort: 30 + i, outcomes: [
      { name: 'over', label: `Über ${fmt(line)}`, price: toOdds(po), point: line },
      { name: 'under', label: `Unter ${fmt(line)}`, price: toOdds(1 - po), point: line }] });
  });
  if (!(h > 0 && a > 0)) rows.push({ key: 'btts', line: null, name: 'Beide Teams treffen', source: 'derived', sort: 40, outcomes: [
    { name: 'yes', label: 'Ja', price: toOdds(r.btts) }, { name: 'no', label: 'Nein', price: toOdds(1 - r.btts) }] });

  if (minute < 45) {
    // Erste Halbzeit: ~45 % der Tore fallen vor der Pause (Erfahrungswert)
    const f = ((45 - minute) / 45) * 0.45;
    const ht = finalOutcome(lh * f, la * f, h, a);
    rows.push({ key: 'h2h_h1', line: null, name: 'Halbzeit-Ergebnis', source: 'derived', sort: 60, outcomes: [
      { name: 'home', label: home, price: toOdds(ht.home) },
      { name: 'draw', label: 'Unentschieden', price: toOdds(ht.draw) },
      { name: 'away', label: away, price: toOdds(ht.away) }] });
    if (h + a < 1) {
      const po = pOver(ht.total, 0.5);
      rows.push({ key: 'totals_h1', line: 0.5, name: 'Halbzeit Über/Unter 0,5', source: 'derived', sort: 61, outcomes: [
        { name: 'over', label: 'Über 0,5', price: toOdds(po), point: 0.5 },
        { name: 'under', label: 'Unter 0,5', price: toOdds(1 - po), point: 0.5 }] });
    }
  }
  return rows;
}
