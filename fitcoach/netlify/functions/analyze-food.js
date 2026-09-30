// KI-Foto-Scan: schickt ein Base64-Foto an Claude Vision und gibt
// Kalorien + Makros als JSON zurück.
// Bewusst OHNE npm-Paket (nur fetch) – damit die Function auch bei
// Netlify-Drag-&-Drop läuft, ohne Build/Installation.
// Der Anthropic-API-Key bleibt serverseitig (Env: ANTHROPIC_API_KEY).

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    erkannt: { type: 'boolean', description: 'true wenn auf dem Foto Essen erkennbar ist' },
    gericht: { type: 'string', description: 'Name des Gerichts auf Deutsch' },
    zutaten: {
      type: 'array',
      description: 'Alle erkennbaren Komponenten mit Einzelschätzung',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          menge_g: { type: 'integer' },
          kalorien: { type: 'integer' },
        },
        required: ['name', 'menge_g', 'kalorien'],
        additionalProperties: false,
      },
    },
    portionsgroesse_g: { type: 'integer', description: 'Gesamtgewicht der Portion in Gramm' },
    kalorien: { type: 'integer', description: 'Gesamtkalorien' },
    protein_g: { type: 'integer', description: 'Protein gesamt in Gramm' },
    carbs_g: { type: 'integer', description: 'Kohlenhydrate gesamt in Gramm' },
    fett_g: { type: 'integer', description: 'Fett gesamt in Gramm' },
    sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    hinweis: { type: 'string', description: 'Kurzer Hinweis zur Schätzung' },
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
4. Du kennst dich mit deutscher, türkischer, italienischer und internationaler Küche aus (Döner, Currywurst, Pasta, Bowls, Fast Food, Markenprodukte). Erkenne Marken/Ketten wenn sichtbar.
5. Bei Auflauf/Eintopf/verdeckten Schichten: kalkuliere die nicht sichtbaren Anteile mit ein und setze sicherheit auf "mittel" oder "niedrig".
6. Schätze die ganze sichtbare Portion (so wie serviert), nicht eine Norm-Portion.

Antworte auf Deutsch. Wenn kein Essen erkennbar ist: erkannt=false, alle Werte 0, leeres zutaten-Array.`;

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

  const { image_base64: imageBase64, media_type: mediaType } = payload;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!imageBase64 || !allowedTypes.includes(mediaType)) {
    return { headers: CORS, statusCode: 400, body: JSON.stringify({ error: 'Bild fehlt oder Format nicht unterstützt' }) };
  }
  if (imageBase64.length > 7_000_000) {
    return { headers: CORS, statusCode: 413, body: JSON.stringify({ error: 'Bild zu groß – bitte verkleinern' }) };
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
        // Sonnet 4.6: schnelle, starke Bilderkennung – bleibt im Netlify-Zeitlimit
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: 'Analysiere dieses Gericht komponentenweise und gib die Gesamt-Nährwerte der ganzen sichtbaren Portion zurück.' },
            ],
          },
        ],
        output_config: { format: { type: 'json_schema', schema: FOOD_SCHEMA } },
      }),
    });

    if (res.status === 429) {
      return { headers: CORS, statusCode: 429, body: JSON.stringify({ error: 'Zu viele Anfragen – bitte kurz warten' }) };
    }
    if (!res.ok) {
      const fehlerText = await res.text();
      console.error('Claude-API-Fehler:', res.status, fehlerText);
      // Häufigste Ursachen klar benennen statt generischem Fehler
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
      body: textBlock.text, // bereits valides JSON laut Schema
    };
  } catch (err) {
    console.error('Fehler:', err);
    return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'KI-Analyse fehlgeschlagen' }) };
  }
};
