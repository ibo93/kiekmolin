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
    <div className="pt-3">
      <h1 className="px-4 text-2xl font-extrabold flex items-center gap-2">Live <span className="h-2.5 w-2.5 rounded-full bg-down animate-pulseDot" /></h1>
      <p className="px-4 mb-3 text-[13px] text-mute">Quoten in Echtzeit · grün = steigt, rot = fällt, Schloss = ausgesetzt</p>
      <SportBar value={sport} onChange={setSport} />
      <div className="mt-3 space-y-3 px-4">
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
const STATUS: Record<Bet['status'], [string, string]> = {
  open: ['Offen', 'bg-s3 text-ink'], won: ['Gewonnen', 'bg-up/15 text-up'], lost: ['Verloren', 'bg-down/15 text-down'],
  void: ['Erstattet', 'bg-s3 text-mute'], cashed_out: ['Ausgezahlt', 'bg-acc-lo text-acc-hi'],
};

function BetCard({ bet }: { bet: Bet }) {
  useApp((s) => s.outcomes);           // Cash-Out-Wert bei Quotenänderung neu
  const value = backend.cashoutValue(bet);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [st, cls] = STATUS[bet.status];
  async function doCashout() {
    if (value === null) return;
    const r = await backend.cashout(bet.id, value);
    if (r.ok) backend.toast(`Cash-Out: +${r.payout} Coins`, 'ok'); else setMsg(r.message);
    setConfirm(false);
  }
  return (
    <div className="rounded-2xl bg-s1 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold">{TYPE[bet.type]}{bet.type === 'system' ? ` ${bet.systemK} aus ${bet.selections.length}` : bet.selections.length > 1 ? ` · ${bet.selections.length} Tipps` : ''}</span>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${cls}`}>{st}</span>
      </div>
      <div className="mt-2 space-y-2">
        {bet.selections.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.status === 'won' ? 'bg-up' : s.status === 'lost' ? 'bg-down' : s.status === 'void' ? 'bg-mute' : 'bg-acc'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-[13px] font-semibold"><span className="truncate">{s.label}</span>
                <span className="tabular-nums flex items-center gap-1">{s.boosted && <span className="text-boost">{Icon.boost('w-3 h-3')}</span>}{fmtOdds(s.price)}</span></div>
              <div className="text-[12px] text-mute truncate">{s.marketName} · {s.eventName}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-line pt-2 text-[12px]">
        <div className="text-mute">Einsatz <Coins value={bet.stake} className="text-ink font-semibold" />{bet.type !== 'system' && <> · Quote <b className="text-ink">{fmtOdds(bet.totalOdds)}</b></>}</div>
        <div className="text-right">
          <div className="text-mute">{bet.status === 'open' ? 'Möglicher Gewinn' : 'Auszahlung'}</div>
          <Coins value={bet.status === 'open' ? bet.potentialPayout : bet.payout} className={`text-[15px] font-extrabold ${bet.payout > 0 || bet.status === 'open' ? 'text-up' : 'text-mute'}`} />
        </div>
      </div>
      {bet.status === 'open' && (
        <div className="mt-2">
          {value === null ? (
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-s2 py-2.5 text-[13px] text-mute">{Icon.lock()} Cash-Out gerade nicht verfügbar</div>
          ) : confirm ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl bg-s2 py-2.5 text-[13px] font-semibold">Abbrechen</button>
              <button onClick={doCashout} className="flex-[2] rounded-xl bg-up py-2.5 text-[13px] font-extrabold text-bg">Bestätigen · {fmtCoins(value)}</button>
            </div>
          ) : (
            <button onClick={() => { setMsg(null); setConfirm(true); }} className="w-full rounded-xl border border-up/40 bg-up/10 py-2.5 text-[13px] font-extrabold text-up">
              Cash-Out {fmtCoins(value)} Coins
            </button>
          )}
          {msg && <p className="mt-1 text-[12px] text-down">{msg}</p>}
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
    <div className="px-4 pt-3">
      <h1 className="text-2xl font-extrabold mb-3">Meine Wetten</h1>
      <Segmented value={tab} onChange={setTab} items={[['open', `Offen (${bets.filter((b) => b.status === 'open').length})`], ['settled', 'Abgerechnet']]} />
      <div className="mt-3 space-y-3">
        {!loaded ? [0, 1].map((i) => <Skel key={i} className="h-40" />)
          : list.length ? list.map((b) => <BetCard key={b.id} bet={b} />)
          : <p className="py-10 text-center text-mute">{tab === 'open' ? 'Keine offenen Wetten. Tippe auf eine Quote!' : 'Noch nichts abgerechnet.'}</p>}
      </div>
      {tab === 'settled' && list.length > 0 && <p className="mt-3 text-[11px] text-mute">Wetten werden automatisch abgerechnet, sobald das Spiel beendet ist.</p>}
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
    <div className="px-4 pt-3">
      <h1 className="text-2xl font-extrabold mb-3">Rangliste</h1>
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
        {[{ id: 'global', name: '🌍 Global' }, ...groups.map((g) => ({ id: g.id, name: g.name }))].map((g) => (
          <button key={g.id} onClick={() => setScope(g.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${scope === g.id ? 'bg-ink text-bg' : 'bg-s1 text-mute'}`}>{g.name}</button>
        ))}
      </div>
      <Segmented value={period} onChange={setPeriod} items={[['week', 'Woche'], ['month', 'Monat'], ['all', 'Gesamt']]} />

      <div className="mt-3 overflow-hidden rounded-2xl bg-s1">
        {!rows ? <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skel key={i} className="h-10" />)}</div>
          : rows.map((r) => (
          <div key={r.username} className={`flex items-center gap-3 px-4 py-2.5 ${r.isMe ? 'bg-acc-lo/70' : ''} ${r.rank <= 3 ? '' : 'border-t border-line/60'}`}>
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-extrabold ${r.rank === 1 ? 'bg-amber-300 text-bg' : r.rank === 2 ? 'bg-slate-300 text-bg' : r.rank === 3 ? 'bg-orange-400 text-bg' : 'text-mute'}`}>{r.rank}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold truncate">{r.username}{r.isMe && <span className="ml-1 text-acc-hi">(du)</span>}</div>
              <div className="text-[11px] text-mute">{r.won}/{r.settled} Wetten gewonnen</div>
            </div>
            <span className={`text-[14px] font-bold tabular-nums ${r.profit >= 0 ? 'text-up' : 'text-down'}`}>{r.profit >= 0 ? '+' : ''}{fmtCoins(r.profit)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-mute">Gewertet: Gewinn = Auszahlungen minus Einsätze abgerechneter Wetten im Zeitraum.</p>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Tippgruppen</h2>
      <p className="mb-3 text-[13px] text-mute">Für Verein, Kneipe oder Freunde – mit eigener Rangliste.</p>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-2xl bg-s1 px-4 py-3">
            <div><div className="text-[14px] font-semibold">{g.name}</div><div className="text-[12px] text-mute">{g.members} Mitglieder · Code {g.inviteCode}</div></div>
            <button onClick={() => share(g)} className="rounded-lg bg-s3 px-3 py-1.5 text-[13px] font-semibold">Einladen</button>
          </div>
        ))}
      </div>
      {created && (
        <div className="mt-3 rounded-2xl border border-up/30 bg-up/10 p-3 text-[13px]">
          <b>„{created.name}“ ist angelegt.</b> Einladungslink: <span className="break-all text-up">{link(created)}</span>
        </div>
      )}
      <div className="mt-3 grid gap-2">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name der neuen Gruppe" maxLength={40}
            className="flex-1 rounded-xl bg-s1 px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-acc" />
          <button onClick={create} className="rounded-xl bg-acc px-4 font-bold text-white">Gründen</button>
        </div>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Einladungscode" maxLength={8}
            className="flex-1 rounded-xl bg-s1 px-3 py-2.5 text-[14px] uppercase tracking-widest outline-none focus:ring-1 focus:ring-acc" />
          <button onClick={join} className="rounded-xl bg-s3 px-4 font-bold">Beitreten</button>
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
      <div className="rounded-2xl bg-s1 p-4 space-y-3">
        <div className="flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-Mail-Adresse"
            className="flex-1 rounded-xl bg-s2 px-3 py-2.5 text-[14px] outline-none focus:ring-1 focus:ring-acc" />
          <button onClick={() => email && backend.signInMagic(email)} className="rounded-xl bg-acc px-3 text-[13px] font-bold text-white">Magic Link</button>
        </div>
        <button onClick={() => backend.signInGoogle()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[14px] font-semibold text-[#1f1f1f]">
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
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-extrabold">Willkommen bei TippArena</h1>
      <p className="mt-1 mb-4 text-[14px] text-mute">{loaded ? 'Melde dich an und starte mit 1.000 Coins Spielgeld.' : '…'}</p>
      <LoginCard />
      <Disclaimer />
    </div>
  );

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-acc text-2xl font-extrabold text-white">{user?.username[0] ?? '?'}</div>
        <div>
          <h1 className="text-xl font-extrabold">{user?.username ?? 'Gast'}</h1>
          <p className="text-[13px] text-mute">{user?.email}{demo && ' · Demo-Modus'}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-acc-lo to-s1 p-4">
        <div className="text-[12px] text-mute">Guthaben (Spielgeld)</div>
        <Coins value={wallet.balance} className="text-3xl font-extrabold" />
        <div className="mt-3 flex gap-2">
          <button onClick={() => backend.claimDailyBonus()} className="flex-1 rounded-xl bg-white/10 py-2 text-[13px] font-semibold">Tagesbonus +100</button>
          <button onClick={() => backend.claimRefill()} disabled={wallet.balance > 0}
            className={`flex-1 rounded-xl py-2 text-[13px] font-semibold ${wallet.balance > 0 ? 'bg-white/5 text-mute' : 'bg-acc text-white'}`}>Auf 500 nachfüllen</button>
        </div>
        <p className="mt-2 text-[11px] text-mute">Nachfüllen geht bei 0 Coins, höchstens 1× pro Woche. Coins kann man nicht kaufen.</p>
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Statistik</h2>
      <div className="grid grid-cols-2 gap-2">
        {!stats ? [0, 1, 2, 3].map((i) => <Skel key={i} className="h-16" />) : [
          ['Trefferquote', stats.hitRate === null ? '–' : `${String(stats.hitRate).replace('.', ',')} %`],
          ['Größter Gewinn', stats.biggestWin === null ? '–' : `+${fmtCoins(stats.biggestWin)}`],
          ['Lieblingsliga', stats.favoriteLeague ?? '–'],
          ['Bilanz gesamt', `${stats.profitTotal >= 0 ? '+' : ''}${fmtCoins(stats.profitTotal)}`],
          ['Wetten', String(stats.betsTotal)],
          ['Davon offen', String(stats.betsOpen)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-s1 p-3"><div className="text-[12px] text-mute">{k}</div><div className="mt-0.5 text-[17px] font-extrabold truncate">{v}</div></div>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Lieblings-Sportarten</h2>
      <div className="flex flex-wrap gap-2">
        {sports.map((s) => {
          const on = favs.sports.includes(s.key);
          return <button key={s.key} onClick={() => favStore.toggle('sports', s.key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${on ? 'bg-amber-300/15 text-amber-300 ring-1 ring-amber-300/40' : 'bg-s1 text-mute'}`}>
            {Icon.star(on, 'w-3.5 h-3.5')} {s.icon} {s.title}</button>;
        })}
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Benachrichtigungen</h2>
      <div className="divide-y divide-line rounded-2xl bg-s1">
        {([['bet_won', 'Wette gewonnen'], ['event_start', 'Spiel beginnt (getippte Spiele)'], ['boost', 'Boost-Alarm']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center justify-between px-4 py-3 text-[14px]">
            {l}
            <button onClick={() => togglePush(k)} role="switch" aria-checked={push[k]}
              className={`relative h-6 w-11 rounded-full transition ${push[k] ? 'bg-acc' : 'bg-s3'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${push[k] ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-[17px] font-bold">Konto</h2>
      <div className="rounded-2xl bg-s1 p-4 space-y-3">
        <button onClick={() => backend.signOut()} className="w-full py-1 text-[13px] text-mute">Abmelden</button>
      </div>
      <Disclaimer />
    </div>
  );
}
