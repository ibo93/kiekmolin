import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend, slipStore, useApp, useSlip } from '../data/store';
import { builderOdds, coins, comboOdds, fmtCoins, fmtOdds, systemInfo } from '../data/odds';
import type { BetRequest } from '../data/types';
import { Coins, Icon } from './ui';

type Mode = 'single' | 'combo' | 'system';
const FAMILY: Record<string, string> = { h2h: 'result', double_chance: 'result', draw_no_bet: 'result', spreads: 'result', totals: 'goals' };

export function SlipFab() {
  const n = useSlip((s) => s.items.length);
  if (!n) return null;
  return (
    <button onClick={() => slipStore.setOpen(true)}
      className="fixed right-4 z-30 flex items-center gap-2 rounded-full bg-acc pl-4 pr-3 py-3 font-bold text-white shadow-[0_8px_30px_rgba(124,108,255,.45)] active:scale-95 transition"
      style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }} aria-label="Wettschein öffnen">
      Wettschein
      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-[13px] text-acc">{n}</span>
    </button>
  );
}

export function SlipSheet() {
  const open = useSlip((s) => s.open);
  const items = useSlip((s) => s.items);
  const st = useApp((s) => s);
  const [mode, setMode] = useState<Mode>('single');
  const [stake, setStake] = useState(10);
  const [k, setK] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const nav = useNavigate();
  const needLogin = backend.requiresLogin && !st.user;

  // Modus an Anzahl Tipps anpassen
  useEffect(() => {
    if (items.length < 2 && mode !== 'single') setMode('single');
    if (items.length < 3 && mode === 'system') setMode('combo');
    if (k >= items.length) setK(Math.max(2, items.length - 1));
  }, [items.length]);
  useEffect(() => { setError(null); }, [items, mode, stake, k]);

  const rows = items.map((it) => {
    const o = st.outcomes[it.outcomeId];
    const m = st.markets.find((x) => x.id === o?.marketId);
    const e = st.events.find((x) => x.id === it.eventId);
    const current = backend.effectivePrice(it.outcomeId) ?? it.price;
    const blocked = backend.blockReason(it.outcomeId);
    return { it, o, m, e, current, changed: !blocked && current !== it.price, blocked };
  });
  const changes = rows.filter((r) => r.changed).map((r) => ({ outcomeId: r.it.outcomeId, newPrice: r.current, up: r.current > r.it.price }));
  const prices = items.map((i) => i.price);
  const events = new Set(items.map((i) => i.eventId));
  const sameEvent = items.length >= 2 && events.size === 1;
  const mixedDup = items.length >= 2 && events.size !== items.length && !sameEvent;
  const familyConflict = sameEvent && new Set(rows.map((r) => FAMILY[r.m?.key ?? ''] ?? r.m?.key)).size !== rows.length;

  const calc = useMemo(() => {
    if (mode === 'single') return { total: stake * items.length, odds: null as number | null, potential: prices.reduce((s, p) => s + coins(stake * p), 0), label: `${items.length}× Einzelwette` };
    if (mode === 'combo') {
      const odds = sameEvent ? builderOdds(prices) : comboOdds(prices);
      return { total: stake, odds, potential: coins(stake * odds), label: sameEvent ? 'Wetten-Konfigurator' : `${items.length}er-Kombi` };
    }
    const si = systemInfo(prices, k);
    return { total: stake, odds: null, potential: coins((stake / si.lines) * si.sumOdds), label: `System ${k} aus ${items.length} · ${si.lines} Reihen`, lines: si.lines };
  }, [mode, stake, k, items]);

  const comboError = mode !== 'single' && (mixedDup ? 'Zwei Tipps aus demselben Spiel gehen nur, wenn ALLE aus einem Spiel sind (Konfigurator).'
    : mode === 'combo' && familyConflict ? 'Diese Märkte sagen dasselbe vorher (z. B. Sieg + Doppelte Chance) – bitte nur einen davon.'
    : mode === 'system' && sameEvent ? 'Systemwetten nur über verschiedene Spiele.' : null);
  const anyBlocked = rows.some((r) => r.blocked);
  const balance = st.wallet.balance;
  const canPlace = items.length > 0 && !changes.length && !anyBlocked && !comboError && stake >= 1 && calc.total <= balance && !busy;

  async function place() {
    setBusy(true); setError(null);
    const reqs: BetRequest[] = mode === 'single'
      ? items.map((i) => ({ type: 'single', stake, selections: [i] }))
      : [{ type: mode === 'combo' ? (sameEvent ? 'builder' : 'combo') : 'system', systemK: mode === 'system' ? k : undefined, stake, selections: items }];
    const r = await backend.placeBets(reqs);
    setBusy(false);
    if (r.ok) {
      setDone(`${calc.label} platziert`);
      slipStore.clear();
      setTimeout(() => { setDone(null); slipStore.setOpen(false); }, 1600);
    } else if (r.code === 'ODDS_CHANGED') {
      setError('Quoten haben sich gerade geändert – bitte prüfen und akzeptieren.');
    } else setError('message' in r ? r.message : r.code);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/60" onClick={() => slipStore.setOpen(false)} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md max-h-[88vh] flex flex-col rounded-t-3xl bg-s1 animate-sheetIn"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center pt-2"><div className="h-1 w-10 rounded-full bg-line" /></div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <h2 className="text-lg font-bold">Wettschein <span className="text-mute font-semibold">({items.length})</span></h2>
          <div className="flex items-center gap-3">
            {items.length > 0 && <button onClick={() => slipStore.clear()} className="text-[13px] text-mute">Leeren</button>}
            <button onClick={() => slipStore.setOpen(false)} className="text-2xl leading-none text-mute" aria-label="Schließen">×</button>
          </div>
        </div>

        {done ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-up/15 text-3xl text-up">✓</div>
            <p className="font-bold">{done}</p><p className="text-mute text-sm">Viel Glück!</p>
          </div>
        ) : items.length === 0 ? (
          <p className="px-6 py-12 text-center text-mute">Tippe auf eine Quote, um sie hinzuzufügen.</p>
        ) : (
          <>
            <div className="px-4">
              <div className="flex rounded-xl bg-bg p-1">
                {(['single', 'combo', 'system'] as Mode[]).map((m) => {
                  const dis = (m === 'combo' && items.length < 2) || (m === 'system' && items.length < 3);
                  const label = m === 'single' ? 'Einzel' : m === 'combo' ? (sameEvent ? 'Konfigurator' : 'Kombi') : 'System';
                  return <button key={m} disabled={dis} onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${mode === m ? 'bg-s3 text-ink' : dis ? 'text-mute/40' : 'text-mute'}`}>{label}</button>;
                })}
              </div>
              {mode === 'system' && (
                <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
                  {Array.from({ length: items.length - 2 }, (_, i) => i + 2).map((kk) => (
                    <button key={kk} onClick={() => setK(kk)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold ${k === kk ? 'bg-acc text-white' : 'bg-s2 text-mute'}`}>{kk} aus {items.length}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {rows.map(({ it, o, m, e, current, changed, blocked }) => (
                <div key={it.outcomeId} className={`rounded-xl bg-s2 p-3 ${changed ? 'ring-1 ring-amber-400/60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[14px] truncate">{o?.label}</div>
                      <div className="text-[12px] text-mute truncate">{m?.name}</div>
                      <div className="text-[12px] text-mute truncate">{e?.home} – {e?.away}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {blocked ? <span className="flex items-center gap-1 text-mute text-[12px]">{Icon.lock()} {blocked}</span> : (
                        <div className="text-right">
                          {changed && <div className="text-[11px] text-mute line-through tabular-nums">{fmtOdds(it.price)}</div>}
                          <div className={`font-bold tabular-nums ${changed ? (current > it.price ? 'text-up' : 'text-down') : ''}`}>{fmtOdds(current)}</div>
                        </div>
                      )}
                      <button onClick={() => slipStore.remove(it.outcomeId)} className="text-mute text-xl leading-none px-1" aria-label="Entfernen">×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line px-4 pt-3 pb-4 space-y-3">
              {changes.length > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-400/10 px-3 py-2 text-[13px] text-amber-300">
                  <span>{changes.length === 1 ? 'Eine Quote hat sich geändert.' : `${changes.length} Quoten haben sich geändert.`}</span>
                  <button onClick={() => slipStore.acceptPrices(changes)} className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-bg">Quoten akzeptieren</button>
                </div>
              )}
              {(comboError || error) && <div className="rounded-xl bg-down/10 px-3 py-2 text-[13px] text-down">{comboError || error}</div>}

              <div className="flex items-center gap-2">
                {[10, 50, 100].map((v) => (
                  <button key={v} onClick={() => setStake(v)}
                    className={`flex-1 rounded-xl py-2.5 text-[14px] font-bold ${stake === v ? 'bg-acc-lo text-acc-hi ring-1 ring-acc' : 'bg-s2'}`}>{v}</button>
                ))}
                <label className="flex flex-[1.4] items-center gap-1 rounded-xl bg-s2 px-3 py-2.5 focus-within:ring-1 focus-within:ring-acc">
                  {Icon.coin('w-4 h-4 shrink-0')}
                  <input inputMode="numeric" value={stake || ''} onChange={(e) => setStake(Math.max(0, parseInt(e.target.value.replace(/\D/g, '')) || 0))}
                    className="w-full bg-transparent text-right font-bold outline-none tabular-nums" aria-label="Einsatz" />
                </label>
              </div>

              <div className="flex items-end justify-between text-[13px]">
                <div className="text-mute space-y-0.5">
                  <div>{calc.label}{mode === 'single' && items.length > 1 ? ` · ${stake} je Tipp` : ''}</div>
                  {calc.odds !== null && <div>Gesamtquote <b className="text-ink tabular-nums">{fmtOdds(calc.odds)}</b>{sameEvent && mode === 'combo' && <span> (inkl. −10 % je weiterem Tipp)</span>}</div>}
                  <div>Einsatz <b className="text-ink tabular-nums">{fmtCoins(calc.total)}</b> · Guthaben <span className="tabular-nums">{fmtCoins(balance)}</span></div>
                </div>
                <div className="text-right">
                  <div className="text-mute">Möglicher Gewinn</div>
                  <Coins value={calc.potential} className="text-xl font-extrabold text-up" />
                </div>
              </div>
              {calc.total > balance && <div className="text-[12px] text-down">Nicht genug Coins.</div>}

              {needLogin ? (
                <button onClick={() => { slipStore.setOpen(false); nav('/profil'); }}
                  className="w-full rounded-2xl bg-acc py-3.5 text-[15px] font-extrabold text-white">Anmelden zum Tippen</button>
              ) : <button disabled={!canPlace} onClick={place}
                className={`w-full rounded-2xl py-3.5 text-[15px] font-extrabold transition ${canPlace ? 'bg-acc text-white active:scale-[.99]' : 'bg-s3 text-mute'}`}>
                {busy ? 'Wird geprüft …' : changes.length ? 'Erst Quoten akzeptieren' : `Tipp abgeben · ${fmtCoins(calc.total)} Coins`}
              </button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
