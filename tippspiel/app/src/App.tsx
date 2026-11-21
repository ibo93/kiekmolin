import { useEffect, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { backend, useApp } from './data/store';
import { Coins, Toast } from './components/ui';
import { SlipFab, SlipSheet } from './components/Slip';
import Home from './screens/Home';
import EventPage, { LeaguePage } from './screens/Event';
import { JoinGroup, Leaderboard, Live, MyBets, Profile } from './screens/Other';

const ic = (d: ReactNode) => <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const TABS = [
  { to: '/', label: 'Sport', icon: ic(<><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10l4-3Z" /></>) },
  { to: '/live', label: 'Live', icon: ic(<><circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>) },
  { to: '/wetten', label: 'Meine Wetten', icon: ic(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>) },
  { to: '/rangliste', label: 'Rangliste', icon: ic(<path d="M8 21V11H3v10h5Zm0 0h8m-8 0V5h8v16m0 0h5v-7h-5" />) },
  { to: '/profil', label: 'Profil', icon: ic(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>) },
];

export default function App() {
  const balance = useApp((s) => s.wallet.balance);
  const liveCount = useApp((s) => s.events.filter((e) => e.status === 'live').length);
  const openBets = useApp((s) => s.bets.filter((b) => b.status === 'open').length);
  const { pathname } = useLocation();
  const error = useApp((s) => s.error);

  useEffect(() => { backend.start(); return () => backend.stop(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-bg pb-24">
      <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between bg-bg/90 px-4 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className="text-[18px] font-extrabold tracking-tight">Tipp<span className="text-acc-hi">Arena</span></span>
        </div>
        <NavLink to="/profil" className="rounded-full bg-s1 px-3 py-1.5 text-[14px] font-bold"><Coins value={balance} /></NavLink>
      </header>

      {error && (
        <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-[13px] text-down">
          <span>{error}. Die Anzeige ist gerade nicht aktuell.</span>
          <button onClick={() => location.reload()} className="shrink-0 rounded-lg bg-down/20 px-2.5 py-1 font-bold">Neu laden</button>
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

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-line bg-s1/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${isActive ? 'text-acc-hi' : 'text-mute'}`}>
              {t.icon}{t.label}
              {t.to === '/live' && liveCount > 0 && <span className="absolute right-[22%] top-1.5 h-2 w-2 rounded-full bg-down" />}
              {t.to === '/wetten' && openBets > 0 && <span className="absolute right-[24%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-acc px-1 text-[9px] text-white">{openBets}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
