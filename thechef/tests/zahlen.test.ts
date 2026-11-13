import { describe, it, expect } from 'vitest';
import { zahlLesen } from '../supabase/functions/_shared/logik/zahlen.ts';

// Die Beispiele aus THECHEF.md zuerst: "vier", "çar", "أربعة".
const faelle: Array<[string, string, number | null]> = [
  ['de', 'vier', 4], ['de', 'Vier Kisten', 4], ['de', 'zwölf', 12], ['de', 'einundzwanzig', 21],
  ['de', 'zweieinhalb', 2.5], ['de', 'anderthalb', 1.5], ['de', 'hundertzwanzig', 120], ['de', 'drei komma fünf', 3.5],
  ['tr', 'dört', 4], ['tr', 'DÖRT', 4], ['tr', 'on iki', 12], ['tr', 'yirmi beş', 25], ['tr', 'iki buçuk', 2.5], ['tr', 'alti', 6],
  ['ku', 'çar', 4], ['ku', 'bîst û pênc', 25], ['ku', 'du û nîv', 2.5], ['ku', 'diwazdeh', 12], ['ku', 'sed', 100],
  ['ar', 'أربعة', 4], ['ar', 'اربعه', 4], ['ar', 'خمسة وعشرون', 25], ['ar', 'ثلاثة عشر', 13], ['ar', 'اثنين ونص', 2.5],
  ['ar', '٤', 4], ['ar', '١٢', 12],
  ['en', 'four', 4], ['en', 'twenty-five', 25], ['en', 'two and a half', 2.5], ['en', 'a hundred', 100],
  ['*', '4', 4], ['*', '4,5', 4.5], ['*', '12.5 kg', 12.5],
  ['*', '', null], ['*', 'weiß nicht', null], ['*', 'bilmiyorum', null],
];

describe('Zahlen aus Sprache lesen', () => {
  for (const [sprache, text, erwartet] of faelle) {
    it(`${sprache}: "${text}" → ${erwartet}`, () => expect(zahlLesen(text)).toBe(erwartet));
  }
});
