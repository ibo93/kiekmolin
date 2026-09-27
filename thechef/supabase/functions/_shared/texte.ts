// Push-Texte in allen Sprachen (kurz – sie erscheinen auf dem Sperrbildschirm).
// ENTWURF für ku/ar: vor dem Start von Muttersprachlern prüfen lassen.
import type { Sprache } from './logik/typen.ts';

type T = Record<'erinnerung_titel' | 'erinnerung_text' | 'briefing_titel' | 'briefing_nicht_gescannt' | 'wichtig_titel' | 'laeuft_ab' | 'leer' | 'abgelaufen', string>;

const TEXTE: Record<string, T> = {
  de: { erinnerung_titel: 'Zeit zum Scannen', erinnerung_text: 'Noch offen: {bereiche}', briefing_titel: 'Abend-Briefing', briefing_nicht_gescannt: 'Heute nicht gescannt: {bereiche}',
    wichtig_titel: 'Wichtig im Lager', laeuft_ab: '{produkt} läuft {wann} ab', leer: '{produkt} ist leer', abgelaufen: '{produkt} ist abgelaufen' },
  tr: { erinnerung_titel: 'Tarama zamanı', erinnerung_text: 'Açık: {bereiche}', briefing_titel: 'Akşam özeti', briefing_nicht_gescannt: 'Bugün taranmadı: {bereiche}',
    wichtig_titel: 'Depoda önemli', laeuft_ab: '{produkt} {wann} bozuluyor', leer: '{produkt} bitti', abgelaufen: '{produkt} bozulmuş' },
  ku: { erinnerung_titel: 'Dema skankirinê ye', erinnerung_text: 'Hîn vekirî: {bereiche}', briefing_titel: 'Kurteya êvarê', briefing_nicht_gescannt: 'Îro nehate skankirin: {bereiche}',
    wichtig_titel: 'Girîng di depoyê de', laeuft_ab: '{produkt} {wann} xera dibe', leer: '{produkt} qediya', abgelaufen: '{produkt} xera bûye' },
  ar: { erinnerung_titel: 'وقت المسح', erinnerung_text: 'لم يُمسح بعد: {bereiche}', briefing_titel: 'ملخص المساء', briefing_nicht_gescannt: 'لم يتم المسح اليوم: {bereiche}',
    wichtig_titel: 'مهم في المخزن', laeuft_ab: 'تنتهي صلاحية {produkt} {wann}', leer: 'نفد {produkt}', abgelaufen: 'انتهت صلاحية {produkt}' },
  en: { erinnerung_titel: 'Time to scan', erinnerung_text: 'Still open: {bereiche}', briefing_titel: 'Evening briefing', briefing_nicht_gescannt: 'Not scanned today: {bereiche}',
    wichtig_titel: 'Important in storage', laeuft_ab: '{produkt} expires {wann}', leer: '{produkt} is empty', abgelaufen: '{produkt} has expired' },
};
const WANN: Record<string, [string, string, string]> = {
  de: ['heute', 'morgen', 'in {n} Tagen'], tr: ['bugün', 'yarın', '{n} gün içinde'], ku: ['îro', 'sibê', 'di {n} rojan de'], ar: ['اليوم', 'غداً', 'بعد {n} أيام'], en: ['today', 'tomorrow', 'in {n} days'],
};

export function text(s: Sprache, k: keyof T, v: Record<string, string | number> = {}) {
  const t = (TEXTE[s] ?? TEXTE.de)[k];
  return t.replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
}
export function wann(s: Sprache, tage: number) {
  const w = WANN[s] ?? WANN.de;
  return tage <= 0 ? w[0] : tage === 1 ? w[1] : w[2].replace('{n}', String(tage));
}
export function name(n: Partial<Record<string, string>>, s: Sprache) {
  return n[s] || n.de || n.en || Object.values(n).find(Boolean) || '';
}
