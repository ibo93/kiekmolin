// Mindestbestand-Vorschlag: aus dem echten Verbrauch, nie geraten.
import { describe, expect, it } from 'vitest';
import { mindestbestandVorschlag, verbrauchSchaetzen } from '../supabase/functions/_shared/logik/verbrauch.ts';

// Hähnchen, Kisten: jeden Morgen gescannt, 2 Kisten pro Tag weniger.
const tag = (d: number, menge: number) => ({ bereich_id: 'k', menge_einheiten: menge, zeitpunkt: `2026-09-${String(d).padStart(2, '0')}T08:00:00Z` });

describe('Mindestbestand-Vorschlag', () => {
  it('2 Kisten pro Tag × 3 Tage = 6 Kisten', () => {
    const v = verbrauchSchaetzen([tag(20, 14), tag(21, 12), tag(22, 10), tag(23, 8), tag(24, 6)]);
    expect(mindestbestandVorschlag(v)).toEqual({ menge: 6, pro_tag: 2, tage: 4 });
  });
  it('krumme Verbräuche werden auf ganze Kisten AUFgerundet', () => {
    const v = verbrauchSchaetzen([tag(10, 20), tag(15, 15), tag(20, 9)]); // 11 in 10 Tagen = 1,1/Tag
    expect(mindestbestandVorschlag(v)?.menge).toBe(4); // 3,3 → 4, nicht 3: lieber eine Kiste zu viel als leer
  });
  it('Lieferung dazwischen zählt nicht als Verbrauch', () => {
    const v = verbrauchSchaetzen([tag(20, 6), tag(21, 4), tag(22, 14), tag(23, 12), tag(24, 10)]);
    // +10 am 22. ist die Lieferung und kein Minus-Verbrauch. Gezählt: 2 + 0 + 2 + 2 = 6 in 4 Tagen
    // = 1,5/Tag → 4,5 → 5. (Den Verbrauch am Liefertag sieht niemand – lieber etwas knapp als erfunden.)
    expect(mindestbestandVorschlag(v)?.menge).toBe(5);
  });
  it('Weggeworfenes ist kein Verbrauch', () => {
    const v = verbrauchSchaetzen([tag(20, 14), tag(21, 12), tag(22, 10), tag(23, 8), tag(24, 6)],
      [{ menge_einheiten: 2, zeitpunkt: '2026-09-22T20:00:00Z' }]);
    // 22.→23.: 2 weniger, davon 2 weggeworfen → 0 verbraucht. Summe 2+2+0+2 = 6 → 1,5/Tag → 5 (ohne Abzug: 6)
    expect(mindestbestandVorschlag(v)?.menge).toBe(5);
  });
  it('zu wenig Verlauf: KEIN Vorschlag statt einer geratenen Zahl', () => {
    expect(mindestbestandVorschlag(verbrauchSchaetzen([tag(23, 10), tag(24, 8)]))).toBeNull();
    expect(mindestbestandVorschlag(verbrauchSchaetzen([]))).toBeNull();
  });
  it('nichts verbraucht: kein Vorschlag von 0', () => {
    expect(mindestbestandVorschlag(verbrauchSchaetzen([tag(20, 5), tag(22, 5), tag(24, 5)]))).toBeNull();
  });
});
