// Abend-Briefing erstellen und an die Chefs schicken – genau einmal pro Tag.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { lagerLaden } from './lager.ts';
import { briefingPunkte, fehlendeBereiche } from './logik/lager.ts';
import type { Betrieb } from './logik/typen.ts';
import { einmal, pushAn } from './push.ts';
import { name, text } from './texte.ts';

export async function briefingSenden(db: SupabaseClient, betrieb: Betrieb) {
  const l = await lagerLaden(db, betrieb);
  if (!(await einmal(db, betrieb.id, 'briefing', l.heute))) return { schon: true };
  const { data: scans } = await db.from('scans').select('bereich_id, status, bestaetigt_am').eq('betrieb_id', betrieb.id)
    .gte('zeitpunkt', new Date(Date.now() - 36 * 3600e3).toISOString());
  const fehlen = fehlendeBereiche(l.bereiche.map((b) => b.id), scans ?? [], betrieb.zeitzone, l.heute);
  const punkte = briefingPunkte(l.staende, l.einkauf);
  const r = await db.from('briefings').upsert({
    betrieb_id: betrieb.id, datum: l.heute, gescannt: fehlen.length === 0, fehlende_bereiche: fehlen, punkte, gesendet_am: new Date().toISOString(),
  }, { onConflict: 'betrieb_id,datum' });
  if (r.error) throw new Error(r.error.message);
  const bereichNamen = (s: Parameters<typeof text>[0]) => fehlen.map((id) => name(l.bereiche.find((b) => b.id === id)?.namen ?? {}, s)).join(', ');
  const push = await pushAn(db, betrieb.id, 'chef', (s) => ({
    titel: text(s, 'briefing_titel'),
    text: fehlen.length ? text(s, 'briefing_nicht_gescannt', { bereiche: bereichNamen(s) }) : `1 · 2 · 3`,
    ziel: '#/c', tag: 'briefing',
  }));
  return { gesendet: true, gescannt: fehlen.length === 0, push };
}
