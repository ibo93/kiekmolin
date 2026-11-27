import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { favStore, slipStore, useApp, useFavs, useSlip } from '../data/store';
import { fmtOdds } from '../data/odds';
import { Disclaimer, EventCard, EventSkeleton, Icon, SectionTitle, sportIcon } from '../components/ui';

function Teaser() {
  const boosts = useApp((s) => s.boosts);
  const events = useApp((s) => s.events);
  const slipIds = useSlip((s) => s.items.map((i) => i.outcomeId).join());
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const slides = [
    ...boosts.map((b) => ({ kind: 'boost' as const, b, ev: events.find((e) => e.id === b.eventId) })).filter((x) => x.ev),
    { kind: 'group' as const },
    { kind: 'bonus' as const },
  ];
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);
  useEffect(() => { ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' }); }, [i]);

  return (
    <div className="px-[18px] pt-1">
      <div ref={ref} className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar rounded-[26px]"
           onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {slides.map((s, idx) => (
          <div key={idx} className="w-full shrink-0 snap-center">
            {s.kind === 'boost' && s.ev ? (
              <div className="relative h-[170px] overflow-hidden rounded-[26px] bg-lav p-[18px] text-[#120E33]">
                <div aria-hidden="true" className="absolute -bottom-16 -right-8 h-[210px] w-[210px] rounded-full bg-lav2" />
                <div aria-hidden="true" className="absolute right-6 top-5 grid h-[88px] w-[88px] place-items-center rounded-full bg-acc text-white">{Icon.boost('w-11 h-11')}</div>
                <div className="relative">
                  <div className="font-wide text-[24px] font-black leading-none">BOOST<br />DES TAGES</div>
                  <div className="mt-3 inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-full bg-[#120E33] px-2.5 py-1 text-[11px] font-bold uppercase text-white">
                    {s.ev.home} <span className="text-acc-hi">vs</span> {s.ev.away}
                  </div>
                  <div className="mt-3 flex items-center gap-2.5">
                    <span className="font-num text-[15px] text-[#5B54A0] line-through">{fmtOdds(s.b.original)}</span>
                    <span className="font-num text-[30px] font-black leading-none">{fmtOdds(s.b.boosted)}</span>
                    {(() => {
                      const on = slipIds.split(',').includes(s.b.outcomeId);
                      return (
                        <button aria-pressed={on} onClick={() => slipStore.toggle({ outcomeId: s.b.outcomeId, eventId: s.b.eventId, price: s.b.boosted })}
                          className={`ml-1 h-10 rounded-full px-4 text-[14px] font-bold ${on ? 'bg-acc text-white' : 'bg-[#120E33] text-white'}`}>{on ? 'Im Schein ✓' : 'Tippen'}</button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : s.kind === 'group' ? (
              <Link to="/rangliste" className="relative block h-[170px] overflow-hidden rounded-[26px] bg-mint p-[18px] text-[#0B3B22]">
                <div aria-hidden="true" className="absolute -bottom-16 -right-10 h-[200px] w-[200px] rounded-full bg-[#B5E0C6]" />
                <div className="relative">
                  <div className="font-wide text-[24px] font-black leading-none">TIPP-<br />GRUPPEN</div>
                  <p className="mt-3 max-w-[230px] text-[14px] font-medium leading-snug">Tippt mit eurem Verein, eurer Kneipe, euren Leuten.</p>
                  <span className="mt-3 inline-block rounded-full bg-[#0B3B22] px-4 py-2 text-[13px] font-bold text-white">Gruppe gründen</span>
                </div>
              </Link>
            ) : (
              <Link to="/profil" className="relative block h-[170px] overflow-hidden rounded-[26px] bg-card p-[18px] text-cink">
                <div aria-hidden="true" className="absolute right-6 top-5 grid h-[88px] w-[88px] place-items-center rounded-full bg-cink text-white">{Icon.gift('w-10 h-10')}</div>
                <div className="relative">
                  <div className="font-wide text-[24px] font-black leading-none">+100<br />JEDEN TAG</div>
                  <p className="mt-3 max-w-[210px] text-[14px] font-medium leading-snug">Tagesbonus beim Öffnen. Nur Spielgeld – kein Kauf, keine Auszahlung.</p>
                </div>
              </Link>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden="true">
        {slides.map((_, idx) => <span key={idx} className={`h-[5px] rounded-full transition-all ${idx === i ? 'w-[18px] bg-acc-hi' : 'w-[5px] bg-s3'}`} />)}
      </div>
    </div>
  );
}

export function SportBar({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const sports = useApp((s) => s.sports);
  const events = useApp((s) => s.events);
  const favs = useFavs();
  const withGames = sports.filter((s) => events.some((e) => e.sportKey === s.key));
  const sorted = [...(withGames.length ? withGames : sports)]
    .sort((a, b) => Number(favs.sports.includes(b.key)) - Number(favs.sports.includes(a.key)) || a.sort - b.sort);
  return (
    <nav aria-label="Sportarten" className="flex gap-2 overflow-x-auto no-scrollbar px-[18px] py-0.5">
      <button onClick={() => onChange('all')} aria-pressed={value === 'all'}
        className={`h-[46px] shrink-0 rounded-full px-5 text-[14px] font-bold ${value === 'all' ? 'bg-ink text-bg' : 'border border-[#2A2E39] text-[#C9CDDA]'}`}>Alle</button>
      {sorted.map((s) => {
        const on = value === s.key;
        return (
          <button key={s.key} onClick={() => onChange(s.key)} aria-pressed={on} aria-label={s.title}
            className={`flex h-[46px] shrink-0 items-center gap-2 rounded-full ${on ? 'bg-ink pl-1.5 pr-4 text-bg' : 'w-[46px] justify-center border border-[#2A2E39] bg-[#0E1015] text-[#C9CDDA]'}`}>
            {on ? <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-acc text-white">{sportIcon(s.key)}</span> : sportIcon(s.key)}
            {on && <span className="text-[14px] font-bold">{s.title}</span>}
          </button>
        );
      })}
    </nav>
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

      <SectionTitle right={<Link to="/live" className="text-[14px] text-mute">Alle ansehen</Link>}>
        <span className="flex items-center gap-2.5">Jetzt live <span className="h-2 w-2 rounded-full bg-down shadow-[0_0_0_4px_rgba(255,94,108,.2)]" /></span>
      </SectionTitle>
      {!loaded ? <div className="px-[18px]"><EventSkeleton /></div> : live.length === 0
        ? <p className="px-[18px] text-[14px] text-mute">Gerade läuft nichts{sport !== 'all' ? ' in dieser Sportart' : ''}.</p>
        : <div className="flex gap-3 overflow-x-auto no-scrollbar px-[18px]">{live.map((e) => <EventCard key={e.id} ev={e} compact />)}</div>}

      <SectionTitle right={<span className="text-[14px] text-mute">{top.length} Spiele</span>}>Top-Events</SectionTitle>
      <SportBar value={sport} onChange={setSport} />
      <div className="mt-3 space-y-3 px-[18px]">
        {!loaded ? [0, 1].map((i) => <EventSkeleton key={i} />)
          : top.length === 0 ? <p className="text-[14px] text-mute">Keine anstehenden Spiele.</p>
          : top.map((e) => <EventCard key={e.id} ev={e} />)}
      </div>

      <SectionTitle>Ligen</SectionTitle>
      <div className="mx-[18px] space-y-1.5">
        {shownLeagues.map((l) => {
          const n = events.filter((e) => e.leagueKey === l.key && e.status !== 'finished').length;
          const fav = favs.leagues.includes(l.key);
          return (
            <div key={l.key} className="flex h-14 items-center gap-2 rounded-full bg-s1 pl-2 pr-4">
              <button onClick={() => favStore.toggle('leagues', l.key)} aria-pressed={fav} aria-label={`${l.title} als Favorit`}
                className={`grid h-11 w-11 place-items-center rounded-full ${fav ? 'text-[#FFC857]' : 'text-mute'}`}>{Icon.star(fav)}</button>
              <Link to={`/liga/${l.key}`} className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-[15px] font-semibold">{l.title}</div><div className="truncate text-[12px] text-mute">{l.country}</div></div>
                <span className="font-num shrink-0 rounded-full bg-s3 px-2.5 py-1 text-[13px] font-bold">{n}</span>
              </Link>
            </div>
          );
        })}
      </div>
      <Disclaimer />
    </div>
  );
}
