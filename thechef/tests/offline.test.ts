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
