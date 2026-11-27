import { useEffect, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { backend, useApp } from './data/store';
import { Coins, Icon, Toast } from './components/ui';
import { SlipFab, SlipSheet } from './components/Slip';
import Home from './screens/Home';
import EventPage, { LeaguePage } from './screens/Event';
import { JoinGroup, Leaderboard, Live, MyBets, Profile } from './screens/Other';

const ic = (d: ReactNode) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const TABS = [
  { to: '/', label: 'Sport', icon: ic(<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" />) },
  { to: '/live', label: 'Live', icon: ic(<><circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>) },
  { to: '/wetten', label: 'Wetten', icon: ic(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>) },
  { to: '/rangliste', label: 'Rangliste', icon: ic(<path d="M8 21V11H3v10h5Zm0 0h8m-8 0V5h8v16m0 0h5v-7h-5" />) },
  { to: '/profil', label: 'Profil', icon: ic(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>) },
];

export default function App() {
  const balance = useApp((s) => s.wallet.balance);
  const user = useApp((s) => s.user);
  const bonusToday = useApp((s) => s.wallet.lastDailyBonus === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }));
  const liveCount = useApp((s) => s.events.filter((e) => e.status === 'live').length);
  const openBets = useApp((s) => s.bets.filter((b) => b.status === 'open').length);
  const { pathname } = useLocation();
  const error = useApp((s) => s.error);

  useEffect(() => { backend.start(); return () => backend.stop(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-bg">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-bg/90 px-[18px] backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <NavLink to="/" className="font-wide text-[19px] font-black tracking-wide text-ink">TIPPARENA<span className="text-acc [text-shadow:0_0_12px_rgba(198,255,0,.8)]">.</span></NavLink>
        {(user || !backend.requiresLogin) && (
          <div className="flex h-11 items-center gap-2.5 rounded-full bg-s2 pl-4 pr-1.5">
            <NavLink to="/profil" className="text-[16px] font-bold text-ink">
              <Coins value={balance} /> <span className="text-[12px] font-medium text-mute">Coins</span>
            </NavLink>
            <button onClick={() => backend.claimDailyBonus()} aria-label={bonusToday ? 'Tagesbonus heute schon abgeholt' : 'Tagesbonus abholen'}
              className={`relative grid h-[34px] w-[34px] place-items-center rounded-full ${bonusToday ? 'bg-s3 text-mute' : 'bg-acc text-black'}`}>
              {Icon.gift()}
              {!bonusToday && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-s2 bg-boost" />}
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="mx-[18px] mt-1 flex items-center justify-between gap-3 rounded-full bg-rose py-1.5 pl-4 pr-1.5 text-[13px] font-semibold text-[#FFB3BC]">
          <span>{error}. Anzeige nicht aktuell.</span>
          <button onClick={() => location.reload()} className="h-9 shrink-0 rounded-full bg-acc px-3.5 font-bold text-black">Neu laden</button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/live" element={<Live />} />
        <Route path="/event/:id" element={<EventPage />} />
        <Route path="/liga/:key" element={<LeaguePage />} />
        <Route path="/wetten" element={<MyBets />} />
        <Route path="/rangliste" element={<Leaderboard />} />
        <Route path="/gruppe/:code" element={<JoinGroup />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="*" element={<Home />} />
      </Routes>

      <SlipFab />
      <SlipSheet />
      <Toast />

      <nav aria-label="Hauptmenü" className="fixed left-1/2 z-30 flex h-16 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#14161C] px-[7px] shadow-[0_12px_40px_rgba(0,0,0,.6)]"
           style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} aria-label={t.label}
            className={({ isActive }) => `relative flex h-[50px] items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-all ${isActive ? 'bg-acc px-4 text-black shadow-neon' : 'w-[50px] bg-s3 text-[#D5D8E2]'}`}>
            {({ isActive }) => (<>
              {t.icon}{isActive && <span>{t.label}</span>}
              {t.to === '/live' && liveCount > 0 && !isActive && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-down" />}
              {t.to === '/wetten' && openBets > 0 && <span className="font-num absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-boost px-1 text-[11px] font-black text-black">{openBets}</span>}
            </>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
