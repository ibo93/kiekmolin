// KI-Text-Analyse: schätzt aus einer Gericht-Beschreibung (getippt oder
// per Sprache diktiert) Kalorien + Makros.
// Bewusst OHNE npm-Paket (nur fetch) – läuft auch bei Netlify-Drag-&-Drop.

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    erkannt: { type: 'boolean' },
    gericht: { type: 'string', description: 'Normalisierter Name des Gerichts auf Deutsch' },
    portionsgroesse_g: { type: 'integer' },
    kalorien: { type: 'integer' },
    protein_g: { type: 'integer' },
    carbs_g: { type: 'integer' },
    fett_g: { type: 'integer' },
    sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    hinweis: { type: 'string' },
  },
  required: [
    'erkannt', 'gericht', 'portionsgroesse_g', 'kalorien',
    'protein_g', 'carbs_g', 'fett_g', 'sicherheit', 'hinweis',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  'Du bist ein Ernährungsexperte. Der Nutzer beschreibt ein Gericht in Worten ' +
  '(oft per Sprache diktiert, evtl. mit Mengenangaben wie "200 Gramm Reis"). ' +
  'Schätze Portionsgröße, Kalorien und Makros realistisch, berücksichtige ' +
  'typische Zubereitung (Öl, Soßen). Antworte auf Deutsch. Wenn die Beschreibung ' +
  'kein Essen ist, setze erkannt=false und alle Werte auf 0.';

async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: process.env.SUPABASE_ANON_KEY },
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Nur POST erlaubt' }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'KI ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt)' }) };
  }

  const user = await verifyUser(event.headers.authorization);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Nicht eingeloggt' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ungültiger Request-Body' }) };
  }
  const text = (payload.text || '').trim();
  if (!text || text.length > 600) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Beschreibung fehlt oder ist zu lang' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Schätze Nährwerte für: "${text}"` }],
        output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA } },
      }),
    });

    if (res.status === 429) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Zu viele Anfragen – bitte kurz warten' }) };
    }
    if (!res.ok) {
      console.error('Claude-API-Fehler:', res.status, await res.text());
      return { statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Keine Antwort vom KI-Modell' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: textBlock.text,
    };
  } catch (err) {
    console.error('Fehler:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
  }
};
