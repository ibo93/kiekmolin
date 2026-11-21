import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { favStore, useApp, useFavs } from '../data/store';
import { fmtOdds } from '../data/odds';
import { Disclaimer, EventCard, EventSkeleton, Icon, LiveBadge, OddsButton, SectionTitle, useH2H } from '../components/ui';
import type { SportEvent } from '../data/types';

function Teaser() {
  const boosts = useApp((s) => s.boosts);
  const events = useApp((s) => s.events);
  const outcomes = useApp((s) => s.outcomes);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const slides = [
    ...boosts.map((b) => ({ kind: 'boost' as const, b, ev: events.find((e) => e.id === b.eventId)! })),
    { kind: 'group' as const },
    { kind: 'bonus' as const },
  ];
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);
  useEffect(() => { ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' }); }, [i]);

  return (
    <div className="px-4 pt-3">
      <div ref={ref} className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar rounded-2xl"
           onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {slides.map((s, idx) => (
          <div key={idx} className="w-full shrink-0 snap-center">
            {s.kind === 'boost' ? (
              <div className="relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-[#3b1d5e] via-[#2a2552] to-[#151729] p-4">
                <div className="absolute -right-6 -top-8 h-40 w-40 rounded-full bg-boost/20 blur-2xl" />
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-boost">{Icon.boost()} Boost des Tages</div>
                <div className="mt-2 text-[17px] font-extrabold leading-tight">{s.b.title}</div>
                <div className="text-[12px] text-mute">{s.ev.home} – {s.ev.away}</div>
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-mute line-through tabular-nums">{fmtOdds(s.b.original)}</span>
                    <span className="text-2xl font-extrabold text-white tabular-nums">{fmtOdds(s.b.boosted)}</span>
                  </div>
                  <div className="w-24"><OddsButton o={outcomes[s.b.outcomeId]} compact /></div>
                </div>
              </div>
            ) : s.kind === 'group' ? (
              <Link to="/rangliste" className="block h-36 rounded-2xl bg-gradient-to-br from-[#123a3a] to-[#151729] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#5eead4]">Tippgruppen</div>
                <div className="mt-2 text-[17px] font-extrabold leading-tight">Tippt mit eurem Verein,<br />eurer Kneipe, euren Leuten</div>
                <div className="mt-3 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-semibold">Gruppe gründen ›</div>
              </Link>
            ) : (
              <Link to="/profil" className="block h-36 rounded-2xl bg-gradient-to-br from-[#2a2552] to-[#151729] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-acc-hi">Jeden Tag</div>
                <div className="mt-2 text-[17px] font-extrabold leading-tight">100 Coins Tagesbonus –<br />einfach App öffnen</div>
                <div className="mt-3 text-[12px] text-mute">Nur Spielgeld. Kein Kauf, keine Auszahlung.</div>
              </Link>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {slides.map((_, idx) => <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-acc' : 'w-1.5 bg-line'}`} />)}
      </div>
    </div>
  );
}

export function SportBar({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const sports = useApp((s) => s.sports);
  const favs = useFavs();
  const sorted = [...sports].sort((a, b) => Number(favs.sports.includes(b.key)) - Number(favs.sports.includes(a.key)) || a.sort - b.sort);
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-1">
      <button onClick={() => onChange('all')}
        className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold ${value === 'all' ? 'bg-ink text-bg' : 'bg-s1 text-mute'}`}>Alle</button>
      {sorted.map((s) => (
        <button key={s.key} onClick={() => onChange(s.key)}
          className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold ${value === s.key ? 'bg-ink text-bg' : 'bg-s1 text-ink/90'}`}>
          <span>{s.icon}</span>{s.title}
          {favs.sports.includes(s.key) && <span className="text-amber-300">{Icon.star(true, 'w-3 h-3')}</span>}
        </button>
      ))}
    </div>
  );
}

function LiveMini({ ev }: { ev: SportEvent }) {
  const { home, draw, away } = useH2H(ev.id);
  return (
    <div className="w-[260px] shrink-0 rounded-2xl bg-s1 p-3">
      <Link to={`/event/${ev.id}`} className="block">
        <div className="mb-2"><LiveBadge minute={ev.minute} /></div>
        <div className="flex justify-between text-[13px] font-semibold"><span className="truncate">{ev.home}</span><span className="tabular-nums text-acc-hi">{ev.homeScore}</span></div>
        <div className="flex justify-between text-[13px] font-semibold"><span className="truncate">{ev.away}</span><span className="tabular-nums text-acc-hi">{ev.awayScore}</span></div>
      </Link>
      <div className={`mt-2 grid gap-1.5 ${draw ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <OddsButton o={home} compact />{draw && <OddsButton o={draw} compact />}<OddsButton o={away} compact />
      </div>
    </div>
  );
}

export default function Home() {
  const loaded = useApp((s) => s.loaded);
  const events = useApp((s) => s.events);
  const leagues = useApp((s) => s.leagues);
  const favs = useFavs();
  const [sport, setSport] = useState('all');

  const live = useMemo(() => events.filter((e) => e.status === 'live' && (sport === 'all' || e.sportKey === sport)), [events, sport]);
  const upcoming = useMemo(() => events.filter((e) => e.status === 'scheduled' && (sport === 'all' || e.sportKey === sport))
    .sort((a, b) => Number(b.isTop) - Number(a.isTop) || a.commence - b.commence), [events, sport]);
  // Top-Events: markierte Spiele, sonst die nächsten aus den wichtigsten Ligen (36 h)
  const prio = (k: string) => leagues.find((l) => l.key === k)?.sort ?? 1e9;
  const soon = upcoming.filter((e) => e.commence < Date.now() + 36 * 3600e3);
  const top = [...(soon.length ? soon : upcoming)]
    .sort((a, b) => Number(b.isTop) - Number(a.isTop) || prio(a.leagueKey) - prio(b.leagueKey) || a.commence - b.commence)
    .slice(0, 6);
  const shownLeagues = leagues
    .filter((l) => (sport === 'all' || l.sportKey === sport)
      && (favs.leagues.includes(l.key) || events.some((e) => e.leagueKey === l.key)))
    .sort((a, b) => Number(favs.leagues.includes(b.key)) - Number(favs.leagues.includes(a.key)) || a.sort - b.sort);

  return (
    <div>
      <Teaser />
      <div className="mt-4"><SportBar value={sport} onChange={setSport} /></div>

      <SectionTitle right={<Link to="/live" className="text-[13px] font-semibold text-acc-hi">Alle ›</Link>}>
        <span className="flex items-center gap-2">Jetzt live <span className="h-2 w-2 rounded-full bg-down animate-pulseDot" /></span>
      </SectionTitle>
      {!loaded ? <div className="px-4"><EventSkeleton /></div> : live.length === 0
        ? <p className="px-4 text-[13px] text-mute">Gerade läuft nichts{sport !== 'all' ? ' in dieser Sportart' : ''}.</p>
        : <div className="flex gap-3 overflow-x-auto no-scrollbar px-4">{live.map((e) => <LiveMini key={e.id} ev={e} />)}</div>}

      <SectionTitle>Top-Events heute</SectionTitle>
      <div className="space-y-3 px-4">
        {!loaded ? [0, 1, 2].map((i) => <EventSkeleton key={i} />)
          : top.length === 0 ? <p className="text-[13px] text-mute">Keine anstehenden Spiele.</p>
          : top.map((e) => <EventCard key={e.id} ev={e} />)}
      </div>

      <SectionTitle>Ligen</SectionTitle>
      <div className="mx-4 divide-y divide-line overflow-hidden rounded-2xl bg-s1">
        {shownLeagues.map((l) => {
          const n = events.filter((e) => e.leagueKey === l.key && e.status !== 'finished').length;
          const fav = favs.leagues.includes(l.key);
          return (
            <div key={l.key} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => favStore.toggle('leagues', l.key)} className={fav ? 'text-amber-300' : 'text-mute'} aria-label="Favorit">{Icon.star(fav)}</button>
              <Link to={`/liga/${l.key}`} className="flex flex-1 items-center justify-between">
                <div><div className="text-[14px] font-semibold">{l.title}</div><div className="text-[12px] text-mute">{l.country}</div></div>
                <span className="text-[12px] text-mute">{n} ›</span>
              </Link>
            </div>
          );
        })}
      </div>
      <Disclaimer />
    </div>
  );
}
