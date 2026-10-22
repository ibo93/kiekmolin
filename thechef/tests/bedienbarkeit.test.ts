// „Halil-Regel“ (THECHEF.md): große Tippflächen (≥ 44 pt, nasse Hände,
// Handschuhe) und lesbare Kontraste. Gemessen am 03.10.2026 im Browser,
// 15 Seiten, hell/dunkel, Deutsch/Arabisch/Kurdisch/Türkisch: 33 Tippflächen
// unter 44 pt (alle durch den Maßstab 0,88: 40 px → 35 pt, 46 px → 40 pt),
// 2 Texte unter 4,5:1. Dieser Test hält die Ursachen fest, damit sie nicht
// zurückkommen; die Messung selbst sieht nur ein echter Browser.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const lesen = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ui = lesen('../src/stil/ui.css');
const tokens = lesen('../src/stil/tokens.css');
const massstab = Number(tokens.match(/--massstab:\s*([\d.]+)/)?.[1]);
const touch = Number(tokens.match(/--touch:\s*(\d+)px/)?.[1]);

const regel = (selektor: string) => {
  const m = ui.match(new RegExp(selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`Regel fehlt: ${selektor}`);
  return m[1];
};

describe('Tippflächen ≥ 44 pt nach dem Maßstab', () => {
  it('--touch ergibt auf dem Gerät mindestens 44 pt', () => {
    expect(touch * massstab).toBeGreaterThanOrEqual(44);
  });
  for (const s of ['.knopf', '.chip', '.umschalter button', '.schalter', '.wert-kachel']) {
    it(`${s} nutzt --touch statt fester px`, () => {
      expect(regel(s)).toMatch(/(min-)?height:\s*var\(--touch\)/);
    });
  }
  it('Knöpfe nur mit Symbol sind auch breit genug', () => {
    expect(regel('.knopf')).toContain('min-width: var(--touch)');
  });
  it('keine festen Mini-Höhen in den Seiten (minHeight: 36/40)', () => {
    const dateien = readdirSync(new URL('../src/seiten/', import.meta.url)).filter((f) => f.endsWith('.tsx'));
    const treffer = dateien.flatMap((f) => [...lesen(`../src/seiten/${f}`).matchAll(/minHeight:\s*(3\d|4[0-3])\b|width:\s*40,\s*height:\s*40/g)].map((m) => `${f}: ${m[0]}`));
    expect(treffer).toEqual([]);
  });
});

describe('Kontraste', () => {
  it('die Briefing-Ziffern nutzen Text-Farben der Ampel (Orange-Fläche auf Weiß: 2,1:1)', () => {
    const a = lesen('../src/seiten/Assistent.tsx');
    expect(a).toContain("['var(--rot-text)', 'var(--gelb-text)', 'var(--akzent)']");
  });
  it('Text-Rot im Dunkelmodus ist heller als die Fläche (#FF453A auf #2C2C2E: 4,1:1)', () => {
    const dunkel = tokens.slice(tokens.indexOf('--rot: #FF453A'));
    expect(dunkel).toMatch(/--rot-text:\s*#FF6961/);
  });
});
