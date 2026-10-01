// Demo ohne Server – zum Anschauen und Durchklicken, bevor Supabase steht.
//
// Deutlich markiert (orangefarbenes Band oben): Die Erkennung ist hier
// SIMULIERT, keine echte KI. Die Rechenlogik (Chargen, Ampel, Einkauf,
// Prüfung der Assistenten-Antworten) ist dieselbe wie im echten Betrieb.
import { blobHelligkeit, zuDunkel } from '../lib/bildpruefung.ts';
import { chargenFortschreiben, fruehestesMhd } from '../../supabase/functions/_shared/logik/chargen.ts';
import { antwortPruefen, type Antwort } from '../../supabase/functions/_shared/logik/antwort.ts';
import {
  anzeigeMenge, briefingPunkte, einkaufsliste, fehlendeBereiche, hinweiseBerechnen, laeuftBaldAb, produktStaende, tagIn,
} from '../../supabase/functions/_shared/logik/lager.ts';
import { bedarf, verbrauchSchaetzen } from '../../supabase/functions/_shared/logik/verbrauch.ts';
import type {
  Bereich, BestandZeile, Betrieb, EinkaufEintrag, Erkennung, Hinweis, Nutzer, Position, Produkt, Scan, Sprache, Weggeworfen,
} from '../../supabase/functions/_shared/logik/typen.ts';
import { texteFuer } from '../i18n/i18n.tsx';
import { DatenFehler, type Api, type AssistentAntwort, type GenauigkeitsZeile, type Kosten, type Sitzung } from './api.ts';

const SPEICHER = 'thechef-demo-v1';
const ZZ = 'Europe/Berlin';
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
const id = () => crypto.randomUUID();

type Zustand = {
  rolle: 'chef' | 'mitarbeiter' | null;
  sprache: Sprache;
  darstellung: Nutzer['darstellung'];
  betrieb: Betrieb;
  bereiche: Bereich[];
  positionen: Position[];
  produkte: Produkt[];
  bestand: Array<BestandZeile & { id: string }>;
  scans: Scan[];
  erkennungen: Erkennung[];
  weggeworfen: Weggeworfen[];
  einkauf: EinkaufEintrag[];
  hinweise: Hinweis[];
  verlauf: Array<{ frage: string; antwort: AssistentAntwort; zeitpunkt: string }>;
  kosten: Kosten[];
};

function tagZurueck(tage: number, stunde = 22, minute = 4) {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  d.setHours(stunde, minute, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString();
const datum = (d: Date) => d.toISOString().slice(0, 10);

function startZustand(): Zustand {
  const betrieb: Betrieb = {
    id: 'demo-betrieb', name: 'ÖZ KEBAB', zeitzone: ZZ, scan_erinnerung_uhrzeit: '22:00', briefing_spaetestens: '23:30',
    foto_loeschfrist_tage: 30, genauigkeitstest: false,
  };
  const B = (key: string, art: Bereich['art'], namen: Bereich['namen'], r: number): Bereich =>
    ({ id: key, betrieb_id: betrieb.id, namen, art, reihenfolge: r, aktiv: true });
  const bereiche = [
    B('kuehl', 'kuehlhaus', { de: 'Kühlhaus', tr: 'Soğuk oda', ku: 'Odeya sar', ar: 'غرفة التبريد', en: 'Cold room' }, 0),
    B('tk', 'tiefkuehler', { de: 'Tiefkühler', tr: 'Derin dondurucu', ku: 'Cemidok', ar: 'المجمّد', en: 'Freezer' }, 1),
    B('trocken', 'trocken', { de: 'Trockenlager', tr: 'Kuru depo', ku: 'Depoya hişk', ar: 'المخزن الجاف', en: 'Dry storage' }, 2),
  ];
  const P = (pid: string, bereich: string, namen: Position['namen'], r: number): Position =>
    ({ id: pid, betrieb_id: betrieb.id, bereich_id: bereich, namen, referenzfoto_pfad: null, reihenfolge: r, aktiv: true });
  const positionen = [
    P('kuehl-l', 'kuehl', { de: 'Regal links', tr: 'Sol raf', ku: 'Refika çepê', ar: 'الرف الأيسر', en: 'Left shelf' }, 0),
    P('kuehl-r', 'kuehl', { de: 'Regal rechts', tr: 'Sağ raf', ku: 'Refika rastê', ar: 'الرف الأيمن', en: 'Right shelf' }, 1),
    P('tk-1', 'tk', { de: 'Truhe', tr: 'Sandık', ku: 'Sandoq', ar: 'الصندوق', en: 'Chest' }, 0),
    P('trocken-1', 'trocken', { de: 'Regal', tr: 'Raf', ku: 'Refik', ar: 'الرف', en: 'Shelf' }, 0),
  ];
  const X = (pid: string, namen: Produkt['namen'], x: Partial<Produkt>): Produkt => ({
    id: pid, betrieb_id: betrieb.id, namen, namen_bestaetigt: ['de', 'tr', 'ku', 'ar', 'en'], kategorie: 'sonstiges', zaehleinheit: 'stueck',
    menge_pro_einheit: null, basiseinheit: 'stueck', referenzfoto_pfad: null, mindestbestand: 0, standard_haltbarkeit_tage: null,
    preis_pro_einheit: null, bereich_ids: [], aktiv: true, ...x,
  });
  const produkte = [
    X('haehnchen', { de: 'Hähnchenbrust', tr: 'Tavuk göğsü', ku: 'Singê mirîşkê', ar: 'صدر دجاج', en: 'Chicken breast' },
      { kategorie: 'fleisch', zaehleinheit: 'kiste', menge_pro_einheit: 5, basiseinheit: 'kg', mindestbestand: 5, standard_haltbarkeit_tage: 4, preis_pro_einheit: 34, bereich_ids: ['kuehl'] }),
    X('joghurt', { de: 'Joghurt', tr: 'Yoğurt', ku: 'Mast', ar: 'لبن زبادي', en: 'Yoghurt' },
      { kategorie: 'milch', zaehleinheit: 'becher', mindestbestand: 20, standard_haltbarkeit_tage: 7, preis_pro_einheit: 1.2, bereich_ids: ['kuehl'] }),
    X('tomaten', { de: 'Tomaten', tr: 'Domates', ku: 'Bacanên sor', ar: 'طماطم', en: 'Tomatoes' },
      { kategorie: 'gemuese', zaehleinheit: 'kiste', menge_pro_einheit: 6, basiseinheit: 'kg', mindestbestand: 6, standard_haltbarkeit_tage: 5, preis_pro_einheit: 12, bereich_ids: ['kuehl'] }),
    X('salat', { de: 'Eisbergsalat', tr: 'Aysberg marul', ku: 'Kahûya aysberg', ar: 'خس آيسبرغ', en: 'Iceberg lettuce' },
      { kategorie: 'gemuese', zaehleinheit: 'kiste', mindestbestand: 4, standard_haltbarkeit_tage: 5, preis_pro_einheit: 11, bereich_ids: ['kuehl'] }),
    X('doener', { de: 'Dönerspieß', tr: 'Döner şiş', ku: 'Şîşa dönerê', ar: 'سيخ شاورما', en: 'Doner cone' },
      { kategorie: 'fleisch', zaehleinheit: 'spiess', mindestbestand: 4, standard_haltbarkeit_tage: 6, preis_pro_einheit: 95, bereich_ids: ['kuehl'] }),
    X('brot', { de: 'Fladenbrot', tr: 'Pide', ku: 'Nanê pîde', ar: 'خبز', en: 'Flatbread' },
      { kategorie: 'brot', zaehleinheit: 'stueck', mindestbestand: 40, standard_haltbarkeit_tage: 3, preis_pro_einheit: 0.35, bereich_ids: ['trocken'] }),
    X('pommes', { de: 'Pommes', tr: 'Patates kızartması', ku: 'Kartolên sorkirî', ar: 'بطاطا مقلية', en: 'Fries' },
      { kategorie: 'tiefkuehl', zaehleinheit: 'beutel', menge_pro_einheit: 2.5, basiseinheit: 'kg', mindestbestand: 6, standard_haltbarkeit_tage: 180, preis_pro_einheit: 4.5, bereich_ids: ['tk'] }),
  ];

  // Drei Wochen Verlauf, damit der Assistent Verbrauch schätzen kann.
  const bestand: Zustand['bestand'] = [];
  const scans: Scan[] = [];
  const verlauf: Record<string, number[]> = {
    // Stand je Abend, ältester zuerst (21 Tage). Anstiege = Lieferung.
    haehnchen: [6, 5, 3.8, 3, 6.2, 5, 3.6, 2.6, 6, 5.2, 4, 3, 6.4, 5.4, 4.2, 3, 6, 5, 4, 3.2, 2.4],
    joghurt: [30, 27, 24, 21, 40, 37, 33, 30, 27, 24, 40, 36, 33, 30, 26, 23, 40, 36, 30, 24, 18],
    tomaten: [8, 7, 6, 10, 9, 8, 7, 10, 9, 8, 7, 6, 10, 9, 8, 7, 6, 10, 8, 6, 4],
    salat: [5, 4, 3, 6, 5, 4, 3, 6, 5, 4, 3, 6, 5, 4, 3, 2, 6, 5, 3, 2, 1],
    doener: [6, 5, 4, 3, 8, 7, 6, 5, 4, 8, 7, 6, 5, 4, 8, 7, 6, 5, 4, 3, 3],
    brot: [80, 60, 40, 90, 70, 50, 90, 70, 50, 30, 90, 70, 50, 90, 70, 50, 90, 70, 60, 70, 60],
    pommes: [10, 9, 8, 7, 6, 12, 11, 10, 9, 8, 7, 12, 11, 10, 9, 8, 7, 12, 10, 9, 8],
  };
  const bereichVon = Object.fromEntries(produkte.map((p) => [p.id, p.bereich_ids[0]]));
  for (let i = 0; i < 21; i++) {
    const tage = 20 - i;
    // heute: nur das Kühlhaus ist schon gescannt (wie Main.dc.html: "1 von 3 erledigt")
    const t = tage === 0 ? tagZurueck(0, 8, 12) : tagZurueck(tage);
    for (const b of bereiche) {
      if (tage === 0 && b.id !== 'kuehl') continue;
      scans.push({ id: `scan-${i}-${b.id}`, betrieb_id: betrieb.id, bereich_id: b.id, nutzer_id: 'halil', lokal_id: `l-${i}-${b.id}`, zeitpunkt: iso(t), status: 'bestaetigt', bestaetigt_am: iso(t), fehler: null });
    }
    for (const p of produkte) {
      const b = bereichVon[p.id];
      if (tage === 0 && b !== 'kuehl') continue;
      const alt = [...bestand].reverse().find((z) => z.produkt_id === p.id);
      // Joghurt: Etikett gelesen, läuft heute ab (wie im Mockup)
      const etikett = p.id === 'joghurt' && tage === 0 ? datum(new Date()) : null;
      const chargen = chargenFortschreiben(alt?.chargen ?? [], verlauf[p.id][i], t, etikett, p.standard_haltbarkeit_tage);
      if (p.id === 'joghurt' && tage === 0) chargen.forEach((c) => { c.mhd = datum(new Date()); c.quelle = 'etikett'; });
      const f = fruehestesMhd(chargen);
      bestand.push({ id: id(), produkt_id: p.id, bereich_id: b, menge_einheiten: verlauf[p.id][i], chargen, mhd: f.mhd, mhd_quelle: f.quelle, zeitpunkt: iso(t) });
    }
  }

  const monatsanfang = new Date(); monatsanfang.setDate(1);
  const vormonat = new Date(monatsanfang); vormonat.setMonth(vormonat.getMonth() - 1);
  const W = (pid: string, menge: number, wert: number, tag: Date): Weggeworfen => ({ id: id(), produkt_id: pid, menge_einheiten: menge, wert_eur: wert, zeitpunkt: iso(tag), nutzer_id: 'halil' });
  const inMonat = (basis: Date, tag: number) => { const d = new Date(basis); d.setDate(Math.min(tag, 27)); d.setHours(21); return d > new Date() ? new Date(Date.now() - 3600e3) : d; };
  const weggeworfen = [
    W('joghurt', 18, 21.6, inMonat(monatsanfang, 4)), W('joghurt', 10, 12.4, inMonat(monatsanfang, 15)),
    W('salat', 2, 22, inMonat(monatsanfang, 9)), W('tomaten', 1.5, 18, inMonat(monatsanfang, 12)), W('brot', 34, 12, inMonat(monatsanfang, 20)),
    W('joghurt', 30, 36, inMonat(vormonat, 8)), W('salat', 3, 33, inMonat(vormonat, 14)), W('tomaten', 2, 24, inMonat(vormonat, 20)), W('brot', 50, 17, inMonat(vormonat, 25)),
  ];
  return {
    rolle: null, sprache: 'de', darstellung: {}, betrieb, bereiche, positionen, produkte, bestand, scans,
    erkennungen: [], weggeworfen, einkauf: [], hinweise: [], verlauf: [], kosten: [],
  };
}

/** Die auf dem Sprach-Screen gewählte Sprache (vor der Anmeldung). */
function gewaehlteSprache(): Sprache | null {
  try { return (localStorage.getItem('thechef-sprache') as Sprache) || null; } catch { return null; }
}

export function demoApi(): Api {
  let z: Zustand;
  try {
    const roh = localStorage.getItem(SPEICHER);
    z = roh ? (JSON.parse(roh) as Zustand) : startZustand();
  } catch {
    z = startZustand();
  }
  const fotos = new Map<string, string>(); // Foto-ID → Objekt-URL (nur diese Sitzung)
  const scanFotos = new Map<string, Array<{ id: string; position_id: string | null; url: string; breite: number; hoehe: number }>>();

  function sichern() {
    try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch { /* voll/privat: Demo läuft trotzdem */ }
  }
  function aktuellerBestand(): BestandZeile[] {
    const m = new Map<string, BestandZeile>();
    for (const b of z.bestand) {
      const k = `${b.produkt_id}|${b.bereich_id}`;
      const alt = m.get(k);
      if (!alt || alt.zeitpunkt <= b.zeitpunkt) m.set(k, b);
    }
    return [...m.values()];
  }
  function nutzer(): Nutzer {
    return {
      id: z.rolle === 'chef' ? 'chef' : 'halil', betrieb_id: z.betrieb.id, name: z.rolle === 'chef' ? 'Mehmet' : 'Halil',
      rolle: z.rolle ?? 'mitarbeiter', sprache: z.sprache, darstellung: z.darstellung, push_an: true,
    };
  }
  function heute() { return tagIn(ZZ); }
  function staende() { return produktStaende(z.produkte, aktuellerBestand(), heute()); }
  function kostenBuchen(art: string, ein: number, aus: number) {
    z.kosten.push({ art, kosten_eur: 0, tokens_ein: ein, tokens_aus: aus, zeitpunkt: new Date().toISOString(), betrieb_id: z.betrieb.id, modell: 'demo (keine KI)' });
  }

  const api: Api = {
    demo: true,

    async sitzung(): Promise<Sitzung | null> {
      if (!z.rolle) return null;
      return { art: 'fertig', nutzer: nutzer(), betrieb: z.betrieb };
    },
    async anmelden() { z.rolle = 'chef'; z.sprache = gewaehlteSprache() ?? z.sprache; sichern(); },
    async registrieren() { z.rolle = 'chef'; z.sprache = gewaehlteSprache() ?? z.sprache; sichern(); return { mailBestaetigen: false }; },
    async abmelden() { z.rolle = null; sichern(); },
    async betriebAnlegen(name, _n, sprache) { z.betrieb.name = name; z.sprache = sprache; z.rolle = 'chef'; sichern(); },
    async beitreten(_c, _n, sprache) { z.sprache = sprache; z.rolle = 'mitarbeiter'; sichern(); },
    async einladungErstellen() { return 'K7M4PQ'; },
    async profilAendern(p) {
      if (p.sprache) z.sprache = p.sprache;
      if (p.darstellung) z.darstellung = p.darstellung;
      sichern();
    },
    async betriebAendern(p) { z.betrieb = { ...z.betrieb, ...p }; sichern(); },
    async team() {
      return [
        { id: 'chef', betrieb_id: z.betrieb.id, name: 'Mehmet', rolle: 'chef', sprache: 'tr', darstellung: {}, push_an: true },
        { id: 'halil', betrieb_id: z.betrieb.id, name: 'Halil', rolle: 'mitarbeiter', sprache: 'ku', darstellung: {}, push_an: true },
      ];
    },
    async teamEntfernen() { throw new DatenFehler('fehler.demo'); },

    async bereiche() { return z.bereiche.filter((b) => b.aktiv).sort((a, b) => a.reihenfolge - b.reihenfolge); },
    async bereichSpeichern(b) {
      const neu = { id: b.id ?? id(), betrieb_id: z.betrieb.id, art: 'sonstig', reihenfolge: z.bereiche.length, aktiv: true, ...b } as Bereich;
      z.bereiche = [...z.bereiche.filter((x) => x.id !== neu.id), neu]; sichern(); return neu;
    },
    async bereichLoeschen(bid) { z.bereiche = z.bereiche.map((b) => (b.id === bid ? { ...b, aktiv: false } : b)); sichern(); },
    async positionen() { return z.positionen.filter((p) => p.aktiv).sort((a, b) => a.reihenfolge - b.reihenfolge); },
    async positionSpeichern(p, foto) {
      const pid = p.id ?? id();
      let pfad = p.referenzfoto_pfad ?? null;
      if (foto) { pfad = `demo:${pid}`; fotos.set(pfad, URL.createObjectURL(foto)); }
      const neu = { betrieb_id: z.betrieb.id, reihenfolge: 0, aktiv: true, ...p, id: pid, referenzfoto_pfad: pfad } as Position;
      z.positionen = [...z.positionen.filter((x) => x.id !== pid), neu]; sichern(); return neu;
    },
    async positionLoeschen(pid) { z.positionen = z.positionen.map((p) => (p.id === pid ? { ...p, aktiv: false } : p)); sichern(); },
    async produkte() { return z.produkte; },
    async produktSpeichern(p, foto) {
      const pid = p.id ?? id();
      let pfad = p.referenzfoto_pfad ?? null;
      if (foto) { pfad = `demo:${pid}`; fotos.set(pfad, URL.createObjectURL(foto)); }
      const alt = z.produkte.find((x) => x.id === pid);
      const neu = {
        betrieb_id: z.betrieb.id, namen_bestaetigt: [], kategorie: 'sonstiges', zaehleinheit: 'stueck', menge_pro_einheit: null,
        basiseinheit: 'stueck', mindestbestand: 0, standard_haltbarkeit_tage: null, preis_pro_einheit: null, bereich_ids: [], aktiv: true,
        ...alt, ...p, id: pid, referenzfoto_pfad: pfad,
      } as Produkt;
      z.produkte = [...z.produkte.filter((x) => x.id !== pid), neu]; sichern(); return neu;
    },
    async produktLoeschen(pid) { z.produkte = z.produkte.map((p) => (p.id === pid ? { ...p, aktiv: false } : p)); sichern(); },
    async namenVorschlagen(name, von) {
      await warte(500);
      // Demo: keine KI. Nur den Namen in der Ausgangssprache zurückgeben – ehrlich leer statt erfunden.
      return { [von]: name };
    },
    async bildUrl(pfad) { return fotos.get(pfad) ?? null; },

    async scansSeit(seit) { return z.scans.filter((s) => s.zeitpunkt >= seit).sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt)); },
    async scanHochladen(scan, liste) {
      const vorhanden = z.scans.find((s) => s.lokal_id === scan.lokal_id);
      if (vorhanden) return vorhanden.id;
      const sid = id();
      z.scans.push({ id: sid, betrieb_id: z.betrieb.id, bereich_id: scan.bereich_id, nutzer_id: nutzer().id, lokal_id: scan.lokal_id, zeitpunkt: new Date().toISOString(), status: 'hochgeladen', bestaetigt_am: null, fehler: null });
      scanFotos.set(sid, liste.map((f) => {
        const url = URL.createObjectURL(f.blob);
        fotos.set(`foto:${f.id}`, url);
        return { id: f.id, position_id: f.position_id, url, breite: f.breite, hoehe: f.hoehe };
      }));
      sichern();
      return sid;
    },
    async erkennen(scanId) {
      await warte(1600);
      const s = z.scans.find((x) => x.id === scanId);
      if (!s) throw new DatenFehler('fehler.laden', 'Scan');
      const fotoListe = scanFotos.get(scanId) ?? [];
      const im = z.produkte.filter((p) => p.aktiv && p.bereich_ids.includes(s.bereich_id));
      const alt = aktuellerBestand();
      z.erkennungen = z.erkennungen.filter((e) => e.scan_id !== scanId);
      im.forEach((p, i) => {
        const vorher = alt.find((b) => b.produkt_id === p.id && b.bereich_id === s.bereich_id)?.menge_einheiten ?? 2;
        const anzahl = Math.max(0, Math.round(vorher * (0.8 + Math.random() * 0.2)));
        if (anzahl === 0 && Math.random() < 0.5) return;
        const spalte = i % 3, zeile = Math.floor(i / 3);
        z.erkennungen.push({
          id: id(), scan_id: scanId, scan_foto_id: fotoListe[i % Math.max(1, fotoListe.length)]?.id ?? null, produkt_id: p.id,
          anzahl_erkannt: anzahl,
          // Eine Erkennung bewusst unsicher, damit die Rückfrage zu sehen ist
          sicherheit: i === 2 ? 0.55 : 0.8 + Math.random() * 0.19,
          mhd: p.id === 'joghurt' ? datum(new Date()) : null,
          box: { x: 0.05 + spalte * 0.31, y: 0.1 + zeile * 0.4, b: 0.28, h: 0.35 },
          anzahl_bestaetigt: null, von_hand: false,
        });
      });
      // Wie der Server: ein zu dunkles Foto melden (dort sagt es die KI).
      const hell = await Promise.all(fotoListe.map((f) => fetch(f.url).then((r) => r.blob()).then(blobHelligkeit).catch(() => 255)));
      s.erkennung_hinweise = { bildqualitaet: hell.some(zuDunkel) ? ['dunkel'] : [], unbekannt: [] };
      s.status = 'erkannt';
      kostenBuchen('scan', 0, 0);
      sichern();
    },
    async erkennungen(scanId) { return z.erkennungen.filter((e) => e.scan_id === scanId); },
    async scanFotos(scanId) { return scanFotos.get(scanId) ?? []; },
    async letztesFotoUrl(positionId) {
      for (const liste of [...scanFotos.values()].reverse()) {
        const f = liste.find((x) => x.position_id === positionId);
        if (f) return f.url;
      }
      return null;
    },
    async scanBestaetigen(scanId, positionen) {
      const s = z.scans.find((x) => x.id === scanId);
      if (!s) throw new DatenFehler('fehler.laden', 'Scan');
      if (s.status === 'bestaetigt') return { produkte: 0 };
      const jetzt = new Date();
      const summe = new Map<string, { anzahl: number; mhd: string | null }>();
      for (const p of positionen) {
        const a = summe.get(p.produkt_id) ?? { anzahl: 0, mhd: null };
        a.anzahl += p.anzahl;
        if (p.mhd && (!a.mhd || p.mhd < a.mhd)) a.mhd = p.mhd;
        summe.set(p.produkt_id, a);
      }
      for (const b of aktuellerBestand()) {
        if (b.bereich_id === s.bereich_id && b.menge_einheiten > 0 && !summe.has(b.produkt_id)) summe.set(b.produkt_id, { anzahl: 0, mhd: null });
      }
      const alt = aktuellerBestand();
      let n = 0;
      for (const [pid, w] of summe) {
        const p = z.produkte.find((x) => x.id === pid)!;
        const vorher = alt.find((b) => b.produkt_id === pid && b.bereich_id === s.bereich_id);
        const chargen = chargenFortschreiben(vorher?.chargen ?? [], w.anzahl, jetzt, w.mhd, p.standard_haltbarkeit_tage);
        const f = fruehestesMhd(chargen);
        z.bestand.push({ id: id(), produkt_id: pid, bereich_id: s.bereich_id, menge_einheiten: w.anzahl, chargen, mhd: f.mhd, mhd_quelle: f.quelle, zeitpunkt: jetzt.toISOString() });
        if (w.anzahl > 0) n++;
        if (!z.erkennungen.some((e) => e.scan_id === scanId && e.produkt_id === pid)) {
          z.erkennungen.push({ id: id(), scan_id: scanId, scan_foto_id: null, produkt_id: pid, anzahl_erkannt: 0, sicherheit: 0, mhd: null, box: null, anzahl_bestaetigt: w.anzahl, von_hand: true });
        }
      }
      z.erkennungen.forEach((e) => { if (e.scan_id === scanId) e.anzahl_bestaetigt = summe.get(e.produkt_id)?.anzahl ?? 0; });
      s.status = 'bestaetigt';
      s.bestaetigt_am = jetzt.toISOString();
      sichern();
      return { produkte: n };
    },
    async nachScan() {
      z.hinweise = hinweiseBerechnen(staende()).map((h) => ({ ...h, id: id(), erledigt: false, erstellt_am: new Date().toISOString() }));
      sichern();
    },

    async bestand() { return aktuellerBestand(); },
    async weggeworfen(von, bis) { return z.weggeworfen.filter((w) => w.zeitpunkt >= von && w.zeitpunkt < bis); },
    async wegwerfen(pid, menge) {
      const p = z.produkte.find((x) => x.id === pid);
      z.weggeworfen.push({ id: id(), produkt_id: pid, menge_einheiten: menge, wert_eur: p?.preis_pro_einheit == null ? null : Math.round(menge * p.preis_pro_einheit * 100) / 100, zeitpunkt: new Date().toISOString(), nutzer_id: nutzer().id });
      sichern();
    },
    async einkaufEintraege(d) { return z.einkauf.filter((e) => e.datum === d); },
    async einkaufSetzen(e) {
      z.einkauf = [...z.einkauf.filter((x) => !(x.datum === e.datum && x.produkt_id === e.produkt_id)), e]; sichern();
    },

    async fragen(frage, sprache) {
      await warte(900);
      const a = await demoAntwort(frage, sprache);
      z.verlauf.push({ frage, antwort: a, zeitpunkt: new Date().toISOString() });
      kostenBuchen('assistent', 0, 0);
      sichern();
      return a;
    },
    async verlauf() { return z.verlauf.slice(-20); },
    async briefing(d) {
      // Wie im echten Betrieb: erst ab der Briefing-Zeit gibt es ein gesendetes Briefing
      if (d !== heute() || new Date().toTimeString().slice(0, 5) < z.betrieb.briefing_spaetestens.slice(0, 5)) return null;
      const s = staende();
      const offen = fehlendeBereiche(z.bereiche.filter((b) => b.aktiv).map((b) => b.id), z.scans, ZZ, d);
      return {
        datum: d, gescannt: offen.length === 0, fehlende_bereiche: offen,
        punkte: briefingPunkte(s, einkaufsliste(s, z.einkauf.filter((e) => e.datum === d))), tagesgericht: {},
        gesendet_am: new Date().toISOString(),
      };
    },
    async tagesgericht(sprache) {
      await warte(700);
      const ab = laeuftBaldAb(staende(), 3)[0];
      if (!ab) return null;
      const t = await texteFuer(sprache);
      return { gericht: t.t('demo.tagesgericht', { produkt: t.name(ab.produkt.namen) }), grund: t.t('demo.tagesgericht_grund', { produkt: t.name(ab.produkt.namen) }) };
    },
    async hinweise() {
      if (!z.hinweise.length) await api.nachScan('');
      return z.hinweise.filter((h) => !h.erledigt);
    },
    async hinweisErledigt(hid) { z.hinweise = z.hinweise.map((h) => (h.id === hid ? { ...h, erledigt: true } : h)); sichern(); },
    async spracheZuText() {
      await warte(600);
      throw new DatenFehler('fehler.sprache_demo');
    },
    async pushSpeichern() { /* Demo: nichts zu speichern */ },

    async kosten(seit) { return z.kosten.filter((k) => k.zeitpunkt >= seit); },
    async genauigkeit(seit): Promise<GenauigkeitsZeile[]> {
      return z.erkennungen
        .filter((e) => e.anzahl_bestaetigt != null)
        .map((e) => ({ scan_id: e.scan_id, produkt_id: e.produkt_id, erkannt: e.anzahl_erkannt, bestaetigt: e.anzahl_bestaetigt!, sicherheit: e.sicherheit, von_hand: e.von_hand, zeitpunkt: z.scans.find((s) => s.id === e.scan_id)?.zeitpunkt ?? '' }))
        .filter((e) => e.zeitpunkt >= seit);
    },
  };

  /** Demo-Assistent: versteht einige Fragen, rechnet mit derselben Logik, prüft seine Antwort wie der echte. */
  async function demoAntwort(frage: string, sprache: Sprache): Promise<AssistentAntwort> {
    const t = await texteFuer(sprache);
    const f = frage.toLocaleLowerCase();
    const s = staende();
    const letzter = aktuellerBestand().map((b) => b.zeitpunkt).sort().at(-1) ?? null;
    const produkt = s.find((x) => Object.values(x.produkt.namen).some((n) => n && f.includes(n.toLocaleLowerCase().slice(0, 5))));
    const tools: unknown[] = [];
    let a: Antwort;

    if (/bestell|einkauf|kauf|sipariş|alış|bikir|kirîn|اطلب|شراء|order|buy/.test(f)) {
      const liste = einkaufsliste(s, z.einkauf.filter((e) => e.datum === heute()));
      tools.push({ einkaufsliste: liste.map((e) => ({ produkt: e.produkt.id, menge: e.menge, anzeige: anzeigeMenge(e.produkt, e.menge).zahl })), anzahl: liste.length, letzter_scan: letzter });
      a = {
        satz: t.t('demo.einkauf_satz', { n: liste.length }), text: liste.map((e) => `${t.name(e.produkt.namen)} +${t.menge(anzeigeMenge(e.produkt, e.menge).zahl, anzeigeMenge(e.produkt, e.menge).einheit)}`).join(' · '),
        kacheln: [], quelle: t.t('demo.quelle_bestand'), stand: letzter, schaetzung: false, daten_alt: false, aktion: { typ: 'einkauf' },
      };
    } else if (produkt && /reicht|genug|yeter|bes e|têr|يكفي|enough|last/.test(f)) {
      const verlaufP = z.bestand.filter((b) => b.produkt_id === produkt.produkt.id);
      const v = verbrauchSchaetzen(verlaufP, z.weggeworfen.filter((w) => w.produkt_id === produkt.produkt.id));
      const b = bedarf(v, [5, 6, 0]); // Fr–So
      if (b.menge == null) {
        a = { satz: t.t('demo.zu_wenig_daten'), text: '', kacheln: [], quelle: null, stand: null, schaetzung: true, daten_alt: false, aktion: null };
      } else {
        const fehlt = Math.max(0, b.menge - produkt.verfuegbar);
        const an = (x: number) => anzeigeMenge(produkt.produkt, x);
        tools.push({ noch_da: [produkt.verfuegbar, an(produkt.verfuegbar).zahl], bedarf: [b.menge, an(b.menge).zahl], fehlt: [fehlt, an(fehlt).zahl], letzter_scan: produkt.letzter_scan, tage: v.tage_abgedeckt });
        const e = an(0).einheit;
        a = {
          satz: fehlt > 0 ? t.t('demo.reicht_nein', { menge: t.menge(an(fehlt).zahl, e) }) : t.t('demo.reicht_ja'),
          text: '',
          kacheln: [
            { art: 'noch_da', titel: t.t('antwort.noch_da'), zahl: an(produkt.verfuegbar).zahl, einheit: t.einheit(e, an(produkt.verfuegbar).zahl) },
            { art: 'brauchst', titel: t.t('antwort.brauchst'), zahl: an(b.menge).zahl, einheit: t.einheit(e, an(b.menge).zahl) },
            { art: 'fehlt', titel: t.t('antwort.fehlt'), zahl: an(fehlt).zahl, einheit: t.einheit(e, an(fehlt).zahl) },
          ],
          quelle: t.t('demo.quelle_verbrauch', { tage: Math.round(v.tage_abgedeckt) }), stand: produkt.letzter_scan, schaetzung: true, daten_alt: false,
          aktion: fehlt > 0 ? { typ: 'einkaufsliste', produkt_id: produkt.produkt.id, menge_einheiten: Math.ceil(fehlt) } : null,
        };
        if (a.aktion?.typ === 'einkaufsliste') tools.push({ bestellmenge: Math.ceil(fehlt) });
      }
    } else if (produkt) {
      const an = anzeigeMenge(produkt.produkt, produkt.menge);
      tools.push({ menge: [produkt.menge, an.zahl], letzter_scan: produkt.letzter_scan });
      a = {
        satz: t.t('demo.bestand_satz', { produkt: t.name(produkt.produkt.namen), menge: t.menge(an.zahl, an.einheit) }), text: '',
        kacheln: [{ art: 'noch_da', titel: t.t('antwort.noch_da'), zahl: an.zahl, einheit: t.einheit(an.einheit, an.zahl) }],
        quelle: t.t('demo.quelle_bestand'), stand: produkt.letzter_scan, schaetzung: false, daten_alt: false, aktion: { typ: 'bestand' },
      };
    } else if (/weg|verlust|çöp|avêt|هدر|رمي|waste|thrown/.test(f)) {
      const anfang = new Date(); anfang.setDate(1); anfang.setHours(0, 0, 0, 0);
      const summe = Math.round(z.weggeworfen.filter((w) => w.zeitpunkt >= anfang.toISOString()).reduce((x, w) => x + (w.wert_eur ?? 0), 0));
      tools.push({ summe_eur: summe, letzter_scan: letzter });
      a = { satz: t.t('demo.weg_satz', { betrag: t.geld(summe) }), text: '', kacheln: [], quelle: t.t('demo.quelle_weg'), stand: letzter, schaetzung: false, daten_alt: false, aktion: { typ: 'verlust' } };
    } else {
      a = { satz: t.t('demo.unbekannt'), text: '', kacheln: [], quelle: null, stand: null, schaetzung: false, daten_alt: false, aktion: null };
    }
    const pr = antwortPruefen(a, tools);
    if (!pr.ok) {
      console.warn('Demo-Antwort verworfen', pr);
      return { satz: t.t('assistent.verworfen'), text: '', kacheln: [], quelle: null, stand: null, schaetzung: false, daten_alt: false, aktion: null, verworfen: true };
    }
    return a;
  }

  return api;
}

export function demoZuruecksetzen() {
  try { localStorage.removeItem(SPEICHER); } catch { /* egal */ }
}
