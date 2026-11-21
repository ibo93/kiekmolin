// sync – holt echte Spiele, Quoten und Ergebnisse von The Odds API.
// Läuft per pg_cron alle 5 Minuten (siehe supabase/cron.sql).
//
// Ablauf je Lauf:
//  1. Einmal am Tag: Liste aller aktiven Ligen (kostet laut Doku 0 Credits)
//  2. Quoten: die fälligen Ligen (nach Priorität, Kontingent eingeteilt)
//  3. Ergebnisse: nur Ligen mit laufenden/gerade beendeten Spielen
//  4. Live-Quoten für Fußball ohne API-Kosten: aus echter Startquote +
//     echtem Spielstand + Restzeit neu gerechnet (Modell)
//  5. Boosts des Tages, Demo-Spiele entfernen
//
// Antwortet IMMER mit 200 und einer Zusammenfassung; Fehler stehen in
// api_usage und im Funktions-Log – nicht als stiller leerer Spielplan.
import { admin, json } from '../_shared/supa.ts';
import { buildMarkets, mapSport, parseScore, PRIORITY, syncIntervalMinutes,
         type ApiEvent, type ApiScore, type ApiSport } from '../_shared/oddsapi.ts';
import { estimateMinute, soccerMarkets } from '../_shared/model.ts';

const BASE = 'https://api.the-odds-api.com/v4';
const MARKETS = 'h2h,totals,spreads';
const CREDITS_PER_ODDS_CALL = 3;          // Märkte × Regionen (1 Region: eu)
const sb = admin();

type Usage = { endpoint: string; status: number; cost: number | null; remaining: number | null; used: number | null; items?: number; note?: string };
async function logUsage(u: Usage) { await sb.from('api_usage').insert(u); }

async function api<T>(endpoint: string, params: Record<string, string>): Promise<{ data: T; remaining: number | null }> {
  const key = Deno.env.get('ODDS_API_KEY')!;
  const url = `${BASE}${endpoint}?${new URLSearchParams({ ...params, apiKey: key })}`;
  const res = await fetch(url);
  const num = (h: string) => { const v = res.headers.get(h); return v === null ? null : Number(v); };
  const u: Usage = { endpoint, status: res.status, cost: num('x-requests-last'), remaining: num('x-requests-remaining'), used: num('x-requests-used') };
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    await logUsage({ ...u, note: text });
    throw new Error(`${endpoint} → ${res.status}: ${text}`);
  }
  const data = await res.json() as T;
  await logUsage({ ...u, items: Array.isArray(data) ? data.length : undefined });
  return { data, remaining: u.remaining };
}

async function cfg(key: string, fallback: number) {
  const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle();
  return data ? Number(data.value) : fallback;
}

// ───── 1. Ligen ─────
async function refreshLeagues(report: string[]) {
  const { data: last } = await sb.from('api_usage').select('at').eq('endpoint', '/sports').eq('status', 200)
    .order('at', { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.at).getTime() < 24 * 3600e3) return;

  const { data: sports } = await api<ApiSport[]>('/sports', {});
  const sportRows = new Map<string, { key: string; title: string; icon: string; sort: number }>();
  const leagueRows: Record<string, unknown>[] = [];
  for (const s of sports) {
    const sp = mapSport(s.group);
    if (!sp || s.has_outrights) continue;              // Langzeitwetten (Meister o. ä.) nicht
    sportRows.set(sp.key, sp);
    leagueRows.push({ key: s.key, sport_key: sp.key, title: s.title, country: s.description || null,
      active: s.active, has_draw: sp.key === 'soccer', odds_priority: PRIORITY[s.key] ?? 100, source: 'api' });
  }
  await sb.from('sports').upsert([...sportRows.values()], { onConflict: 'key' });
  const { error } = await sb.from('leagues').upsert(leagueRows, { onConflict: 'key' });
  if (error) throw new Error('leagues upsert: ' + error.message);
  report.push(`Ligen: ${leagueRows.length} (aktiv ${leagueRows.filter((l) => l.active).length})`);
}

// ───── 2. Quoten ─────
async function syncOdds(report: string[]) {
  const { data: lastU } = await sb.from('api_usage').select('remaining').not('remaining', 'is', null)
    .order('at', { ascending: false }).limit(1).maybeSingle();
  let remaining = lastU?.remaining ?? await cfg('credits_fallback', 500);

  const { data: leagues } = await sb.from('leagues').select('key, sport_key, last_odds_sync')
    .eq('active', true).order('odds_priority').order('sort').limit(await cfg('odds_max_leagues', 12));
  if (!leagues?.length) { report.push('Quoten: keine aktiven Ligen'); return; }

  const { data: liveRows } = await sb.from('events').select('league_key').eq('status', 'live');
  const live = new Set((liveRows ?? []).map((r) => r.league_key));
  const interval = syncIntervalMinutes(remaining, leagues.length, CREDITS_PER_ODDS_CALL);
  const age = (t: string | null) => (t ? (Date.now() - new Date(t).getTime()) / 60000 : Infinity);
  const due = leagues
    .filter((l) => age(l.last_odds_sync) >= (live.has(l.key) && remaining > 150 ? Math.min(interval, 15) : interval))
    .sort((a, b) => Number(live.has(b.key)) - Number(live.has(a.key)))
    .slice(0, await cfg('odds_calls_per_run', 4));
  report.push(`Kontingent: ${remaining} · Abstand je Liga: ${Number.isFinite(interval) ? interval + ' min' : 'aus (Kontingent leer)'} · fällig: ${due.length}`);

  for (const l of due) {
    try {
      const { data, remaining: rem } = await api<ApiEvent[]>(`/sports/${l.key}/odds`,
        { regions: 'eu', markets: MARKETS, oddsFormat: 'decimal', dateFormat: 'iso' });
      if (rem !== null) remaining = rem;
      let n = 0;
      for (const ev of data) {
        if (new Date(ev.commence_time).getTime() > Date.now() + 8 * 86400e3) continue;
        const b = buildMarkets(ev, l.sport_key);
        if (!b.markets.length) continue;
        const { error } = await sb.rpc('upsert_event_markets', {
          p_event: { id: ev.id, league_key: l.key, sport_key: l.sport_key, home_team: ev.home_team, away_team: ev.away_team,
                     commence_time: ev.commence_time, bookmakers: b.bookmakers, lambda_home: b.lambdas?.lh ?? null,
                     lambda_away: b.lambdas?.la ?? null, odds_source: 'api' },
          p_markets: b.markets,
        });
        if (error) console.error('upsert', ev.id, error.message); else n++;
      }
      await sb.from('leagues').update({ last_odds_sync: new Date().toISOString() }).eq('key', l.key);
      report.push(`  ${l.key}: ${n} Spiele`);
    } catch (e) {
      report.push(`  ${l.key}: FEHLER ${(e as Error).message}`);
      if (String(e).includes('401') || String(e).includes('429')) break;   // Schlüssel/Kontingent – nicht weiter verbrennen
    }
  }
}

// ───── 3. Ergebnisse ─────
async function syncScores(report: string[]) {
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: running } = await sb.from('events').select('league_key')
    .in('status', ['scheduled', 'live']).lte('commence_time', new Date().toISOString()).gte('commence_time', since);
  const keys = [...new Set((running ?? []).map((r) => r.league_key))];
  if (!keys.length) return;
  const every = await cfg('scores_interval_min', 10);
  const { data: leagues } = await sb.from('leagues').select('key, sport_key, last_scores_sync').in('key', keys);

  for (const l of leagues ?? []) {
    if (l.last_scores_sync && Date.now() - new Date(l.last_scores_sync).getTime() < every * 60000) continue;
    try {
      const { data } = await api<ApiScore[]>(`/sports/${l.key}/scores`, { daysFrom: '1', dateFormat: 'iso' });
      let changed = 0, done = 0;
      for (const s of data) {
        const sc = parseScore(s);
        if (!sc && !s.completed) continue;
        const min = l.sport_key === 'soccer' ? estimateMinute(new Date(s.commence_time).getTime(), Date.now()).label : 'Live';
        const { data: ch, error } = await sb.rpc('apply_score', {
          p_event: s.id, p_home: sc?.home ?? null, p_away: sc?.away ?? null, p_completed: s.completed && !!sc, p_minute: min });
        if (error) console.error('apply_score', s.id, error.message);
        if (ch) changed++;
        if (s.completed) done++;
      }
      await sb.from('leagues').update({ last_scores_sync: new Date().toISOString() }).eq('key', l.key);
      report.push(`Ergebnisse ${l.key}: ${changed} Tore/Änderungen, ${done} beendet`);
    } catch (e) {
      report.push(`Ergebnisse ${l.key}: FEHLER ${(e as Error).message}`);
    }
  }
}

// ───── 4. Live-Quoten aus dem Modell (Fußball, ohne Credits) ─────
async function modelLive(report: string[]) {
  const { data: evs } = await sb.from('events')
    .select('id, league_key, sport_key, home_team, away_team, commence_time, home_score, away_score, lambda_home, lambda_away, last_odds_update, last_score_update, odds_source')
    .eq('status', 'live').eq('sport_key', 'soccer');
  const maxScoreAge = (await cfg('scores_interval_min', 10) + 3) * 60000;
  let n = 0, locked = 0;
  for (const e of evs ?? []) {
    const est = estimateMinute(new Date(e.commence_time).getTime(), Date.now());
    const fresh = e.last_score_update && Date.now() - new Date(e.last_score_update).getTime() < maxScoreAge;
    // Ohne aktuellen Spielstand keine Live-Quoten: sonst könnte jemand auf ein
    // Tor wetten, das schon gefallen ist, aber noch nicht bei uns angekommen.
    if (!fresh || e.lambda_home === null || e.lambda_away === null || est.phase === 'ht') {
      await sb.from('markets').update({ status: 'suspended' }).eq('event_id', e.id).eq('status', 'open');
      await sb.from('events').update({ minute: est.label }).eq('id', e.id);
      locked++; continue;
    }
    // Gerade frische Buchmacher-Quoten? Dann die nehmen, nicht überschreiben.
    if (e.odds_source === 'api' && e.last_odds_update && Date.now() - new Date(e.last_odds_update).getTime() < 3 * 60000) continue;
    const rows = soccerMarkets(e.home_team, e.away_team, Number(e.lambda_home), Number(e.lambda_away),
      { minute: est.minute, h: e.home_score ?? 0, a: e.away_score ?? 0 });
    const { error } = await sb.rpc('upsert_event_markets', {
      p_event: { id: e.id, league_key: e.league_key, sport_key: e.sport_key, home_team: e.home_team, away_team: e.away_team,
                 commence_time: e.commence_time, odds_source: 'model' },
      p_markets: rows,
    });
    if (error) console.error('model', e.id, error.message); else n++;
    await sb.from('events').update({ minute: est.label }).eq('id', e.id);
  }
  if (n || locked) report.push(`Live-Modell: ${n} neu gerechnet, ${locked} gesperrt (kein frischer Spielstand / Pause)`);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ ok: false }, 401);
  const report: string[] = [];
  if (!Deno.env.get('ODDS_API_KEY')) {
    await logUsage({ endpoint: '-', status: 0, cost: null, remaining: null, used: null, note: 'ODDS_API_KEY fehlt' });
    return json({ ok: false, report: ['ODDS_API_KEY fehlt – keine echten Spiele'] });
  }
  for (const [name, step] of [['Ligen', refreshLeagues], ['Quoten', syncOdds], ['Ergebnisse', syncScores], ['Live', modelLive]] as const) {
    try { await step(report); } catch (e) { report.push(`${name}: FEHLER ${(e as Error).message}`); }
  }
  const { data: boosts } = await sb.rpc('create_daily_boosts', { p_count: 3 });
  const { data: removed } = await sb.rpc('remove_demo_events');
  if (boosts) report.push(`Boosts: ${boosts}`);
  if (removed) report.push(`Demo-Spiele entfernt: ${removed}`);
  console.log(report.join('\n'));
  return json({ ok: !report.some((r) => r.includes('FEHLER')), report });
});
