// Läuft alle 15 Minuten (pg_cron, 0003_zeitplan.sql). Je Betrieb in SEINER Zeitzone:
//   - Scan-Erinnerung an die Mitarbeiter (Standard 22:00), wenn noch etwas offen ist
//   - Abend-Briefing an den Chef spätestens um briefing_spaetestens
//   - einmal nachts: Scan-Fotos nach der Löschfrist löschen (Zahlen bleiben)
//
// Gibt IMMER 200 zurück: bei 500 wiederholt der Aufrufer – bei Kiek mol in
// gemessen dreimal je Viertelstunde (CLAUDE.md). Fehler stehen im Ergebnis und im Log.
import { admin, CORS, json } from '../_shared/http.ts';
import { briefingSenden } from '../_shared/briefing.ts';
import { fehlendeBereiche, tagIn, uhrzeitIn } from '../_shared/logik/lager.ts';
import type { Betrieb } from '../_shared/logik/typen.ts';
import { einmal, pushAn } from '../_shared/push.ts';
import { name, text } from '../_shared/texte.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const schluessel = Deno.env.get('ZEITPLAN_SCHLUESSEL');
  if (!schluessel || req.headers.get('x-zeitplan-schluessel') !== schluessel) return json({ fehler: 'nicht erlaubt' }, 401);

  const db = admin();
  const protokoll: unknown[] = [];
  const { data: betriebe, error } = await db.from('betriebe').select('*');
  if (error) { console.error(error.message); return json({ fehler: error.message }); }

  for (const b of (betriebe ?? []) as Betrieb[]) {
    try {
      const jetzt = uhrzeitIn(b.zeitzone);
      const heute = tagIn(b.zeitzone);
      const { data: bereiche } = await db.from('bereiche').select('id, namen').eq('betrieb_id', b.id).eq('aktiv', true);
      const { data: scans } = await db.from('scans').select('bereich_id, status, bestaetigt_am').eq('betrieb_id', b.id)
        .gte('zeitpunkt', new Date(Date.now() - 36 * 3600e3).toISOString());
      const fehlen = fehlendeBereiche((bereiche ?? []).map((x) => x.id), scans ?? [], b.zeitzone, heute);

      if (jetzt >= b.scan_erinnerung_uhrzeit.slice(0, 5) && fehlen.length && (bereiche ?? []).length && await einmal(db, b.id, 'erinnerung', heute)) {
        const r = await pushAn(db, b.id, 'mitarbeiter', (s) => ({
          titel: text(s, 'erinnerung_titel'),
          text: text(s, 'erinnerung_text', { bereiche: fehlen.map((id) => name((bereiche ?? []).find((x) => x.id === id)?.namen ?? {}, s)).join(', ') }),
          ziel: '#/m', tag: 'erinnerung',
        }));
        protokoll.push({ betrieb: b.id, erinnerung: r });
      }
      if (jetzt >= b.briefing_spaetestens.slice(0, 5) && (bereiche ?? []).length) {
        protokoll.push({ betrieb: b.id, briefing: await briefingSenden(db, b) });
      }
      if (jetzt >= '03:00' && jetzt < '05:00' && await einmal(db, b.id, 'aufraeumen', heute)) {
        protokoll.push({ betrieb: b.id, geloescht: await fotosLoeschen(db, b.id) });
      }
    } catch (e) {
      console.error(b.id, e);
      protokoll.push({ betrieb: b.id, fehler: String((e as Error).message) });
    }
  }
  return json({ ok: true, protokoll });
});

// deno-lint-ignore no-explicit-any
async function fotosLoeschen(db: any, betriebId: string) {
  const { data } = await db.from('scan_fotos').select('id, foto_pfad').eq('betrieb_id', betriebId).eq('geloescht', false).lt('loeschen_am', new Date().toISOString()).limit(1000);
  const liste = (data ?? []) as Array<{ id: string; foto_pfad: string | null }>;
  const pfade = liste.map((f) => f.foto_pfad).filter(Boolean) as string[];
  if (pfade.length) {
    const r = await db.storage.from('scan-fotos').remove(pfade);
    if (r.error) throw new Error(r.error.message);
  }
  if (liste.length) await db.from('scan_fotos').update({ geloescht: true, foto_pfad: null }).in('id', liste.map((f) => f.id));
  return liste.length;
}
