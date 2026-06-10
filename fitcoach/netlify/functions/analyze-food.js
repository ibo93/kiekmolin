// KI-Foto-Scan: nimmt ein Base64-Foto entgegen, lässt Claude Vision das
// Gericht analysieren und gibt Kalorien + Makros als JSON zurück.
// Der Anthropic-API-Key bleibt serverseitig (Env: ANTHROPIC_API_KEY).
// Zugriff nur mit gültigem Supabase-Login (Bearer-Token wird verifiziert).

const Anthropic = require('@anthropic-ai/sdk');

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    erkannt: {
      type: 'boolean',
      description: 'true wenn auf dem Foto Essen erkennbar ist',
    },
    gericht: { type: 'string', description: 'Name des Gerichts auf Deutsch' },
    portionsgroesse_g: {
      type: 'integer',
      description: 'Geschätzte Portionsgröße in Gramm',
    },
    kalorien: { type: 'integer', description: 'Kalorien der ganzen Portion (kcal)' },
    protein_g: { type: 'integer', description: 'Protein in Gramm' },
    carbs_g: { type: 'integer', description: 'Kohlenhydrate in Gramm' },
    fett_g: { type: 'integer', description: 'Fett in Gramm' },
    zutaten: {
      type: 'array',
      items: { type: 'string' },
      description: 'Erkennbare Hauptzutaten auf Deutsch',
    },
    sicherheit: {
      type: 'string',
      enum: ['hoch', 'mittel', 'niedrig'],
      description: 'Wie sicher ist die Schätzung',
    },
    hinweis: {
      type: 'string',
      description: 'Kurzer Hinweis zur Schätzung, z. B. unsichtbare Zutaten wie Öl',
    },
  },
  required: [
    'erkannt', 'gericht', 'portionsgroesse_g', 'kalorien',
    'protein_g', 'carbs_g', 'fett_g', 'zutaten', 'sicherheit', 'hinweis',
  ],
  additionalProperties: false,
};

// Prüft das Supabase-JWT gegen die Auth-API, damit nur eingeloggte
// Nutzer den (kostenpflichtigen) Claude-Call auslösen können.
async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: process.env.SUPABASE_ANON_KEY,
    },
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

  const { image_base64: imageBase64, media_type: mediaType } = payload;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!imageBase64 || !allowedTypes.includes(mediaType)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bild fehlt oder Format nicht unterstützt' }) };
  }
  // ~7 MB Base64 ≈ 5 MB Bild — Claude-Limit und Netlify-Payload-Grenze
  if (imageBase64.length > 7_000_000) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Bild zu groß – bitte verkleinern' }) };
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system:
        'Du bist ein Ernährungsexperte. Analysiere Fotos von Gerichten und schätze ' +
        'Portionsgröße, Kalorien und Makronährstoffe realistisch. Berücksichtige ' +
        'unsichtbare Zutaten (Öl, Butter, Zucker in Soßen). Antworte auf Deutsch. ' +
        'Wenn kein Essen erkennbar ist, setze erkannt=false und alle Werte auf 0.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: 'Analysiere dieses Gericht: erkenne es, schätze die Portionsgröße in Gramm sowie Kalorien, Protein, Kohlenhydrate und Fett der ganzen Portion.',
            },
          ],
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
      body: textBlock.text, // bereits valides JSON laut Schema
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Zu viele Anfragen – bitte kurz warten' }) };
    }
    console.error('Claude-API-Fehler:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
  }
};
