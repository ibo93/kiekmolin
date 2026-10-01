// Gemeinsame Typen für App (Vite) und Edge Functions (Deno).
// Keine Abhängigkeiten, nur relative Importe mit .ts – läuft in beiden.
import type { Charge } from './chargen.ts';

export type Sprache = 'de' | 'tr' | 'ku' | 'ar' | 'en' | 'ckb';
export type Namen = Partial<Record<Sprache, string>>;

export type Zaehleinheit =
  | 'kiste' | 'packung' | 'stueck' | 'becher' | 'beutel' | 'flasche' | 'dose'
  | 'eimer' | 'sack' | 'karton' | 'glas' | 'netz' | 'spiess';
export type Basiseinheit = 'kg' | 'l' | 'stueck';
export type Kategorie =
  | 'fleisch' | 'fisch' | 'gemuese' | 'obst' | 'milch' | 'brot' | 'tiefkuehl' | 'trocken' | 'getraenke' | 'sonstiges';

export type Betrieb = {
  id: string;
  name: string;
  zeitzone: string;
  scan_erinnerung_uhrzeit: string;
  briefing_spaetestens: string;
  foto_loeschfrist_tage: number;
  genauigkeitstest: boolean;
};

export type Nutzer = {
  id: string;
  betrieb_id: string;
  name: string;
  rolle: 'chef' | 'mitarbeiter';
  sprache: Sprache;
  darstellung: Darstellung;
  push_an: boolean;
  plattform_admin?: boolean;
};

export type Darstellung = {
  modus?: 'hell' | 'dunkel' | 'auto';
  akzent?: string; // Schlüssel aus AKZENTE
  glas?: 'klar' | 'getoent';
  bewegung?: boolean;
};

export type Bereich = {
  id: string;
  betrieb_id: string;
  namen: Namen;
  art: 'kuehlhaus' | 'tiefkuehler' | 'trocken' | 'sonstig';
  reihenfolge: number;
  aktiv: boolean;
};

export type Position = {
  id: string;
  betrieb_id: string;
  bereich_id: string;
  namen: Namen;
  referenzfoto_pfad: string | null;
  reihenfolge: number;
  aktiv: boolean;
};

export type Produkt = {
  id: string;
  betrieb_id: string;
  namen: Namen;
  namen_bestaetigt: string[];
  kategorie: Kategorie;
  zaehleinheit: Zaehleinheit;
  menge_pro_einheit: number | null;
  basiseinheit: Basiseinheit;
  referenzfoto_pfad: string | null;
  mindestbestand: number;
  standard_haltbarkeit_tage: number | null;
  preis_pro_einheit: number | null;
  bereich_ids: string[];
  aktiv: boolean;
};

export type BestandZeile = {
  produkt_id: string;
  bereich_id: string;
  menge_einheiten: number;
  chargen: Charge[];
  mhd: string | null;
  mhd_quelle: 'etikett' | 'berechnet' | null;
  zeitpunkt: string;
};

export type Scan = {
  id: string;
  betrieb_id: string;
  bereich_id: string;
  nutzer_id: string | null;
  lokal_id: string;
  zeitpunkt: string;
  status: 'offline' | 'hochgeladen' | 'erkannt' | 'bestaetigt' | 'fehler';
  bestaetigt_am: string | null;
  fehler: string | null;
  /** Was die KI zu den Fotos sagt – angezeigt beim Bestätigen (0004_scan_hinweise.sql). */
  erkennung_hinweise?: ScanHinweise | null;
};

export type Bildproblem = 'dunkel' | 'unscharf' | 'zu_weit' | 'verdeckt' | 'spiegelung';
export type ScanHinweise = {
  bildqualitaet: Bildproblem[];
  unbekannt: Array<{ beschreibung: string }>;
};

/** Hinweise aus den Antworten der KI (je Stelle eine) zusammenfassen: jedes Problem einmal. */
export function hinweiseZusammen(
  antworten: Array<{ bildqualitaet: { ok: boolean; problem: string | null }; unbekannt: Array<{ beschreibung: string }> }>,
): ScanHinweise {
  const bekannt: Bildproblem[] = ['dunkel', 'unscharf', 'zu_weit', 'verdeckt', 'spiegelung'];
  const probleme = antworten
    .filter((a) => !a.bildqualitaet.ok && a.bildqualitaet.problem)
    .map((a) => a.bildqualitaet.problem as Bildproblem)
    .filter((p) => bekannt.includes(p));
  const unbekannt = antworten.flatMap((a) => a.unbekannt)
    .map((u) => ({ beschreibung: u.beschreibung.trim().slice(0, 80) }))
    .filter((u, i, l) => u.beschreibung && l.findIndex((x) => x.beschreibung.toLowerCase() === u.beschreibung.toLowerCase()) === i)
    .slice(0, 5);
  return { bildqualitaet: [...new Set(probleme)], unbekannt };
}

export type Box = { x: number; y: number; b: number; h: number };

export type Erkennung = {
  id: string;
  scan_id: string;
  scan_foto_id: string | null;
  produkt_id: string;
  anzahl_erkannt: number;
  sicherheit: number;
  mhd: string | null;
  box: Box | null;
  anzahl_bestaetigt: number | null;
  von_hand: boolean;
};

export type Weggeworfen = {
  id: string;
  produkt_id: string;
  menge_einheiten: number;
  wert_eur: number | null;
  zeitpunkt: string;
  nutzer_id: string | null;
};

export type EinkaufEintrag = {
  id?: string;
  datum: string;
  produkt_id: string;
  menge_extra: number;
  abgehakt: boolean;
  quelle: 'hand' | 'assistent' | 'auto';
};

/** Ein Hinweis ist strukturiert – der Text entsteht erst beim Leser, in seiner Sprache. */
export type HinweisArt = 'laeuft_ab' | 'abgelaufen' | 'knapp' | 'leer' | 'nicht_gescannt';
export type Hinweis = {
  id?: string;
  art: HinweisArt;
  prioritaet: number;
  daten: {
    produkt_id?: string;
    tage?: number; // bis MHD (0 = heute, <0 = abgelaufen)
    menge?: number; // Einheiten
    fehlt?: number; // Einheiten
    bereich_ids?: string[];
  };
  aktion: 'einkaufsliste' | 'erledigt' | 'scannen' | null;
  erledigt?: boolean;
  erstellt_am?: string;
};

export type BriefingPunkt =
  | { art: 'laeuft_ab'; produkt_id: string; tage: number; menge: number }
  | { art: 'nichts_laeuft_ab' }
  | { art: 'knapp'; produkt_id: string; fehlt: number; menge: number }
  | { art: 'alles_da' }
  | { art: 'einkauf'; anzahl: number };

export type Briefing = {
  datum: string;
  gescannt: boolean;
  fehlende_bereiche: string[];
  punkte: BriefingPunkt[];
  tagesgericht: Partial<Record<Sprache, { gericht: string; grund: string }>>;
  erstellt_am?: string;
  gesendet_am?: string | null;
};
