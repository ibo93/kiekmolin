// Offline im Kühlhaus: Was man zum Scannen braucht, muss ohne Netz da sein.
// Und nur ohne Netz – ein echter Fehler (z. B. RLS) darf nicht still von
// altem Speicher überdeckt werden (CLAUDE.md, Regel 6).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const speicher = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k),
});
const netz = { onLine: true };
vi.stubGlobal('navigator', netz);

const { mitSpeicher } = await import('../src/daten/supabase.ts');

describe('Offline-Rückfall', () => {
  beforeEach(() => { speicher.clear(); netz.onLine = true; });

  it('online: frische Daten, und sie werden gemerkt', async () => {
    expect(await mitSpeicher('bereiche', async () => ['Kühlhaus'])).toEqual(['Kühlhaus']);
    expect(speicher.get('thechef-offline:bereiche')).toBe('["Kühlhaus"]');
  });
  it('ohne Netz: der letzte Stand statt einer leeren Startseite', async () => {
    await mitSpeicher('bereiche', async () => ['Kühlhaus', 'Tiefkühler']);
    netz.onLine = false;
    const r = await mitSpeicher('bereiche', async () => { throw new Error('Bereiche: TypeError: Failed to fetch'); });
    expect(r).toEqual(['Kühlhaus', 'Tiefkühler']);
  });
  it('Safari meldet "Load failed" – auch das zählt als kein Netz', async () => {
    await mitSpeicher('x', async () => 1);
    const r = await mitSpeicher('x', async () => { throw new Error('TypeError: Load failed'); });
    expect(r).toBe(1);
  });
  it('ein echter Fehler bei Netz wird NICHT von altem Speicher verdeckt', async () => {
    await mitSpeicher('bereiche', async () => ['alt']);
    await expect(mitSpeicher('bereiche', async () => { throw new Error('permission denied for table bereiche'); })).rejects.toThrow('permission denied');
  });
  it('ohne Netz und ohne Speicher: Fehler, keine erfundene leere Liste', async () => {
    netz.onLine = false;
    await expect(mitSpeicher('neu', async () => { throw new Error('Failed to fetch'); })).rejects.toThrow('Failed to fetch');
  });
});

// Weggeworfen ohne Netz: die Warteschlange darf nichts verlieren, nichts doppelt
// zählen und einen echten Fehler weder endlos wiederholen noch still wegwerfen.
const { wegAbgleichen } = await import('../src/lib/abgleich.ts');
type W = { lokal_id: string; produkt_id: string; menge: number; zeitpunkt: string; fehler?: string };
function speicherMit(liste: W[]) {
  const s = new Map(liste.map((w) => [w.lokal_id, { ...w }]));
  return {
    s,
    alle: async () => [...s.values()],
    entfernen: async (id: string) => void s.delete(id),
    markieren: async (id: string, fehler: string) => void s.set(id, { ...s.get(id)!, fehler }),
  };
}
const w1: W = { lokal_id: 'a', produkt_id: 'p1', menge: 2, zeitpunkt: '2026-09-28T06:10:00Z' };
const w2: W = { lokal_id: 'b', produkt_id: 'p2', menge: 1, zeitpunkt: '2026-09-28T06:11:00Z' };

describe('Weggeworfen-Warteschlange', () => {
  beforeEach(() => { netz.onLine = true; });

  it('Netz da: hochgeladen – mit eigener Kennung und dem Zeitpunkt vom Handy – und aus der Schlange', async () => {
    const sp = speicherMit([w1]);
    const gesendet: unknown[] = [];
    await wegAbgleichen({ wegwerfen: async (...a) => void gesendet.push(a) }, sp);
    expect(gesendet).toEqual([['p1', 2, { lokal_id: 'a', zeitpunkt: '2026-09-28T06:10:00Z' }]]);
    expect(sp.s.size).toBe(0);
  });
  it('kein Netz: alles bleibt liegen, ohne Fehlertext', async () => {
    const sp = speicherMit([w1, w2]);
    await wegAbgleichen({ wegwerfen: async () => { throw new Error('TypeError: Load failed'); } }, sp);
    expect([...sp.s.values()]).toEqual([w1, w2]);
  });
  it('echter Fehler: bleibt MIT Fehlertext liegen, die nächste Meldung geht trotzdem raus', async () => {
    const sp = speicherMit([w1, w2]);
    await wegAbgleichen({ wegwerfen: async (pid) => { if (pid === 'p1') throw new Error('Weggeworfen: permission denied'); } }, sp);
    expect(sp.s.get('a')?.fehler).toBe('Weggeworfen: permission denied');
    expect(sp.s.has('b')).toBe(false);
  });
  it('markierte Meldung wird nicht endlos wiederholt', async () => {
    const sp = speicherMit([{ ...w1, fehler: 'x' }]);
    let aufrufe = 0;
    await wegAbgleichen({ wegwerfen: async () => { aufrufe++; } }, sp);
    expect(aufrufe).toBe(0);
    expect(sp.s.size).toBe(1);
  });
});
