// KI-Assistent: "wie ein erfahrener Küchenchef, der das Lager kennt".
//
// Technische Absicherung von "erfindet NIE Mengen" (THECHEF.md 4e):
//  1. Zahlen kommen AUSSCHLIESSLICH aus den Tools unten – die rechnen mit
//     derselben Logik wie App und Briefing (_shared/logik).
//  2. Die Antwort ist strukturiert (JSON-Schema), nicht Freitext.
//  3. antwortPruefen(): jede Zahl in der Antwort muss in einem Tool-
//     Ergebnis stehen, und der Scan-Zeitpunkt muss dabei sein. Sonst
//     einmal zurück an die KI; klappt es dann nicht: ehrlich "weiß ich nicht".
import { admin, aufrufer, bedienen, fehler, json } from '../_shared/http.ts';
import { addieren, anfrage, kostenBuchen, NULL_NUTZUNG, textAus, type Nutzung } from '../_shared/claude.ts';
import { lagerLaden } from '../_shared/lager.ts';
import { ANTWORT_SCHEMA, antwortPruefen, type Antwort } from '../_shared/logik/antwort.ts';
import { anzeigeMenge, laeuftBaldAb, tagIn, warenwert, type ProduktStand } from '../_shared/logik/lager.ts';
import { bedarf, verbrauchSchaetzen } from '../_shared/logik/verbrauch.ts';
import type { Betrieb, Produkt, Sprache } from '../_shared/logik/typen.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SPRACHNAME: Record<string, string> = { de: 'Deutsch', tr: 'Türkisch', ku: 'Kurdisch (Kurmancî, lateinische Schrift)', ar: 'Arabisch', en: 'Englisch', ckb: 'Kurdisch (Sorani)' };
const ALT_STUNDEN = 36;

const TOOLS = [
  { name: 'scan_status', description: 'Wann welcher Bereich zuletzt gescannt wurde und ob heute alles gescannt ist. Immer zuerst aufrufen, wenn Mengen genannt werden.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'bestand_abfragen', description: 'Aktueller Bestand. Ohne suche: alle Produkte. Mit suche: Produkte, deren Name (in jeder Sprache) den Text enthält.', input_schema: { type: 'object', properties: { suche: { type: 'string' } }, additionalProperties: false } },
  { name: 'bald_ablaufend', description: 'Produkte, deren (frühestes) MHD in höchstens `tage` Tagen erreicht ist, dringendste zuerst.', input_schema: { type: 'object', properties: { tage: { type: 'integer', minimum: 0, maximum: 30 } }, required: ['tage'], additionalProperties: false } },
  { name: 'einkaufsliste', description: 'Fertige Einkaufsliste für morgen: Bestand gegen Mindestbestand, ablaufende Ware zählt nicht mit, plus manuell Hinzugefügtes.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'bedarf_pruefen', description: 'Reicht ein Produkt für bestimmte Tage? Schätzt den Verbrauch aus der Scan-Geschichte. wochentage: 0=So … 6=Sa, z. B. Wochenende = [5,6,0].', input_schema: { type: 'object', properties: { produkt_id: { type: 'string' }, wochentage: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, minItems: 1, maxItems: 14 } }, required: ['produkt_id', 'wochentage'], additionalProperties: false } },
  { name: 'weggeworfen_abfragen', description: 'Weggeworfenes eines Monats (Wert in €, je Produkt) und Vergleich zum Vormonat. monat im Format YYYY-MM, ohne = aktueller Monat.', input_schema: { type: 'object', properties: { monat: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } }, additionalProperties: false } },
  { name: 'warenwert', description: 'Gesamtwert der Ware im Lager in € (nur Produkte mit Preis) und wie viele Produkte keinen Preis haben.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
];

function stand(s: ProduktStand, sprache: Sprache) {
  const a = (x: number) => anzeigeMenge(s.produkt, x);
  return {
    produkt_id: s.produkt.id, name: s.produkt.namen[sprache] ?? s.produkt.namen.de, zaehleinheit: s.produkt.zaehleinheit,
    menge_einheiten: s.menge, menge_anzeige: a(s.menge).zahl, anzeige_einheit: a(s.menge).einheit,
    verfuegbar_ohne_ablaufendes: a(s.verfuegbar).zahl,
    mindestbestand_anzeige: a(s.produkt.mindestbestand).zahl, fehlt_einheiten: s.fehlt, fehlt_anzeige: a(s.fehlt).zahl,
    mhd: s.mhd, mhd_quelle: s.mhd_quelle, tage_bis_mhd: s.tage_bis_mhd, ampel: s.ampel, letzter_scan: s.letzter_scan,
  };
}

async function werkzeug(name: string, input: Record<string, unknown>, db: SupabaseClient, betrieb: Betrieb, sprache: Sprache) {
  const l = await lagerLaden(db, betrieb);
  const alter = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 3600e3) : null);
  switch (name) {
    case 'scan_status': {
      const seit = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data } = await db.from('scans').select('bereich_id, bestaetigt_am').eq('betrieb_id', betrieb.id).eq('status', 'bestaetigt').gte('bestaetigt_am', seit);
      const letzte = l.bereiche.map((b) => {
        const t = (data ?? []).filter((s) => s.bereich_id === b.id).map((s) => s.bestaetigt_am as string).sort().at(-1) ?? null;
        return { bereich: b.namen[sprache] ?? b.namen.de, letzter_scan: t, heute: t ? tagIn(betrieb.zeitzone, new Date(t)) === l.heute : false, alter_stunden: alter(t) };
      });
      const aeltester = letzte.map((x) => x.alter_stunden ?? 9999).sort((a, b) => b - a)[0];
      return { bereiche: letzte, alles_heute_gescannt: letzte.every((x) => x.heute), daten_alt: aeltester > ALT_STUNDEN, hinweis: aeltester > ALT_STUNDEN ? 'Mindestens ein Bereich ist älter als 36 Stunden – sag das und bitte um einen neuen Scan.' : null };
    }
    case 'bestand_abfragen': {
      const q = String(input.suche ?? '').toLocaleLowerCase();
      const treffer = l.staende.filter((s) => !q || Object.values(s.produkt.namen).some((n) => n?.toLocaleLowerCase().includes(q)));
      return { produkte: treffer.map((s) => stand(s, sprache)), gefunden: treffer.length };
    }
    case 'bald_ablaufend':
      return { produkte: laeuftBaldAb(l.staende, Number(input.tage ?? 3)).map((s) => ({ ...stand(s, sprache), ablaufende_menge_anzeige: anzeigeMenge(s.produkt, s.menge_mhd).zahl })) };
    case 'einkaufsliste':
      return {
        anzahl: l.einkauf.filter((e) => !e.abgehakt).length,
        zeilen: l.einkauf.map((e) => ({
          produkt_id: e.produkt.id, name: e.produkt.namen[sprache] ?? e.produkt.namen.de, menge_einheiten: e.menge,
          menge_anzeige: anzeigeMenge(e.produkt, e.menge).zahl, einheit: anzeigeMenge(e.produkt, e.menge).einheit,
          noch_da_anzeige: anzeigeMenge(e.produkt, e.noch_da).zahl, mindestens_anzeige: anzeigeMenge(e.produkt, e.mindestens).zahl,
          laeuft_ab: e.laeuft_ab, abgehakt: e.abgehakt,
        })),
        letzter_scan: l.bestand.map((b) => b.zeitpunkt).sort().at(-1) ?? null,
      };
    case 'bedarf_pruefen': {
      const s = l.staende.find((x) => x.produkt.id === input.produkt_id);
      if (!s) return { fehler: 'Produkt nicht im Katalog' };
      const [v, w] = await Promise.all([
        db.from('bestand').select('bereich_id, menge_einheiten, zeitpunkt').eq('betrieb_id', betrieb.id).eq('produkt_id', s.produkt.id).gte('zeitpunkt', new Date(Date.now() - 56 * 864e5).toISOString()),
        db.from('weggeworfen').select('menge_einheiten, zeitpunkt').eq('betrieb_id', betrieb.id).eq('produkt_id', s.produkt.id),
      ]);
      const vb = verbrauchSchaetzen((v.data ?? []).map((z) => ({ ...z, menge_einheiten: Number(z.menge_einheiten) })), (w.data ?? []).map((z) => ({ ...z, menge_einheiten: Number(z.menge_einheiten) })));
      const b = bedarf(vb, input.wochentage as number[]);
      const a = (x: number) => anzeigeMenge(s.produkt, x).zahl;
      if (b.menge == null) return { zu_wenig_daten: true, datenpunkte: vb.datenpunkte, tage_abgedeckt: vb.tage_abgedeckt, noch_da_anzeige: a(s.verfuegbar), letzter_scan: s.letzter_scan };
      const fehlt = Math.max(0, b.menge - s.verfuegbar);
      return {
        einheit: anzeigeMenge(s.produkt, 1).einheit,
        noch_da_einheiten: s.verfuegbar, noch_da_anzeige: a(s.verfuegbar),
        bedarf_einheiten: b.menge, bedarf_anzeige: a(b.menge),
        fehlt_einheiten: Math.round(fehlt * 100) / 100, fehlt_anzeige: a(fehlt), bestellmenge_einheiten: Math.ceil(fehlt - 1e-9),
        grundlage: b.grundlage, tage_abgedeckt: vb.tage_abgedeckt, datenpunkte: vb.datenpunkte, schaetzung: true, letzter_scan: s.letzter_scan,
      };
    }
    case 'weggeworfen_abfragen': {
      const m = String(input.monat ?? l.heute.slice(0, 7));
      const [j, mo] = m.split('-').map(Number);
      const von = new Date(Date.UTC(j, mo - 1, 1)).toISOString(), bis = new Date(Date.UTC(j, mo, 1)).toISOString(), vor = new Date(Date.UTC(j, mo - 2, 1)).toISOString();
      const [dies, letzt] = await Promise.all([
        db.from('weggeworfen').select('produkt_id, menge_einheiten, wert_eur').eq('betrieb_id', betrieb.id).gte('zeitpunkt', von).lt('zeitpunkt', bis),
        db.from('weggeworfen').select('wert_eur').eq('betrieb_id', betrieb.id).gte('zeitpunkt', vor).lt('zeitpunkt', von),
      ]);
      const je = new Map<string, { eur: number; einheiten: number }>();
      for (const w of dies.data ?? []) { const x = je.get(w.produkt_id) ?? { eur: 0, einheiten: 0 }; x.eur += Number(w.wert_eur ?? 0); x.einheiten += Number(w.menge_einheiten); je.set(w.produkt_id, x); }
      const summe = (xs: Array<{ wert_eur: number | null }>) => Math.round(xs.reduce((s, w) => s + Number(w.wert_eur ?? 0), 0) * 100) / 100;
      const diesS = summe(dies.data ?? []), vorS = summe(letzt.data ?? []);
      return {
        monat: m, summe_eur: diesS, vormonat_eur: vorS, differenz_eur: Math.round((diesS - vorS) * 100) / 100, ohne_preis: (dies.data ?? []).filter((w) => w.wert_eur == null).length,
        je_produkt: [...je.entries()].sort((a, b) => b[1].eur - a[1].eur).map(([id, x]) => ({ name: (l.produkte.find((p: Produkt) => p.id === id)?.namen[sprache]) ?? id, eur: Math.round(x.eur * 100) / 100, einheiten: x.einheiten })),
        letzter_scan: l.bestand.map((b) => b.zeitpunkt).sort().at(-1) ?? null,
      };
    }
    case 'warenwert': {
      const w = warenwert(l.staende);
      return { ...w, letzter_scan: l.bestand.map((b) => b.zeitpunkt).sort().at(-1) ?? null };
    }
  }
  return { fehler: `unbekanntes Werkzeug ${name}` };
}

function system(sprache: Sprache, betrieb: Betrieb) {
  return `Du bist der Küchen-Assistent von "${betrieb.name}" – wie ein erfahrener Küchenchef, der das Lager kennt. Heute ist ${tagIn(betrieb.zeitzone)} (${betrieb.zeitzone}).

Antworte IMMER auf ${SPRACHNAME[sprache] ?? 'Deutsch'}, kurz und klar, für jemanden in der Küche.

Harte Regeln:
- Jede Zahl, Menge, jeder Betrag und jedes Datum in deiner Antwort MUSS aus einem Tool-Ergebnis stammen. Rechne nicht selbst; nutze die fertigen Felder (z. B. fehlt_anzeige, bedarf_anzeige).
- Nennst du Mengen, rufe vorher scan_status auf und setze "stand" auf den letzter_scan-Zeitpunkt aus den Tool-Daten (genau so, als ISO-Zeitpunkt).
- Sind die Daten alt (daten_alt), setze daten_alt=true und sag es im ersten Satz ("Letzter Scan vor 2 Tagen – bitte neu scannen").
- Schätzungen (Verbrauch, Bedarf) als Schätzung kennzeichnen (schaetzung=true) und in "quelle" die Grundlage nennen (z. B. Scans der letzten N Tage).
- Zu wenig Daten? Dann sag das ehrlich und bitte um weitere Scans – rate nie.
- Zahlen als Ziffern schreiben, nicht als Wort.

Form der Antwort:
- "satz": EIN klarer erster Satz, die eigentliche Antwort ("Nein, es fehlen etwa 10 kg.").
- "kacheln": 0–3 Zahlen (z. B. Noch da / Brauchst du / Fehlt), Titel in der Sprache des Nutzers, "einheit" als Wort in dieser Sprache.
- "aktion": wenn etwas zu bestellen ist → {"typ":"einkaufsliste","produkt_id":…,"menge_einheiten": bestellmenge_einheiten}; sonst die passende Seite oder null.
- "text": höchstens 1–2 kurze Sätze, sonst leer.`;
}

bedienen(async (req) => {
  const { nutzer, betrieb, db: _d } = await aufrufer(req);
  const db = admin();
  const body = await req.json();
  const sprache = (body.sprache ?? nutzer.sprache) as Sprache;

  if (body.art === 'tagesgericht') return json(await tagesgericht(db, betrieb, sprache));

  const frage = String(body.frage ?? '').trim().slice(0, 1000);
  if (!frage) return fehler('frage fehlt');

  // Letzte Fragen als Zusammenhang (nur Text, keine alten Zahlen als "Daten")
  const { data: alt } = await db.from('assistent_verlauf').select('frage, antwort').eq('nutzer_id', nutzer.id).eq('verworfen', false).order('zeitpunkt', { ascending: false }).limit(3);
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [];
  for (const v of (alt ?? []).reverse()) {
    messages.push({ role: 'user', content: v.frage });
    messages.push({ role: 'assistant', content: JSON.stringify(v.antwort) });
  }
  messages.push({ role: 'user', content: frage });

  const genutzt: Array<{ tool: string; input: unknown; ergebnis: unknown }> = [];
  let nutzung: Nutzung = NULL_NUTZUNG;
  let antwort: Antwort | null = null;
  let versuche = 0;

  for (let runde = 0; runde < 10; runde++) {
    const m = await anfrage({
      system: [{ type: 'text', text: system(sprache, betrieb), cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANTWORT_SCHEMA } },
      messages,
    });
    nutzung = addieren(nutzung, m.usage as Nutzung);
    messages.push({ role: 'assistant', content: m.content });

    if (m.stop_reason === 'tool_use') {
      const aufrufe = m.content.filter((b) => b.type === 'tool_use') as Array<{ id: string; name: string; input: Record<string, unknown> }>;
      const ergebnisse = await Promise.all(aufrufe.map(async (a) => {
        try {
          const e = await werkzeug(a.name, a.input ?? {}, db, betrieb, sprache);
          genutzt.push({ tool: a.name, input: a.input, ergebnis: e });
          return { type: 'tool_result', tool_use_id: a.id, content: JSON.stringify(e) };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: a.id, content: String((err as Error).message), is_error: true };
        }
      }));
      messages.push({ role: 'user', content: ergebnisse });
      continue;
    }

    // Fertige Antwort → prüfen
    let a: Antwort;
    try { a = JSON.parse(textAus(m)); } catch { a = null as unknown as Antwort; }
    const pr = a ? antwortPruefen(a, genutzt.map((g) => g.ergebnis)) : { ok: false as const, grund: 'kein_json' };
    if (pr.ok) { antwort = a; break; }
    if (versuche++ >= 1) break;
    // Einmal zurückgeben, mit dem genauen Grund
    messages.push({ role: 'user', content: `Deine Antwort wurde nicht angezeigt: ${JSON.stringify(pr)}. Jede Zahl muss aus einem Tool-Ergebnis stammen und "stand" muss ein letzter_scan aus den Tool-Daten sein. Rufe die nötigen Tools auf oder antworte ohne Zahlen.` });
  }

  const verworfen = !antwort;
  const endgueltig: Antwort = antwort ?? {
    satz: { de: 'Das kann ich gerade nicht sicher sagen. Bitte neu scannen oder anders fragen.', tr: 'Bunu şu an kesin söyleyemem. Lütfen yeniden tara veya farklı sor.', ku: 'Niha ez nikarim vê bi ewlehî bibêjim. Ji kerema xwe dîsa skan bike an cuda bipirse.', ar: 'لا أستطيع قول ذلك بثقة الآن. امسح من جديد أو اسأل بطريقة أخرى.', en: "I can't say that for sure right now. Please scan again or ask differently." }[sprache as string] ?? 'Das kann ich gerade nicht sicher sagen.',
    text: '', kacheln: [], quelle: null, stand: null, schaetzung: false, daten_alt: false, aktion: null,
  };
  const v = await db.from('assistent_verlauf').insert({ betrieb_id: betrieb.id, nutzer_id: nutzer.id, frage, antwort: endgueltig, genutzte_daten: genutzt, verworfen }).select('id').single();
  await kostenBuchen(db, betrieb.id, 'assistent', nutzung, v.data?.id);
  return json({ ...endgueltig, verworfen, id: v.data?.id });
});

/** Tagesgericht aus Ware, die bald abläuft – einmal pro Tag und Sprache, gespeichert im Briefing. */
async function tagesgericht(db: SupabaseClient, betrieb: Betrieb, sprache: Sprache) {
  const l = await lagerLaden(db, betrieb);
  const { data: br } = await db.from('briefings').select('id, tagesgericht').eq('betrieb_id', betrieb.id).eq('datum', l.heute).maybeSingle();
  if (br?.tagesgericht?.[sprache]) return br.tagesgericht[sprache];
  const bald = laeuftBaldAb(l.staende, 3).slice(0, 6);
  if (!bald.length) return null;
  const vorrat = l.staende.filter((s) => s.menge > 0).map((s) => s.produkt.namen[sprache] ?? s.produkt.namen.de);
  const m = await anfrage({
    system: `Du schlägst EIN Tagesgericht für "${betrieb.name}" vor, das Ware verbraucht, die bald abläuft. Nur Zutaten aus dem Vorrat. Keine Mengen, keine Zahlen. Antworte auf ${SPRACHNAME[sprache] ?? 'Deutsch'}.`,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['gericht', 'grund'], properties: { gericht: { type: 'string', description: 'Name des Gerichts, ein kurzer Satz.' }, grund: { type: 'string', description: 'Ein Satz: welche ablaufende Ware es verbraucht.' } } } } },
    messages: [{ role: 'user', content: `Läuft bald ab: ${bald.map((s) => s.produkt.namen[sprache] ?? s.produkt.namen.de).join(', ')}.\nVorrat: ${vorrat.join(', ')}.` }],
  });
  const idee = JSON.parse(textAus(m)) as { gericht: string; grund: string };
  await kostenBuchen(db, betrieb.id, 'tagesgericht', m.usage as Nutzung);
  // Zahlen haben hier nichts zu suchen (Regel: keine erfundenen Mengen)
  if (/\d/.test(idee.gericht + idee.grund)) { idee.gericht = idee.gericht.replace(/\d+[.,]?\d*\s*\S*/g, '').trim(); idee.grund = idee.grund.replace(/\d+[.,]?\d*\s*\S*/g, '').trim(); }
  if (br) await db.from('briefings').update({ tagesgericht: { ...(br.tagesgericht ?? {}), [sprache]: idee } }).eq('id', br.id);
  else await db.from('briefings').upsert({ betrieb_id: betrieb.id, datum: l.heute, gescannt: false, tagesgericht: { [sprache]: idee } }, { onConflict: 'betrieb_id,datum', ignoreDuplicates: false });
  return idee;
}
