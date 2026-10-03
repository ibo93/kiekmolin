import { describe, it, expect } from 'vitest';
import {
  produktStaende, ampelZaehlen, warenwert, einkaufsliste, hinweiseBerechnen, briefingPunkte,
  anzeigeMenge, fehlendeBereiche, tagIn, laeuftBaldAb,
} from '../supabase/functions/_shared/logik/lager.ts';
import { verbrauchSchaetzen, bedarf } from '../supabase/functions/_shared/logik/verbrauch.ts';
import type { BestandZeile, Produkt } from '../supabase/functions/_shared/logik/typen.ts';

const HEUTE = '2026-09-27';
function produkt(id: string, x: Partial<Produkt> = {}): Produkt {
  return {
    id, betrieb_id: 'b', namen: { de: id }, namen_bestaetigt: ['de'], kategorie: 'sonstiges', zaehleinheit: 'stueck',
    menge_pro_einheit: null, basiseinheit: 'stueck', referenzfoto_pfad: null, mindestbestand: 0,
    standard_haltbarkeit_tage: null, preis_pro_einheit: null, bereich_ids: [], aktiv: true, ...x,
  };
}
function zeile(produkt_id: string, menge: number, mhd: string | null = null, bereich_id = 'kuehl'): BestandZeile {
  return {
    produkt_id, bereich_id, menge_einheiten: menge, mhd, mhd_quelle: mhd ? 'etikett' : null, zeitpunkt: '2026-09-27T20:04:00Z',
    chargen: menge ? [{ menge, eingang: '2026-09-25', mhd, quelle: mhd ? 'etikett' : null }] : [],
  };
}

// Die Zahlen aus den Mockups (Bestand.dc.html, Einkauf.dc.html)
const haehnchen = produkt('haehnchen', { zaehleinheit: 'kiste', basiseinheit: 'kg', menge_pro_einheit: 5, mindestbestand: 5, preis_pro_einheit: 35 });
const joghurt = produkt('joghurt', { zaehleinheit: 'becher', mindestbestand: 20, preis_pro_einheit: 1.2 });
const tomaten = produkt('tomaten', { zaehleinheit: 'kiste', mindestbestand: 6, preis_pro_einheit: 12 });
const salat = produkt('salat', { zaehleinheit: 'kiste', mindestbestand: 4 });
const brot = produkt('brot', { mindestbestand: 40 });
const produkte = [haehnchen, joghurt, tomaten, salat, brot];
const bestand = [
  zeile('haehnchen', 2.4, '2026-09-29'), // 12 kg, 2 Tage
  zeile('joghurt', 18, '2026-09-27'),     // heute
  zeile('tomaten', 4),
  zeile('salat', 1, '2026-09-30'),
  zeile('brot', 60, null, 'trocken'),
];
const s = produktStaende(produkte, bestand, HEUTE);
const nach = (id: string) => s.find((x) => x.produkt.id === id)!;

describe('Ampel', () => {
  it('Joghurt läuft heute ab → Sofort', () => expect(nach('joghurt').ampel).toBe('sofort'));
  it('Hähnchen in 2 Tagen und unter Mindestbestand → knapp', () => expect(nach('haehnchen').ampel).toBe('knapp'));
  it('Brot über Mindestbestand, kein MHD → gut', () => expect(nach('brot').ampel).toBe('gut'));
  it('Leer, aber Mindestbestand gesetzt → Sofort (nicht still "gut")', () => {
    const leer = produktStaende([produkt('x', { mindestbestand: 3 })], [], HEUTE)[0];
    expect(leer.ampel).toBe('sofort');
  });
  it('Zählung stimmt', () => expect(ampelZaehlen(s)).toEqual({ gut: 1, knapp: 3, sofort: 1 }));
});

describe('Einheiten', () => {
  it('Hähnchen: 2,4 Kisten à 5 kg = 12 kg', () => expect(anzeigeMenge(haehnchen, 2.4)).toEqual({ zahl: 12, einheit: 'kg', basis: true }));
  it('Tomaten bleiben Kisten', () => expect(anzeigeMenge(tomaten, 4)).toEqual({ zahl: 4, einheit: 'kiste', basis: false }));
});

describe('Warenwert', () => {
  it('zählt nur Produkte mit Preis – und sagt, wie viele keinen haben', () => {
    const w = warenwert(s);
    expect(w.eur).toBe(2.4 * 35 + 18 * 1.2 + 4 * 12);
    expect(w.produkte_ohne_preis).toBe(2);
  });
});

describe('Einkaufsliste', () => {
  const liste = einkaufsliste(s, []);
  const z = (id: string) => liste.find((e) => e.produkt.id === id);
  it('Joghurt: läuft heute ab, zählt nicht als da → alle 20', () => {
    expect(z('joghurt')?.menge).toBe(20);
    expect(z('joghurt')?.laeuft_ab).toBe(true);
  });
  it('Tomaten: 4 da, 6 mindestens → +2', () => expect(z('tomaten')?.menge).toBe(2));
  it('Salat: 1 da, 4 mindestens → +3', () => expect(z('salat')?.menge).toBe(3));
  it('Brot steht nicht drauf', () => expect(z('brot')).toBeUndefined());
  it('Halbe Kisten werden aufgerundet', () => {
    const p = produkt('p', { zaehleinheit: 'kiste', mindestbestand: 3 });
    expect(einkaufsliste(produktStaende([p], [zeile('p', 1.5)], HEUTE), [])[0].menge).toBe(2);
  });
  it('Vom Assistenten dazugelegt kommt obendrauf', () => {
    const l = einkaufsliste(s, [{ datum: HEUTE, produkt_id: 'brot', menge_extra: 10, abgehakt: false, quelle: 'assistent' }]);
    expect(l.find((e) => e.produkt.id === 'brot')?.menge).toBe(10);
  });
});

describe('Hinweise', () => {
  const h = hinweiseBerechnen(s);
  it('höchstens 5, wichtigste zuerst', () => {
    expect(h.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < h.length; i++) expect(h[i - 1].prioritaet).toBeGreaterThanOrEqual(h[i].prioritaet);
  });
  it('Joghurt (heute) steht ganz oben', () => expect(h[0]).toMatchObject({ art: 'laeuft_ab', daten: { produkt_id: 'joghurt', tage: 0 } }));
  it('jeder Hinweis hat eine Aktion', () => h.forEach((x) => expect(x.aktion).not.toBeNull()));
});

describe('Briefing', () => {
  it('genau 3 Punkte', () => {
    const p = briefingPunkte(s, einkaufsliste(s, []));
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ art: 'laeuft_ab', produkt_id: 'joghurt' });
    expect(p[2]).toMatchObject({ art: 'einkauf', anzahl: 4 });
  });
  it('auch wenn alles gut ist: 3 Punkte', () => {
    const ok = produktStaende([produkt('a')], [zeile('a', 3)], HEUTE);
    expect(briefingPunkte(ok, [])).toEqual([{ art: 'nichts_laeuft_ab' }, { art: 'alles_da' }, { art: 'einkauf', anzahl: 0 }]);
  });
  it('läuft bald ab sortiert nach Tagen', () => expect(laeuftBaldAb(s).map((x) => x.produkt.id)).toEqual(['joghurt', 'haehnchen', 'salat']));
});

describe('Tag im Betrieb', () => {
  it('23:30 in Berlin ist noch heute, obwohl UTC schon …', () => {
    expect(tagIn('Europe/Berlin', new Date('2026-09-27T21:30:00Z'))).toBe('2026-09-27');
    expect(tagIn('Europe/Berlin', new Date('2026-09-27T22:30:00Z'))).toBe('2026-09-28');
  });
  it('fehlende Bereiche: nur heute bestätigte zählen', () => {
    const f = fehlendeBereiche(['a', 'b', 'c'], [
      { bereich_id: 'a', status: 'bestaetigt', bestaetigt_am: '2026-09-27T06:12:00Z' },
      { bereich_id: 'b', status: 'bestaetigt', bestaetigt_am: '2026-09-26T20:00:00Z' },
      { bereich_id: 'c', status: 'erkannt', bestaetigt_am: null },
    ], 'Europe/Berlin', '2026-09-27');
    expect(f).toEqual(['b', 'c']);
  });
});

describe('Verbrauch', () => {
  const tag = (d: number, h = 22) => new Date(Date.UTC(2026, 8, d, h)).toISOString();
  it('zu wenig Daten → keine Zahl (nicht raten)', () => {
    const v = verbrauchSchaetzen([{ bereich_id: 'k', menge_einheiten: 5, zeitpunkt: tag(20) }, { bereich_id: 'k', menge_einheiten: 3, zeitpunkt: tag(21) }]);
    expect(v.zuverlaessig).toBe(false);
    expect(bedarf(v, [5, 6])).toEqual({ menge: null, grundlage: 'keine' });
  });
  it('Lieferung zählt nicht als Verbrauch; 2 pro Tag', () => {
    const v = verbrauchSchaetzen([
      { bereich_id: 'k', menge_einheiten: 10, zeitpunkt: tag(20) },
      { bereich_id: 'k', menge_einheiten: 8, zeitpunkt: tag(21) },
      { bereich_id: 'k', menge_einheiten: 6, zeitpunkt: tag(22) },
      { bereich_id: 'k', menge_einheiten: 14, zeitpunkt: tag(23) }, // Lieferung +10, Verbrauch 2
      { bereich_id: 'k', menge_einheiten: 12, zeitpunkt: tag(24) },
    ]);
    // 2+2+0+2 = 6 in 4 Tagen → wäre 1,5; die Lieferung verdeckt einen Verbrauch – genau deshalb "Schätzung"
    expect(v.pro_tag).toBe(1.5);
    expect(v.zuverlaessig).toBe(true);
    expect(bedarf(v, [5, 6])).toEqual({ menge: 3, grundlage: 'durchschnitt' });
  });
  it('Weggeworfenes ist kein Verbrauch', () => {
    const v = verbrauchSchaetzen([
      { bereich_id: 'k', menge_einheiten: 10, zeitpunkt: tag(20) },
      { bereich_id: 'k', menge_einheiten: 6, zeitpunkt: tag(21) },
      { bereich_id: 'k', menge_einheiten: 4, zeitpunkt: tag(22) },
      { bereich_id: 'k', menge_einheiten: 2, zeitpunkt: tag(23) },
    ], [{ menge_einheiten: 2, zeitpunkt: tag(21, 12) }]);
    expect(v.pro_tag).toBe(2); // (4-2)+2+2 = 6 in 3 Tagen
  });
});
