// Nach jedem bestätigten Scan: Hinweise neu berechnen (3–5, wichtigste zuerst),
// Wichtiges per Push an den Chef, und wenn alle Bereiche des Tages fertig
// sind, sofort das Abend-Briefing.
import { admin, aufrufer, bedienen, json } from '../_shared/http.ts';
import { briefingSenden } from '../_shared/briefing.ts';
import { lagerLaden } from '../_shared/lager.ts';
import { fehlendeBereiche, hinweiseBerechnen } from '../_shared/logik/lager.ts';
import { einmal, pushAn } from '../_shared/push.ts';
import { name, text, wann } from '../_shared/texte.ts';

bedienen(async (req) => {
  const { betrieb } = await aufrufer(req);
  const db = admin();
  const { scan_id } = await req.json().catch(() => ({}));
  const l = await lagerLaden(db, betrieb);

  // Offene Hinweise ersetzen (erledigte bleiben als Verlauf)
  const hinweise = hinweiseBerechnen(l.staende);
  await db.from('hinweise').delete().eq('betrieb_id', betrieb.id).eq('erledigt', false);
  if (hinweise.length) {
    const r = await db.from('hinweise').insert(hinweise.map((h) => ({ ...h, betrieb_id: betrieb.id, scan_id: scan_id ?? null })));
    if (r.error) throw new Error(r.error.message);
  }

  // Push nur für wirklich Dringendes – und nur einmal pro Produkt und Tag
  let gepusht = 0;
  for (const h of hinweise.filter((x) => x.prioritaet >= 85)) {
    if (!(await einmal(db, betrieb.id, `hinweis:${h.art}`, l.heute, h.daten.produkt_id ?? ''))) continue;
    const p = l.produkte.find((x) => x.id === h.daten.produkt_id);
    await pushAn(db, betrieb.id, 'chef', (s) => ({
      titel: text(s, 'wichtig_titel'),
      text: text(s, h.art === 'leer' ? 'leer' : h.art === 'abgelaufen' ? 'abgelaufen' : 'laeuft_ab', { produkt: name(p?.namen ?? {}, s), wann: wann(s, h.daten.tage ?? 0) }),
      ziel: '#/c', tag: `hinweis-${h.daten.produkt_id}`,
    }));
    gepusht++;
  }

  // Alles gescannt? → Briefing jetzt, nicht erst am späten Abend
  const { data: scans } = await db.from('scans').select('bereich_id, status, bestaetigt_am').eq('betrieb_id', betrieb.id)
    .gte('zeitpunkt', new Date(Date.now() - 36 * 3600e3).toISOString());
  const fehlen = fehlendeBereiche(l.bereiche.map((b) => b.id), scans ?? [], betrieb.zeitzone, l.heute);
  const briefing = fehlen.length === 0 ? await briefingSenden(db, betrieb) : null;

  return json({ hinweise: hinweise.length, gepusht, briefing });
});
