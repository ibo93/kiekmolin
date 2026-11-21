import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { favStore, slipStore, useApp, useFavs, useSlip } from '../data/store';
import { builderOdds, fmtOdds } from '../data/odds';
import { Disclaimer, EventCard, EventSkeleton, Icon, kickoff, LiveBadge, OddsButton, Skel } from '../components/ui';
import type { Market } from '../data/types';

type Tab = 'all' | 'popular' | 'goals' | 'half' | 'stats';
const TABS: [Tab, string][] = [['all', 'Alle'], ['popular', 'Beliebt'], ['goals', 'Tore'], ['half', 'Halbzeit'], ['stats', 'Statistik']];
const inTab = (m: Market, t: Tab) =>
  t === 'all' ? true
  : t === 'popular' ? ['h2h', 'double_chance', 'btts'].includes(m.key) || (m.key === 'totals' && m.line === 2.5)
  : t === 'goals' ? ['totals', 'btts'].includes(m.key)
  : t === 'half' ? m.key.endsWith('_h1') : false;

function MarketAccordion({ m, defaultOpen }: { m: Market; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const outcomes = useApp((s) => s.outcomes);
  const outs = Object.values(outcomes).filter((o) => o.marketId === m.id);
  const order = ['home', '1X', 'over', 'yes', 'draw', '12', 'under', 'no', 'away', 'X2'];
  outs.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return (
    <div className="rounded-2xl bg-s1">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3.5">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          {m.name}
          {m.status === 'suspended' && <span className="flex items-center gap-1 rounded bg-s3 px-1.5 py-0.5 text-[10px] text-mute">{Icon.lock('w-3 h-3')} ausgesetzt</span>}
        </span>
        <span className="text-mute">{Icon.chevron(open)}</span>
      </button>
      {open && (
        <div className={`grid gap-2 px-3 pb-3 ${outs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {outs.map((o) => <OddsButton key={o.id} o={o} top={o.label} />)}
        </div>
      )}
    </div>
  );
}

// Form & direkte Duelle: The Odds API liefert keine Statistik. Später aus
// eigenen abgerechneten Spielen; im Demo-Betrieb erkennbar als Beispiel.
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function Form({ team }: { team: string }) {
  const h = hash(team);
  const res = Array.from({ length: 5 }, (_, i) => ['S', 'U', 'N'][(h >> (i * 3)) % 3]);
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[14px] font-semibold truncate">{team}</span>
      <div className="flex gap-1">{res.map((r, i) => (
        <span key={i} className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold ${r === 'S' ? 'bg-up/20 text-up' : r === 'N' ? 'bg-down/20 text-down' : 'bg-s3 text-mute'}`}>{r}</span>
      ))}</div>
    </div>
  );
}
function Stats({ home, away }: { home: string; away: string }) {
  const h = hash(home + away);
  const duels = Array.from({ length: 4 }, (_, i) => [(h >> (i * 2)) % 4, (h >> (i * 2 + 5)) % 3]);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-s1 px-4 py-2">
        <div className="pt-1 text-[12px] font-semibold uppercase tracking-wider text-mute">Form (letzte 5)</div>
        <Form team={home} /><Form team={away} />
      </div>
      <div className="rounded-2xl bg-s1 px-4 py-3">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-mute">Direkte Duelle</div>
        {duels.map(([a, b], i) => (
          <div key={i} className="flex justify-between py-1.5 text-[13px]">
            <span className="text-mute">{2025 - i}/{(26 - i).toString().padStart(2, '0')}</span>
            <span className="truncate">{home}</span><b className="tabular-nums px-2">{a}:{b}</b><span className="truncate text-right">{away}</span>
          </div>
        ))}
      </div>
      <p className="px-1 text-[11px] text-mute">Beispielwerte im Demo-Betrieb. Echte Werte kommen aus abgerechneten Spielen – die Quoten-API liefert keine Statistik.</p>
    </div>
  );
}

export default function EventPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const loaded = useApp((s) => s.loaded);
  const ev = useApp((s) => s.events.find((e) => e.id === id));
  const allMarkets = useApp((s) => s.markets);
  const league = useApp((s) => s.leagues.find((l) => l.key === ev?.leagueKey));
  const slip = useSlip((s) => s.items);
  const [tab, setTab] = useState<Tab>('all');

  const markets = useMemo(() => allMarkets.filter((m) => m.eventId === id).sort((a, b) => a.sort - b.sort), [allMarkets, id]);
  const mine = slip.filter((i) => i.eventId === id);
  const onlyThisEvent = slip.length >= 2 && slip.every((i) => i.eventId === id);

  if (!loaded) return <div className="p-4 space-y-3"><Skel className="h-28" /><EventSkeleton /><EventSkeleton /></div>;
  if (!ev) return <div className="p-6 text-center text-mute">Spiel nicht gefunden. <Link to="/" className="text-acc-hi">Zur Startseite</Link></div>;
  const live = ev.status === 'live';

  return (
    <div>
      <div className="sticky top-[52px] z-10 bg-bg/95 backdrop-blur px-4 pt-2 pb-3">
        <div className="flex items-center justify-between text-[12px] text-mute">
          <button onClick={() => nav(-1)} className="py-1 pr-3 text-ink">‹ Zurück</button>
          <span>{league?.title}</span>
        </div>
        <div className="mt-2 rounded-2xl bg-gradient-to-br from-s2 to-s1 p-4">
          <div className="flex justify-center mb-2">{live ? <LiveBadge minute={ev.minute} /> : <span className="text-[12px] text-mute">{kickoff(ev.commence)}</span>}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <div className="text-[15px] font-bold leading-tight">{ev.home}</div>
            <div className="text-3xl font-extrabold tabular-nums">{live ? `${ev.homeScore}:${ev.awayScore}` : <span className="text-mute text-lg">vs</span>}</div>
            <div className="text-[15px] font-bold leading-tight">{ev.away}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold ${tab === k ? 'bg-acc text-white' : 'bg-s1 text-mute'}`}>{l}</button>
          ))}
        </div>
      </div>

      {mine.length >= 2 && (
        <div className="mx-4 mb-3 rounded-2xl border border-acc/40 bg-acc-lo/60 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-acc-hi">Wetten-Konfigurator</div>
              <div className="text-[13px]">{mine.length} Tipps aus diesem Spiel kombiniert</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-mute">Quote</div>
              <div className="text-xl font-extrabold tabular-nums">{fmtOdds(builderOdds(mine.map((i) => i.price)))}</div>
            </div>
          </div>
          {onlyThisEvent
            ? <button onClick={() => slipStore.setOpen(true)} className="mt-2 w-full rounded-xl bg-acc py-2 text-[13px] font-bold text-white">Im Wettschein ansehen</button>
            : <p className="mt-2 text-[12px] text-mute">Im Wettschein sind noch Tipps aus anderen Spielen – für den Konfigurator nur Tipps aus diesem Spiel.</p>}
        </div>
      )}

      <div className="space-y-2 px-4">
        {tab === 'stats' ? <Stats home={ev.home} away={ev.away} />
          : markets.filter((m) => inTab(m, tab)).map((m, i) => <MarketAccordion key={m.id} m={m} defaultOpen={i < 4} />)}
        {tab === 'half' && <p className="px-1 text-[11px] text-mute">Hinweis: Liefert die Datenquelle keinen Halbzeitstand, wird der Tipp erstattet.</p>}
      </div>
      <Disclaimer />
    </div>
  );
}

export function LeaguePage() {
  const { key } = useParams();
  const nav = useNavigate();
  const league = useApp((s) => s.leagues.find((l) => l.key === key));
  const events = useApp((s) => s.events);
  const favs = useFavs();
  const list = events.filter((e) => e.leagueKey === key && e.status !== 'finished').sort((a, b) => a.commence - b.commence);
  const fav = !!key && favs.leagues.includes(key);
  return (
    <div className="px-4 pt-2">
      <div className="flex items-center justify-between">
        <button onClick={() => nav(-1)} className="py-1 text-[13px]">‹ Zurück</button>
        <button onClick={() => key && favStore.toggle('leagues', key)} className={`flex items-center gap-1 text-[13px] ${fav ? 'text-amber-300' : 'text-mute'}`}>{Icon.star(fav)} Favorit</button>
      </div>
      <h1 className="mt-2 text-2xl font-extrabold">{league?.title}</h1>
      <p className="text-[13px] text-mute mb-4">{league?.country}</p>
      <div className="space-y-3">{list.length ? list.map((e) => <EventCard key={e.id} ev={e} />) : <p className="text-mute">Keine Spiele angesetzt.</p>}</div>
      <Disclaimer />
    </div>
  );
}
