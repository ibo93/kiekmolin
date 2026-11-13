// Gemeinsames für alle Edge Functions: CORS, Antworten, Anmeldung prüfen.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Betrieb, Nutzer } from './logik/typen.ts';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(daten: unknown, status = 200) {
  return new Response(JSON.stringify(daten), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
export function fehler(text: string, status = 400) {
  return json({ fehler: text }, status);
}

/** Server-Schlüssel: umgeht RLS. Nur NACH geprüfter Anmeldung und immer mit betrieb_id filtern. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

export type Aufrufer = { nutzer: Nutzer; betrieb: Betrieb; db: SupabaseClient };

/** Wer ruft an? Liefert Nutzer + Betrieb oder wirft. */
export async function aufrufer(req: Request): Promise<Aufrufer> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) throw new Error('nicht angemeldet');
  const db = admin();
  const { data: u, error } = await db.auth.getUser(jwt);
  if (error || !u.user) throw new Error('nicht angemeldet');
  const n = await db.from('nutzer').select('*').eq('id', u.user.id).single();
  if (n.error || !n.data) throw new Error('kein Betrieb');
  const b = await db.from('betriebe').select('*').eq('id', n.data.betrieb_id).single();
  if (b.error || !b.data) throw new Error('kein Betrieb');
  return { nutzer: n.data as Nutzer, betrieb: b.data as Betrieb, db };
}

/** Handler mit CORS und sauberer Fehlerantwort (Fehlertext IMMER zurück – nie still). */
export function bedienen(f: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
      return await f(req);
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      console.error(m);
      return fehler(m, /nicht angemeldet|kein Betrieb/.test(m) ? 401 : 500);
    }
  });
}
