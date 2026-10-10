// Gemeinsames für die Chef-Seiten: Lager laden und strukturierte Hinweise in Text verwandeln.
import {
  anzeigeMenge, einkaufsliste, produktStaende, tagIn, type ProduktStand,
} from '../../supabase/functions/_shared/logik/lager.ts';
import type { BriefingPunkt, Hinweis, Produkt } from '../../supabase/functions/_shared/logik/typen.ts';
import { useIch, useLaden } from '../app/kontext.tsx';
import type { T } from '../i18n/i18n.tsx';

export function useLager() {
  const { betrieb } = useIch();
  const heute = tagIn(betrieb.zeitzone);
  return useLaden(async (a) => {
    const monat = new Date(); monat.setDate(1); monat.setHours(0, 0, 0, 0);
    const [produkte, bestand, bereiche, eintraege, weg, team] = await Promise.all([
      a.produkte(), a.bestand(), a.bereiche(), a.einkaufEintraege(heute),
      a.weggeworfen(monat.toISOString(), new Date(Date.now() + 864e5).toISOString()), a.team().catch(() => []),
    ]);
    const staende = produktStaende(produkte, bestand, heute);
    const letzterScan = bestand.map((b) => b.zeitpunkt).sort().at(-1) ?? null;
    return {
      heute, produkte, bestand, bereiche, staende, eintraege, team,
      einkauf: einkaufsliste(staende, eintraege),
      wegMonat: weg.reduce((s, w) => s + (w.wert_eur ?? 0), 0),
      letzterScan,
    };
  });
}

export function mengeText(t: T, p: Produkt, einheiten: number) {
  const a = anzeigeMenge(p, einheiten);
  return t.menge(a.zahl, a.einheit);
}

export function hinweisText(t: T, h: Hinweis, produkte: Produkt[], bereichName: (id: string) => string) {
  const p = produkte.find((x) => x.id === h.daten.produkt_id);
  const produkt = p ? t.name(p.namen) : '';
  const menge = p && h.daten.menge != null ? mengeText(t, p, h.daten.menge) : '';
  const fehlt = p && h.daten.fehlt != null ? mengeText(t, p, h.daten.fehlt) : '';
  switch (h.art) {
    case 'abgelaufen': return { titel: t.t('hinweis.abgelaufen', { produkt }), unter: menge };
    case 'laeuft_ab': return { titel: t.t('hinweis.laeuft_ab', { produkt, wann: t.mhdWann(h.daten.tage ?? 0) }), unter: menge };
    case 'leer': return { titel: t.t('hinweis.leer', { produkt }), unter: t.t('hinweis.bestellen', { menge: fehlt }) };
    case 'knapp': return { titel: t.t('hinweis.knapp', { produkt }), unter: t.t('hinweis.fehlen', { menge: fehlt }) };
    case 'nicht_gescannt': return { titel: t.t('hinweis.nicht_gescannt'), unter: (h.daten.bereich_ids ?? []).map(bereichName).join(', ') };
  }
}

export function briefingText(t: T, b: BriefingPunkt, produkte: Produkt[]): { stark: string; leise: string } {
  const p = 'produkt_id' in b ? produkte.find((x) => x.id === b.produkt_id) : undefined;
  const produkt = p ? t.name(p.namen) : '';
  switch (b.art) {
    case 'laeuft_ab': return { stark: t.t(b.tage < 0 ? 'briefing.abgelaufen' : 'briefing.laeuft_ab', { produkt, wann: t.mhdWann(b.tage) }), leise: p ? mengeText(t, p, b.menge) : '' };
    case 'nichts_laeuft_ab': return { stark: t.t('briefing.nichts_laeuft_ab'), leise: '' };
    case 'knapp': return { stark: t.t('briefing.knapp', { produkt }), leise: p ? t.t('briefing.bestellen', { menge: mengeText(t, p, b.fehlt) }) : '' };
    case 'alles_da': return { stark: t.t('briefing.alles_da'), leise: '' };
    case 'einkauf': return { stark: t.t('briefing.einkauf'), leise: t.t('briefing.artikel', { n: b.anzahl }) };
  }
}

export function ampelWort(t: T, s: ProduktStand) {
  return s.ampel === 'sofort' ? t.t('ampel.sofort') : s.ampel === 'knapp' ? t.t('ampel.knapp') : t.t('ampel.gut');
}
