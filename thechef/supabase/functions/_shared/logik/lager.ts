// Alles, was aus dem Bestand abgeleitet wird: Ampel, Warenwert,
// Einkaufsliste, Hinweise, Briefing-Punkte.
//
// Reine Funktionen: gleiche Eingabe → gleiche Ausgabe. Die App zeigt damit
// den Bestand, der Server schreibt damit Hinweise und das Briefing, der
// Assistent bekommt daraus seine Zahlen. Eine Rechnung, drei Nutzer –
// sonst sagt das Briefing "13 kg fehlen" und die Einkaufsliste "+12".
import type { Charge } from './chargen.ts';
import type {
  BestandZeile, BriefingPunkt, EinkaufEintrag, Hinweis, Produkt,
} from './typen.ts';

// ───────────────────────────────────────────── Datum

/** Kalendertag im Betrieb (nicht UTC): 23:30 in Berlin ist noch "heute". */
export function tagIn(zeitzone: string, jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zeitzone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(jetzt);
}

/** Uhrzeit HH:MM im Betrieb. */
export function uhrzeitIn(zeitzone: string, jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zeitzone, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(jetzt);
}

export function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(bis + 'T00:00:00Z') - Date.parse(von + 'T00:00:00Z')) / 86400000);
}

// ───────────────────────────────────────────── Bestand je Produkt

export type Ampel = 'gut' | 'knapp' | 'sofort';

export type ProduktStand = {
  produkt: Produkt;
  menge: number; // Einheiten, alle Bereiche
  /** Menge ohne das, was bis morgen abläuft */
  verfuegbar: number;
  mhd: string | null;
  mhd_quelle: 'etikett' | 'berechnet' | null;
  tage_bis_mhd: number | null;
  /** Menge, die am frühesten abläuft */
  menge_mhd: number;
  bereiche: Array<{ bereich_id: string; menge: number; zeitpunkt: string }>;
  letzter_scan: string | null;
  ampel: Ampel;
  /** fehlt bis Mindestbestand, in Einheiten */
  fehlt: number;
  wert_eur: number | null;
};

/** Ab wie vielen Tagen bis zum MHD es gelb wird. */
export const BALD_TAGE = 2;

export function produktStaende(produkte: Produkt[], bestand: BestandZeile[], heute: string): ProduktStand[] {
  const jeProdukt = new Map<string, BestandZeile[]>();
  for (const z of bestand) {
    const l = jeProdukt.get(z.produkt_id) ?? [];
    l.push(z);
    jeProdukt.set(z.produkt_id, l);
  }
  return produkte
    .filter((p) => p.aktiv)
    .map((p) => {
      const zeilen = jeProdukt.get(p.id) ?? [];
      const menge = runde(zeilen.reduce((s, z) => s + Number(z.menge_einheiten), 0));
      const chargen: Charge[] = zeilen.flatMap((z) => z.chargen ?? []);
      // frühestes MHD über alle Bereiche
      let mhd: string | null = null;
      let quelle: ProduktStand['mhd_quelle'] = null;
      for (const c of chargen) if (c.mhd && c.menge > 0 && (!mhd || c.mhd < mhd)) { mhd = c.mhd; quelle = c.quelle; }
      if (!mhd) for (const z of zeilen) if (z.mhd && z.menge_einheiten > 0 && (!mhd || z.mhd < mhd)) { mhd = z.mhd; quelle = z.mhd_quelle; }
      const tage = mhd ? tageZwischen(heute, mhd) : null;
      const mengeMhd = mhd ? runde(chargen.filter((c) => c.mhd === mhd).reduce((s, c) => s + c.menge, 0)) || menge : 0;
      // bis morgen ablaufend zählt nicht als verfügbar
      const bisMorgen = runde(chargen.filter((c) => c.mhd && tageZwischen(heute, c.mhd) <= 1).reduce((s, c) => s + c.menge, 0));
      const verfuegbar = Math.max(0, runde(menge - bisMorgen));
      const fehlt = Math.max(0, runde(Number(p.mindestbestand) - verfuegbar));

      let ampel: Ampel = 'gut';
      if ((tage != null && tage <= 0 && menge > 0) || (menge === 0 && p.mindestbestand > 0)) ampel = 'sofort';
      else if (fehlt > 0 || (tage != null && tage <= BALD_TAGE && menge > 0)) ampel = 'knapp';

      const zeiten = zeilen.map((z) => z.zeitpunkt).sort();
      return {
        produkt: p,
        menge,
        verfuegbar,
        mhd: menge > 0 ? mhd : null,
        mhd_quelle: menge > 0 ? quelle : null,
        tage_bis_mhd: menge > 0 ? tage : null,
        menge_mhd: menge > 0 ? mengeMhd : 0,
        bereiche: zeilen.map((z) => ({ bereich_id: z.bereich_id, menge: Number(z.menge_einheiten), zeitpunkt: z.zeitpunkt })),
        letzter_scan: zeiten.at(-1) ?? null,
        ampel,
        fehlt,
        wert_eur: p.preis_pro_einheit == null ? null : runde(menge * Number(p.preis_pro_einheit), 2),
      };
    });
}

export function ampelZaehlen(s: ProduktStand[]) {
  return {
    gut: s.filter((x) => x.ampel === 'gut').length,
    knapp: s.filter((x) => x.ampel === 'knapp').length,
    sofort: s.filter((x) => x.ampel === 'sofort').length,
  };
}

/** Warenwert – und ehrlich, wie viele Produkte gar keinen Preis haben. */
export function warenwert(s: ProduktStand[]) {
  const mitPreis = s.filter((x) => x.wert_eur != null);
  return {
    eur: runde(mitPreis.reduce((a, x) => a + (x.wert_eur ?? 0), 0), 2),
    produkte_mit_preis: mitPreis.length,
    produkte_ohne_preis: s.filter((x) => x.wert_eur == null && x.menge > 0).length,
  };
}

/** Bald ablaufend, dringendstes zuerst. */
export function laeuftBaldAb(s: ProduktStand[], tage = 5) {
  return s
    .filter((x) => x.menge > 0 && x.tage_bis_mhd != null && x.tage_bis_mhd <= tage)
    .sort((a, b) => a.tage_bis_mhd! - b.tage_bis_mhd! || b.menge_mhd - a.menge_mhd);
}

// ───────────────────────────────────────────── Einkaufsliste

export type EinkaufZeile = {
  produkt: Produkt;
  menge: number; // Einheiten zu kaufen
  noch_da: number;
  mindestens: number;
  laeuft_ab: boolean;
  quelle: 'auto' | 'hand' | 'assistent';
  abgehakt: boolean;
};

/** Mindestbestand minus Verfügbares, plus was von Hand/Assistent dazukam. */
export function einkaufsliste(s: ProduktStand[], eintraege: EinkaufEintrag[]): EinkaufZeile[] {
  const extra = new Map(eintraege.map((e) => [e.produkt_id, e]));
  const zeilen: EinkaufZeile[] = [];
  for (const x of s) {
    const e = extra.get(x.produkt.id);
    const menge = runde(x.fehlt + (e?.menge_extra ?? 0));
    if (menge <= 0) continue;
    zeilen.push({
      produkt: x.produkt,
      menge: aufGanze(x.produkt, menge),
      noch_da: x.menge,
      mindestens: Number(x.produkt.mindestbestand),
      laeuft_ab: x.tage_bis_mhd != null && x.tage_bis_mhd <= 1,
      quelle: x.fehlt > 0 ? 'auto' : e!.quelle,
      abgehakt: e?.abgehakt ?? false,
    });
  }
  return zeilen.sort((a, b) => Number(a.abgehakt) - Number(b.abgehakt) || b.menge * (b.produkt.preis_pro_einheit ?? 1) - a.menge * (a.produkt.preis_pro_einheit ?? 1));
}

/** Eine halbe Kiste bestellt niemand. Nur wo in kg/l angezeigt wird, bleibt es krumm. */
export function aufGanze(p: Produkt, menge: number): number {
  return zeigtBasis(p) ? runde(menge, 2) : Math.ceil(menge - 1e-9);
}

// ───────────────────────────────────────────── Einheiten

/** In kg/l anzeigen, wenn bekannt ist, wie viel in einer Einheit steckt. */
export function zeigtBasis(p: Pick<Produkt, 'basiseinheit' | 'menge_pro_einheit'>): boolean {
  return p.basiseinheit !== 'stueck' && p.menge_pro_einheit != null;
}

/** Einheiten → angezeigte Zahl + Einheit ("12" + "kg" oder "4" + "kiste"). */
export function anzeigeMenge(p: Pick<Produkt, 'basiseinheit' | 'menge_pro_einheit' | 'zaehleinheit'>, einheiten: number) {
  // Zwei Stellen: 3 Flaschen à 0,25 l sind 0,75 l – mit einer Stelle stand „0,8 l“ da (gemessen 04.10.2026).
  if (zeigtBasis(p)) return { zahl: runde(einheiten * p.menge_pro_einheit!, 2), einheit: p.basiseinheit as string, basis: true };
  return { zahl: runde(einheiten, 2), einheit: p.zaehleinheit as string, basis: false };
}

export function runde(x: number, stellen = 3): number {
  const f = 10 ** stellen;
  return Math.round(x * f) / f;
}

// ───────────────────────────────────────────── Hinweise

export const MAX_HINWEISE = 5;

/** Die wichtigsten 3–5 Hinweise, wichtigste zuerst, jeder mit einer Aktion. */
export function hinweiseBerechnen(s: ProduktStand[], max = MAX_HINWEISE): Hinweis[] {
  const h: Hinweis[] = [];
  for (const x of s) {
    const id = x.produkt.id;
    if (x.menge > 0 && x.tage_bis_mhd != null && x.tage_bis_mhd < 0) {
      h.push({ art: 'abgelaufen', prioritaet: 100, daten: { produkt_id: id, tage: x.tage_bis_mhd, menge: x.menge_mhd }, aktion: 'erledigt' });
    } else if (x.menge > 0 && x.tage_bis_mhd != null && x.tage_bis_mhd <= BALD_TAGE) {
      h.push({ art: 'laeuft_ab', prioritaet: 90 - x.tage_bis_mhd * 10, daten: { produkt_id: id, tage: x.tage_bis_mhd, menge: x.menge_mhd }, aktion: 'erledigt' });
    }
    if (x.menge === 0 && x.produkt.mindestbestand > 0) {
      h.push({ art: 'leer', prioritaet: 85, daten: { produkt_id: id, fehlt: x.fehlt, menge: 0 }, aktion: 'einkaufsliste' });
    } else if (x.fehlt > 0) {
      const anteil = x.produkt.mindestbestand > 0 ? x.fehlt / x.produkt.mindestbestand : 0;
      h.push({ art: 'knapp', prioritaet: 50 + Math.round(anteil * 30), daten: { produkt_id: id, fehlt: x.fehlt, menge: x.menge }, aktion: 'einkaufsliste' });
    }
  }
  return h.sort((a, b) => b.prioritaet - a.prioritaet).slice(0, max);
}

// ───────────────────────────────────────────── Briefing

/** Genau drei Punkte. Immer drei – auch wenn alles gut ist, steht das da. */
export function briefingPunkte(s: ProduktStand[], einkauf: EinkaufZeile[]): BriefingPunkt[] {
  const ab = laeuftBaldAb(s, BALD_TAGE)[0];
  const p1: BriefingPunkt = ab
    ? { art: 'laeuft_ab', produkt_id: ab.produkt.id, tage: ab.tage_bis_mhd!, menge: ab.menge_mhd }
    : { art: 'nichts_laeuft_ab' };
  const knapp = s
    .filter((x) => x.fehlt > 0 && x.produkt.id !== (ab?.produkt.id ?? ''))
    .sort((a, b) => b.fehlt / Math.max(1, b.produkt.mindestbestand) - a.fehlt / Math.max(1, a.produkt.mindestbestand))[0];
  const p2: BriefingPunkt = knapp
    ? { art: 'knapp', produkt_id: knapp.produkt.id, fehlt: knapp.fehlt, menge: knapp.menge }
    : { art: 'alles_da' };
  return [p1, p2, { art: 'einkauf', anzahl: einkauf.filter((e) => !e.abgehakt).length }];
}

/** Welche aktiven Bereiche wurden heute (Betriebs-Tag) noch nicht bestätigt? */
export function fehlendeBereiche(
  bereichIds: string[],
  scans: Array<{ bereich_id: string; status: string; bestaetigt_am: string | null }>,
  zeitzone: string,
  heute: string,
): string[] {
  const erledigt = new Set(
    scans.filter((s) => s.status === 'bestaetigt' && s.bestaetigt_am && tagIn(zeitzone, new Date(s.bestaetigt_am)) === heute)
      .map((s) => s.bereich_id),
  );
  return bereichIds.filter((id) => !erledigt.has(id));
}

// ───────────────────────────────────────────── Nach dem Scan

const hinweisSchluessel = (h: Pick<Hinweis, 'art' | 'daten'>) => `${h.art}:${h.daten.produkt_id ?? ''}`;

/** Was der Chef heute schon als erledigt markiert hat, kommt heute nicht wieder. */
export function hinweiseOhneErledigte(neu: Hinweis[], erledigtHeute: Array<Pick<Hinweis, 'art' | 'daten'>>): Hinweis[] {
  const weg = new Set(erledigtHeute.map(hinweisSchluessel));
  return neu.filter((h) => !weg.has(hinweisSchluessel(h)));
}

/** Ab dieser Priorität ist ein Hinweis eine Push-Nachricht wert (abgelaufen, heute, leer). */
export const PUSH_AB = 85;

/**
 * EINE Nachricht nach dem Scan ("3 Dinge sind wichtig: …") statt einer je Produkt.
 * Nur Wichtiges, das heute noch nicht gemeldet wurde; die wichtigsten 3 zuerst.
 * Nichts Neues → null (dann keine Nachricht).
 */
export function pushZusammenfassung(hinweise: Hinweis[], schonGemeldet: Set<string>): { neu: Hinweis[]; schluessel: string[] } | null {
  const neu = hinweise.filter((h) => h.prioritaet >= PUSH_AB && !schonGemeldet.has(hinweisSchluessel(h)));
  if (!neu.length) return null;
  return { neu: neu.slice(0, 3), schluessel: neu.map(hinweisSchluessel) };
}
