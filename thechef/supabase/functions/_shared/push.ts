// Web-Push an Nutzer eines Betriebs – jeder in seiner Sprache.
// Abgelaufene Abos (404/410) werden gelöscht, damit nichts still ins Leere geht.
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Sprache } from './logik/typen.ts';

let bereit = false;
function einrichten() {
  if (bereit) return true;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) { console.error('VAPID-Schlüssel fehlen – Push ist aus.'); return false; }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@kiekmolin.de', pub, priv);
  bereit = true;
  return true;
}

export type Nachricht = { titel: string; text: string; ziel?: string; tag?: string };

/** Schickt an alle Nutzer mit passender Rolle; text() baut die Nachricht in der Sprache des Empfängers. */
export async function pushAn(db: SupabaseClient, betriebId: string, rolle: 'chef' | 'mitarbeiter' | 'alle', text: (s: Sprache) => Nachricht) {
  if (!einrichten()) return { gesendet: 0, fehler: 'push_nicht_eingerichtet' };
  let q = db.from('nutzer').select('id, sprache, rolle, push_an').eq('betrieb_id', betriebId).eq('push_an', true);
  if (rolle !== 'alle') q = q.eq('rolle', rolle);
  const { data: nutzer, error } = await q;
  if (error) throw new Error(error.message);
  let gesendet = 0;
  for (const n of nutzer ?? []) {
    const { data: abos } = await db.from('push_abos').select('*').eq('nutzer_id', n.id);
    for (const a of abos ?? []) {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(text(n.sprache as Sprache)), { TTL: 6 * 3600 });
        gesendet++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_abos').delete().eq('id', a.id);
        else console.error('Push fehlgeschlagen', code, (e as Error).message);
      }
    }
  }
  return { gesendet };
}

/** Einmal pro (Art, Tag, Schlüssel) – der Zeitplan läuft alle 15 Minuten. */
export async function einmal(db: SupabaseClient, betriebId: string, art: string, datum: string, schluessel = ''): Promise<boolean> {
  const r = await db.from('benachrichtigungen').insert({ betrieb_id: betriebId, art, datum, schluessel });
  return !r.error; // Unique-Verletzung = schon gesendet
}
