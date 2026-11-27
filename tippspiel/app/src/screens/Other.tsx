import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { backend, favStore, useApp, useFavs } from '../data/store';
import { fmtCoins, fmtOdds } from '../data/odds';
import { Coins, Disclaimer, EventCard, EventSkeleton, Icon, Segmented, Skel } from '../components/ui';
import { SportBar } from './Home';
import type { Bet, Group, LeaderRow, Stats } from '../data/types';

// ───────────────────────── Live ─────────────────────────
export function Live() {
  const loaded = useApp((s) => s.loaded);
  const events = useApp((s) => s.events);
  const [sport, setSport] = useState('all');
  const live = events.filter((e) => e.status === 'live' && (sport === 'all' || e.sportKey === sport));
  return (
    <div className="pt-1">
      <div className="px-[18px]">
        <h1 className="font-wide flex items-center gap-3 text-[26px] font-black">LIVE <span className="h-[9px] w-[9px] rounded-full bg-down shadow-[0_0_0_5px_rgba(255,94,108,.2)]" /></h1>
        <p className="mb-3 mt-1 text-[13px] text-mute">Quoten in Echtzeit · ▲ steigt · ▼ fällt · Schloss = ausgesetzt</p>
      </div>
      <SportBar value={sport} onChange={setSport} />
      <div className="mt-3 space-y-3 px-[18px]">
        {!loaded ? [0, 1].map((i) => <EventSkeleton key={i} />)
          : live.length ? live.map((e) => <EventCard key={e.id} ev={e} />)
          : <p className="py-10 text-center text-mute">Gerade läuft kein Spiel.</p>}
      </div>
      <Disclaimer />
    </div>
  );
}

// ───────────────────────── Meine Wetten ─────────────────────────
const TYPE: Record<Bet['type'], string> = { single: 'Einzel', combo: 'Kombi', system: 'System', builder: 'Konfigurator' };
// Karte je Status: offen = eisblau, gewonnen = mint, verloren = rosé, Cash-Out = flieder, erstattet = grau
const LOOK: Record<Bet['status'], { card: string; badge: string; label: string; sub: string; amount: string }> = {
  open: { card: 'bg-card', badge: '', label: 'Offen', sub: 'text-cmute', amount: 'text-[#3DF29A]' },
  won: { card: 'bg-mint shadow-[inset_0_0_0_1px_rgba(61,242,154,.35)]', badge: 'bg-[#3DF29A]', label: 'GEWONNEN', sub: 'text-[#8BC7A8]', amount: 'text-[#3DF29A]' },
  lost: { card: 'bg-rose shadow-[inset_0_0_0_1px_rgba(255,94,108,.35)]', badge: 'bg-[#FF4D61]', label: 'VERLOREN', sub: 'text-[#D99AA4]', amount: 'text-[#FF5E6C]' },
  cashed_out: { card: 'bg-acc-lo', badge: 'bg-acc', label: 'CASH-OUT', sub: 'text-acc-hi', amount: 'text-acc' },
  void: { card: 'bg-card2', badge: 'bg-cmute', label: 'ERSTATTET', sub: 'text-cmute', amount: 'text-cmute' },
};

function BetCard({ bet }: { bet: Bet }) {
  useApp((s) => s.outcomes);           // Cash-Out-Wert bei Quotenänderung neu
  const value = backend.cashoutValue(bet);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const L = LOOK[bet.status];
  const open = bet.status === 'open';
  const net = bet.payout - bet.stake;
  async function doCashout() {
    if (value === null) return;
    const r = await backend.cashout(bet.id, value);
    if (r.ok) backend.toast(`Cash-Out: +${r.payout} Coins`, 'ok'); else setMsg(r.message);
    setConfirm(false);
  }
  return (
    <div className={`relative text-cink ${open ? '' : 'pt-2.5'}`}>
      {!open && <span className={`absolute left-1/2 top-0 z-[1] -translate-x-1/2 rounded-full px-3.5 py-1 text-[12px] font-extrabold tracking-wide text-black ${L.badge}`}>{L.label}</span>}
      <div className={`${L.card} ${open ? 'rounded-t-[26px]' : 'rounded-[26px] pt-5'} p-3.5`}>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-black/30 px-3 py-1.5 text-[12px] font-bold">
            {TYPE[bet.type]}{bet.type === 'system' ? ` ${bet.systemK} aus ${bet.selections.length}` : bet.selections.length > 1 ? ` · ${bet.selections.length} Tipps` : ''}
          </span>
          {!open && <span className={`font-num text-[26px] font-black ${L.amount}`}>{net > 0 ? '+' : net < 0 ? '−' : '±'}{fmtCoins(Math.abs(net))}</span>}
        </div>
        <div className="mt-3 space-y-2.5">
          {bet.selections.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {s.status === 'won' ? <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[#3DF29A] text-black">{Icon.check()}</span>
                : s.status === 'lost' ? <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[#FF4D61] text-black">{Icon.close('w-3 h-3')}</span>
                : s.status === 'void' ? <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[#5C6375]" />
                : <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-acc"><span className="h-2 w-2 rounded-full bg-acc" /></span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold">{s.label}</div>
                <div className={`truncate text-[12px] ${L.sub}`}>{s.marketName} · {s.eventName}</div>
              </div>
              <span className="font-num flex shrink-0 items-center gap-1 text-[16px] font-extrabold">{s.boosted && <span className="text-[#FF6B8A]">{Icon.boost('w-3 h-3')}</span>}{fmtOdds(s.price)}</span>
            </div>
          ))}
        </div>
        {!open && (
          <div className={`mt-3 text-[12px] ${L.sub}`}>
            Einsatz <b className="font-num">{fmtCoins(bet.stake)}</b>{bet.type !== 'system' && <> · Quote <b className="font-num">{fmtOdds(bet.totalOdds)}</b></>} · Auszahlung <b className="font-num">{fmtCoins(bet.payout)}</b>
          </div>
        )}
      </div>
      {open && (
        <div className="mt-1 rounded-b-[26px] bg-card2 py-2.5 pl-4 pr-2.5">
          <div className="flex items-center justify-between gap-2.5">
            <div className="text-[12px] leading-relaxed text-cmute">
              Einsatz <b className="font-num text-cink">{fmtCoins(bet.stake)}</b><br />
              Möglich <b className="font-num text-[15px] text-[#3DF29A]">{fmtCoins(bet.potentialPayout)}</b>
            </div>
            {value === null ? (
              <span className="flex h-[52px] items-center gap-1.5 rounded-full bg-lock px-4 text-[13px] font-semibold text-cmute">{Icon.lock()} Cash-Out gesperrt</span>
            ) : confirm ? (
              <div className="flex gap-1.5">
                <button onClick={() => setConfirm(false)} className="h-[52px] rounded-full bg-chip px-4 text-[13px] font-semibold">Nein</button>
                <button onClick={doCashout} className="h-[52px] rounded-full bg-[#3DF29A] px-4 text-[13px] font-extrabold text-white">Ja, <span className="font-num">{fmtCoins(value)}</span></button>
              </div>
            ) : (
              <button onClick={() => { setMsg(null); setConfirm(true); }} className="flex h-[52px] items-center gap-2 rounded-full bg-acc pl-[18px] pr-2 text-[14px] font-bold text-black">
                Cash-Out <span className="font-num rounded-full bg-black px-2.5 py-1 text-[15px] font-extrabold text-acc">{fmtCoins(value)}</span>
              </button>
            )}
          </div>
          {msg && <p className="mt-1.5 text-[12px] font-medium text-[#FF5E6C]">{msg}</p>}
        </div>
      )}
    </div>
  );
}

export function MyBets() {
  const loaded = useApp((s) => s.loaded);
  const bets = useApp((s) => s.bets);
  const [tab, setTab] = useState<'open' | 'settled'>('open');
  const list = bets.filter((b) => (tab === 'open') === (b.status === 'open'));
  return (
    <div className="px-[18px] pt-1">
      <h1 className="mb-3 text-[22px] font-bold tracking-tight">Meine Wetten</h1>
      <Segmented value={tab} onChange={setTab} items={[['open', `Offen · ${bets.filter((b) => b.status === 'open').length}`], ['settled', `Abgerechnet · ${bets.filter((b) => b.status !== 'open').length}`]]} />
      <div className="mt-4 space-y-4">
        {!loaded ? [0, 1].map((i) => <Skel key={i} className="h-40 !rounded-[26px]" />)
          : list.length ? list.map((b) => <BetCard key={b.id} bet={b} />)
          : <p className="py-10 text-center text-mute">{tab === 'open' ? 'Keine offenen Wetten. Tippe auf eine Quote!' : 'Noch nichts abgerechnet.'}</p>}
      </div>
      {tab === 'settled' && list.length > 0 && <p className="mt-3 text-[12px] text-mute">Wetten werden automatisch abgerechnet, sobald das Spiel beendet ist.</p>}
      <Disclaimer />
    </div>
  );
}

// ───────────────────────── Rangliste & Gruppen ─────────────────────────
export function Leaderboard() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [scope, setScope] = useState<string>('global');
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [created, setCreated] = useState<Group | null>(null);

  useEffect(() => { backend.listGroups().then(setGroups); }, []);
  useEffect(() => { setRows(null); backend.leaderboard(period, scope === 'global' ? undefined : scope).then(setRows); }, [period, scope]);

  async function create() {
    if (name.trim().length < 3) return backend.toast('Name: mindestens 3 Zeichen', 'err');
    const g = await backend.createGroup(name.trim());
    setGroups(await backend.listGroups()); setCreated(g); setName('');
  }
  async function join() {
    if (!code.trim()) return;
    const r = await backend.joinGroup(code.trim());
    if (r.ok) { backend.toast(`Beigetreten: ${r.name}`, 'ok'); setGroups(await backend.listGroups()); setCode(''); }
  }
  const link = (g: Group) => `${location.origin}/gruppe/${g.inviteCode}`;
  async function share(g: Group) {
    const text = `Tipp mit uns in „${g.name}“ auf TippArena – nur Spielgeld: ${link(g)}`;
    if (navigator.share) { try { await navigator.share({ title: 'TippArena', text }); return; } catch { /* abgebrochen */ } }
    try { await navigator.clipboard.writeText(link(g)); backend.toast('Einladungslink kopiert', 'ok'); } catch { backend.toast(link(g)); }
  }

  return (
    <div className="px-[18px] pt-1">
      <h1 className="mb-3 text-[22px] font-bold tracking-tight">Rangliste</h1>
      <nav aria-label="Ranglisten" className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {[{ id: 'global', name: 'Global' }, ...groups.map((g) => ({ id: g.id, name: g.name }))].map((g) => (
          <button key={g.id} onClick={() => setScope(g.id)} aria-pressed={scope === g.id}
            className={`h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold ${scope === g.id ? 'bg-ink font-bold text-bg' : 'border border-[#2A2E39] text-[#C9CDDA]'}`}>{g.name}</button>
        ))}
      </nav>

      <section className="overflow-hidden rounded-[28px] bg-card px-3.5 pt-3.5 text-ink">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-s1 p-1">
          {([['week', 'Woche'], ['month', 'Monat'], ['all', 'Gesamt']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} aria-pressed={period === k}
              className={`h-9 rounded-full text-[13px] font-semibold ${period === k ? 'bg-acc font-bold text-black shadow-neon' : 'text-mute'}`}>{l}</button>
          ))}
        </div>
        {!rows ? <div className="flex h-[210px] items-end gap-2 pt-4">{[0, 1, 2].map((i) => <Skel key={i} light className="flex-1 !rounded-b-none" />)}</div>
          : rows.length === 0 ? <p className="py-12 text-center text-[14px] font-medium">Noch keine abgerechneten Wetten in diesem Zeitraum.</p>
          : (
          <div className="mt-4 grid grid-cols-3 items-end gap-2 text-center">
            {[rows[1], rows[0], rows[2]].map((r, i) => {
              if (!r) return <div key={i} />;
              const first = r.rank === 1;
              return (
                <div key={r.username} className="min-w-0">
                  {first && <svg width="22" height="16" viewBox="0 0 24 16" aria-hidden="true" className="mx-auto mb-1"><path d="M2 14 4 3l5 5 3-7 3 7 5-5 2 11Z" fill="#C6FF00" /></svg>}
                  <span className={`font-num mx-auto grid place-items-center rounded-full font-black ${first ? 'h-14 w-14 bg-acc text-[18px] text-black shadow-neon' : 'h-12 w-12 bg-s3 text-[16px] text-ink'}`}>{r.username[0]?.toUpperCase()}</span>
                  <div className="mt-1.5 truncate text-[13px] font-bold">{r.isMe ? 'Du' : r.username}</div>
                  <div className="font-num text-[14px] font-extrabold text-acc">{r.profit >= 0 ? '+' : '−'}{fmtCoins(Math.abs(r.profit))}</div>
                  <div className={`font-wide mt-2 grid place-items-center rounded-t-2xl font-black ${first ? 'h-[92px] bg-acc text-[30px] text-black shadow-neonlg' : r.rank === 2 ? 'h-16 bg-s3 text-[26px]' : 'h-12 bg-s3 text-[22px]'}`}>{r.rank}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ol className="mt-3 space-y-1.5">
        {(rows ?? []).slice(3).map((r) => (
          <li key={r.username} className={`flex h-14 items-center gap-3 rounded-full px-4 ${r.isMe ? 'bg-ink text-bg' : 'bg-s1'}`}>
            <span className={`font-num w-6 font-extrabold ${r.isMe ? 'text-cmute' : 'text-mute'}`}>{r.rank}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{r.isMe ? 'Du' : r.username}</span>
              <span className={`block text-[11px] ${r.isMe ? 'text-cmute' : 'text-mute'}`}>{r.won}/{r.settled} gewonnen</span>
            </span>
            <span className={`font-num text-[15px] font-extrabold ${r.profit >= 0 ? (r.isMe ? 'text-[#3DF29A]' : 'text-[#7FE3B0]') : (r.isMe ? 'text-[#FF5E6C]' : 'text-down')}`}>{r.profit >= 0 ? '+' : '−'}{fmtCoins(Math.abs(r.profit))}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 px-1 text-[12px] text-mute">Gewertet: Auszahlungen minus Einsätze abgerechneter Wetten im Zeitraum.</p>

      <h2 className="mb-1 mt-7 text-[22px] font-bold tracking-tight">Tippgruppen</h2>
      <p className="mb-3 text-[14px] text-mute">Für Verein, Kneipe oder Freunde – mit eigener Rangliste.</p>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 rounded-[22px] bg-card py-2.5 pl-4 pr-2.5 text-cink">
            <div className="min-w-0"><div className="truncate text-[15px] font-bold">{g.name}</div><div className="text-[12px] text-cmute">{g.members} Mitglieder · Code <span className="font-num font-bold tracking-wider">{g.inviteCode}</span></div></div>
            <button onClick={() => share(g)} className="h-11 shrink-0 rounded-full bg-acc px-4 text-[13px] font-bold text-black">Einladen</button>
          </div>
        ))}
      </div>
      {created && (
        <div className="mt-3 rounded-[22px] bg-mint p-4 text-[13px] text-[#7FF0B8]">
          <b>„{created.name}“ ist angelegt.</b> Einladungslink: <span className="break-all font-semibold">{link(created)}</span>
        </div>
      )}
      <div className="mt-3 space-y-2">
        <div className="flex h-14 items-center gap-2 rounded-full bg-s1 pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-acc">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name der neuen Gruppe" maxLength={40} aria-label="Name der neuen Gruppe"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute" />
          <button onClick={create} className="h-11 shrink-0 rounded-full bg-acc px-5 text-[14px] font-bold text-black">Gründen</button>
        </div>
        <div className="flex h-14 items-center gap-2 rounded-full bg-s1 pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-acc">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Einladungscode" maxLength={8} aria-label="Einladungscode"
            className="font-num min-w-0 flex-1 bg-transparent text-[15px] uppercase tracking-widest outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-mute" />
          <button onClick={join} className="h-11 shrink-0 rounded-full bg-s3 px-5 text-[14px] font-bold">Beitreten</button>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

export function JoinGroup() {
  const { code } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    if (code) backend.joinGroup(code).then((r) => { backend.toast(`Beigetreten: ${r.name}`, 'ok'); nav('/rangliste'); });
  }, [code]);
  return <div className="p-6"><Skel className="h-24" /></div>;
}

// ───────────────────────── Profil ─────────────────────────
function LoginCard() {
  const [email, setEmail] = useState('');
  return (
      <div className="space-y-2.5 rounded-[28px] bg-card2 p-3 text-cink">
        <div className="flex h-14 items-center gap-2 rounded-full bg-chip pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-acc">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-Mail-Adresse"
            aria-label="E-Mail-Adresse" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-cmute" />
          <button onClick={() => email && backend.signInMagic(email)} className="h-11 shrink-0 rounded-full bg-acc px-4 text-[14px] font-bold text-black">Link senden</button>
        </div>
        <button onClick={() => backend.signInGoogle()} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-acc text-[15px] font-semibold text-black">
          <svg viewBox="0 0 48 48" className="h-4 w-4"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.5-9.5 6.5-16.1Z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46Z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.5.8 6.9 2.5 9.9l7.3-5.7Z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9Z"/></svg>
          Mit Google anmelden
        </button>
      </div>
  );
}

export function Profile() {
  const user = useApp((s) => s.user);
  const demo = useApp((s) => s.demo);
  const loaded = useApp((s) => s.loaded);
  const wallet = useApp((s) => s.wallet);
  const bets = useApp((s) => s.bets);
  const sports = useApp((s) => s.sports);
  const favs = useFavs();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { backend.stats().then(setStats); }, [bets]);
  const push = useApp((s) => s.pushPrefs);

  function togglePush(k: keyof typeof push) { backend.setPushPrefs({ ...push, [k]: !push[k] }); }


  if (backend.requiresLogin && !user) return (
    <div className="px-[18px] pt-4">
      <h1 className="font-wide text-[26px] font-black leading-none">WILLKOMMEN</h1>
      <p className="mt-1 mb-4 text-[14px] text-mute">{loaded ? 'Melde dich an und starte mit 1.000 Coins Spielgeld.' : '…'}</p>
      <LoginCard />
      <Disclaimer />
    </div>
  );

  return (
    <div className="px-[18px] pt-1">
      <div className="flex items-center gap-3">
        <div className="font-num grid h-14 w-14 place-items-center rounded-full bg-acc text-2xl font-black text-black">{user?.username[0] ?? '?'}</div>
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{user?.username ?? 'Gast'}</h1>
          <p className="text-[13px] text-mute">{user?.email}{demo && ' · Demo-Modus'}</p>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-[28px] bg-lav p-[18px] text-[#1A2000]">
        <div aria-hidden="true" className="absolute -bottom-16 -right-10 h-[190px] w-[190px] rounded-full bg-lav2" />
        <div className="relative text-[13px] font-semibold text-[#3D4D00]">Guthaben · Spielgeld</div>
        <div className="relative font-num text-[44px] font-black leading-none"><Coins value={wallet.balance} /> <span className="font-sans text-[15px] font-semibold text-[#3D4D00]">Coins</span></div>
        <div className="relative mt-4 flex gap-2">
          <button onClick={() => backend.claimDailyBonus()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#1A2000] text-[14px] font-bold text-white">{Icon.gift('w-4 h-4')} Bonus +100</button>
          <button onClick={() => backend.claimRefill()} disabled={wallet.balance > 0}
            className={`h-12 flex-1 rounded-full text-[14px] font-bold ${wallet.balance > 0 ? 'bg-black/15 text-[#3D4D00]' : 'bg-black text-acc'}`}>Auf 500 füllen</button>
        </div>
        <p className="relative mt-3 text-[12px] text-[#3D4D00]">Nachfüllen geht bei 0 Coins, höchstens 1× pro Woche. Coins kann man nicht kaufen.</p>
      </div>

      <h2 className="mb-3 mt-7 text-[22px] font-bold tracking-tight">Statistik</h2>
      <div className="grid grid-cols-2 gap-2">
        {!stats ? [0, 1, 2, 3].map((i) => <Skel key={i} className="h-[76px] !rounded-[22px]" />) : [
          ['Trefferquote', stats.hitRate === null ? '–' : `${String(stats.hitRate).replace('.', ',')} %`],
          ['Größter Gewinn', stats.biggestWin === null ? '–' : `+${fmtCoins(stats.biggestWin)}`],
          ['Lieblingsliga', stats.favoriteLeague ?? '–'],
          ['Bilanz gesamt', `${stats.profitTotal >= 0 ? '+' : ''}${fmtCoins(stats.profitTotal)}`],
          ['Wetten', String(stats.betsTotal)],
          ['Davon offen', String(stats.betsOpen)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[22px] border border-line bg-s1 p-3.5"><div className="text-[12px] text-mute">{k}</div><div className="font-num mt-1 truncate text-[20px] font-extrabold text-[#E2FF7A]">{v}</div></div>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Lieblings-Sportarten</h2>
      <div className="flex flex-wrap gap-2">
        {sports.map((s) => {
          const on = favs.sports.includes(s.key);
          return <button key={s.key} onClick={() => favStore.toggle('sports', s.key)}
            aria-pressed={on} className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold ${on ? 'bg-ink text-bg' : 'border border-[#2A2E39] text-[#C9CDDA]'}`}>
            {Icon.star(on, 'w-3.5 h-3.5')} {s.icon} {s.title}</button>;
        })}
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Benachrichtigungen</h2>
      <div className="divide-y divide-line rounded-[22px] border border-line bg-s1">
        {([['bet_won', 'Wette gewonnen'], ['event_start', 'Spiel beginnt (getippte Spiele)'], ['boost', 'Boost-Alarm']] as const).map(([k, l]) => (
          <label key={k} className="flex min-h-[56px] items-center justify-between px-4 text-[15px]">
            {l}
            <button onClick={() => togglePush(k)} role="switch" aria-checked={push[k]}
              className={`relative h-7 w-12 rounded-full transition ${push[k] ? 'bg-acc' : 'bg-s3'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${push[k] ? 'left-[24px]' : 'left-1'}`} />
            </button>
          </label>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Konto</h2>
      <div>
        <button onClick={() => backend.signOut()} className="h-12 w-full rounded-full border border-[#2A2E39] text-[14px] font-semibold text-[#C9CDDA]">Abmelden</button>
      </div>
      <Disclaimer />
    </div>
  );
}
