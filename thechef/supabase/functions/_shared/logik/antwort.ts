// Die technische Absicherung von "Der Assistent erfindet NIE Mengen".
//
// Der Assistent bekommt Zahlen nur aus Tool-Ergebnissen. Bevor eine
// Antwort den Chef erreicht, wird JEDE Zahl darin gegen diese Ergebnisse
// geprüft. Steht eine Zahl nirgends in den Daten, wird die Antwort
// verworfen – lieber "Das kann ich nicht sicher sagen" als eine erfundene
// Menge, die jemand bestellt.

export type Kachel = {
  art: 'noch_da' | 'brauchst' | 'fehlt' | 'wert' | 'sonstig';
  titel: string;
  zahl: number;
  einheit: string;
};

export type Aktion =
  | { typ: 'einkaufsliste'; produkt_id: string; menge_einheiten: number }
  | { typ: 'bestand' | 'verlust' | 'einkauf' | 'neu_scannen' };

export type Antwort = {
  satz: string;
  text: string;
  kacheln: Kachel[];
  quelle: string | null;
  /** Zeitpunkt des Scans, auf dem die Zahlen beruhen (ISO) */
  stand: string | null;
  schaetzung: boolean;
  daten_alt: boolean;
  aktion: Aktion | null;
};

/** Alle Zahlen aus Tool-Ergebnissen einsammeln (auch verschachtelt). */
export function belegZahlen(ergebnisse: unknown[]): number[] {
  const raus: number[] = [];
  const lauf = (x: unknown) => {
    if (typeof x === 'number' && Number.isFinite(x)) raus.push(x);
    else if (Array.isArray(x)) x.forEach(lauf);
    else if (x && typeof x === 'object') Object.values(x).forEach(lauf);
  };
  ergebnisse.forEach(lauf);
  return raus;
}

/** Alle Zeitpunkte (ISO) aus Tool-Ergebnissen, die als "Stand" taugen. */
export function belegZeitpunkte(ergebnisse: unknown[]): string[] {
  const raus: string[] = [];
  const lauf = (x: unknown, schluessel = '') => {
    if (typeof x === 'string' && /scan|stand|zeitpunkt/i.test(schluessel) && !Number.isNaN(Date.parse(x))) raus.push(x);
    else if (Array.isArray(x)) x.forEach((y) => lauf(y, schluessel));
    else if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => lauf(v, k));
  };
  ergebnisse.forEach((e) => lauf(e));
  return raus;
}

/** Zahlen aus Fließtext – ohne Uhrzeiten und Datumsangaben. */
export function zahlenImText(text: string): number[] {
  const ohne = text
    .replace(/\b\d{1,2}[:.]\d{2}\s*(uhr|h)?\b(?![.,]\d)/gi, ' ') // 22:04, 22.04 Uhr
    .replace(/\b\d{1,2}\.\s?\d{1,2}\.(\d{2,4})?/g, ' ') // 27.9. / 27.09.2026
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  return [...ohne.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
}

function passt(zahl: number, belege: number[]): boolean {
  return belege.some((b) => Math.abs(zahl - b) <= Math.max(Math.abs(b) * 0.051, 0.051));
}

export type Pruefung = { ok: true } | { ok: false; grund: string; zahlen?: number[] };

export function antwortPruefen(a: Antwort, toolErgebnisse: unknown[]): Pruefung {
  const belege = belegZahlen(toolErgebnisse);
  const genannt = [
    ...zahlenImText(a.satz),
    ...zahlenImText(a.text ?? ''),
    ...a.kacheln.map((k) => k.zahl),
    ...(a.aktion?.typ === 'einkaufsliste' ? [a.aktion.menge_einheiten] : []),
  ];
  if (genannt.length === 0) return { ok: true };
  if (toolErgebnisse.length === 0) return { ok: false, grund: 'zahlen_ohne_daten', zahlen: genannt };

  const ohneBeleg = genannt.filter((z) => !passt(z, belege));
  if (ohneBeleg.length) return { ok: false, grund: 'zahl_ohne_beleg', zahlen: ohneBeleg };

  // Mengen genannt → der Zeitpunkt des Scans muss dabei sein, und er muss aus den Daten stammen.
  if (!a.stand) return { ok: false, grund: 'stand_fehlt' };
  const zeiten = belegZeitpunkte(toolErgebnisse).map((t) => Date.parse(t));
  if (!zeiten.some((t) => Math.abs(t - Date.parse(a.stand!)) < 60_000)) return { ok: false, grund: 'stand_ohne_beleg' };
  return { ok: true };
}

/** JSON-Schema für die Antwort (Structured Output). */
export const ANTWORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['satz', 'text', 'kacheln', 'quelle', 'stand', 'schaetzung', 'daten_alt', 'aktion'],
  properties: {
    satz: { type: 'string', description: 'Ein klarer erster Satz, die Antwort selbst.' },
    text: { type: 'string', description: 'Optional 1–2 kurze Sätze Erklärung. Leer lassen, wenn nicht nötig.' },
    kacheln: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['art', 'titel', 'zahl', 'einheit'],
        properties: {
          art: { type: 'string', enum: ['noch_da', 'brauchst', 'fehlt', 'wert', 'sonstig'] },
          titel: { type: 'string' },
          zahl: { type: 'number' },
          einheit: { type: 'string' },
        },
      },
    },
    quelle: { type: ['string', 'null'], description: 'Worauf die Zahlen beruhen, in einem Satz.' },
    stand: { type: ['string', 'null'], description: 'ISO-Zeitpunkt des Scans aus den Tool-Daten, auf dem die Zahlen beruhen.' },
    schaetzung: { type: 'boolean' },
    daten_alt: { type: 'boolean' },
    aktion: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false, required: ['typ', 'produkt_id', 'menge_einheiten'],
          properties: { typ: { type: 'string', enum: ['einkaufsliste'] }, produkt_id: { type: 'string' }, menge_einheiten: { type: 'number' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['typ'],
          properties: { typ: { type: 'string', enum: ['bestand', 'verlust', 'einkauf', 'neu_scannen'] } },
        },
      ],
    },
  },
} as const;
