// Die Push-Nachricht des Abend-Briefings bestand nur aus „1 · 2 · 3“ – auf dem
// Sperrbildschirm stand nichts, was der Chef lesen konnte (briefing.ts).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { briefingPushText } from '../supabase/functions/_shared/texte.ts';
import type { BriefingPunkt } from '../supabase/functions/_shared/logik/typen.ts';

const namen: Record<string, string> = { h: 'Hähnchenbrust', j: 'Joghurt' };
const n = (id: string) => namen[id];

describe('Briefing-Push', () => {
  it('nennt die drei Punkte mit Produkt', () => {
    const p: BriefingPunkt[] = [
      { art: 'laeuft_ab', produkt_id: 'j', tage: 1, menge: 18 },
      { art: 'knapp', produkt_id: 'h', fehlt: 25, menge: 12 },
      { art: 'einkauf', anzahl: 6 },
    ];
    expect(briefingPushText(p, 'de', n)).toBe('1. Joghurt läuft morgen ab · 2. Hähnchenbrust wird knapp · 3. Einkauf: 6 Artikel');
  });
  it('Abgelaufenes heißt abgelaufen, nicht „läuft heute ab“', () => {
    expect(briefingPushText([{ art: 'laeuft_ab', produkt_id: 'j', tage: -2, menge: 1 }], 'de', n)).toBe('1. Joghurt ist abgelaufen');
  });
  it('nichts zu tun: ein Satz statt leerer Nachricht', () => {
    expect(briefingPushText([{ art: 'nichts_laeuft_ab' }, { art: 'alles_da' }, { art: 'einkauf', anzahl: 0 }], 'de', n)).toBe('Alles in Ordnung');
  });
  it('in jeder Sprache ohne übrig gebliebene Platzhalter', () => {
    const p: BriefingPunkt[] = [{ art: 'laeuft_ab', produkt_id: 'j', tage: 3, menge: 1 }, { art: 'knapp', produkt_id: 'h', fehlt: 1, menge: 0 }, { art: 'einkauf', anzahl: 2 }];
    for (const s of ['de', 'tr', 'ku', 'ar', 'en'] as const) {
      const t = briefingPushText(p, s, n);
      expect(t, s).not.toMatch(/[{}]/);
      expect(t, s).toContain('Joghurt');
      expect(t, s).toContain('2');
    }
  });
  it('briefing.ts benutzt es (kein fester Text mehr)', () => {
    const src = readFileSync(new URL('../supabase/functions/_shared/briefing.ts', import.meta.url), 'utf8');
    expect(src).toContain('briefingPushText(punkte');
    expect(src).not.toContain('1 · 2 · 3');
  });
});
