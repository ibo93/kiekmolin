import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend, slipStore, useApp, useSlip } from '../data/store';
import { builderOdds, coins, comboOdds, fmtCoins, fmtOdds, systemInfo } from '../data/odds';
import type { BetRequest } from '../data/types';
import { Coins, Crest, Icon } from './ui';

type Mode = 'single' | 'combo' | 'system';
// Kurzzeichen für Tipps ohne Mannschaft
const SYMBOL: Record<string, string> = { draw: 'X', over: 'Ü', under: 'U', yes: 'JA', no: 'NE' };
const FAMILY: Record<string, string> = { h2h: 'result', double_chance: 'result', draw_no_bet: 'result', spreads: 'result', totals: 'goals' };

export function SlipFab() {
  const n = useSlip((s) => s.items.length);
  if (!n) return null;
  return (
    <button onClick={() => slipStore.setOpen(true)} aria-label={`Wettschein öffnen, ${n} Tipps`}
      className="fixed z-30 grid h-[58px] w-[58px] place-items-center rounded-full bg-acc text-black shadow-neonlg transition active:scale-95"
      style={{ bottom: 'calc(100px + env(safe-area-inset-bottom))', right: 'max(18px, calc((100vw - 448px) / 2 + 18px))' }}>
      {Icon.slip()}
      <span className="font-num absolute -right-0.5 -top-0.5 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-black px-1 text-[12px] font-black text-acc">{n}</span>
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
      return { total: stake, odds, potential: coins(stake * odds), label: sameEvent ? 'Konfigurator' : `${items.length}er-Kombi` };
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
      <div className="absolute inset-0 bg-black/70" onClick={() => slipStore.setOpen(false)} />
      <section aria-label="Wettschein" className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90vh] max-w-md flex-col rounded-t-[32px] bg-card2 text-cink animate-sheetIn"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center pt-2.5"><div className="h-[5px] w-[42px] rounded-full bg-[#2A2E37]" /></div>
        <div className="flex items-center justify-between px-[18px] pt-2.5">
          <h2 className="font-wide text-[22px] font-black">WETTSCHEIN <span className="font-num text-cmute">{items.length || ''}</span></h2>
          <div className="flex items-center gap-1">
            {items.length > 0 && <button onClick={() => slipStore.clear()} className="h-11 px-3 text-[14px] font-medium text-cmute">Leeren</button>}
            <button onClick={() => slipStore.setOpen(false)} aria-label="Schließen" className="grid h-11 w-11 place-items-center rounded-full bg-chip">{Icon.close()}</button>
          </div>
        </div>

        {done ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-mint text-[#3DF29A]">{Icon.check('w-7 h-7')}</div>
            <p className="text-[17px] font-bold">{done}</p><p className="text-[14px] text-cmute">Viel Glück!</p>
          </div>
        ) : items.length === 0 ? (
          <p className="px-6 py-14 text-center text-cmute">Tippe auf eine Quote, um sie hinzuzufügen.</p>
        ) : (
          <>
            <div className="px-[18px] pt-3">
              <div className="grid grid-cols-3 gap-1 rounded-full bg-[#101217] p-[5px]">
                {(['single', 'combo', 'system'] as Mode[]).map((m) => {
                  const dis = (m === 'combo' && items.length < 2) || (m === 'system' && items.length < 3);
                  const label = m === 'single' ? 'Einzel' : m === 'combo' ? (sameEvent ? 'Konfigurator' : 'Kombi') : 'System';
                  return <button key={m} disabled={dis} onClick={() => setMode(m)} aria-pressed={mode === m}
                    className={`h-10 rounded-full text-[14px] font-semibold ${mode === m ? 'bg-acc text-black' : dis ? 'text-cmute/40' : 'text-cmute'}`}>{label}</button>;
                })}
              </div>
              {mode === 'system' && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {Array.from({ length: items.length - 2 }, (_, i) => i + 2).map((kk) => (
                    <button key={kk} onClick={() => setK(kk)} aria-pressed={k === kk}
                      className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold ${k === kk ? 'bg-acc text-black' : 'bg-chip text-ink'}`}>{kk} aus {items.length}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-[18px] py-3">
              {rows.map(({ it, o, m, e, current, changed, blocked }) => {
                const team = o?.name === 'home' ? e?.home : o?.name === 'away' ? e?.away : null;
                return (
                  <div key={it.outcomeId} className={`flex items-center gap-3 rounded-[22px] bg-card py-3 pl-3.5 pr-3 ${changed ? 'shadow-[inset_0_0_0_2px_#FFC857]' : ''}`}>
                    {team ? <Crest name={team} size={40} /> : <span className="font-num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card2 text-[13px] font-black">{SYMBOL[o?.name ?? ''] ?? (o?.name ?? '').slice(0, 2).toUpperCase()}</span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold">{o?.label}</div>
                      <div className="truncate text-[12px] text-cmute">{m?.name} · {e?.home} – {e?.away}</div>
                    </div>
                    {blocked ? <span className="flex shrink-0 items-center gap-1 text-[12px] text-cmute">{Icon.lock()} {blocked}</span> : (
                      <div className="shrink-0 text-right">
                        {changed && <div className="font-num text-[12px] text-[#7A8194] line-through">{fmtOdds(it.price)}</div>}
                        <div className={`font-num text-[18px] font-black ${changed ? (current > it.price ? 'text-[#3DF29A]' : 'text-[#FF5E6C]') : ''}`}>
                          {fmtOdds(current)}{changed ? (current > it.price ? ' ▲' : ' ▼') : ''}
                        </div>
                      </div>
                    )}
                    <button onClick={() => slipStore.remove(it.outcomeId)} aria-label="Tipp entfernen" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card2 text-cmute">{Icon.close('w-3.5 h-3.5')}</button>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 px-[18px] pb-6 pt-1">
              {changes.length > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-full bg-warn py-1.5 pl-4 pr-1.5">
                  <span className="text-[13px] font-semibold text-[#FFD98A]">{changes.length === 1 ? 'Eine Quote hat sich geändert' : `${changes.length} Quoten haben sich geändert`}</span>
                  <button onClick={() => slipStore.acceptPrices(changes)} className="h-10 shrink-0 rounded-full bg-acc px-4 text-[13px] font-bold text-black">Akzeptieren</button>
                </div>
              )}
              {(comboError || error) && <div className="rounded-[18px] bg-rose px-4 py-2.5 text-[13px] font-medium text-[#FFB3BC]">{comboError || error}</div>}

              <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-1.5">
                {[10, 50, 100].map((v) => (
                  <button key={v} onClick={() => setStake(v)} aria-pressed={stake === v}
                    className={`font-num h-[50px] rounded-full text-[16px] font-extrabold ${stake === v ? 'bg-acc text-black' : 'bg-chip text-ink'}`}>{v}</button>
                ))}
                <label className="flex h-[50px] items-center gap-1 rounded-full bg-chip px-4 focus-within:ring-2 focus-within:ring-acc">
                  <span className="text-[12px] text-cmute">Einsatz</span>
                  <input inputMode="numeric" value={stake || ''} onChange={(e) => setStake(Math.max(0, parseInt(e.target.value.replace(/\D/g, '')) || 0))}
                    className="font-num w-full bg-transparent text-right text-[16px] font-extrabold outline-none" aria-label="Einsatz in Coins" />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[26px] bg-black py-4 pl-5 pr-4 text-ink shadow-[inset_0_0_0_1px_rgba(0,255,136,.35)]">
                <div className="min-w-0">
                  <div className="text-[12px] text-mute">
                    {calc.label}{calc.odds !== null && <> · Quote <b className="font-num text-ink">{fmtOdds(calc.odds)}</b></>}
                  </div>
                  <div className="text-[12px] text-mute">Möglicher Gewinn</div>
                  <div className="font-num text-[32px] font-black leading-none text-acc [text-shadow:0_0_18px_rgba(0,255,136,.55)]"><Coins value={calc.potential} /> <span className="font-sans text-[13px] font-semibold text-mute">Coins</span></div>
                </div>
                {needLogin ? (
                  <button onClick={() => { slipStore.setOpen(false); nav('/profil'); }}
                    className="h-[54px] shrink-0 rounded-full bg-acc px-5 text-[14px] font-bold text-black">Anmelden</button>
                ) : (
                  <button disabled={!canPlace} onClick={place}
                    className={`h-[54px] shrink-0 rounded-full px-5 text-[14px] font-bold transition ${canPlace ? 'bg-acc text-black shadow-neon active:scale-95' : 'bg-s3 text-mute'}`}>
                    {busy ? 'Prüfe …' : changes.length ? 'Erst akzeptieren' : `Tippen · ${fmtCoins(calc.total)}`}
                  </button>
                )}
              </div>
              <p className="text-center text-[12px] text-cmute">
                {calc.total > balance ? <b className="text-[#FF5E6C]">Nicht genug Coins ({fmtCoins(balance)}). </b> : <>Guthaben {fmtCoins(balance)} · </>}
                {mode === 'single' && items.length > 1 ? `${stake} je Tipp · ` : ''}
                {sameEvent && mode === 'combo' ? '−10 % je weiterem Tipp · ' : ''}
                Kein Glücksspiel – nur Spielgeld
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
