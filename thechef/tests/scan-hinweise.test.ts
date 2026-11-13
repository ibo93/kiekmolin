// Scan genauer: Die KI meldete schon immer, wenn ein Foto zu dunkel oder
// unscharf war und welche Ware nicht im Katalog steht – die App warf es weg.
// Dazu: zu dunkle Fotos sofort am Gerät erkennen (auch ohne Netz) und ein
// Ausweichweg, wenn die Live-Kamera nicht geht.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { helligkeit, zuDunkel, ZU_DUNKEL } from '../src/lib/bildpruefung.ts';
import { hinweiseZusammen } from '../supabase/functions/_shared/logik/typen.ts';

const lesen = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const pixel = (r: number, g: number, b: number, n = 100) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]);

describe('Helligkeit am Gerät', () => {
  it('schwarz 0, weiß 255', () => {
    expect(helligkeit(pixel(0, 0, 0))).toBe(0);
    expect(helligkeit(pixel(255, 255, 255))).toBeCloseTo(255, 5);
  });
  it('Grün zählt fürs Auge mehr als Blau (BT.601)', () => {
    expect(helligkeit(pixel(0, 200, 0))).toBeGreaterThan(helligkeit(pixel(0, 0, 200)));
  });
  it('dunkles Kühlhaus ohne Licht: zu dunkel; normal beleuchtetes Regal: nicht', () => {
    expect(zuDunkel(helligkeit(pixel(20, 22, 25)))).toBe(true);
    expect(zuDunkel(helligkeit(pixel(120, 110, 100)))).toBe(false);
  });
  it('die Grenze liegt zwischen den beiden', () => {
    expect(ZU_DUNKEL).toBeGreaterThan(22);
    expect(ZU_DUNKEL).toBeLessThan(110);
  });
});

describe('Hinweise der KI zusammenfassen', () => {
  it('jedes Problem einmal, ok-Fotos zählen nicht', () => {
    const h = hinweiseZusammen([
      { bildqualitaet: { ok: false, problem: 'dunkel' }, unbekannt: [] },
      { bildqualitaet: { ok: false, problem: 'dunkel' }, unbekannt: [] },
      { bildqualitaet: { ok: true, problem: null }, unbekannt: [] },
      { bildqualitaet: { ok: false, problem: 'unscharf' }, unbekannt: [] },
    ]);
    expect(h.bildqualitaet).toEqual(['dunkel', 'unscharf']);
  });
  it('unbekannte Problem-Wörter fallen weg (sonst stünde ein roher Schlüssel im Text)', () => {
    expect(hinweiseZusammen([{ bildqualitaet: { ok: false, problem: 'nebel' }, unbekannt: [] }]).bildqualitaet).toEqual([]);
  });
  it('Unbekanntes: ohne Doppelte (auch Groß/klein), höchstens 5, gekürzt', () => {
    const u = (b: string) => ({ beschreibung: b });
    const h = hinweiseZusammen([
      { bildqualitaet: { ok: true, problem: null }, unbekannt: [u('Mangosaft'), u('mangosaft '), u('Ayran')] },
      { bildqualitaet: { ok: true, problem: null }, unbekannt: [u('A'), u('B'), u('C'), u('D'), u('x'.repeat(200))] },
    ]);
    expect(h.unbekannt.map((x) => x.beschreibung)).toEqual(['Mangosaft', 'Ayran', 'A', 'B', 'C']);
    expect(hinweiseZusammen([{ bildqualitaet: { ok: true, problem: null }, unbekannt: [u('x'.repeat(200))] }]).unbekannt[0].beschreibung).toHaveLength(80);
  });
});

describe('Verdrahtung', () => {
  it('scan-erkennen speichert die Hinweise am Scan', () => {
    const f = lesen('../supabase/functions/scan-erkennen/index.ts');
    expect(f).toContain('erkennung_hinweise: hinweise');
    expect(f).toContain('hinweiseZusammen(');
  });
  it('Bestätigen zeigt Bildqualität und Unbekanntes an', () => {
    const b = lesen('../src/seiten/Bestaetigen.tsx');
    expect(b).toContain('daten?.scan?.erkennung_hinweise');
    expect(b).toContain('bestaetigen.qualitaet_${p}');
    expect(b).toContain("t('bestaetigen.unbekannt'");
  });
  it('… auch schon auf der Rückfrage, BEVOR jemand eine Zahl zu einem dunklen Foto tippt', () => {
    const b = lesen('../src/seiten/Bestaetigen.tsx');
    const rueckfrage = b.slice(b.indexOf('if (frage) {'), b.indexOf("t('rueckfrage.wie_viele'"));
    expect(rueckfrage).toContain('{qualitaet}');
  });
  it('der Scan prüft jedes Foto sofort auf Dunkelheit', () => {
    const s = lesen('../src/seiten/Scan.tsx');
    expect(s).toContain('setDunkel(zuDunkel(bildHelligkeit(roh)))');
    expect(s).toContain("t('scan.zu_dunkel')");
  });
  it('geht die Kamera nicht, öffnet der Auslöser die Kamera-App (statt gesperrt zu sein)', () => {
    const s = lesen('../src/seiten/Scan.tsx');
    expect(s).toContain('capture="environment"');
    expect(s).not.toMatch(/scan-ausloeser"[^>]*disabled=\{!!kameraFehler\}/);
    expect(s).toContain('if (kameraFehler) kameraApp.current?.click()');
  });
});
