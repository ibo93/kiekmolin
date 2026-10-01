// Verbrauch schätzen – aus nichts als den Scans.
//
// Zwischen zwei Scans ist weniger da → das wurde verbraucht (oder
// weggeworfen, das ziehen wir ab). Mehr da → Lieferung, zählt nicht als
// Verbrauch. Mehr Daten gibt es im MVP nicht (keine Kasse, keine Lieferscheine).
//
// Das Ergebnis ist IMMER eine Schätzung und sagt, worauf sie beruht.
// Zu wenig Daten → "unsicher", und der Assistent sagt das auch so.
import { runde } from './lager.ts';

export type Stand = { bereich_id: string; menge_einheiten: number; zeitpunkt: string };

export type Verbrauch = {
  pro_tag: number | null; // Einheiten
  /** Verbrauch je Wochentag (0 = Sonntag), wo genug Daten da sind */
  pro_wochentag: Array<number | null>;
  datenpunkte: number;
  tage_abgedeckt: number;
  von: string | null;
  bis: string | null;
  zuverlaessig: boolean;
};

/** Mindestens so viele Tage Verlauf, bevor wir eine Zahl nennen. */
export const MIN_TAGE = 3;
export const MIN_PUNKTE = 3;

export function verbrauchSchaetzen(verlauf: Stand[], weggeworfen: Array<{ menge_einheiten: number; zeitpunkt: string }> = []): Verbrauch {
  const zeilen = [...verlauf].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));
  // Gesamtbestand über die Zeit (Summe des letzten Stands je Bereich)
  const jeBereich = new Map<string, number>();
  const reihe: Array<{ t: number; menge: number }> = [];
  for (const z of zeilen) {
    jeBereich.set(z.bereich_id, Number(z.menge_einheiten));
    const menge = [...jeBereich.values()].reduce((s, m) => s + m, 0);
    const t = Date.parse(z.zeitpunkt);
    // Mehrere Zeilen desselben Scans (gleiche Zeit) → nur der letzte Stand zählt
    if (reihe.length && Math.abs(reihe[reihe.length - 1].t - t) < 60_000) reihe[reihe.length - 1] = { t, menge };
    else reihe.push({ t, menge });
  }
  const leer: Verbrauch = {
    pro_tag: null, pro_wochentag: Array(7).fill(null), datenpunkte: reihe.length,
    tage_abgedeckt: 0, von: null, bis: null, zuverlaessig: false,
  };
  if (reihe.length < 2) return leer;

  let summe = 0;
  const wt = Array(7).fill(0);
  const wtTage = Array(7).fill(0);
  for (let i = 1; i < reihe.length; i++) {
    const a = reihe[i - 1], b = reihe[i];
    let weniger = a.menge - b.menge;
    // Weggeworfenes in diesem Zeitraum ist kein Verbrauch
    const weg = weggeworfen
      .filter((w) => { const t = Date.parse(w.zeitpunkt); return t > a.t && t <= b.t; })
      .reduce((s, w) => s + Number(w.menge_einheiten), 0);
    weniger -= weg;
    if (weniger > 0) summe += weniger;
    const tage = Math.max((b.t - a.t) / 86400000, 1 / 24);
    const tag = new Date(b.t).getUTCDay();
    wt[tag] += Math.max(0, weniger);
    wtTage[tag] += Math.min(tage, 1);
  }
  const tageAbgedeckt = (reihe[reihe.length - 1].t - reihe[0].t) / 86400000;
  const zuverlaessig = tageAbgedeckt >= MIN_TAGE && reihe.length >= MIN_PUNKTE;
  return {
    pro_tag: tageAbgedeckt > 0 ? runde(summe / tageAbgedeckt, 2) : null,
    // je Wochentag erst ab zwei Wochen Verlauf
    pro_wochentag: wt.map((v, i) => (tageAbgedeckt >= 14 && wtTage[i] >= 2 ? runde(v / wtTage[i], 2) : null)),
    datenpunkte: reihe.length,
    tage_abgedeckt: runde(tageAbgedeckt, 1),
    von: new Date(reihe[0].t).toISOString(),
    bis: new Date(reihe[reihe.length - 1].t).toISOString(),
    zuverlaessig,
  };
}

/** Bedarf für die nächsten Tage (Wochentage 0–6, beginnend morgen), mit Grundlage. */
export function bedarf(v: Verbrauch, wochentage: number[]): { menge: number | null; grundlage: 'wochentag' | 'durchschnitt' | 'keine' } {
  if (v.pro_tag == null || !v.zuverlaessig) return { menge: null, grundlage: 'keine' };
  const mitWt = wochentage.every((d) => v.pro_wochentag[d] != null);
  const menge = wochentage.reduce((s, d) => s + (mitWt ? v.pro_wochentag[d]! : v.pro_tag!), 0);
  return { menge: runde(menge, 2), grundlage: mitWt ? 'wochentag' : 'durchschnitt' };
}

/** Wie lange der Mindestbestand reichen soll – bis zur nächsten Lieferung, mit Luft. */
export const REICHWEITE_TAGE = 3;

/**
 * Vorschlag für den Mindestbestand: Verbrauch pro Tag × Reichweite, auf ganze
 * Einheiten aufgerundet. Nur mit genug Verlauf – sonst null und KEINE geratene Zahl.
 */
export function mindestbestandVorschlag(v: Verbrauch, reichweite = REICHWEITE_TAGE): { menge: number; pro_tag: number; tage: number } | null {
  if (!v.zuverlaessig || v.pro_tag == null || v.pro_tag <= 0) return null;
  return { menge: Math.max(1, Math.ceil(v.pro_tag * reichweite - 1e-9)), pro_tag: v.pro_tag, tage: v.tage_abgedeckt };
}
