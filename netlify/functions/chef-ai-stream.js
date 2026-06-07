// The Chef – KI-Streaming. Wie chef-ai.js, nur dass Claude's SSE-Stream
// 1:1 an den Client durchgereicht wird. Erster Token in ~400ms, statt nach
// 2-3 Sekunden voller Roundtrip.
//
// Erwartet POST mit JSON (gleiches Schema wie chef-ai.js):
//   { message, history, restaurant, context }
// Antwort: text/event-stream mit Claude-Events. Client liest delta.text.
//
// Netlify Functions v2 (export default + Response) ermoeglicht echtes
// Response-Streaming – Anthropic-SSE wird gepiped ohne Buffer.

const SYSTEM_PROMPT = `Du bist "The Chef" – der persönliche KI-Assistent für Gastronominnen und Gastronomen, eingebaut in eine Mobile-App.

# Deine Rolle
Du bist der digitale Sous-Chef und Betriebsleiter-Assistent. Du hilfst dem Wirt, seinen Laden im Griff zu behalten: Warenbestand, Bestellungen, Kalkulation, Personal, Marketing, Lieferanten und die Tagesplanung. Du bist proaktiv, praktisch und sprichst die Sprache der Gastronomie – kein Tech-Geschwätz.

# Wie du antwortest
- Deutsch, per Du, locker aber kompetent – wie ein erfahrener Kollege.
- Kurz und konkret. Maximal 2-4 Sätze pro Antwort, außer es wird ausdrücklich mehr verlangt.
- Immer handlungsorientiert: sag, was zu tun ist, nicht nur, was Sache ist.
- Nenne konkrete Zahlen, Mengen, Uhrzeiten, Lieferanten, wenn sie im Kontext stehen.
- Wenn du eine Aktion vorschlägst, formuliere sie als klaren nächsten Schritt ("Soll ich ... vorbereiten?").
- Keine Emojis, keine Aufzählungs-Bullets außer es hilft der Übersicht wirklich.
- Wenn dir Daten fehlen, sag offen was du brauchst – erfinde keine Bestände oder Zahlen.

# Worüber du Bescheid weißt
- Warenbestand & Mindesthaltbarkeit, Nachbestellung, Lieferanten-Vergleich
- Rezept-Kalkulation: Wareneinsatz, Marge, Verkaufspreis
- Wochenangebote & Tageskarte passend zum Lager
- Personal- und Schichtplanung, Wetter-Einfluss auf Gästezahl
- Marketing: Post-Ideen für Instagram/TikTok/Google
- Tagesplan: was heute noch ansteht (Lieferungen, Anrufe, Aufgaben)
- Krisen: Personalausfall, Lieferprobleme, Stromausfall, Kontrolle
- Angebote von Großhändlern & Discountern (Metro, Aldi, Lidl etc.)

# Grenzen
- Du bist ein Assistent in einer Demo/Prototyp-App. Die Daten im Kontext sind die einzige Quelle der Wahrheit – wenn etwas nicht drinsteht, weißt du es nicht.
- Du führst keine echten Bestellungen aus, keine echten Zahlungen, keine rechtsverbindlichen Aussagen. Du bereitest vor und schlägst vor; der Mensch entscheidet.
- Bei rechtlichen, steuerlichen oder lebensmittelrechtlichen Detailfragen: gib eine sinnvolle erste Einschätzung und empfiehl, im Zweifel Fachleute/Behörden zu fragen.

Bleib immer in der Rolle von "The Chef".`;

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht gesetzt' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  let payload;
  try { payload = await req.json(); }
  catch (e) { return new Response(JSON.stringify({ error: 'Ungültiges JSON' }), { status: 400, headers: { 'content-type': 'application/json' } }); }

  const userMessage = String(payload.message || '').trim();
  if (!userMessage) {
    return new Response(JSON.stringify({ error: 'Feld "message" fehlt' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // History normalisieren (gleiche Logik wie chef-ai.js)
  const history = Array.isArray(payload.history) ? payload.history.slice(-20) : [];
  const messages = [];
  for (const turn of history) {
    const role = turn && turn.role === 'assistant' ? 'assistant' : 'user';
    const text = turn && typeof turn.text === 'string' ? turn.text.trim() : '';
    if (!text) continue;
    if (messages.length && messages[messages.length - 1].role === role) {
      messages[messages.length - 1].content += '\n' + text;
    } else {
      messages.push({ role, content: text });
    }
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (messages.length && messages[messages.length - 1].role === 'user') {
    messages[messages.length - 1].content += '\n' + userMessage;
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const r = payload.restaurant || {};
  const ctxLines = [];
  if (r.name) ctxLines.push('Restaurant: ' + r.name);
  if (r.type) ctxLines.push('Betriebs-Typ: ' + r.type);
  if (payload.context) ctxLines.push('Aktuelle Lage:\n' + String(payload.context).slice(0, 4000));
  const restaurantContext = ctxLines.length
    ? 'Kontext für diese Anfrage:\n' + ctxLines.join('\n')
    : 'Kein zusätzlicher Kontext übergeben.';

  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'accept': 'text/event-stream'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        stream: true,
        output_config: { effort: 'low' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: restaurantContext }
        ],
        messages
      })
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Claude unerreichbar', detail: String(err && err.message || err) }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  if (!claudeRes.ok || !claudeRes.body) {
    const t = await claudeRes.text().catch(() => '');
    return new Response(JSON.stringify({ error: 'Claude-Stream fehlgeschlagen', detail: t.slice(0, 300) }), { status: claudeRes.status || 502, headers: { 'content-type': 'application/json' } });
  }

  // Claude SSE-Stream 1:1 an den Client durchreichen
  return new Response(claudeRes.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'access-control-allow-origin': '*'
    }
  });
};
