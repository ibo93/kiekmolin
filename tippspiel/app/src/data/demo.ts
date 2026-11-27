// Demo-Betrieb ohne Supabase: dieselben Spiele wie supabase/seed.sql,
// dieselben Prüfregeln wie place_bets()/cashout_bet() – nur im Speicher.
// Live-Spiele ticken, damit Quoten-Blinken und Sperren sichtbar sind.

import type {
  Bet, BetRequest, Boost, Group, LeaderRow, League, Market, Outcome, PlaceResult,
  Sport, SportEvent, Stats, Wallet,
} from './types';
import { builderOdds, CASHOUT_MARGIN, coins, comboOdds, kCombinations, product, systemInfo } from './odds';

export interface State {
  loaded: boolean;
  demo: boolean;
  user: { email: string; username: string } | null;
  sports: Sport[];
  leagues: League[];
  events: SportEvent[];
  markets: Market[];
  outcomes: Record<string, Outcome>;
  boosts: Boost[];
  wallet: Wallet;
  bets: Bet[];
  toast: { text: string; kind: 'ok' | 'info' | 'err' } | null;
  /** Dauerhafter Fehler (z. B. Server nicht erreichbar) – darf nicht wie "keine Spiele" aussehen */
  error: string | null;
  pushPrefs: PushPrefs;
}
export type PushPrefs = { bet_won: boolean; event_start: boolean; boost: boolean };

const MIN = 60_000;
const now = () => Date.now();
let seq = 0;
const uid = (p: string) => `${p}_${(++seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const SPORTS: Sport[] = [
  { key: 'soccer', title: 'Fußball', icon: '⚽', sort: 10 },
  { key: 'basketball', title: 'Basketball', icon: '🏀', sort: 20 },
  { key: 'tennis', title: 'Tennis', icon: '🎾', sort: 30 },
  { key: 'icehockey', title: 'Eishockey', icon: '🏒', sort: 40 },
  { key: 'americanfootball', title: 'Football', icon: '🏈', sort: 50 },
  { key: 'handball', title: 'Handball', icon: '🤾', sort: 60 },
];

export const LEAGUES: League[] = [
  { key: 'soccer_germany_bundesliga', sportKey: 'soccer', title: 'Bundesliga', country: 'Deutschland', sort: 10, hasDraw: true },
  { key: 'soccer_germany_bundesliga2', sportKey: 'soccer', title: '2. Bundesliga', country: 'Deutschland', sort: 11, hasDraw: true },
  { key: 'soccer_uefa_champs_league', sportKey: 'soccer', title: 'Champions League', country: 'Europa', sort: 20, hasDraw: true },
  { key: 'soccer_epl', sportKey: 'soccer', title: 'Premier League', country: 'England', sort: 30, hasDraw: true },
  { key: 'soccer_spain_la_liga', sportKey: 'soccer', title: 'La Liga', country: 'Spanien', sort: 31, hasDraw: true },
  { key: 'basketball_nba', sportKey: 'basketball', title: 'NBA', country: 'USA', sort: 10, hasDraw: false },
  { key: 'tennis_atp_finals', sportKey: 'tennis', title: 'ATP Finals', country: 'International', sort: 10, hasDraw: false },
  { key: 'icehockey_nhl', sportKey: 'icehockey', title: 'NHL', country: 'USA', sort: 10, hasDraw: false },
  { key: 'handball_germany_bundesliga', sportKey: 'handball', title: 'Handball-Bundesliga', country: 'Deutschland', sort: 10, hasDraw: false },
];

type DemoEv = { id: string; lg: string; h: string; a: string; t: number; top?: boolean; odds: [number, number | null, number]; live?: [number, number, string] };
const DEMO: DemoEv[] = [
  { id: 'demo_1', lg: 'soccer_germany_bundesliga', h: 'FC Nordhafen', a: 'SV Moorwald', t: 180, top: true, odds: [1.85, 3.6, 4.2] },
  { id: 'demo_2', lg: 'soccer_germany_bundesliga', h: 'Eintracht Deichstadt', a: 'TSV Kliffburg', t: 300, top: true, odds: [2.4, 3.3, 2.9] },
  { id: 'demo_3', lg: 'soccer_uefa_champs_league', h: 'Real Costa', a: 'AC Lagune', t: 26 * 60, top: true, odds: [2.1, 3.4, 3.4] },
  { id: 'demo_4', lg: 'soccer_epl', h: 'Riverside United', a: 'Kingsbridge FC', t: 28 * 60, odds: [1.55, 4.2, 5.75] },
  { id: 'demo_5', lg: 'soccer_germany_bundesliga2', h: 'Hafen 04', a: 'Grünfeld 1912', t: -35, odds: [1.6, 3.9, 5.4], live: [1, 0, "35'"] },
  { id: 'demo_6', lg: 'soccer_spain_la_liga', h: 'Atlético Sol', a: 'Deportivo Mar', t: -70, top: true, odds: [2.75, 2.6, 3.1], live: [1, 1, "68'"] },
  { id: 'demo_7', lg: 'basketball_nba', h: 'Harbor Hawks', a: 'Desert Suns', t: 480, odds: [1.7, null, 2.15] },
  { id: 'demo_8', lg: 'icehockey_nhl', h: 'Polar Bears', a: 'Lake Wolves', t: -40, odds: [1.8, null, 2.0], live: [2, 1, '2. Drittel'] },
  { id: 'demo_9', lg: 'tennis_atp_finals', h: 'M. Berger', a: 'L. Duarte', t: 240, odds: [1.45, null, 2.7] },
  { id: 'demo_10', lg: 'soccer_germany_bundesliga', h: 'Borussia Hügelfeld', a: 'VfR Ostmark', t: 27 * 60, odds: [1.95, 3.5, 3.7] },
  { id: 'demo_11', lg: 'handball_germany_bundesliga', h: 'HSG Küste', a: 'THW Seewind', t: 360, odds: [2.05, null, 1.78] },
];

function buildEvent(d: DemoEv, markets: Market[], outcomes: Record<string, Outcome>): SportEvent {
  const lg = LEAGUES.find((l) => l.key === d.lg)!;
  const ev: SportEvent = {
    id: d.id, leagueKey: d.lg, sportKey: lg.sportKey, home: d.h, away: d.a,
    commence: now() + d.t * MIN, status: d.live ? 'live' : 'scheduled',
    homeScore: d.live ? d.live[0] : null, awayScore: d.live ? d.live[1] : null,
    minute: d.live ? d.live[2] : null, isTop: !!d.top,
  };
  const add = (key: string, name: string, sort: number, line: number | null,
               outs: [string, string, number][]) => {
    const mid = `${d.id}:${key}:${line ?? ''}`;              // feste IDs → Demo-Stand übersteht Neuladen
    const m: Market = { id: mid, eventId: d.id, key, line, name, status: 'open', sort };
    markets.push(m);
    for (const [n, label, price] of outs) {
      const o: Outcome = { id: `${mid}:${n}`, marketId: m.id, eventId: d.id, name: n, label, price: r2(Math.max(1.01, price)), prevPrice: null, changedAt: null, status: 'open' };
      outcomes[o.id] = o;
    }
  };
  const [ph, pd, pa] = d.odds;
  add('h2h', 'Endergebnis', 10, null, pd
    ? [['home', d.h, ph], ['draw', 'Unentschieden', pd], ['away', d.a, pa]]
    : [['home', d.h, ph], ['away', d.a, pa]]);
  if (lg.sportKey === 'soccer' && pd) {
    add('double_chance', 'Doppelte Chance', 20, null, [
      ['1X', '1 oder X', 0.95 / (1 / ph + 1 / pd)],
      ['12', '1 oder 2', 0.95 / (1 / ph + 1 / pa)],
      ['X2', 'X oder 2', 0.95 / (1 / pd + 1 / pa)],
    ]);
    add('totals', 'Über/Unter 2,5 Tore', 30, 2.5, [['over', 'Über 2,5', 1.9], ['under', 'Unter 2,5', 1.9]]);
    add('totals', 'Über/Unter 1,5 Tore', 31, 1.5, [['over', 'Über 1,5', 1.33], ['under', 'Unter 1,5', 3.2]]);
    add('totals', 'Über/Unter 3,5 Tore', 32, 3.5, [['over', 'Über 3,5', 3.1], ['under', 'Unter 3,5', 1.36]]);
    add('btts', 'Beide Teams treffen', 40, null, [['yes', 'Ja', 1.8], ['no', 'Nein', 1.95]]);
    add('spreads', 'Handicap', 50, -1, [['home', `${d.h} −1`, ph * 1.9], ['away', `${d.a} +1`, 0.95 / (1 - 1 / (ph * 1.9))]]);
    add('h2h_h1', 'Halbzeit-Ergebnis', 60, null, [['home', d.h, ph * 1.45], ['draw', 'Unentschieden', 2.1], ['away', d.a, pa * 1.45]]);
    add('totals_h1', 'Halbzeit Über/Unter 0,5', 61, 0.5, [['over', 'Über 0,5', 1.38], ['under', 'Unter 0,5', 2.9]]);
  } else {
    add('spreads', 'Handicap', 50, null, [['home', `${d.h} −3,5`, 1.9], ['away', `${d.a} +3,5`, 1.9]]);
  }
  return ev;
}

const SAVE_KEY = 'tipparena.demo';
function loadSaved(): { wallet: Wallet; bets: Bet[] } | null {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
}

function initialState(): State {
  const saved = loadSaved();
  const markets: Market[] = [];
  const outcomes: Record<string, Outcome> = {};
  const events = DEMO.map((d) => buildEvent(d, markets, outcomes));
  // Boosts: Heimsiege der Top-Spiele um ~20 % erhöht
  const boosts: Boost[] = [];
  for (const id of ['demo_1', 'demo_3']) {
    const m = markets.find((x) => x.eventId === id && x.key === 'h2h')!;
    const o = Object.values(outcomes).find((x) => x.marketId === m.id && x.name === 'home')!;
    const ev = events.find((e) => e.id === id)!;
    boosts.push({ outcomeId: o.id, eventId: id, original: o.price, boosted: r2(o.price * 1.2), title: `${ev.home} gewinnt` });
  }
  return {
    loaded: false, demo: true, user: { email: 'demo@tipparena.app', username: 'Du' },
    sports: SPORTS, leagues: LEAGUES, events, markets, outcomes, boosts,
    wallet: saved?.wallet ?? { balance: 1000, lastDailyBonus: null, lastRefillAt: null },
    bets: saved?.bets ?? demoHistory(), toast: null, error: null,
    pushPrefs: { bet_won: false, event_start: false, boost: false },
  };
}

function demoHistory(): Bet[] {
  const sel = (ev: string, mk: string, label: string, price: number, status: Bet['selections'][0]['status']) =>
    ({ outcomeId: uid('x'), eventId: 'old', eventName: ev, marketName: mk, label, price, boosted: false, status });
  return [
    { id: uid('b'), type: 'combo', systemK: null, lines: 1, stake: 50, totalOdds: 4.37, potentialPayout: 218, status: 'won', payout: 218,
      placedAt: now() - 2 * 86400e3, settledAt: now() - 86400e3,
      selections: [sel('FC Nordhafen – TSV Kliffburg', 'Endergebnis', 'FC Nordhafen', 1.9, 'won'),
                   sel('Real Costa – Hafen 04', 'Über/Unter 2,5 Tore', 'Über 2,5', 2.3, 'won')] },
    { id: uid('b'), type: 'single', systemK: null, lines: 1, stake: 100, totalOdds: 3.4, potentialPayout: 340, status: 'lost', payout: 0,
      placedAt: now() - 3 * 86400e3, settledAt: now() - 3 * 86400e3 + 7200e3,
      selections: [sel('AC Lagune – SV Moorwald', 'Endergebnis', 'Unentschieden', 3.4, 'lost')] },
  ];
}

// ───────────────────────── Store ─────────────────────────
type Listener = () => void;

export class DemoBackend {
  state: State = initialState();
  /** Demo-Betrieb: kein Login nötig */
  requiresLogin = false;
  private listeners = new Set<Listener>();
  private timer: number | undefined;

  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getState = () => this.state;
  protected set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    if (this.state.demo && (patch.wallet || patch.bets)) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ wallet: this.state.wallet, bets: this.state.bets })); } catch { /* privater Modus */ }
    }
    this.listeners.forEach((l) => l());
  }

  start() {
    // Kurzer Ladezustand, damit die Skeletons zu sehen sind
    setTimeout(() => { this.set({ loaded: true }); this.claimDailyBonus(true); }, 700);
    this.timer = window.setInterval(() => this.tick(), 3500);
  }
  stop() { window.clearInterval(this.timer); }

  toast(text: string, kind: 'ok' | 'info' | 'err' = 'info') {
    this.set({ toast: { text, kind } });
    setTimeout(() => { if (this.state.toast?.text === text) this.set({ toast: null }); }, 2600);
  }

  /** Live-Simulation: Quoten schwanken, Märkte werden kurz gesperrt, Minute läuft */
  private tick() {
    const outcomes = { ...this.state.outcomes };
    const markets = this.state.markets.map((m) => ({ ...m }));
    const live = this.state.events.filter((e) => e.status === 'live');
    for (const ev of live) {
      for (const m of markets.filter((x) => x.eventId === ev.id)) {
        if (m.status === 'suspended' && Math.random() < 0.5) m.status = 'open';
        else if (m.status === 'open' && Math.random() < 0.06) m.status = 'suspended';
      }
      const outs = Object.values(outcomes).filter((o) => o.eventId === ev.id);
      for (const o of outs) {
        if (Math.random() < 0.18) {
          const f = 1 + (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.06);
          outcomes[o.id] = { ...o, prevPrice: o.price, price: r2(Math.max(1.01, o.price * f)), changedAt: now() };
        }
      }
    }
    const events = this.state.events.map((e) => {
      if (e.status !== 'live' || !e.minute?.endsWith("'")) return e;
      const m = Math.min(90, parseInt(e.minute) + (Math.random() < 0.4 ? 1 : 0));
      return { ...e, minute: `${m}'` };
    });
    this.set({ outcomes, markets, events });
  }

  // ───── Auth (Demo: immer angemeldet) ─────
  async signInMagic(email: string) { this.toast(`Demo: Magic Link an ${email} „gesendet“`, 'info'); }
  async signInGoogle() { this.toast('Demo: Google-Login ist erst mit Supabase aktiv', 'info'); }
  async signOut() { this.toast('Demo-Modus: Abmelden nicht möglich', 'info'); }

  // ───── Coins ─────
  claimDailyBonus(silent = false) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    if (this.state.wallet.lastDailyBonus === today) { if (!silent) this.toast('Tagesbonus heute schon abgeholt'); return; }
    this.set({ wallet: { ...this.state.wallet, balance: this.state.wallet.balance + 100, lastDailyBonus: today } });
    this.toast('+100 Coins Tagesbonus 🎁', 'ok');
  }
  claimRefill() {
    const w = this.state.wallet;
    if (w.balance > 0) return this.toast('Nachfüllen geht erst bei 0 Coins', 'err');
    if (w.lastRefillAt && now() - w.lastRefillAt < 7 * 86400e3) return this.toast('Nachfüllen nur 1× pro Woche', 'err');
    this.set({ wallet: { ...w, balance: 500, lastRefillAt: now() } });
    this.toast('Auf 500 Coins aufgefüllt', 'ok');
  }

  effectivePrice(outcomeId: string) {
    const b = this.state.boosts.find((x) => x.outcomeId === outcomeId);
    return b ? b.boosted : this.state.outcomes[outcomeId]?.price;
  }

  blockReason(outcomeId: string): string | null {
    const o = this.state.outcomes[outcomeId];
    if (!o) return 'Nicht gefunden';
    const m = this.state.markets.find((x) => x.id === o.marketId);
    const e = this.state.events.find((x) => x.id === o.eventId);
    if (!m || !e) return 'Nicht mehr verfügbar';
    if (['finished', 'cancelled', 'postponed'].includes(e.status)) return 'Spiel ist vorbei';
    if (o.status !== 'open' || m.status !== 'open') return 'Markt gesperrt';
    if (e.status === 'scheduled' && e.commence <= now()) return 'Spiel hat begonnen';
    return null;
  }

  // ───── Wette platzieren (gleiche Regeln wie place_bets) ─────
  async placeBets(reqs: BetRequest[]): Promise<PlaceResult> {
    await new Promise((r) => setTimeout(r, 450));
    const changes: { outcomeId: string; newPrice: number }[] = [];
    for (const r of reqs) for (const s of r.selections) {
      const why = this.blockReason(s.outcomeId);
      if (why) return { ok: false, code: 'SELECTION_UNAVAILABLE', message: why };
      const p = this.effectivePrice(s.outcomeId)!;
      if (p !== s.price) changes.push({ outcomeId: s.outcomeId, newPrice: p });
    }
    if (changes.length) return { ok: false, code: 'ODDS_CHANGED', changes };
    const total = reqs.reduce((s, r) => s + r.stake, 0);
    if (total > this.state.wallet.balance) return { ok: false, code: 'INSUFFICIENT_COINS', message: 'Nicht genug Coins' };

    const newBets: Bet[] = reqs.map((r) => {
      const prices = r.selections.map((s) => s.price);
      let odds = comboOdds(prices), lines = 1, potential: number;
      if (r.type === 'builder') odds = builderOdds(prices);
      if (r.type === 'system') {
        const si = systemInfo(prices, r.systemK!);
        lines = si.lines; odds = si.sumOdds / lines; potential = coins(r.stake / lines * si.sumOdds);
      } else potential = coins(r.stake * odds);
      return {
        id: uid('b'), type: r.type, systemK: r.systemK ?? null, lines, stake: r.stake,
        totalOdds: Math.round(odds * 1000) / 1000, potentialPayout: potential, status: 'open', payout: 0,
        placedAt: now(), settledAt: null,
        selections: r.selections.map((s) => {
          const o = this.state.outcomes[s.outcomeId];
          const m = this.state.markets.find((x) => x.id === o.marketId)!;
          const e = this.state.events.find((x) => x.id === o.eventId)!;
          return { outcomeId: o.id, eventId: e.id, eventName: `${e.home} – ${e.away}`, marketName: m.name,
                   label: o.label, price: s.price, boosted: this.state.boosts.some((b) => b.outcomeId === o.id), status: 'open' };
        }),
      };
    });
    this.set({ bets: [...newBets, ...this.state.bets], wallet: { ...this.state.wallet, balance: this.state.wallet.balance - total } });
    return { ok: true, balance: this.state.wallet.balance };
  }

  // ───── Cash-Out (gleiche Formel wie cashout_value) ─────
  cashoutValue(bet: Bet): number | null {
    if (bet.status !== 'open') return null;
    const f: number[] = [];
    for (const s of bet.selections) {
      if (s.status === 'open') {
        if (this.blockReason(s.outcomeId)) return null;
        f.push(s.price / this.effectivePrice(s.outcomeId)!);   // inkl. Boost – sonst Boost sofort mit Gewinn auszahlbar
      } else f.push(s.status === 'won' ? s.price : s.status === 'void' ? 1 : 0);
    }
    let v: number;
    if (bet.type === 'system') {
      v = kCombinations(f.length, bet.systemK!).reduce((a, l) => a + (bet.stake / bet.lines) * product(l.map((i) => f[i])), 0);
    } else {
      if (f.includes(0)) return null;
      const factor = bet.type === 'builder' ? Math.pow(0.9, bet.selections.length - 1) : 1;
      v = bet.stake * factor * product(f);
    }
    const c = coins(v * CASHOUT_MARGIN);
    return c >= 1 ? c : null;
  }

  async cashout(betId: string, expected: number) {
    await new Promise((r) => setTimeout(r, 350));
    const bet = this.state.bets.find((b) => b.id === betId);
    if (!bet) return { ok: false as const, message: 'Wette nicht gefunden' };
    const v = this.cashoutValue(bet);
    if (v === null) return { ok: false as const, message: 'Cash-Out gerade nicht möglich' };
    if (v < expected) return { ok: false as const, message: `Wert gesunken auf ${v} Coins`, value: v };
    this.set({
      bets: this.state.bets.map((b) => b.id === betId ? { ...b, status: 'cashed_out', payout: v, settledAt: now() } : b),
      wallet: { ...this.state.wallet, balance: this.state.wallet.balance + v },
    });
    return { ok: true as const, payout: v };
  }

  // ───── Push ─────
  /** Demo: nur Einstellungen merken, nichts senden */
  async setPushPrefs(prefs: PushPrefs) {
    this.set({ pushPrefs: prefs });
    if (Object.values(prefs).some(Boolean)) this.toast('Demo: Benachrichtigungen kommen erst im echten Betrieb', 'info');
  }

  // ───── Rangliste, Gruppen, Statistik ─────
  private groups: Group[] = [{ id: 'g1', name: 'Stammtisch Hafenkante', inviteCode: 'HAFEN7KQ', members: 12, isOwner: true }];

  async leaderboard(period: 'week' | 'month' | 'all', groupId?: string): Promise<LeaderRow[]> {
    await new Promise((r) => setTimeout(r, 300));
    const names = groupId
      ? ['Jonte', 'Mareike_S', 'Tjark', 'Du', 'Hauke', 'Imke.B', 'Fiete']
      : ['Kiekerkönig', 'Lena_09', 'Ole.Tipp', 'BolzplatzBen', 'Du', 'Watt_Wizard', 'Nordlicht', 'Knut77', 'Elbkicker', 'Moin_Matze'];
    const scale = period === 'week' ? 1 : period === 'month' ? 3.4 : 11;
    const myProfit = this.state.bets.filter((b) => b.status !== 'open').reduce((s, b) => s + b.payout - b.stake, 0);
    return names.map((n, i) => ({
      rank: 0, username: n, isMe: n === 'Du',
      profit: n === 'Du' ? myProfit : Math.round((2400 - i * 260 + (i % 3) * 40) * scale),
      settled: 8 + ((i * 7) % 13), won: 3 + ((i * 5) % 7),
    })).sort((a, b) => b.profit - a.profit).map((r, i) => ({ ...r, rank: i + 1 }));
  }
  async listGroups() { return this.groups; }
  async createGroup(name: string) {
    const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
    const g: Group = { id: uid('g'), name, inviteCode: code, members: 1, isOwner: true };
    this.groups = [...this.groups, g];
    return g;
  }
  async joinGroup(code: string) {
    const g: Group = { id: uid('g'), name: `Gruppe ${code.toUpperCase()}`, inviteCode: code.toUpperCase(), members: 5, isOwner: false };
    this.groups = [...this.groups, g];
    return { ok: true, name: g.name };
  }
  async stats(): Promise<Stats> {
    const b = this.state.bets;
    const decided = b.filter((x) => ['won', 'lost', 'cashed_out'].includes(x.status));
    const won = decided.filter((x) => x.payout > x.stake);
    const wins = b.filter((x) => x.payout > x.stake).map((x) => x.payout - x.stake);
    return {
      betsTotal: b.length, betsOpen: b.filter((x) => x.status === 'open').length,
      hitRate: decided.length ? Math.round((won.length / decided.length) * 1000) / 10 : null,
      biggestWin: wins.length ? Math.max(...wins) : null,
      profitTotal: b.filter((x) => x.status !== 'open').reduce((s, x) => s + x.payout - x.stake, 0),
      favoriteLeague: 'Bundesliga',
    };
  }
}
