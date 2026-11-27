// Wette platzieren. Prüfung UND Abbuchung passieren in place_bets() in einer
// Transaktion (Coins reichen? Quote noch gültig? Spiel nicht vorbei/angepfiffen?).
// Diese Funktion stellt nur sicher, WER wettet – die user_id kommt aus dem JWT.
import { admin, cors, json, userFrom } from '../_shared/supa.ts';

const MESSAGES: Record<string, string> = {
  INVALID_REQUEST: 'Ungültige Anfrage.',
  INVALID_STAKE: 'Ungültiger Einsatz.',
  INVALID_BET_SHAPE: 'Diese Wettart passt nicht zur Anzahl der Tipps.',
  SAME_EVENT_IN_COMBO: 'Zwei Tipps aus demselben Spiel gehen nur im Konfigurator.',
  BUILDER_CONFLICT: 'Diese Tipps sagen dasselbe vorher.',
  ODDS_CHANGED: 'Quoten haben sich geändert.',
  SELECTION_UNAVAILABLE: 'Ein Tipp ist gerade nicht verfügbar.',
  INSUFFICIENT_COINS: 'Nicht genug Coins.',
  MAX_PAYOUT_EXCEEDED: 'Möglicher Gewinn zu hoch.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'METHOD' }, 405);
  const sb = admin();
  const user = await userFrom(req, sb);
  if (!user) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte anmelden.' }, 401);

  let body: { bets?: unknown };
  try { body = await req.json(); } catch { return json({ ok: false, code: 'INVALID_REQUEST' }, 400); }
  if (!Array.isArray(body.bets)) return json({ ok: false, code: 'INVALID_REQUEST' }, 400);

  const { data, error } = await sb.rpc('place_bets', { p_user: user.id, p_bets: body.bets });
  if (error) {
    console.error('place_bets', user.id, error.message);
    return json({ ok: false, code: 'SERVER', message: 'Wette konnte nicht gespeichert werden.' }, 500);
  }
  const r = data as { ok: boolean; code?: string };
  if (!r.ok) return json({ ...r, message: MESSAGES[r.code ?? ''] ?? r.code }, 200);
  return json(r);
});
