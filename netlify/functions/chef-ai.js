// The Chef – KI-Assistent. Proxyt Anfragen an die Claude API.
// Der ANTHROPIC_API_KEY bleibt serverseitig (Netlify-Env-Var) – nie im Frontend.
//
// Erwartet POST mit JSON:
//   {
//     message:   "die Frage des Gastronomen",
//     history:   [{ role: "user"|"assistant", text: "..." }, ...],   // optional
//     restaurant:{ name: "...", type: "..." },                       // optional
//     context:   "frei formatierter Lage-Snapshot (Lager, Umsatz, ...)" // optional
//   }
// Antwort: { reply: "..." }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// --- Frozen System-Prompt -------------------------------------------------
// Bewusst stabil & ausführlich gehalten: Inhalt ändert sich NICHT pro Request,
// damit Prompt-Caching greift. Der variable Teil (Restaurant-Name/-Typ, Lager-
// Snapshot) kommt als zweiter, NICHT gecachter System-Block dahinter.
const SYSTEM_PROMPT = `Du bist "The Chef" – der persönliche KI-Assistent für Gastronominnen und Gastronomen, eingebaut in eine Mobile-App.

# Deine Rolle
Du bist der digitale Sous-Chef und Betriebsleiter-Assistent. Du hilfst dem Wirt, seinen Laden im Griff zu behalten: Warenbestand, Bestellungen, Kalkulation, Personal, HACCP, Marketing, Lieferanten und die Tagesplanung. Du bist proaktiv, praktisch und sprichst die Sprache der Gastronomie – kein Tech-Geschwätz.

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
- HACCP: Temperaturen, Reinigung, Dokumentation
- Marketing: Post-Ideen für Instagram/TikTok/Google
- Tagesplan: was heute noch ansteht (Lieferungen, Anrufe, Aufgaben)
- Krisen: Personalausfall, Lieferprobleme, Stromausfall, Kontrolle
- Angebote von Großhändlern & Discountern (Metro, Aldi, Lidl etc.)

# Grenzen
- Du bist ein Assistent in einer Demo/Prototyp-App. Die Daten im Kontext sind die einzige Quelle der Wahrheit – wenn etwas nicht drinsteht, weißt du es nicht.
- Du führst keine echten Bestellungen aus, keine echten Zahlungen, keine rechtsverbindlichen Aussagen. Du bereitest vor und schlägst vor; der Mensch entscheidet.
- Bei rechtlichen, steuerlichen oder lebensmittelrechtlichen Detailfragen: gib eine sinnvolle erste Einschätzung und empfiehl, im Zweifel Fachleute/Behörden zu fragen.

Bleib immer in der Rolle von "The Chef".`;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht gesetzt' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON' }) };
  }

  const userMessage = (payload.message || '').toString().trim();
  if (!userMessage) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Feld "message" fehlt' }) };
  }

  // Konversations-Historie übernehmen (alternierend, defensiv normalisiert)
  const history = Array.isArray(payload.history) ? payload.history.slice(-20) : [];
  const messages = [];
  for (const turn of history) {
    const role = turn && turn.role === 'assistant' ? 'assistant' : 'user';
    const text = turn && typeof turn.text === 'string' ? turn.text.trim() : '';
    if (!text) continue;
    // keine zwei gleichen Rollen hintereinander
    if (messages.length && messages[messages.length - 1].role === role) {
      messages[messages.length - 1].content += '\n' + text;
    } else {
      messages.push({ role: role, content: text });
    }
  }
  // sicherstellen, dass es mit user beginnt
  while (messages.length && messages[0].role !== 'user') messages.shift();
  // aktuelle Frage anhängen
  if (messages.length && messages[messages.length - 1].role === 'user') {
    messages[messages.length - 1].content += '\n' + userMessage;
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  // Variabler Restaurant-Kontext – kommt NACH dem gecachten Block
  const r = payload.restaurant || {};
  const ctxLines = [];
  if (r.name) ctxLines.push('Restaurant: ' + r.name);
  if (r.type) ctxLines.push('Betriebs-Typ: ' + r.type);
  if (payload.context) ctxLines.push('Aktuelle Lage:\n' + String(payload.context).slice(0, 4000));
  const restaurantContext = ctxLines.length
    ? 'Kontext für diese Anfrage:\n' + ctxLines.join('\n')
    : 'Kein zusätzlicher Kontext übergeben.';

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        output_config: { effort: 'medium' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: restaurantContext }
        ],
        messages: messages
      })
    });
    if (!apiRes.ok) {
      const t = await apiRes.text();
      const e = new Error(t.slice(0, 300)); e.status = apiRes.status; throw e;
    }
    const response = await apiRes.json();

    const reply = (response.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n')
      .trim();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        reply: reply || 'Sorry, da kam nichts zurück – frag noch mal anders.',
        usage: response.usage
      })
    };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('chef-ai error:', status, msg);
    return {
      statusCode: status >= 400 && status < 600 ? status : 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Claude-Anfrage fehlgeschlagen', detail: msg })
    };
  }
};
