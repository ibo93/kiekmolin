import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { backend, slipStore, useApp, useSlip } from '../data/store';
import { fmtOdds } from '../data/odds';
import type { Outcome, SportEvent } from '../data/types';

// ───── Icons (eigene, schlicht) ─────
export const Icon = {
  lock: (c = 'w-3.5 h-3.5') => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"/></svg>),
  boost: (c = 'w-3.5 h-3.5') => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>),
  star: (on: boolean, c = 'w-4 h-4') => (
    <svg viewBox="0 0 24 24" className={c} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>),
  chevron: (open: boolean) => (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>),
  coin: (c = 'w-4 h-4') => (
    <svg viewBox="0 0 24 24" className={c}><circle cx="12" cy="12" r="10" fill="#7c6cff"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#d9d4ff" strokeWidth="1.6"/><path d="M12 8.5v7M9.8 10.5h4.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/></svg>),
};

export function Coins({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>{Icon.coin('w-3.5 h-3.5')}{new Intl.NumberFormat('de-DE').format(value)}</span>;
}

// ───── Skeleton statt Spinner ─────
export function Skel({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-s2 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}
export function EventSkeleton() {
  return (
    <div className="rounded-2xl bg-s1 p-3 space-y-3">
      <Skel className="h-3 w-32" />
      <div className="flex justify-between"><Skel className="h-4 w-40" /><Skel className="h-4 w-10" /></div>
      <div className="grid grid-cols-3 gap-2"><Skel className="h-12" /><Skel className="h-12" /><Skel className="h-12" /></div>
    </div>
  );
}

// ───── Quoten-Button ─────
// ausgewählt = gefüllt, Änderung = kurz grün/rot, gesperrt = Schloss
export function OddsButton({ o, top, compact }: { o: Outcome | undefined; top?: string; compact?: boolean }) {
  const boosts = useApp((s) => s.boosts);
  const market = useApp((s) => (o ? s.markets.find((m) => m.id === o.marketId) : undefined));
  const selected = useSlip((s) => !!o && s.items.some((i) => i.outcomeId === o.id));
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  const last = useRef(o?.price);

  useEffect(() => {
    if (!o) return;
    if (last.current !== undefined && o.price !== last.current) {
      setFlash(o.price > last.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(''), 1400);
      last.current = o.price;
      return () => clearTimeout(t);
    }
    last.current = o.price;
  }, [o?.price]);

  if (!o) return <div className="h-12 rounded-xl bg-s2/50" />;
  const boost = boosts.find((b) => b.outcomeId === o.id);
  const price = boost ? boost.boosted : o.price;
  const locked = o.status !== 'open' || market?.status !== 'open';

  return (
    <button
      disabled={locked}
      onClick={() => slipStore.toggle({ outcomeId: o.id, eventId: o.eventId, price })}
      aria-pressed={selected}
      className={[
        'relative flex flex-col items-center justify-center rounded-xl font-semibold transition-colors select-none',
        compact ? 'h-11 px-2' : 'h-12 px-2',
        locked ? 'bg-s2/60 text-mute cursor-not-allowed'
          : selected ? 'bg-acc text-white shadow-[0_0_0_1px_#9b8fff_inset]'
          : 'bg-s2 text-ink hover:bg-s3 active:scale-[.97]',
        flash === 'up' && !selected && !locked ? 'animate-flashUp' : '',
        flash === 'down' && !selected && !locked ? 'animate-flashDown' : '',
      ].join(' ')}
    >
      {top && <span className={`text-[10px] font-medium leading-none mb-1 truncate max-w-full ${selected ? 'text-white/80' : 'text-mute'}`}>{top}</span>}
      {locked ? Icon.lock('w-4 h-4') : (
        <span className="flex items-center gap-1 text-[15px] tabular-nums leading-none">
          {boost && <span className={selected ? 'text-white' : 'text-boost'}>{Icon.boost('w-3 h-3')}</span>}
          {boost && <span className={`text-[11px] line-through font-normal ${selected ? 'text-white/60' : 'text-mute'}`}>{fmtOdds(boost.original)}</span>}
          {fmtOdds(price)}
          {flash && <span className={`text-[10px] ${flash === 'up' ? 'text-up' : 'text-down'} ${selected ? '!text-white' : ''}`}>{flash === 'up' ? '▲' : '▼'}</span>}
        </span>
      )}
    </button>
  );
}

// ───── Spielzeile mit 1/X/2 ─────
export function useH2H(eventId: string) {
  const markets = useApp((s) => s.markets);
  const outcomes = useApp((s) => s.outcomes);
  const m = markets.find((x) => x.eventId === eventId && x.key === 'h2h');
  const outs = m ? Object.values(outcomes).filter((o) => o.marketId === m.id) : [];
  return { home: outs.find((o) => o.name === 'home'), draw: outs.find((o) => o.name === 'draw'), away: outs.find((o) => o.name === 'away') };
}

export function kickoff(ts: number) {
  const d = new Date(ts), today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Heute ${t}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Morgen ${t}`;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + t;
}

export function LiveBadge({ minute }: { minute: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-down/15 px-1.5 py-0.5 text-[11px] font-bold text-down">
      <span className="h-1.5 w-1.5 rounded-full bg-down animate-pulseDot" /> LIVE {minute && <span className="font-semibold text-ink/90">{minute}</span>}
    </span>
  );
}

export function EventCard({ ev }: { ev: SportEvent }) {
  const leagues = useApp((s) => s.leagues);
  const marketsCount = useApp((s) => s.markets.filter((m) => m.eventId === ev.id).length);
  const { home, draw, away } = useH2H(ev.id);
  const lg = leagues.find((l) => l.key === ev.leagueKey);
  const live = ev.status === 'live';
  return (
    <div className="rounded-2xl bg-s1 p-3">
      <Link to={`/event/${ev.id}`} className="block">
        <div className="flex items-center justify-between text-[11px] text-mute mb-2">
          <span className="truncate">{lg?.title}</span>
          {live ? <LiveBadge minute={ev.minute} /> : <span>{kickoff(ev.commence)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 space-y-1 text-[14px] font-semibold">
            <div className="truncate">{ev.home}</div>
            <div className="truncate">{ev.away}</div>
          </div>
          {live ? (
            <div className="space-y-1 text-right text-[15px] font-bold tabular-nums text-acc-hi">
              <div>{ev.homeScore}</div><div>{ev.awayScore}</div>
            </div>
          ) : <span className="text-[11px] text-mute shrink-0">+{marketsCount} Märkte ›</span>}
        </div>
      </Link>
      <div className={`mt-3 grid gap-2 ${draw ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <OddsButton o={home} top="1" />
        {draw && <OddsButton o={draw} top="X" />}
        <OddsButton o={away} top="2" />
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 mt-6 mb-2">
      <h2 className="text-[17px] font-bold tracking-tight">{children}</h2>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="flex rounded-xl bg-s1 p-1">
      {items.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${value === k ? 'bg-s3 text-ink' : 'text-mute'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Disclaimer() {
  return (
    <footer className="px-6 pt-8 pb-4 text-center text-[11px] leading-relaxed text-mute">
      <p className="font-semibold text-ink/80">Kein Glücksspiel – nur Spielgeld, keine Gewinne in Geld</p>
      <p>Coins können nicht gekauft und nicht ausgezahlt werden.</p>
    </footer>
  );
}

export function Toast() {
  const t = useApp((s) => s.toast);
  if (!t) return null;
  const c = t.kind === 'ok' ? 'bg-up/15 text-up border-up/30' : t.kind === 'err' ? 'bg-down/15 text-down border-down/30' : 'bg-s3 text-ink border-line';
  return (
    <div className="fixed left-0 right-0 z-50 flex justify-center px-4 pointer-events-none" style={{ top: 'calc(60px + env(safe-area-inset-top))' }}>
      <div className={`rounded-xl border px-4 py-2.5 text-[13px] font-semibold backdrop-blur ${c}`}>{t.text}</div>
    </div>
  );
}

export { backend };
