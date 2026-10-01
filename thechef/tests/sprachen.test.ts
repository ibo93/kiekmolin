// Fehlt ein Text, zeigt die App den deutschen – oder bei einem neuen Schlüssel
// den Schlüssel selbst ("bestand.titel"). Beides sieht aus wie "läuft", ist
// aber für Halil unlesbar. Deshalb wird hier jeder Text in jeder Sprache geprüft.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const DIR = new URL('../public/sprachen/', import.meta.url).pathname;
const lade = (s: string) => JSON.parse(readFileSync(DIR + s + '.json', 'utf8')) as Record<string, string | Record<string, string>>;
const de = lade('de');
const FERTIG = ['tr', 'ku', 'ar', 'en'];

function dateien(d: string): string[] {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? dateien(p) : /\.tsx?$/.test(f) ? [p] : []; });
}
const code = dateien(new URL('../src', import.meta.url).pathname).map((f) => readFileSync(f, 'utf8')).join('\n');

// Schlüssel, die im Code zusammengesetzt werden (`nav.${id}` usw.)
const DYNAMISCH = [
  ...['assistent', 'bestand', 'einkauf'].map((x) => `nav.${x}`),
  ...['kiste', 'packung', 'stueck', 'becher', 'beutel', 'flasche', 'dose', 'eimer', 'sack', 'karton', 'glas', 'netz', 'spiess', 'kg', 'l'].map((x) => `einheit.${x}`),
  ...['gut', 'knapp', 'sofort'].map((x) => `ampel.${x}`),
  ...['fleisch', 'fisch', 'gemuese', 'obst', 'milch', 'brot', 'tiefkuehl', 'trocken', 'getraenke', 'sonstiges'].map((x) => `kategorie.${x}`),
  ...['blau', 'lila', 'petrol'].map((x) => `akzent.${x}`),
  ...['scan', 'assistent', 'briefing', 'sprache', 'uebersetzung', 'tagesgericht'].map((x) => `kosten.${x}`),
  ...['einkaufsliste', 'bestand', 'verlust', 'einkauf', 'neu_scannen'].map((x) => `aktion.${x}`),
  ...['chef', 'mitarbeiter'].map((x) => `team.${x}`),
  ...['dunkel', 'unscharf', 'zu_weit', 'verdeckt', 'spiegelung'].map((x) => `bestaetigen.qualitaet_${x}`),
  ...['bereiche', 'produkte', 'team', 'iphone'].map((x) => `einrichtung.${x}_titel`),
  ...Array.from({ length: 12 }, (_, i) => `monat.${i + 1}`),
  ...['laden', 'speichern', 'nicht_angemeldet', 'server', 'foto', 'anmelden', 'registrieren', 'beitreten', 'code_ungueltig', 'sprache', 'sprache_demo', 'demo',
    'keine_kamera', 'kein_mikrofon', 'push_ios_installieren', 'push_nicht_moeglich', 'push_abgelehnt', 'push_nicht_eingerichtet', 'unbekannt', 'verbindung'].map((x) => `fehler.${x}`),
];
const imCode = [...code.matchAll(/\bt\(\s*'([a-z_]+\.[a-z0-9_]+)'/g), ...code.matchAll(/'((?:vorlage|vorschlag|installieren|katalog|team|kosten|genauigkeit)\.[a-z0-9_]+)'/g)].map((m) => m[1]);
const benutzt = [...new Set([...imCode, ...DYNAMISCH])];

const platzhalter = (v: string | Record<string, string>) =>
  [...new Set((typeof v === 'string' ? v : Object.values(v).join(' ')).match(/\{\w+\}/g) ?? [])].sort();

describe('Deutsch hat jeden Text, den der Code benutzt', () => {
  it('kein Schlüssel fehlt', () => expect(benutzt.filter((k) => !(k in de))).toEqual([]));
  it('der Test findet wirklich Schlüssel im Code (sonst prüft er nichts)', () => expect(imCode.length).toBeGreaterThan(250));
});

for (const s of FERTIG) {
  describe(`${s}: vollständig und mit denselben Platzhaltern`, () => {
    const t = lade(s);
    it('kein Text fehlt', () => expect(Object.keys(de).filter((k) => !(k in t))).toEqual([]));
    it('kein Text ist leer', () => expect(Object.entries(t).filter(([, v]) => (typeof v === 'string' ? !v.trim() : !v.other)).map(([k]) => k)).toEqual([]));
    it('Platzhalter stimmen ({menge}, {produkt} …)', () => {
      const falsch = Object.keys(de).filter((k) => k in t && platzhalter(t[k]).join() !== platzhalter(de[k]).join());
      expect(falsch).toEqual([]);
    });
  });
}

describe('Sorani ist vorbereitet', () => {
  it('Datei existiert und ist gültiges JSON', () => expect(typeof lade('ckb')).toBe('object'));
});
