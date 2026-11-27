// Quoten-Mathematik – gleiche Regeln wie place_bets() in der Datenbank.
// Der Server rechnet verbindlich; das hier ist nur die Live-Anzeige im Wettschein.

export const BUILDER_FACTOR = 0.9;
export const CASHOUT_MARGIN = 0.95;

export function kCombinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

export const product = (xs: number[]) => xs.reduce((a, b) => a * b, 1);

/** Ganze Coins, abgerundet – wie floor() in SQL. Kleiner Epsilon gegen 2,9999999. */
export const coins = (x: number) => Math.floor(x + 1e-9);

export function comboOdds(prices: number[]) { return product(prices); }

export function builderOdds(prices: number[]) {
  return Math.max(1.01, product(prices) * Math.pow(BUILDER_FACTOR, prices.length - 1));
}

export function systemInfo(prices: number[], k: number) {
  const lines = kCombinations(prices.length, k);
  const sum = lines.reduce((s, l) => s + product(l.map((i) => prices[i])), 0);
  return { lines: lines.length, sumOdds: sum };
}

export function systemLabel(k: number, n: number) { return `${k} aus ${n}`; }

export function fmtOdds(p: number) { return p.toFixed(2).replace('.', ','); }
export function fmtCoins(c: number) { return new Intl.NumberFormat('de-DE').format(Math.round(c)); }
