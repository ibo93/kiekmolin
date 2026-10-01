// Push an Nutzer eines Betriebs – jeder in seiner Sprache, auf zwei Wegen:
//   web  → Web-Push (installierte Web-App / Android)
//   apns → Apple, für die iPhone-App aus Xcode (dort gibt es kein Web-Push)
// Abgelaufene Abos (Web 404/410, Apple 410) werden gelöscht, damit nichts still ins Leere geht.
// Fehlt die Einrichtung eines Weges, steht das im Protokoll UND in der Antwort – nicht nur "0 gesendet".
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { APNS_HOST, apnsDeuten, apnsJwt, apnsNutzlast, apnsSchluessel, type ApnsUmgebung } from './logik/apns.ts';
import type { Sprache } from './logik/typen.ts';

let webBereit = false;
function webEinrichten() {
  if (webBereit) return true;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@kiekmolin.de', pub, priv);
  webBereit = true;
  return true;
}

// Apple-Anbieter-Token: 40 Minuten wiederverwenden (Apple: nicht öfter als alle 20, gültig bis 60).
let apnsToken: { jwt: string; seit: number } | null = null;
async function apnsAnmeldung(neu = false): Promise<string | null> {
  const p8 = Deno.env.get('APNS_KEY_P8'), kid = Deno.env.get('APNS_KEY_ID'), team = Deno.env.get('APNS_TEAM_ID');
  if (!p8 || !kid || !team) return null;
  const jetzt = Math.floor(Date.now() / 1000);
  if (!neu && apnsToken && jetzt - apnsToken.seit < 40 * 60) return apnsToken.jwt;
  apnsToken = { jwt: await apnsJwt(await apnsSchluessel(p8), kid, team, jetzt), seit: jetzt };
  return apnsToken.jwt;
}

async function apnsSenden(token: string, nutzlast: unknown, umgebung: ApnsUmgebung, jwt: string) {
  const r = await fetch(`${APNS_HOST[umgebung]}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': Deno.env.get('APNS_BUNDLE_ID') ?? 'de.kiekmolin.thechef',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 6 * 3600),
      'content-type': 'application/json',
    },
    body: JSON.stringify(nutzlast),
  });
  const grund = r.status === 200 ? undefined : ((await r.json().catch(() => ({}))) as { reason?: string }).reason;
  return { status: r.status, grund };
}

/** Ein Apple-Abo: erst die eingestellte Umgebung, bei "BadDeviceToken" die andere. */
async function apnsZustellen(token: string, n: Nachricht): Promise<'ok' | 'loeschen' | string> {
  let jwt = await apnsAnmeldung();
  if (!jwt) return 'apns_nicht_eingerichtet';
  const erste: ApnsUmgebung = Deno.env.get('APNS_UMGEBUNG') === 'production' ? 'production' : 'sandbox';
  const reihe: ApnsUmgebung[] = [erste, erste === 'sandbox' ? 'production' : 'sandbox'];
  let letzte = '';
  for (const u of reihe) {
    let a = await apnsSenden(token, apnsNutzlast(n), u, jwt);
    if (apnsDeuten(a.status, a.grund) === 'neues_token') {
      jwt = (await apnsAnmeldung(true))!;
      a = await apnsSenden(token, apnsNutzlast(n), u, jwt);
    }
    const folge = apnsDeuten(a.status, a.grund);
    if (folge === 'ok' || folge === 'loeschen') return folge;
    letzte = `${u} ${a.status} ${a.grund ?? ''}`.trim();
    if (folge !== 'andere_umgebung') break;
  }
  return letzte;
}

export type Nachricht = { titel: string; text: string; ziel?: string; tag?: string };

/** Schickt an alle Nutzer mit passender Rolle; text() baut die Nachricht in der Sprache des Empfängers. */
export async function pushAn(db: SupabaseClient, betriebId: string, rolle: 'chef' | 'mitarbeiter' | 'alle', text: (s: Sprache) => Nachricht) {
  let q = db.from('nutzer').select('id, sprache, rolle, push_an').eq('betrieb_id', betriebId).eq('push_an', true);
  if (rolle !== 'alle') q = q.eq('rolle', rolle);
  const { data: nutzer, error } = await q;
  if (error) throw new Error(error.message);
  let gesendet = 0;
  const fehler = new Set<string>();
  for (const n of nutzer ?? []) {
    const { data: abos, error: aboFehler } = await db.from('push_abos').select('*').eq('nutzer_id', n.id);
    if (aboFehler) { console.error('Push-Abos nicht lesbar', aboFehler.message); fehler.add('abos_lesen'); continue; }
    const nachricht = text(n.sprache as Sprache);
    for (const a of abos ?? []) {
      try {
        if (a.art === 'apns') {
          const r = await apnsZustellen(a.endpoint, nachricht);
          if (r === 'ok') gesendet++;
          else if (r === 'loeschen') await db.from('push_abos').delete().eq('id', a.id);
          else { console.error('Apple-Push fehlgeschlagen:', r); fehler.add(r === 'apns_nicht_eingerichtet' ? r : 'apns'); }
          continue;
        }
        if (!webEinrichten()) { console.error('VAPID-Schlüssel fehlen – Web-Push ist aus.'); fehler.add('push_nicht_eingerichtet'); continue; }
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(nachricht), { TTL: 6 * 3600 });
        gesendet++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_abos').delete().eq('id', a.id);
        else { console.error('Push fehlgeschlagen', a.art, code, (e as Error).message); fehler.add(a.art ?? 'web'); }
      }
    }
  }
  return fehler.size ? { gesendet, fehler: [...fehler].join(',') } : { gesendet };
}

/** Einmal pro (Art, Tag, Schlüssel) – der Zeitplan läuft alle 15 Minuten. */
export async function einmal(db: SupabaseClient, betriebId: string, art: string, datum: string, schluessel = ''): Promise<boolean> {
  const r = await db.from('benachrichtigungen').insert({ betrieb_id: betriebId, art, datum, schluessel });
  return !r.error; // Unique-Verletzung = schon gesendet
}
