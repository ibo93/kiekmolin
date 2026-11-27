// Web Push verschicken (VAPID). Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export async function sendPushQueue(sb: SupabaseClient, report: string[]) {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return;                         // Push nicht eingerichtet – kein Fehler
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.org', pub, priv);

  const { data: queue } = await sb.from('push_queue').select('*').is('sent_at', null).order('id').limit(200);
  if (!queue?.length) return;
  let ok = 0, gone = 0, failed = 0;
  for (const q of queue) {
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', q.user_id);
    const results: string[] = [];
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: q.title, body: q.body, url: q.url, tag: q.kind }), { TTL: 3600 });
        ok++; results.push('ok');
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {            // Gerät abgemeldet → Abo löschen
          await sb.from('push_subscriptions').delete().eq('id', s.id); gone++; results.push('gone');
        } else { failed++; results.push(`err ${code ?? ''}`); console.error('push', q.id, e); }
      }
    }
    await sb.from('push_queue').update({ sent_at: new Date().toISOString(), result: results.join(',') || 'kein Gerät' }).eq('id', q.id);
  }
  report.push(`Push: ${ok} zugestellt, ${gone} Geräte abgemeldet, ${failed} Fehler`);
}
