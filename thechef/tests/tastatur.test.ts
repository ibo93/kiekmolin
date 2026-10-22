// Die Tastatur verdeckte auf dem iPhone die Frageleiste – man tippte blind
// (gemessen im Simulator, 28.09.2026). lib/tastatur.ts misst die Höhe,
// das CSS hebt die Leiste darüber.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { verdeckt } from '../src/lib/tastatur.ts';

const lesen = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('Tastatur verdeckt die Frageleiste nicht', () => {
  it('iPhone-Tastatur (336 pt) wird in App-px umgerechnet (Maßstab 0,88)', () => {
    expect(verdeckt(874, 538, 0, 0.88)).toBeCloseTo(336 / 0.88, 5);
  });
  it('seitlich gescrollt: der Versatz oben zählt nicht als Tastatur', () => {
    expect(verdeckt(874, 538, 120, 0.88)).toBeCloseTo(216 / 0.88, 5);
  });
  it('keine Tastatur, nur Rundung oder Leiste: 0', () => {
    expect(verdeckt(874, 874, 0, 0.88)).toBe(0);
    expect(verdeckt(874, 820, 0, 0.88)).toBe(0);
  });
  it('mit zwei Fingern hineingezoomt ist keine Tastatur', () => {
    expect(verdeckt(874, 437, 200, 0.88, 2)).toBe(0);
  });
  it('wird beim Start eingeschaltet', () => {
    expect(lesen('../src/main.tsx')).toMatch(/^tastaturBeobachten\(\);$/m);
  });
  it('beide Frageleisten rücken über die Tastatur', () => {
    const css = lesen('../src/stil/ui.css');
    expect(css).toMatch(/\.tastatur-offen \.frage-bereich,\s*\.tastatur-offen \.frage-leiste\.unten-allein\s*\{\s*bottom:\s*calc\(var\(--tastatur\)/);
    expect(lesen('../src/seiten/Gespraech.tsx')).toContain('frage-leiste glas unten-allein');
  });
});
