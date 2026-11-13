import { describe, it, expect } from 'vitest';
import { antwortPruefen, zahlenImText, type Antwort } from '../supabase/functions/_shared/logik/antwort.ts';

// Das Beispiel aus Antwort.dc.html: "Reicht das Hähnchen fürs Wochenende?"
const tool = [{
  produkt: 'Hähnchenbrust', noch_da: { einheiten: 2.4, anzeige: 12, einheit: 'kg' },
  bedarf: { einheiten: 4.4, anzeige: 22, einheit: 'kg' }, fehlt: { einheiten: 2, anzeige: 10, einheit: 'kg' },
  letzter_scan: '2026-09-27T20:04:00Z', grundlage: 'durchschnitt', wochenenden: 3,
}];
const gut: Antwort = {
  satz: 'Nein, es fehlen etwa 10 kg.', text: '',
  kacheln: [
    { art: 'noch_da', titel: 'Noch da', zahl: 12, einheit: 'kg' },
    { art: 'brauchst', titel: 'Brauchst du', zahl: 22, einheit: 'kg' },
    { art: 'fehlt', titel: 'Fehlt', zahl: 10, einheit: 'kg' },
  ],
  quelle: 'Geschätzt aus deinen Scans der letzten 3 Wochenenden. Stand: Scan heute, 22:04.',
  stand: '2026-09-27T20:04:00Z', schaetzung: true, daten_alt: false,
  aktion: { typ: 'einkaufsliste', produkt_id: 'h', menge_einheiten: 2 },
};

describe('Antwort-Prüfung', () => {
  it('die Antwort aus dem Mockup geht durch', () => expect(antwortPruefen(gut, tool)).toEqual({ ok: true }));
  it('erfundene Menge wird verworfen', () => {
    const r = antwortPruefen({ ...gut, satz: 'Nein, es fehlen etwa 15 kg.' }, tool);
    expect(r).toMatchObject({ ok: false, grund: 'zahl_ohne_beleg', zahlen: [15] });
  });
  it('erfundene Kachel wird verworfen', () => {
    const r = antwortPruefen({ ...gut, kacheln: [...gut.kacheln, { art: 'sonstig', titel: 'x', zahl: 7, einheit: 'kg' }] }, tool);
    expect(r.ok).toBe(false);
  });
  it('Zahlen ohne ein einziges Tool → verworfen', () => {
    expect(antwortPruefen(gut, [])).toMatchObject({ ok: false, grund: 'zahlen_ohne_daten' });
  });
  it('Mengen ohne Zeitpunkt des Scans → verworfen', () => {
    expect(antwortPruefen({ ...gut, stand: null }, tool)).toMatchObject({ ok: false, grund: 'stand_fehlt' });
  });
  it('Zeitpunkt, der nicht aus den Daten stammt → verworfen', () => {
    expect(antwortPruefen({ ...gut, stand: '2026-09-27T21:00:00Z' }, tool)).toMatchObject({ ok: false, grund: 'stand_ohne_beleg' });
  });
  it('Antwort ganz ohne Zahlen ist erlaubt ("bitte neu scannen")', () => {
    expect(antwortPruefen({ ...gut, satz: 'Dazu habe ich keine Daten. Bitte neu scannen.', kacheln: [], aktion: { typ: 'neu_scannen' }, stand: null, quelle: null }, [])).toEqual({ ok: true });
  });
  it('Uhrzeit und Datum zählen nicht als Menge', () => {
    expect(zahlenImText('Stand: Scan heute, 22:04. Am 27.09. waren es 12 kg.')).toEqual([12]);
  });
  it('arabische Ziffern werden auch geprüft', () => {
    expect(antwortPruefen({ ...gut, satz: 'لا، ينقص حوالي ١٥ كغ.' }, tool).ok).toBe(false);
  });
});
