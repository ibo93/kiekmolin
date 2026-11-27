// Cash-Out. Wert wird in cashout_bet() neu berechnet; ist er gesunken,
// muss der Nutzer neu bestätigen (CASHOUT_CHANGED mit neuem Wert).
import { admin, cors, json, userFrom } from '../_shared/supa.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  const user = await userFrom(req, sb);
  if (!user) return json({ ok: false, code: 'NOT_AUTHENTICATED' }, 401);
  let body: { bet_id?: string; expected?: number };
  try { body = await req.json(); } catch { return json({ ok: false, code: 'INVALID_REQUEST' }, 400); }
  if (!body.bet_id || !Number.isInteger(body.expected)) return json({ ok: false, code: 'INVALID_REQUEST' }, 400);

  const { data, error } = await sb.rpc('cashout_bet', { p_user: user.id, p_bet: body.bet_id, p_expected: body.expected });
  if (error) {
    console.error('cashout_bet', user.id, error.message);
    return json({ ok: false, code: 'SERVER' }, 500);
  }
  return json(data);
});
