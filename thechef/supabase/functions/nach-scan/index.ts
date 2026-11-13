// Nach jedem bestätigten Scan:
//  - Hinweise neu berechnen (3–5, wichtigste zuerst); was der Chef heute
//    schon als erledigt markiert hat, kommt heute nicht wieder
//  - EINE Push-Nachricht an den Chef ("3 Dinge sind wichtig: …") – nur mit
//    Neuem; dasselbe klingelt nicht zweimal am Tag (CLAUDE.md: 96 Mails)
//  - sind alle Bereiche des Tages fertig: sofort das Abend-Briefing
import { admin, aufrufer, bedienen, json } from '../_shared/http.ts';
import { briefingSenden } from '../_shared/briefing.ts';
import { lagerLaden } from '../_shared/lager.ts';
import { fehlendeBereiche, hinweiseBerechnen, hinweiseOhneErledigte, pushZusammenfassung, tagIn } from '../_shared/logik/lager.ts';
import type { Hinweis, Sprache } from '../_shared/logik/typen.ts';
import { einmal, pushAn } from '../_shared/push.ts';
import { name, text, wann } from '../_shared/texte.ts';

bedienen(async (req) => {
  const { betrieb } = await aufrufer(req);
  const db = admin();
  const { scan_id } = await req.json().catch(() => ({}));
  const l = await lagerLaden(db, betrieb);
  const seit = new Date(Date.now() - 36 * 3600e3).toISOString();
  const heute = (iso: string) => tagIn(betrieb.zeitzone, new Date(iso)) === l.heute;

  // Heute schon Erledigtes und schon Gemeldetes
  const [erl, gem] = await Promise.all([
    db.from('hinweise').select('art, daten, erstellt_am').eq('betrieb_id', betrieb.id).eq('erledigt', true).gte('erstellt_am', seit),
    db.from('benachrichtigungen').select('schluessel').eq('betrieb_id', betrieb.id).eq('art', 'hinweis').eq('datum', l.heute),
  ]);
  if (erl.error) throw new Error(erl.error.message);
  const erledigtHeute = (erl.data ?? []).filter((x) => heute(x.erstellt_am)) as Array<Pick<Hinweis, 'art' | 'daten'>>;
  const hinweise = hinweiseOhneErledigte(hinweiseBerechnen(l.staende), erledigtHeute);

  // Offene Hinweise ersetzen (erledigte bleiben als Verlauf)
  const del = await db.from('hinweise').delete().eq('betrieb_id', betrieb.id).eq('erledigt', false);
  if (del.error) throw new Error(del.error.message);
  if (hinweise.length) {
    const r = await db.from('hinweise').insert(hinweise.map((h) => ({ ...h, betrieb_id: betrieb.id, scan_id: scan_id ?? null })));
    if (r.error) throw new Error(r.error.message);
  }

  // Eine Nachricht, nur mit Neuem
  let gepusht = 0;
  const z = pushZusammenfassung(hinweise, new Set((gem.data ?? []).map((g) => g.schluessel as string)));
  if (z) {
    for (const k of z.schluessel) await einmal(db, betrieb.id, 'hinweis', l.heute, k);
    const zeile = (h: Hinweis, s: Sprache) => {
      const p = l.produkte.find((x) => x.id === h.daten.produkt_id);
      return text(s, h.art === 'leer' ? 'leer' : h.art === 'abgelaufen' ? 'abgelaufen' : 'laeuft_ab', { produkt: name(p?.namen ?? {}, s), wann: wann(s, h.daten.tage ?? 0) });
    };
    const r = await pushAn(db, betrieb.id, 'chef', (s) => ({
      titel: text(s, 'wichtig_titel', { n: z.neu.length }),
      text: z.neu.map((h) => zeile(h, s)).join(' · '),
      ziel: '#/c', tag: 'nach-scan',
    }));
    gepusht = r.gesendet ?? 0;
  }

  // Alles gescannt? → Briefing jetzt, nicht erst am späten Abend
  const { data: scans } = await db.from('scans').select('bereich_id, status, bestaetigt_am').eq('betrieb_id', betrieb.id).gte('zeitpunkt', seit);
  const fehlen = fehlendeBereiche(l.bereiche.map((b) => b.id), scans ?? [], betrieb.zeitzone, l.heute);
  const briefing = fehlen.length === 0 ? await briefingSenden(db, betrieb) : null;

  return json({ hinweise: hinweise.length, gepusht, briefing });
});
