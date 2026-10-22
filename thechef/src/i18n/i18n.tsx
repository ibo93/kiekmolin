// Sprachsystem. Texte liegen in public/sprachen/<sprache>.json – dort können
// Muttersprachler korrigieren, ohne Code anzufassen.
//
// Jeder Nutzer hat seine eigene Sprache. Daten (Produktnamen, Bereiche)
// liegen je Sprache in der Datenbank; name() wählt die passende.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Namen, Sprache } from '../../supabase/functions/_shared/logik/typen.ts';

export const SPRACHEN: Array<{ code: Sprache; eigen: string; de: string; dir: 'ltr' | 'rtl'; fertig: boolean }> = [
  { code: 'de', eigen: 'Deutsch', de: 'Deutsch', dir: 'ltr', fertig: true },
  { code: 'tr', eigen: 'Türkçe', de: 'Türkisch', dir: 'ltr', fertig: true },
  { code: 'ku', eigen: 'Kurdî (Kurmancî)', de: 'Kurdisch', dir: 'ltr', fertig: true },
  { code: 'ar', eigen: 'العربية', de: 'Arabisch', dir: 'rtl', fertig: true },
  { code: 'en', eigen: 'English', de: 'Englisch', dir: 'ltr', fertig: true },
  // Sorani: vorbereitet (RTL, eigene Datei), noch nicht übersetzt → nicht wählbar.
  { code: 'ckb', eigen: 'کوردی (سۆرانی)', de: 'Kurdisch (Sorani)', dir: 'rtl', fertig: false },
];

/** Zahlen-/Datumsformat je Sprache. Arabisch mit westlichen Ziffern – wie im Mockup (Main.dc.html: "تم 1 من 3"). */
const LOCALE: Record<Sprache, string> = {
  de: 'de-DE', tr: 'tr-TR', ku: 'tr-TR', ar: 'ar-u-nu-latn', en: 'en-GB', ckb: 'ar-u-nu-latn',
};

type Texte = Record<string, string | Record<string, string>>;
const cache = new Map<Sprache, Texte>();

async function laden(s: Sprache): Promise<Texte> {
  if (cache.has(s)) return cache.get(s)!;
  const r = await fetch(`${import.meta.env.BASE_URL}sprachen/${s}.json`);
  if (!r.ok) throw new Error(`Sprachdatei ${s} fehlt (${r.status})`);
  const t = (await r.json()) as Texte;
  cache.set(s, t);
  return t;
}

export type T = ReturnType<typeof bauen>;

function bauen(sprache: Sprache, texte: Texte, rueckfall: Texte) {
  const locale = LOCALE[sprache];
  const plural = new Intl.PluralRules(locale.split('-u-')[0]);
  const dir = SPRACHEN.find((x) => x.code === sprache)?.dir ?? 'ltr';

  function roh(key: string): string | Record<string, string> | undefined {
    return texte[key] ?? rueckfall[key];
  }

  /** t('bestand.titel') · t('einkauf.anzahl', { n: 4 }) – Plural über {one, other, …} */
  function t(key: string, vars: Record<string, string | number> = {}): string {
    let v = roh(key);
    if (v == null) {
      if (import.meta.env.DEV) console.warn('Text fehlt:', key);
      return key;
    }
    if (typeof v === 'object') {
      const n = Number(vars.n ?? 0);
      const form = n === 0 && v.zero ? 'zero' : plural.select(n);
      v = v[form] ?? v.other ?? Object.values(v)[0];
    }
    return (v as string).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }

  // Bis zu zwei Stellen, Nullen fallen weg: 12 kg bleibt 12 kg, 0,75 l wird nicht zu 0,8 l.
  const zahlFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  // Für festgelegte Werte (Inhalt einer Flasche): 0,25 l bleibt 0,25 l – zahlFmt machte 0,3 l daraus.
  const zahlGenauFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const geldFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const geldGenau = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

  function uhrzeit(iso: string | Date) {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** "heute, 22:04" · "gestern" · "vor 3 Tagen" */
  function wann(iso: string | null | undefined, mitUhrzeit = true): string {
    if (!iso) return t('zeit.nie');
    const d = new Date(iso);
    const heute = new Date();
    const tage = Math.round((new Date(heute.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
    if (tage <= 0) return mitUhrzeit ? t('zeit.heute_um', { zeit: uhrzeit(d) }) : t('zeit.heute');
    if (tage === 1) return mitUhrzeit ? t('zeit.gestern_um', { zeit: uhrzeit(d) }) : t('zeit.gestern');
    return t('zeit.vor_tagen', { n: tage });
  }

  /** MHD-Plakette: "abgelaufen" · "heute" · "morgen" · "3 Tage" */
  function mhdText(tage: number): string {
    if (tage < 0) return t('mhd.abgelaufen');
    if (tage === 0) return t('mhd.heute');
    if (tage === 1) return t('mhd.morgen');
    return t('mhd.tage', { n: tage });
  }

  /** Für Sätze: "heute" · "morgen" · "in 3 Tagen" */
  function mhdWann(tage: number): string {
    if (tage <= 0) return t('mhd.heute');
    if (tage === 1) return t('mhd.morgen');
    return t('mhd.in_tagen', { n: tage });
  }

  /** "Kiste"/"Kisten", "kg" – Einheiten mit Plural in jeder Sprache */
  function einheit(e: string, n: number): string {
    return t(`einheit.${e}`, { n });
  }

  function menge(zahl: number, e: string): string {
    return `${zahlFmt.format(zahl)} ${einheit(e, zahl)}`;
  }

  function name(n: Namen | null | undefined): string {
    if (!n) return '';
    return n[sprache] || n.de || n.en || Object.values(n).find(Boolean) || '';
  }

  function monat(m: number, jahr?: number) {
    const name = t(`monat.${m}`);
    return jahr ? `${name} ${jahr}` : name;
  }

  return {
    t, sprache, dir, locale, name, einheit, menge, wann, uhrzeit, mhdText, mhdWann, monat,
    zahl: (x: number) => zahlFmt.format(x),
    zahlGenau: (x: number) => zahlGenauFmt.format(x),
    geld: (x: number) => geldFmt.format(x),
    geldGenau: (x: number) => geldGenau.format(x),
  };
}

const Kontext = createContext<T | null>(null);

export function SprachRahmen({ sprache, children }: { sprache: Sprache; children: ReactNode }) {
  const [texte, setTexte] = useState<{ s: Sprache; t: Texte; de: Texte } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aus = false;
    Promise.all([laden(sprache), laden('de')])
      .then(([t, de]) => { if (!aus) { setTexte({ s: sprache, t, de }); setFehler(null); } })
      .catch((e) => !aus && setFehler(String(e.message ?? e)));
    return () => { aus = true; };
  }, [sprache]);

  const wert = useMemo(() => (texte ? bauen(texte.s, texte.t, texte.de) : null), [texte]);

  useEffect(() => {
    if (!wert) return;
    document.documentElement.lang = wert.sprache;
    document.documentElement.dir = wert.dir;
  }, [wert]);

  if (fehler && !wert) {
    // Stiller Ausfall wäre eine leere Seite. Deshalb laut – auf Deutsch, weil nichts anderes geladen ist.
    return <div className="laden-voll" role="alert">Die Sprachdatei konnte nicht geladen werden. Bitte Verbindung prüfen und neu öffnen.<br /><small>{fehler}</small></div>;
  }
  if (!wert) return <div className="laden-voll"><div className="laden" /></div>;
  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useT(): T {
  const k = useContext(Kontext);
  if (!k) throw new Error('useT außerhalb von SprachRahmen');
  return k;
}

/** Für Texte vor der Anmeldung (Sprachwahl), ohne Kontext. */
export async function texteFuer(s: Sprache) {
  const [t, de] = await Promise.all([laden(s), laden('de')]);
  return bauen(s, t, de);
}
