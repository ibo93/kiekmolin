// KI-Text-Analyse: nimmt eine Gericht-Beschreibung (getippt oder per Sprache
// diktiert) entgegen und lässt Claude Kalorien + Makros schätzen.
// Gleiche Absicherung wie analyze-food: API-Key serverseitig, Supabase-JWT nötig.

const Anthropic = require('@anthropic-ai/sdk');

// Client auf Modul-Ebene: wird bei warmen Function-Aufrufen wiederverwendet
const client = new Anthropic();

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    erkannt: { type: 'boolean', description: 'true wenn die Beschreibung Essen enthält' },
    gericht: { type: 'string', description: 'Normalisierter Name des Gerichts auf Deutsch' },
    portionsgroesse_g: { type: 'integer', description: 'Geschätzte Portionsgröße in Gramm' },
    kalorien: { type: 'integer', description: 'Kalorien der ganzen Portion (kcal)' },
    protein_g: { type: 'integer', description: 'Protein in Gramm' },
    carbs_g: { type: 'integer', description: 'Kohlenhydrate in Gramm' },
    fett_g: { type: 'integer', description: 'Fett in Gramm' },
    sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    hinweis: { type: 'string', description: 'Kurzer Hinweis zur Schätzung' },
  },
  required: [
    'erkannt', 'gericht', 'portionsgroesse_g', 'kalorien',
    'protein_g', 'carbs_g', 'fett_g', 'sicherheit', 'hinweis',
  ],
  additionalProperties: false,
};

async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Nur POST erlaubt' }) };
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
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system:
        'Du bist ein Ernährungsexperte. Der Nutzer beschreibt ein Gericht in Worten ' +
        '(oft per Sprache diktiert, evtl. mit Mengenangaben wie "200 Gramm Reis"). ' +
        'Schätze Portionsgröße, Kalorien und Makros realistisch, berücksichtige ' +
        'typische Zubereitung (Öl, Soßen). Antworte auf Deutsch. Wenn die Beschreibung ' +
        'kein Essen ist, setze erkannt=false und alle Werte auf 0.',
      messages: [
        {
          role: 'user',
          content: `Schätze Nährwerte für: "${text}"`,
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: FOOD_SCHEMA },
      },
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Keine Antwort vom KI-Modell' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: textBlock.text,
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Zu viele Anfragen – bitte kurz warten' }) };
    }
    console.error('Claude-API-Fehler:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
  }
};
