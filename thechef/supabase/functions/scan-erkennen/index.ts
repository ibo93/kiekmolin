// Scan-Erkennung: Fotos einer Position → gezählte Einheiten je Katalog-Produkt.
//
// Regeln (THECHEF.md): Die KI ZÄHLT EINHEITEN (Kisten, Becher, Stück) –
// sie schätzt kein Gewicht. Jede Erkennung hat einen Sicherheitswert; ist
// sie unsicher, fragt die App nach. Produkt-IDs sind im Schema als enum
// festgelegt: eine erfundene ID kann gar nicht zurückkommen.
//
// Mehrere Fotos derselben Position gehen in EINEN Aufruf, damit
// Überlappungen nicht doppelt gezählt werden. Verschiedene Positionen
// laufen parallel und werden erst beim Bestätigen summiert.
import { admin, aufrufer, bedienen, fehler, json } from '../_shared/http.ts';
import { addieren, anfrage, base64, kostenBuchen, MODELL, NULL_NUTZUNG, textAus, type Nutzung } from '../_shared/claude.ts';
import type { Produkt } from '../_shared/logik/typen.ts';

/** Referenzfotos im Katalog: höchstens so viele pro Aufruf (Kosten). */
const MAX_REFERENZEN = 24;

type Foto = { id: string; position_id: string | null; foto_pfad: string; breite: number | null; hoehe: number | null };

function schema(ids: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['erkennungen', 'unbekannt', 'bildqualitaet'],
    properties: {
      erkennungen: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['produkt_id', 'anzahl_einheiten', 'sicherheit', 'mhd', 'foto', 'box', 'begruendung'],
          properties: {
            produkt_id: { type: 'string', enum: ids },
            anzahl_einheiten: { type: 'number', description: 'Gezählte Zähleinheiten. Halbe nur, wenn eine Einheit sichtbar halb leer ist.' },
            sicherheit: { type: 'number', description: '0 bis 1. Unter 0.75, wenn verdeckt, gestapelt ohne sichtbare Tiefe, unscharf oder verwechselbar.' },
            mhd: { type: ['string', 'null'], description: 'Mindesthaltbarkeitsdatum YYYY-MM-DD, NUR wenn auf einem Etikett lesbar. Sonst null.' },
            foto: { type: 'integer', description: 'Nummer des Fotos (1-basiert), auf dem das Produkt am besten zu sehen ist.' },
            box: {
              type: 'object', additionalProperties: false, required: ['x', 'y', 'b', 'h'],
              description: 'Rechteck um die Einheiten auf diesem Foto, Werte 0..1 relativ zur Bildgröße (x,y = oben links).',
              properties: { x: { type: 'number' }, y: { type: 'number' }, b: { type: 'number' }, h: { type: 'number' } },
            },
            begruendung: { type: 'string', description: 'Kurz, deutsch: was gezählt wurde (z. B. "2 Reihen à 2 Kisten, hintere Reihe verdeckt").' },
          },
        },
      },
      unbekannt: {
        type: 'array',
        description: 'Ware, die zu keinem Katalog-Produkt passt.',
        items: { type: 'object', additionalProperties: false, required: ['beschreibung', 'foto'], properties: { beschreibung: { type: 'string' }, foto: { type: 'integer' } } },
      },
      bildqualitaet: {
        type: 'object', additionalProperties: false, required: ['ok', 'problem'],
        properties: { ok: { type: 'boolean' }, problem: { type: ['string', 'null'], enum: ['dunkel', 'unscharf', 'zu_weit', 'verdeckt', 'spiegelung', null] } },
      },
    },
  } as const;
}

const SYSTEM = `Du zählst den Lagerbestand in einer kleinen Restaurantküche (Imbiss, Döner, Pizzeria).
Du bekommst den Produktkatalog des Betriebs – je Produkt Name, ID, Zähleinheit und oft ein Referenzfoto – und Fotos EINER Stelle im Lager.

So zählst du:
- Zähle ZÄHLEINHEITEN (Kiste, Becher, Stück, Beutel …), wie im Katalog angegeben. Schätze niemals Gewicht oder Volumen.
- Jede Einheit genau einmal. Mehrere Fotos derselben Stelle können sich überlappen: zähle eine Einheit, die auf zwei Fotos zu sehen ist, nur einmal.
- Nur Katalog-Produkte melden. Alles andere unter "unbekannt".
- Gestapelte oder verdeckte Ware: zähle, was du sicher siehst, und leite verdeckte Einheiten nur ab, wenn der Stapel eindeutig ist (z. B. gleich hohe Kistentürme). Dann sicherheit unter 0.75 und in "begruendung" sagen, was abgeleitet ist.
- sicherheit: 0.9+ nur, wenn jede Einheit klar sichtbar und eindeutig zuzuordnen ist.
- MHD nur, wenn ein Datum auf einem Etikett wirklich lesbar ist. Nicht raten.
- Ein Produkt, das du nicht siehst, lässt du weg (keine Einträge mit 0).
- Ist das Foto zu dunkel, unscharf oder zu weit weg, sag es in "bildqualitaet".`;

bedienen(async (req) => {
  const { nutzer, betrieb } = await aufrufer(req);
  const db = admin();
  const { scan_id } = await req.json();
  if (!scan_id) return fehler('scan_id fehlt');

  const s = await db.from('scans').select('*').eq('id', scan_id).eq('betrieb_id', betrieb.id).single();
  if (s.error || !s.data) return fehler('Scan nicht gefunden', 404);
  if (s.data.status === 'bestaetigt') return json({ schon_bestaetigt: true });

  const [fotosR, produkteR] = await Promise.all([
    db.from('scan_fotos').select('id, position_id, foto_pfad, breite, hoehe').eq('scan_id', scan_id).eq('geloescht', false),
    db.from('produkte').select('*').eq('betrieb_id', betrieb.id).eq('aktiv', true),
  ]);
  if (fotosR.error) throw new Error(fotosR.error.message);
  if (produkteR.error) throw new Error(produkteR.error.message);
  const fotos = (fotosR.data ?? []) as Foto[];
  if (!fotos.length) return fehler('Keine Fotos zu diesem Scan');
  const alle = (produkteR.data ?? []) as Produkt[];
  if (!alle.length) return fehler('Der Produktkatalog ist leer. Bitte zuerst Produkte anlegen.');

  // Katalog klein halten: zuerst die Produkte, die in diesem Bereich liegen
  const hier = alle.filter((p) => p.bereich_ids?.includes(s.data.bereich_id));
  const katalog = hier.length ? [...hier, ...alle.filter((p) => !hier.includes(p))] : alle;

  // Katalog-Block (Text + Referenzfotos) – für alle Positionen gleich → Prompt-Cache
  const katalogInhalt: unknown[] = [{ type: 'text', text: 'PRODUKTKATALOG:' }];
  let refs = 0;
  for (const p of katalog) {
    const inhalt = p.menge_pro_einheit ? ` (1 ${p.zaehleinheit} ≈ ${p.menge_pro_einheit} ${p.basiseinheit})` : '';
    katalogInhalt.push({ type: 'text', text: `• ID ${p.id} – ${p.namen.de ?? Object.values(p.namen)[0]} – gezählt in: ${p.zaehleinheit}${inhalt}${hier.includes(p) ? '' : ' – liegt normalerweise woanders'}` });
    if (p.referenzfoto_pfad && refs < MAX_REFERENZEN) {
      const f = await db.storage.from('katalog').download(p.referenzfoto_pfad);
      if (!f.error && f.data) {
        katalogInhalt.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64(await f.data.arrayBuffer()) } });
        refs++;
      }
    }
  }
  (katalogInhalt[katalogInhalt.length - 1] as Record<string, unknown>).cache_control = { type: 'ephemeral' };

  // Fotos je Position gruppieren
  const gruppen = new Map<string, Foto[]>();
  for (const f of fotos) {
    const k = f.position_id ?? 'ohne';
    gruppen.set(k, [...(gruppen.get(k) ?? []), f]);
  }

  let nutzung: Nutzung = NULL_NUTZUNG;
  const ids = katalog.map((p) => p.id);
  const ergebnisse = await Promise.all([...gruppen.values()].map(async (liste) => {
    const inhalt: unknown[] = [];
    for (const [i, f] of liste.entries()) {
      const d = await db.storage.from('scan-fotos').download(f.foto_pfad);
      if (d.error || !d.data) throw new Error(`Foto ${f.id} nicht lesbar: ${d.error?.message}`);
      inhalt.push({ type: 'text', text: `Foto ${i + 1}:` });
      inhalt.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64(await d.data.arrayBuffer()) } });
    }
    inhalt.push({ type: 'text', text: `Zähle die Katalog-Produkte auf diesen ${liste.length} Foto(s) derselben Stelle.` });
    const m = await anfrage({
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: schema(ids) } },
      messages: [{ role: 'user', content: [...katalogInhalt, ...inhalt] }],
    });
    nutzung = addieren(nutzung, m.usage as Nutzung);
    const r = JSON.parse(textAus(m)) as {
      erkennungen: Array<{ produkt_id: string; anzahl_einheiten: number; sicherheit: number; mhd: string | null; foto: number; box: { x: number; y: number; b: number; h: number }; begruendung: string }>;
      unbekannt: Array<{ beschreibung: string; foto: number }>;
      bildqualitaet: { ok: boolean; problem: string | null };
    };
    return { liste, r };
  }));

  // Speichern (alte Erkennungen dieses Scans ersetzen – z. B. nach "nochmal")
  await db.from('scan_erkennungen').delete().eq('scan_id', scan_id).eq('von_hand', false);
  const zeilen = ergebnisse.flatMap(({ liste, r }) => r.erkennungen
    .filter((e) => ids.includes(e.produkt_id) && e.anzahl_einheiten >= 0)
    .map((e) => ({
      betrieb_id: betrieb.id, scan_id, produkt_id: e.produkt_id,
      scan_foto_id: liste[Math.min(Math.max(e.foto, 1), liste.length) - 1].id,
      anzahl_erkannt: e.anzahl_einheiten,
      sicherheit: Math.min(1, Math.max(0, e.sicherheit)),
      mhd: /^\d{4}-\d{2}-\d{2}$/.test(e.mhd ?? '') ? e.mhd : null,
      box: e.box,
    })));
  if (zeilen.length) {
    const ins = await db.from('scan_erkennungen').insert(zeilen);
    if (ins.error) throw new Error(ins.error.message);
  }
  await db.from('scans').update({ status: 'erkannt', fehler: null }).eq('id', scan_id);
  await kostenBuchen(db, betrieb.id, 'scan', nutzung, scan_id, MODELL);

  return json({
    erkennungen: zeilen.length,
    unbekannt: ergebnisse.flatMap(({ r }) => r.unbekannt),
    bildqualitaet: ergebnisse.map(({ r }) => r.bildqualitaet).filter((b) => !b.ok),
    von: nutzer.id,
  });
});
