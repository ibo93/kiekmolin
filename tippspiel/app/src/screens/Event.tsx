import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { favStore, slipStore, useApp, useFavs, useSlip } from '../data/store';
import { builderOdds, fmtOdds } from '../data/odds';
import { Crest, Disclaimer, EventCard, EventSkeleton, Icon, kickoff, LiveBadge, OddsButton, Skel } from '../components/ui';
import type { Market } from '../data/types';

type Tab = 'all' | 'popular' | 'goals' | 'half' | 'stats';
const TABS: [Tab, string][] = [['all', 'Alle'], ['popular', 'Beliebt'], ['goals', 'Tore'], ['half', 'Halbzeit'], ['stats', 'Statistik']];
const inTab = (m: Market, t: Tab) =>
  t === 'all' ? true
  : t === 'popular' ? ['h2h', 'double_chance', 'btts'].includes(m.key) || (m.key === 'totals' && m.line === 2.5)
  : t === 'goals' ? ['totals', 'btts'].includes(m.key)
  : t === 'half' ? m.key.endsWith('_h1') : false;

const SHORT: Record<string, string> = { home: '1', draw: 'X', away: '2' };
function MarketAccordion({ m, defaultOpen }: { m: Market; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const outcomes = useApp((s) => s.outcomes);
  const outs = Object.values(outcomes).filter((o) => o.marketId === m.id);
  const order = ['home', '1X', 'over', 'yes', 'draw', '12', 'under', 'no', 'away', 'X2'];
  outs.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const three = outs.length === 3;
  return (
    <div className="rounded-[26px] bg-card2 text-cink">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-[52px] w-full items-center justify-between px-[18px]">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          {m.name}
          {m.status === 'suspended' && <span className="flex items-center gap-1 rounded-full bg-lock px-2 py-0.5 text-[11px] font-semibold text-cmute">{Icon.lock('w-3 h-3')} ausgesetzt</span>}
        </span>
        <span className="text-cmute">{Icon.chevron(open)}</span>
      </button>
      {open && (
        <div className={`grid gap-1.5 px-2 pb-2 ${three ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {outs.map((o) => <OddsButton key={o.id} o={o} top={three ? (SHORT[o.name] ?? o.name) : o.label} />)}
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
        <span key={i} className={`grid h-[26px] w-[26px] place-items-center rounded-lg text-[12px] font-extrabold ${r === 'S' ? 'bg-mint text-[#7FF0B8]' : r === 'N' ? 'bg-rose text-[#FFB3BC]' : 'bg-s3 text-[#C9CDDA]'}`}>{r}</span>
      ))}</div>
    </div>
  );
}
function Stats({ home, away }: { home: string; away: string }) {
  const h = hash(home + away);
  const duels = Array.from({ length: 4 }, (_, i) => [(h >> (i * 2)) % 4, (h >> (i * 2 + 5)) % 3]);
  return (
    <div className="space-y-3">
      <div className="rounded-[22px] border border-line bg-s1 px-4 py-2">
        <div className="pt-1 text-[12px] font-semibold uppercase tracking-wider text-mute">Form (letzte 5)</div>
        <Form team={home} /><Form team={away} />
      </div>
      <div className="rounded-[22px] border border-line bg-s1 px-4 py-3">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-mute">Direkte Duelle</div>
        {duels.map(([a, b], i) => (
          <div key={i} className="flex justify-between py-1.5 text-[13px]">
            <span className="text-mute">{2025 - i}/{(26 - i).toString().padStart(2, '0')}</span>
            <span className="truncate">{home}</span><b className="font-num px-2">{a}:{b}</b><span className="truncate text-right">{away}</span>
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

  if (!loaded) return <div className="space-y-3 px-[18px] pt-2"><EventSkeleton /><Skel className="h-40" /></div>;
  if (!ev) return <div className="p-6 text-center text-mute">Spiel nicht gefunden. <Link to="/" className="text-acc-hi">Zur Startseite</Link></div>;
  const live = ev.status === 'live';

  return (
    <div>
      <div className="flex h-11 items-center justify-between px-[18px]">
        <button onClick={() => nav(-1)} className="-ml-1 flex h-11 items-center gap-1.5 text-[16px] font-semibold">{Icon.back()}Zurück</button>
        <span className="truncate text-[13px] text-mute">{league?.title}</span>
      </div>

      <section className="px-[18px] pt-1">
        <div className="rounded-[28px] bg-card p-3.5 pb-5 text-cink">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-chip px-3 py-1.5 text-[12px] font-semibold">{live ? 'Live' : kickoff(ev.commence)}</span>
            {live && <LiveBadge minute={ev.minute} />}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <Crest name={ev.home} size={58} />
              <span className="line-clamp-2 text-center text-[12px] font-bold uppercase leading-tight">{ev.home}</span>
            </div>
            <div className="text-center">
              {live ? <div className="font-num text-[44px] font-black leading-none tracking-wide">{ev.homeScore}:{ev.awayScore}</div>
                : <div className="font-wide text-[22px] font-black text-cmute">VS</div>}
            </div>
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <Crest name={ev.away} size={58} />
              <span className="line-clamp-2 text-center text-[12px] font-bold uppercase leading-tight">{ev.away}</span>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Markt-Gruppen" className="sticky top-16 z-10 flex gap-1.5 overflow-x-auto no-scrollbar bg-bg/95 px-[18px] py-3 backdrop-blur">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold ${tab === k ? 'bg-ink text-bg' : 'bg-s2 text-[#B4BACB]'}`}>{l}</button>
        ))}
      </nav>

      {mine.length >= 2 && (
        <div className="mx-[18px] mb-3 flex items-center justify-between gap-3 rounded-[26px] bg-lav py-3 pl-[18px] pr-3 text-[#1A2000]">
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#2F3D00]">Wetten-Konfigurator</div>
            <div className="text-[13px] font-medium">{onlyThisEvent ? `${mine.length} Tipps aus diesem Spiel` : 'Nur Tipps aus diesem Spiel im Schein lassen'}</div>
          </div>
          <button onClick={() => slipStore.setOpen(true)} className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[#1A2000] px-4 text-[14px] font-bold text-white">
            Quote <span className="font-num text-[17px] text-[#E2FF7A]">{fmtOdds(builderOdds(mine.map((i) => i.price)))}</span>
          </button>
        </div>
      )}

      <div className="space-y-2 px-[18px]">
        {tab === 'stats' ? <Stats home={ev.home} away={ev.away} />
          : markets.filter((m) => inTab(m, tab)).map((m, i) => <MarketAccordion key={m.id} m={m} defaultOpen={i < 4} />)}
        {tab === 'half' && <p className="px-1 text-[12px] text-mute">Liefert die Datenquelle keinen Halbzeitstand, wird der Tipp erstattet.</p>}
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
    <div className="px-[18px]">
      <div className="flex h-11 items-center justify-between">
        <button onClick={() => nav(-1)} className="-ml-1 flex h-11 items-center gap-1.5 text-[16px] font-semibold">{Icon.back()}Zurück</button>
        <button onClick={() => key && favStore.toggle('leagues', key)} aria-pressed={fav}
          className={`flex h-10 items-center gap-1.5 rounded-full border border-[#2A2E39] px-4 text-[13px] font-semibold ${fav ? 'text-[#FFC857]' : 'text-[#C9CDDA]'}`}>{Icon.star(fav)} Favorit</button>
      </div>
      <h1 className="font-wide mt-3 text-[26px] font-black uppercase leading-none">{league?.title}</h1>
      <p className="mb-4 mt-1 text-[14px] text-mute">{league?.country}</p>
      <div className="space-y-3">{list.length ? list.map((e) => <EventCard key={e.id} ev={e} />) : <p className="text-mute">Keine Spiele angesetzt.</p>}</div>
      <Disclaimer />
    </div>
  );
}
