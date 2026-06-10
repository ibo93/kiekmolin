// KI-Foto-Scan: nimmt ein Base64-Foto entgegen, lässt Claude Vision das
// Gericht analysieren und gibt Kalorien + Makros als JSON zurück.
// Der Anthropic-API-Key bleibt serverseitig (Env: ANTHROPIC_API_KEY).
// Zugriff nur mit gültigem Supabase-Login (Bearer-Token wird verifiziert).

const Anthropic = require('@anthropic-ai/sdk');

// Client auf Modul-Ebene: wird bei warmen Function-Aufrufen wiederverwendet
const client = new Anthropic();

// Das Schema zwingt die KI, das Gericht in Zutaten mit Einzelwerten zu
// zerlegen – komponentenweises Schätzen ist deutlich genauer als eine
// Gesamtzahl aus dem Bauch.
const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    erkannt: {
      type: 'boolean',
      description: 'true wenn auf dem Foto Essen erkennbar ist',
    },
    gericht: { type: 'string', description: 'Name des Gerichts auf Deutsch' },
    zutaten: {
      type: 'array',
      description: 'Alle erkennbaren Komponenten mit Einzelschätzung',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Zutat/Komponente auf Deutsch' },
          menge_g: { type: 'integer', description: 'Geschätzte Menge in Gramm' },
          kalorien: { type: 'integer', description: 'Kalorien dieser Komponente' },
        },
        required: ['name', 'menge_g', 'kalorien'],
        additionalProperties: false,
      },
    },
    portionsgroesse_g: {
      type: 'integer',
      description: 'Gesamtgewicht der Portion in Gramm (Summe der Zutaten)',
    },
    kalorien: {
      type: 'integer',
      description: 'Gesamtkalorien (muss zur Summe der Zutaten passen)',
    },
    protein_g: { type: 'integer', description: 'Protein gesamt in Gramm' },
    carbs_g: { type: 'integer', description: 'Kohlenhydrate gesamt in Gramm' },
    fett_g: { type: 'integer', description: 'Fett gesamt in Gramm' },
    sicherheit: {
      type: 'string',
      enum: ['hoch', 'mittel', 'niedrig'],
      description: 'Wie sicher ist die Schätzung',
    },
    hinweis: {
      type: 'string',
      description: 'Kurzer Hinweis, z. B. zu unsichtbaren Zutaten oder Unsicherheiten',
    },
  },
  required: [
    'erkannt', 'gericht', 'zutaten', 'portionsgroesse_g', 'kalorien',
    'protein_g', 'carbs_g', 'fett_g', 'sicherheit', 'hinweis',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du bist ein erfahrener Ernährungsexperte und analysierst Fotos von Gerichten so präzise wie möglich.

Vorgehen:
1. Nutze Referenzobjekte im Bild für die Größenschätzung: Standardteller ≈ 26 cm, Gabel ≈ 19 cm, Glas ≈ 200–300 ml, Hand, Dose (330 ml).
2. Zerlege das Gericht in seine Komponenten und schätze jede einzeln (Gramm + Kalorien) – die Gesamtwerte müssen zur Summe passen.
3. Rechne unsichtbare Zutaten realistisch ein: Bratöl/Butter (typisch 10–15 g pro gebratener Komponente), Zucker und Fett in Soßen/Dressings, Marinade.
4. Du kennst dich mit deutscher, türkischer, italienischer und internationaler Küche aus (Döner, Currywurst, Pasta, Bowls, Fast Food, Markenprodukte). Erkenne Marken/Ketten wenn sichtbar und nutze deren typische Nährwerte.
5. Bei Auflauf/Eintopf/verdeckten Schichten: kalkuliere die nicht sichtbaren Anteile mit ein und setze sicherheit auf "mittel" oder "niedrig".
6. Schätze lieber die ganze sichtbare Portion (so wie serviert), nicht eine Norm-Portion.

Antworte auf Deutsch. Wenn kein Essen erkennbar ist: erkannt=false, alle Werte 0, leeres zutaten-Array.`;

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

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
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
              text: 'Analysiere dieses Gericht komponentenweise und gib die Gesamt-Nährwerte der ganzen sichtbaren Portion zurück.',
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
