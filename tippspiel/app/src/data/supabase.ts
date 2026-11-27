// Echter Betrieb: Daten aus Supabase, Live-Updates über Realtime.
// Gleiche Oberfläche wie der Demo-Betrieb – die Screens merken keinen Unterschied.
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { DemoBackend, type PushPrefs, type State } from './demo';
import type { Bet, BetRequest, Group, LeaderRow, League, Market, Outcome, PlaceResult, Sport, SportEvent, Stats } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const mapEvent = (r: Row): SportEvent => ({
  id: r.id, leagueKey: r.league_key, sportKey: r.sport_key, home: r.home_team, away: r.away_team,
  commence: new Date(r.commence_time).getTime(), status: r.status, homeScore: r.home_score, awayScore: r.away_score,
  minute: r.minute, isTop: r.is_top,
});
const mapMarket = (r: Row): Market => ({ id: r.id, eventId: r.event_id, key: r.key, line: r.line === null ? null : Number(r.line), name: r.name, status: r.status, sort: r.sort });
const mapOutcome = (r: Row): Outcome => ({
  id: r.id, marketId: r.market_id, eventId: r.event_id, name: r.name, label: r.label, price: Number(r.price),
  prevPrice: r.previous_price === null ? null : Number(r.previous_price),
  changedAt: r.price_changed_at ? new Date(r.price_changed_at).getTime() : null, status: r.status,
});
const mapBet = (r: Row): Bet => ({
  id: r.id, type: r.type, systemK: r.system_k, lines: r.lines, stake: Number(r.stake), totalOdds: Number(r.total_odds),
  potentialPayout: Number(r.potential_payout), status: r.status, payout: Number(r.payout),
  placedAt: new Date(r.placed_at).getTime(), settledAt: r.settled_at ? new Date(r.settled_at).getTime() : null,
  selections: (r.bet_selections ?? []).sort((a: Row, b: Row) => a.position - b.position).map((s: Row) => ({
    outcomeId: s.outcome_id, eventId: s.event_id, eventName: s.event_name, marketName: s.market_name,
    label: s.label, price: Number(s.price), boosted: s.boosted, status: s.status })),
});

/** PostgREST liefert höchstens 1000 Zeilen je Abfrage – deshalb seitenweise */
async function all(q: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: any }>) {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export class SupabaseBackend extends DemoBackend {
  sb: SupabaseClient;
  private channels: RealtimeChannel[] = [];
  requiresLogin = true;

  constructor(url: string, anonKey: string) {
    super();
    this.sb = createClient(url, anonKey);
    // Demo-Inhalte sofort verwerfen
    this.state = { ...this.state, demo: false, user: null, events: [], markets: [], outcomes: {}, boosts: [], bets: [],
      wallet: { balance: 0, lastDailyBonus: null, lastRefillAt: null } };
  }

  start() {
    this.loadPublic().catch((e) => this.fail('Spiele konnten nicht geladen werden', e));
    this.sb.auth.getSession().then(({ data }) => this.onUser(data.session?.user ?? null));
    this.sb.auth.onAuthStateChange((_e, session) => this.onUser(session?.user ?? null));
    this.subscribePublic();
  }
  stop() { this.channels.forEach((c) => this.sb.removeChannel(c)); this.channels = []; }

  /** Kein stiller leerer Bildschirm: Fehler sichtbar machen */
  private fail(text: string, e: unknown) { console.error(text, e); this.toast(text, 'err'); this.set({ loaded: true, error: text }); }

  // ───── Öffentliche Daten ─────
  private async loadPublic() {
    const horizon = new Date(Date.now() + 8 * 86400e3).toISOString();
    const [sp, lg, ev, bo] = await Promise.all([
      this.sb.from('sports').select('*').eq('active', true).order('sort'),
      this.sb.from('leagues').select('*').eq('active', true).order('odds_priority').order('sort'),
      all((f, t) => this.sb.from('events').select('*').in('status', ['scheduled', 'live']).lte('commence_time', horizon).order('commence_time').range(f, t)),
      this.sb.from('boosts').select('*, outcomes(label), events(home_team, away_team)').eq('valid_date', new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })),
    ]);
    if (sp.error || lg.error || bo.error) throw sp.error || lg.error || bo.error;
    const events = ev.map(mapEvent);
    const ids = events.map((e) => e.id);
    const markets: Market[] = [], outcomes: Record<string, Outcome> = {};
    for (let i = 0; i < ids.length; i += 150) {              // URL-Länge begrenzen
      const chunk = ids.slice(i, i + 150);
      const [ms, os] = await Promise.all([
        all((f, t) => this.sb.from('markets').select('*').in('event_id', chunk).neq('status', 'settled').range(f, t)),
        all((f, t) => this.sb.from('outcomes').select('*').in('event_id', chunk).range(f, t)),
      ]);
      ms.forEach((m) => markets.push(mapMarket(m)));
      os.forEach((o) => { outcomes[o.id] = mapOutcome(o); });
    }
    this.set({
      sports: (sp.data ?? []).map((s: Row): Sport => ({ key: s.key, title: s.title, icon: s.icon, sort: s.sort })),
      leagues: (lg.data ?? []).map((l: Row): League => ({ key: l.key, sportKey: l.sport_key, title: l.title, country: l.country ?? '', sort: l.odds_priority * 1000 + l.sort, hasDraw: l.has_draw })),
      events, markets, outcomes,
      boosts: (bo.data ?? []).map((b: Row) => ({ outcomeId: b.outcome_id, eventId: b.event_id, original: Number(b.original_price),
        boosted: Number(b.boosted_price), title: b.title })),
      loaded: true, error: null,
    });
  }

  private subscribePublic() {
    const ch = this.sb.channel('public-odds')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outcomes' }, (p) => {
        const r = p.new as Row; if (!r?.id) return;
        const prev = this.state.outcomes[r.id];
        if (!prev && !this.state.events.some((e) => e.id === r.event_id)) return;
        this.set({ outcomes: { ...this.state.outcomes, [r.id]: { ...mapOutcome(r), prevPrice: prev?.price ?? null } } });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, (p) => {
        const r = p.new as Row; if (!r?.id) return;
        const m = mapMarket(r), i = this.state.markets.findIndex((x) => x.id === m.id);
        if (i < 0 && !this.state.events.some((e) => e.id === m.eventId)) return;
        this.set({ markets: i < 0 ? [...this.state.markets, m] : this.state.markets.map((x) => (x.id === m.id ? m : x)) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (p) => {
        const r = p.new as Row; if (!r?.id) return;
        const e = mapEvent(r), exists = this.state.events.some((x) => x.id === e.id);
        const keep = e.status === 'scheduled' || e.status === 'live';
        this.set({ events: !keep ? this.state.events.filter((x) => x.id !== e.id)
          : exists ? this.state.events.map((x) => (x.id === e.id ? e : x)) : [...this.state.events, e] });
      })
      .subscribe();
    this.channels.push(ch);
  }

  // ───── Nutzer ─────
  private async onUser(u: { id: string; email?: string } | null) {
    if (!u) { this.set({ user: null, bets: [], wallet: { balance: 0, lastDailyBonus: null, lastRefillAt: null } }); return; }
    const { data: prof } = await this.sb.from('profiles').select('username, push_prefs').eq('id', u.id).maybeSingle();
    const hasDevice = (await this.sb.from('push_subscriptions').select('id', { count: 'exact', head: true })).count ?? 0;
    const pp = (prof?.push_prefs ?? {}) as PushPrefs;
    this.set({ user: { email: u.email ?? '', username: prof?.username ?? 'Spieler' },
      // Ohne angemeldetes Gerät kommt nichts an – dann auch nicht "an" anzeigen
      pushPrefs: hasDevice ? { bet_won: !!pp.bet_won, event_start: !!pp.event_start, boost: !!pp.boost } : { bet_won: false, event_start: false, boost: false } });
    await Promise.all([this.loadWallet(), this.loadBets()]);
    await this.claimDailyBonus(true);
    const ch = this.sb.channel('mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${u.id}` }, () => this.loadWallet())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets', filter: `user_id=eq.${u.id}` }, () => this.loadBets())
      .subscribe();
    this.channels.push(ch);
  }
  private async loadWallet() {
    const { data, error } = await this.sb.from('wallets').select('*').maybeSingle();
    if (error) return this.fail('Guthaben nicht lesbar', error);
    if (data) this.set({ wallet: { balance: Number(data.balance), lastDailyBonus: data.last_daily_bonus,
      lastRefillAt: data.last_refill_at ? new Date(data.last_refill_at).getTime() : null } });
  }
  private async loadBets() {
    const { data, error } = await this.sb.from('bets').select('*, bet_selections(*)').order('placed_at', { ascending: false }).limit(200);
    if (error) return this.fail('Wetten nicht lesbar', error);
    this.set({ bets: (data ?? []).map(mapBet) });
  }

  async signInMagic(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    this.toast(error ? `Fehler: ${error.message}` : `Link an ${email} gesendet – bitte Postfach öffnen`, error ? 'err' : 'ok');
  }
  async signInGoogle() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
    if (error) this.toast(`Google-Login: ${error.message}`, 'err');
  }
  async signOut() { await this.sb.auth.signOut(); this.toast('Abgemeldet'); }

  // ───── Coins (serverseitig) ─────
  async claimDailyBonus(silent = false) {
    if (!this.state.user) return;
    const { data, error } = await this.sb.rpc('claim_daily_bonus');
    if (error) return this.fail('Tagesbonus fehlgeschlagen', error);
    if (data?.granted) { this.toast(`+${data.amount} Coins Tagesbonus 🎁`, 'ok'); this.loadWallet(); }
    else if (!silent) this.toast('Tagesbonus heute schon abgeholt');
  }
  async claimRefill() {
    const { data, error } = await this.sb.rpc('claim_refill');
    if (error) return this.fail('Nachfüllen fehlgeschlagen', error);
    if (data?.granted) { this.toast('Auf 500 Coins aufgefüllt', 'ok'); this.loadWallet(); }
    else this.toast(data?.reason === 'TOO_SOON' ? 'Nachfüllen nur 1× pro Woche' : 'Nachfüllen geht erst bei 0 Coins', 'err');
  }

  // ───── Wetten (Edge Functions) ─────
  async placeBets(reqs: BetRequest[]): Promise<PlaceResult> {
    if (!this.state.user) return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte im Profil anmelden.' };
    const body = { bets: reqs.map((r) => ({ type: r.type, system_k: r.systemK ?? null, stake: r.stake,
      selections: r.selections.map((s) => ({ outcome_id: s.outcomeId, price: s.price })) })) };
    const { data, error } = await this.sb.functions.invoke('place-bet', { body });
    if (error) return { ok: false, code: 'SERVER', message: 'Server nicht erreichbar – bitte nochmal.' };
    if (data.ok) { this.loadWallet(); this.loadBets(); return { ok: true, balance: data.balance }; }
    if (data.code === 'ODDS_CHANGED') return { ok: false, code: 'ODDS_CHANGED',
      changes: data.changes.map((c: Row) => ({ outcomeId: c.outcome_id, newPrice: Number(c.new_price) })) };
    return { ok: false, code: data.code, message: data.message ?? data.code };
  }
  async cashout(betId: string, expected: number) {
    const { data, error } = await this.sb.functions.invoke('cashout', { body: { bet_id: betId, expected } });
    if (error) return { ok: false as const, message: 'Server nicht erreichbar' };
    if (data.ok) { this.loadWallet(); this.loadBets(); return { ok: true as const, payout: Number(data.payout) }; }
    return { ok: false as const, message: data.code === 'CASHOUT_CHANGED' ? `Wert gesunken auf ${data.value} Coins` : 'Cash-Out gerade nicht möglich' };
  }

  // ───── Push ─────
  async setPushPrefs(prefs: PushPrefs) {
    const { data: me } = await this.sb.auth.getUser();
    if (!me.user) return this.toast('Bitte erst anmelden', 'err');
    if (Object.values(prefs).some(Boolean)) {
      const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapid || !('serviceWorker' in navigator) || !('PushManager' in window))
        return this.toast('Benachrichtigungen werden auf diesem Gerät nicht unterstützt', 'err');
      if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted')
        return this.toast('Benachrichtigungen im Browser nicht erlaubt', 'err');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: urlB64(vapid) as BufferSource });
      const j = sub.toJSON();
      const { error } = await this.sb.from('push_subscriptions').upsert(
        { user_id: me.user.id, endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: 'endpoint' });
      if (error) return this.fail('Gerät nicht angemeldet', error);
    }
    const { error } = await this.sb.from('profiles').update({ push_prefs: prefs }).eq('id', me.user.id);
    if (error) return this.fail('Einstellung nicht gespeichert', error);
    this.set({ pushPrefs: prefs });
  }

  // ───── Rangliste, Gruppen, Statistik ─────
  async leaderboard(period: 'week' | 'month' | 'all', groupId?: string): Promise<LeaderRow[]> {
    const { data, error } = await this.sb.rpc('leaderboard', { p_period: period, p_group: groupId ?? null, p_limit: 100 });
    if (error) { this.fail('Rangliste nicht ladbar', error); return []; }
    return (data ?? []).map((r: Row) => ({ rank: Number(r.rank), username: r.username, profit: Number(r.profit),
      settled: Number(r.bets_settled), won: Number(r.bets_won), isMe: r.is_me }));
  }
  async listGroups(): Promise<Group[]> {
    if (!this.state.user) return [];
    const { data, error } = await this.sb.from('groups').select('id, name, invite_code, owner_id, group_members(count)');
    if (error) { this.fail('Gruppen nicht ladbar', error); return []; }
    const { data: me } = await this.sb.auth.getUser();
    return (data ?? []).map((g: Row) => ({ id: g.id, name: g.name, inviteCode: g.invite_code,
      members: g.group_members?.[0]?.count ?? 0, isOwner: g.owner_id === me.user?.id }));
  }
  async createGroup(name: string): Promise<Group> {
    const { data, error } = await this.sb.rpc('create_group', { p_name: name });
    if (error) { this.fail('Gruppe nicht angelegt: ' + error.message, error); throw error; }
    return { id: data.id, name, inviteCode: data.invite_code, members: 1, isOwner: true };
  }
  async joinGroup(code: string) {
    const { data, error } = await this.sb.rpc('join_group', { p_code: code });
    if (error) return { ok: false, name: '' };
    return { ok: !!data?.ok, name: data?.name ?? 'Gruppe nicht gefunden' };
  }
  async stats(): Promise<Stats> {
    const { data } = await this.sb.rpc('my_stats');
    const d = (data ?? {}) as Row;
    return { betsTotal: d.bets_total ?? 0, betsOpen: d.bets_open ?? 0, hitRate: d.hit_rate === null || d.hit_rate === undefined ? null : Number(d.hit_rate),
      biggestWin: d.biggest_win ?? null, profitTotal: Number(d.profit_total ?? 0), favoriteLeague: d.favorite_league ?? null };
  }
}

function urlB64(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type { State };
