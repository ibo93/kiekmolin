import { useSyncExternalStore } from 'react';
import { DemoBackend, type State } from './demo';
import type { SlipItem } from './types';

// Später: SupabaseBackend mit derselben Oberfläche, gewählt über VITE_SUPABASE_URL.
export const backend = new DemoBackend();

export function useApp<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(backend.subscribe, () => sel(backend.getState()));
}

// ───── Wettschein & Favoriten (nur auf dem Gerät) ─────
type SlipState = { items: SlipItem[]; open: boolean };
let slip: SlipState = { items: [], open: false };
const slipL = new Set<() => void>();
const emit = () => slipL.forEach((l) => l());

export const slipStore = {
  subscribe: (l: () => void) => { slipL.add(l); return () => slipL.delete(l); },
  get: () => slip,
  toggle(item: SlipItem) {
    const has = slip.items.some((i) => i.outcomeId === item.outcomeId);
    // Pro Markt nur ein Tipp: anderen Ausgang desselben Markts ersetzen
    const s = backend.getState();
    const mkt = s.outcomes[item.outcomeId]?.marketId;
    const rest = slip.items.filter((i) => i.outcomeId !== item.outcomeId && s.outcomes[i.outcomeId]?.marketId !== mkt);
    slip = { ...slip, items: has ? rest : [...rest, item] };
    emit();
  },
  remove(id: string) { slip = { ...slip, items: slip.items.filter((i) => i.outcomeId !== id) }; emit(); },
  clear() { slip = { ...slip, items: [] }; emit(); },
  setOpen(open: boolean) { slip = { ...slip, open }; emit(); },
  acceptPrices(changes: { outcomeId: string; newPrice: number }[]) {
    slip = { ...slip, items: slip.items.map((i) => {
      const c = changes.find((x) => x.outcomeId === i.outcomeId);
      return c ? { ...i, price: c.newPrice } : i;
    }) };
    emit();
  },
};
export function useSlip<T>(sel: (s: SlipState) => T): T {
  return useSyncExternalStore(slipStore.subscribe, () => sel(slip));
}

const FAV_KEY = 'tipparena.favs';
type Favs = { sports: string[]; leagues: string[] };
let favs: Favs = (() => {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '') as Favs; } catch { return { sports: ['soccer'], leagues: ['soccer_germany_bundesliga'] }; }
})();
const favL = new Set<() => void>();
export const favStore = {
  subscribe: (l: () => void) => { favL.add(l); return () => favL.delete(l); },
  get: () => favs,
  toggle(kind: 'sports' | 'leagues', key: string) {
    const list = favs[kind].includes(key) ? favs[kind].filter((k) => k !== key) : [...favs[kind], key];
    favs = { ...favs, [kind]: list };
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch { /* privater Modus */ }
    favL.forEach((l) => l());
  },
};
export function useFavs() { return useSyncExternalStore(favStore.subscribe, favStore.get); }
