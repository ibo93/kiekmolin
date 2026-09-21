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

// Einfacher App-Schlüssel statt Login: Der Client schickt x-app-key,
// das muss zur Netlify-Variable APP_KEY passen.
function autorisiert(event) {
  const key = event.headers['x-app-key'];
  return Boolean(key && process.env.APP_KEY && key === process.env.APP_KEY);
}

// Beide Schreibweisen akzeptieren – robust gegen Tippfehler beim Eintragen
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-key',
};

exports.handler = async (event) => {
  // Preflight (kommt z. B. von der Standalone-Testdatei)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { headers: CORS, statusCode: 405, body: JSON.stringify({ error: 'Nur POST erlaubt' }) };
  }
  if (!API_KEY) {
    return { headers: CORS, statusCode: 503, body: JSON.stringify({ error: 'KI ist nicht konfiguriert (ANTHROPIC_API_KEY fehlt)' }) };
  }

  if (!autorisiert(event)) {
    return { headers: CORS, statusCode: 401, body: JSON.stringify({ error: 'App-Schlüssel fehlt oder falsch' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { headers: CORS, statusCode: 400, body: JSON.stringify({ error: 'Ungültiger Request-Body' }) };
  }
  const text = (payload.text || '').trim();
  if (!text || text.length > 600) {
    return { headers: CORS, statusCode: 400, body: JSON.stringify({ error: 'Beschreibung fehlt oder ist zu lang' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
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
      return { headers: CORS, statusCode: 429, body: JSON.stringify({ error: 'Zu viele Anfragen – bitte kurz warten' }) };
    }
    if (!res.ok) {
      const fehlerText = await res.text();
      console.error('Claude-API-Fehler:', res.status, fehlerText);
      if (/credit balance/i.test(fehlerText)) {
        return { headers: CORS, statusCode: 402, body: JSON.stringify({ error: 'Kein Guthaben auf dem Anthropic-Konto – auf console.anthropic.com unter Billing aufladen' }) };
      }
      if (res.status === 401) {
        return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY ist ungültig – bei Netlify prüfen' }) };
      }
      return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'Keine Antwort vom KI-Modell' }) };
    }
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: textBlock.text,
    };
  } catch (err) {
    console.error('Fehler:', err);
    return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
  }
};
