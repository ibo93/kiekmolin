// iOS zoomt die ganze Seite heran, sobald man ein Feld antippt, dessen Schrift
// unter 16 px liegt – gemessen NACH dem Maßstab (html { zoom }). Seit die App
// auf 0,88 verkleinert wurde, lagen alle Felder darunter (16 px → 14 px,
// 18 px → 15,8 px): Im Simulator rutschte beim Antippen der Frageleiste die
// Seite nach rechts, Kopfzeile weg, Mikrofon halb abgeschnitten.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../src/stil/tokens.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/stil/ui.css', import.meta.url), 'utf8');

const massstab = Number(tokens.match(/--massstab:\s*([\d.]+)/)?.[1]);

/** Schriftgröße in px, wie sie vor dem Maßstab im CSS steht. */
function px(wert: string): number {
  const w = wert.trim();
  if (/^var\(--feld-min\)$/.test(w)) {
    const def = tokens.match(/--feld-min:\s*([^;]+);/)?.[1];
    if (!def) throw new Error('--feld-min fehlt in tokens.css');
    return px(def);
  }
  const calc = w.match(/^calc\(\s*([\d.]+)px\s*\/\s*var\(--massstab\)\s*\)$/);
  if (calc) return Number(calc[1]) / massstab;
  const max = w.match(/^max\((.+)\)$/);
  if (max) return Math.max(...teilen(max[1]).map(px));
  const einfach = w.match(/^([\d.]+)px$/);
  if (einfach) return Number(einfach[1]);
  throw new Error(`Schriftgröße nicht lesbar: ${w}`);
}

/** Kommas auf oberster Ebene trennen (nicht in Klammern). */
function teilen(s: string): string[] {
  const teile: string[] = []; let tiefe = 0; let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') tiefe++;
    else if (s[i] === ')') tiefe--;
    else if (s[i] === ',' && tiefe === 0) { teile.push(s.slice(start, i)); start = i + 1; }
  }
  teile.push(s.slice(start));
  return teile;
}

/** Alle Regeln, die ein Texteingabefeld treffen, mit ihrer Schriftgröße. */
function feldRegeln(css: string) {
  const regeln: { selektor: string; groesse: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selektor = m[1].trim();
    if (!/(^|[\s,>])(input|textarea|select)\b|\.eingabe\b/.test(selektor)) continue;
    if (/::placeholder|:focus/.test(selektor)) continue;
    const groesse = m[2].match(/font-size:\s*([^;]+);?/)?.[1];
    if (groesse) regeln.push({ selektor, groesse });
  }
  return regeln;
}

describe('Eingabefelder lösen auf dem iPhone keinen Zoom aus', () => {
  it('der Maßstab ist lesbar', () => {
    expect(massstab).toBeGreaterThan(0.5);
    expect(massstab).toBeLessThanOrEqual(1);
  });

  const regeln = feldRegeln(ui);
  it('es gibt Feld-Regeln zu prüfen (sonst prüft dieser Test nichts)', () => {
    expect(regeln.map((r) => r.selektor)).toEqual(expect.arrayContaining(['.eingabe', '.frage-leiste input']));
  });

  for (const r of regeln) {
    it(`${r.selektor}: mindestens 16 px nach dem Maßstab`, () => {
      expect(px(r.groesse) * massstab).toBeGreaterThanOrEqual(16);
    });
  }

  it('Felder ohne eigene Schriftgröße erben nicht die kleine Grundschrift', () => {
    // Frageleiste im Gespräch und im Assistenten: <input> ohne Klasse.
    const grund = tokens.match(/(?:^|\n)input, select, textarea\s*\{([^}]*)\}/)?.[1] ?? '';
    const groesse = grund.match(/font-size:\s*([^;]+);/)?.[1];
    expect(groesse, 'Grundregel für Felder braucht eine Mindestgröße').toBeTruthy();
    expect(px(groesse!) * massstab).toBeGreaterThanOrEqual(16);
  });
});
