import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { backend, slipStore, useApp, useSlip } from '../data/store';
import { fmtOdds } from '../data/odds';
import type { Outcome, SportEvent } from '../data/types';

// ───── Icons (eigene, schlicht, Linien) ─────
const line = (d: ReactNode, c = 'w-5 h-5', sw = 2) => (
  <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>);

export const Icon = {
  lock: (c = 'w-4 h-4') => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"/></svg>),
  boost: (c = 'w-3.5 h-3.5') => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>),
  star: (on: boolean, c = 'w-4 h-4') => (
    <svg viewBox="0 0 24 24" className={c} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>),
  chevron: (open: boolean) => line(<path d="m6 9 6 6 6-6" />, `w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`, 2.5),
  back: () => line(<path d="m15 5-7 7 7 7" />, 'w-5 h-5', 2.2),
  close: (c = 'w-4 h-4') => line(<path d="M6 6l12 12M18 6 6 18" />, c, 2.4),
  gift: (c = 'w-[17px] h-[17px]') => line(<><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1.5S10 8 12 8Zm0 0c2-4 6-4 6-1.5S14 8 12 8Z" /></>, c),
  live: (c = 'w-5 h-5') => line(<><circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>, c),
  slip: (c = 'w-6 h-6') => line(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>, c),
  check: (c = 'w-3 h-3') => line(<path d="m5 12 5 5 9-10" />, c, 3.2),
};

/** Symbole der Sportarten (rund, für die Leiste) */
export const SportIcon: Record<string, ReactNode> = {
  soccer: line(<><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10l4-3Z" /></>, 'w-5 h-5', 1.8),
  basketball: line(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" /></>, 'w-5 h-5', 1.7),
  tennis: line(<><circle cx="12" cy="12" r="9" /><path d="M5 5.5c4 3.5 4 9.5 0 13M19 5.5c-4 3.5-4 9.5 0 13" /></>, 'w-5 h-5', 1.7),
  icehockey: line(<><path d="M5 3l7 14h6M19 3l-4 8" /><ellipse cx="7" cy="19" rx="3" ry="1.5" /></>, 'w-5 h-5', 1.7),
  handball: line(<><circle cx="15" cy="5" r="2.5" /><path d="M6 21l3-6 3 2 1-5-4-2-3 3M13 12l4 2" /></>, 'w-5 h-5', 1.7),
  americanfootball: line(<><ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-40 12 12)" /><path d="m9.5 14.5 5-5M10.5 11.5l2 2M12.5 9.5l2 2" /></>, 'w-5 h-5', 1.7),
};
export const sportIcon = (k: string) => SportIcon[k] ?? line(<circle cx="12" cy="12" r="9" />, 'w-5 h-5', 1.8);

export function Coins({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`font-num tabular-nums ${className}`}>{new Intl.NumberFormat('de-DE').format(value)}</span>;
}

// ───── Wappen: Kürzel im Kreis (keine echten Vereinslogos – geschützt) ─────
const CREST = ['#2B4A9E', '#B5304A', '#1F7A6C', '#8A4FB8', '#B86A12', '#2E6B9A', '#7A2E5A', '#3F6B1F'];
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
export function initials(name: string) {
  const w = name.replace(/[^\p{L}\d ]/gu, '').split(/\s+/).filter((x) => x && !/^(fc|sv|tsv|vfb|vfl|ac|cf|sc|fk|1\.)$/i.test(x));
  return ((w[0]?.[0] ?? name[0] ?? '?') + (w[1]?.[0] ?? w[0]?.[1] ?? '')).toUpperCase();
}
export function Crest({ name, size = 52 }: { name: string; size?: number }) {
  const c = CREST[hash(name) % CREST.length];
  return (
    <span aria-hidden="true" className="font-num grid shrink-0 place-items-center rounded-full bg-white font-black"
      style={{ width: size, height: size, border: `${Math.max(2, Math.round(size / 18))}px solid ${c}`, color: c, fontSize: Math.round(size * 0.3) }}>
      {initials(name)}
    </span>
  );
}

// ───── Skeleton statt Spinner ─────
export function Skel({ className = '', light }: { className?: string; light?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${light ? 'bg-lock' : 'bg-s2'} ${className}`}>
      <div className={`absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent ${light ? 'via-white/60' : 'via-white/5'} to-transparent`} />
    </div>
  );
}
export function EventSkeleton() {
  return (
    <div className="space-y-1">
      <div className="rounded-t-[26px] bg-card p-4 space-y-4">
        <Skel light className="h-6 w-32 !rounded-full" />
        <div className="flex items-center justify-between"><Skel light className="h-12 w-12 !rounded-full" /><Skel light className="h-9 w-16" /><Skel light className="h-12 w-12 !rounded-full" /></div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-b-[26px] bg-card2 p-2"><Skel light className="h-12 !rounded-full" /><Skel light className="h-12 !rounded-full" /><Skel light className="h-12 !rounded-full" /></div>
    </div>
  );
}

// ───── Quoten-Pille ─────
// Auf hellen Karten. ausgewählt = violett gefüllt, Änderung = kurz mint/rosé, gesperrt = Schloss
export function OddsButton({ o, top }: { o: Outcome | undefined; top?: string; compact?: boolean }) {
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

  if (!o) return <div className="h-12 rounded-full bg-lock/60" />;
  const boost = boosts.find((b) => b.outcomeId === o.id);
  const price = boost ? boost.boosted : o.price;
  const locked = o.status !== 'open' || market?.status !== 'open';

  return (
    <button
      disabled={locked}
      onClick={() => slipStore.toggle({ outcomeId: o.id, eventId: o.eventId, price })}
      aria-pressed={selected}
      aria-label={locked ? `${top ?? o.label} – ausgesetzt` : `${top ?? o.label}, Quote ${fmtOdds(price)}`}
      className={[
        'flex h-12 min-w-0 items-center justify-between gap-1.5 rounded-full px-3.5 transition-colors select-none',
        locked ? 'justify-center bg-lock text-[#6E758A] cursor-not-allowed'
          : selected ? 'bg-acc text-white'
          : 'bg-white text-cink active:scale-[.97]',
        flash === 'up' && !selected && !locked ? 'animate-flashUp' : '',
        flash === 'down' && !selected && !locked ? 'animate-flashDown' : '',
      ].join(' ')}
    >
      {locked ? Icon.lock() : (
        <>
          {top && <span className={`truncate text-[12px] ${selected ? 'text-white/80' : 'text-cmute'}`}>{top}</span>}
          <span className="font-num flex shrink-0 items-center gap-1 text-[16px] font-extrabold leading-none tabular-nums">
            {boost && <span className={selected ? 'text-white' : 'text-[#D9365C]'}>{Icon.boost('w-3 h-3')}</span>}
            <span className={flash === 'up' && !selected ? 'text-[#0D7A4A]' : flash === 'down' && !selected ? 'text-[#B3243C]' : ''}>{fmtOdds(price)}</span>
            {flash && <span className={`text-[10px] ${selected ? 'text-white' : flash === 'up' ? 'text-[#0D7A4A]' : 'text-[#B3243C]'}`}>{flash === 'up' ? '▲' : '▼'}</span>}
          </span>
        </>
      )}
    </button>
  );
}

// ───── Spielkarte ─────
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E2475A] px-2.5 py-1 text-[12px] font-bold text-white">
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulseDot" />{minute ?? 'LIVE'}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="truncate rounded-full bg-chip px-3 py-1.5 text-[12px] font-semibold text-cink">{children}</span>;
}

/** Zweiteilige helle Karte: oben Spiel, unten Quoten */
export function EventCard({ ev, compact }: { ev: SportEvent; compact?: boolean }) {
  const leagues = useApp((s) => s.leagues);
  const marketsCount = useApp((s) => s.markets.filter((m) => m.eventId === ev.id).length);
  const { home, draw, away } = useH2H(ev.id);
  const lg = leagues.find((l) => l.key === ev.leagueKey);
  const live = ev.status === 'live';
  const crest = compact ? 40 : 52;
  return (
    <div className={compact ? 'w-[300px] shrink-0' : ''}>
      <Link to={`/event/${ev.id}`} className="block rounded-t-[26px] bg-card p-3.5 text-cink">
        <div className="flex items-center justify-between gap-2">
          <Chip>{lg?.title}</Chip>
          {live ? <LiveBadge minute={ev.minute} /> : <span className="shrink-0 text-[12px] font-medium text-cmute">+{marketsCount} Märkte ›</span>}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <Crest name={ev.home} size={crest} />
            <span className="line-clamp-2 text-center text-[12px] font-bold uppercase leading-tight">{ev.home}</span>
          </div>
          <div className="text-center">
            {live
              ? <div className="font-num text-[36px] font-black leading-none tracking-wide">{ev.homeScore}:{ev.awayScore}</div>
              : <div className="font-num text-[22px] font-black leading-none">{new Date(ev.commence).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>}
            <div className="mt-1 text-[12px] text-cmute">{live ? 'läuft' : kickoff(ev.commence).split(' ')[0]}</div>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <Crest name={ev.away} size={crest} />
            <span className="line-clamp-2 text-center text-[12px] font-bold uppercase leading-tight">{ev.away}</span>
          </div>
        </div>
      </Link>
      <div className={`mt-1 grid gap-1.5 rounded-b-[26px] bg-card2 p-2 ${draw ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <OddsButton o={home} top="1" />
        {draw && <OddsButton o={draw} top="X" />}
        <OddsButton o={away} top="2" />
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[18px] mt-6 mb-3">
      <h2 className="text-[22px] font-bold tracking-tight">{children}</h2>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="flex gap-1 rounded-full bg-s2 p-1">
      {items.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
          className={`h-10 flex-1 rounded-full text-[14px] font-semibold transition-colors ${value === k ? 'bg-ink text-bg' : 'text-[#B4BACB]'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Disclaimer() {
  return (
    <footer className="px-6 pt-8 pb-28 text-center text-[11px] leading-relaxed text-mute">
      <p className="font-semibold text-ink/80">Kein Glücksspiel – nur Spielgeld, keine Gewinne in Geld</p>
      <p>Coins können nicht gekauft und nicht ausgezahlt werden.</p>
    </footer>
  );
}

export function Toast() {
  const t = useApp((s) => s.toast);
  if (!t) return null;
  const c = t.kind === 'ok' ? 'bg-mint text-[#0B3B22]' : t.kind === 'err' ? 'bg-rose text-[#5A1220]' : 'bg-ink text-bg';
  return (
    <div className="fixed left-0 right-0 z-50 flex justify-center px-4 pointer-events-none" style={{ top: 'calc(70px + env(safe-area-inset-top))' }}>
      <div role="status" className={`rounded-full px-5 py-3 text-[14px] font-semibold shadow-xl ${c}`}>{t.text}</div>
    </div>
  );
}

export { backend };
