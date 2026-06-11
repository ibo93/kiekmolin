// Ernährungs-Coach: schlägt konkrete Gerichte vor, die in die restlichen
// Kalorien und Makros des Tages passen.
// Bewusst OHNE npm-Paket (nur fetch) – läuft auch bei Netlify-Drag-&-Drop.

const VORSCHLAG_SCHEMA = {
  type: 'object',
  properties: {
    vorschlaege: {
      type: 'array',
      description: 'Genau 3 konkrete Gericht-Vorschläge',
      items: {
        type: 'object',
        properties: {
          gericht: { type: 'string', description: 'Name des Gerichts auf Deutsch' },
          beschreibung: { type: 'string', description: 'Ein Satz: was genau, grobe Mengen, warum es jetzt passt' },
          kalorien: { type: 'integer' },
          protein_g: { type: 'integer' },
          carbs_g: { type: 'integer' },
          fett_g: { type: 'integer' },
        },
        required: ['gericht', 'beschreibung', 'kalorien', 'protein_g', 'carbs_g', 'fett_g'],
        additionalProperties: false,
      },
    },
    hinweis: { type: 'string', description: 'Ein motivierender Satz zur Tagesbilanz' },
  },
  required: ['vorschlaege', 'hinweis'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du bist ein pragmatischer Ernährungs-Coach für eine deutsche Fitness-App.
Der Nutzer fragt: "Was soll ich heute noch essen?" Du bekommst seine restlichen Kalorien und Makros für heute.

Regeln für deine 3 Vorschläge:
- Alltagstauglich: normale Supermarkt-Zutaten oder schnell zubereitet (auch Imbiss/Kantine okay), keine exotischen Rezepte
- Die Vorschläge sollen gut in die RESTLICHEN Kalorien passen und vor allem die Protein-Lücke schließen
- Abwechslung: ein schnelles/kaltes Gericht, ein warmes Gericht, eine leichte Option
- Wenn kaum noch Kalorien übrig sind: kleine, proteinreiche Snacks (Magerquark, Skyr, Eier, Gemüse)
- Wenn das Tagesziel überschritten ist: ehrlich sagen, nur sehr leichte Optionen oder "heute reicht es" empfehlen
- Mengenangaben konkret in Gramm/Stück, Kalorien realistisch
- Deutsch, direkt, motivierend ohne Floskeln`;

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

// Beide Schreibweisen akzeptieren – robust gegen Tippfehler beim Eintragen
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Nur POST erlaubt' }) };
  }
  if (!API_KEY) {
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

  const zahl = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);
  const lage = {
    ziel: ['abnehmen', 'muskelaufbau', 'rekomposition'].includes(payload.ziel) ? payload.ziel : 'abnehmen',
    kalorienziel: zahl(payload.kalorienziel),
    rest_kalorien: zahl(payload.rest_kalorien),
    rest_protein: zahl(payload.rest_protein),
    rest_carbs: zahl(payload.rest_carbs),
    rest_fett: zahl(payload.rest_fett),
    uhrzeit: zahl(payload.uhrzeit),
  };

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
        messages: [
          {
            role: 'user',
            content:
              `Mein Ziel: ${lage.ziel}. Tagesziel ${lage.kalorienziel} kcal. ` +
              `Heute noch übrig: ${lage.rest_kalorien} kcal, ${lage.rest_protein} g Protein, ` +
              `${lage.rest_carbs} g Carbs, ${lage.rest_fett} g Fett. Es ist ${lage.uhrzeit} Uhr. ` +
              'Was soll ich heute noch essen?',
          },
        ],
        output_config: { format: { type: 'json_schema', schema: VORSCHLAG_SCHEMA } },
      }),
    });

    if (res.status === 429) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Zu viele Anfragen – bitte kurz warten' }) };
    }
    if (!res.ok) {
      const fehlerText = await res.text();
      console.error('Claude-API-Fehler:', res.status, fehlerText);
      if (/credit balance/i.test(fehlerText)) {
        return { statusCode: 402, body: JSON.stringify({ error: 'Kein Guthaben auf dem Anthropic-Konto – auf console.anthropic.com unter Billing aufladen' }) };
      }
      return { statusCode: 502, body: JSON.stringify({ error: 'Coach nicht erreichbar' }) };
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
    return { statusCode: 502, body: JSON.stringify({ error: 'Coach nicht erreichbar' }) };
  }
};
