// FIFO-Chargen – dieselben Regeln wie chargen_fortschreiben() in
// 0001_grundlage.sql. tests/datenbank.test.ts rechnet beide mit denselben
// Fällen und verlangt dasselbe Ergebnis.
//
// Warum Chargen: Ohne sie hätte eine Kiste, die heute kommt, das MHD der
// Kiste von letzter Woche geerbt – oder umgekehrt. Mit FIFO wird immer
// die älteste Ware zuerst verbraucht, wie in jeder Küche.
//
// Datum = UTC-Kalendertag, wie ::date in der Datenbank (Supabase läuft in UTC).

export type Charge = {
  menge: number;
  eingang: string; // YYYY-MM-DD
  mhd: string | null;
  quelle: 'etikett' | 'berechnet' | null;
};

export function tagPlus(datum: string, tage: number): string {
  const d = new Date(datum + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export function chargenFortschreiben(
  alt: Charge[],
  menge: number,
  jetzt: Date,
  mhdEtikett: string | null,
  haltbarkeitTage: number | null,
): Charge[] {
  const summe = alt.reduce((s, c) => s + c.menge, 0);
  const heute = jetzt.toISOString().slice(0, 10);

  if (menge > summe) {
    const berechnet = haltbarkeitTage == null ? null : tagPlus(heute, haltbarkeitTage);
    return [
      ...alt,
      {
        menge: menge - summe,
        eingang: heute,
        mhd: mhdEtikett ?? berechnet,
        quelle: mhdEtikett ? 'etikett' : berechnet ? 'berechnet' : null,
      },
    ];
  }

  let rest = summe - menge;
  const neu: Charge[] = [];
  for (const c of alt) {
    if (rest >= c.menge) {
      rest -= c.menge;
    } else {
      neu.push({ ...c, menge: c.menge - rest });
      rest = 0;
    }
  }
  if (mhdEtikett && neu.length > 0 && neu[0].quelle !== 'etikett') {
    neu[0] = { ...neu[0], mhd: mhdEtikett, quelle: 'etikett' };
  }
  return neu;
}

/** Frühestes MHD über alle Chargen (das zählt für die Warnung). */
export function fruehestesMhd(chargen: Charge[]): { mhd: string | null; quelle: Charge['quelle'] } {
  let best: Charge | null = null;
  for (const c of chargen) if (c.mhd && (!best || c.mhd < best.mhd!)) best = c;
  return { mhd: best?.mhd ?? null, quelle: best?.quelle ?? null };
}
