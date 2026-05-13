// Kiek mol in — KI-Assistent via Anthropic Claude API
// Erwartet ANTHROPIC_API_KEY in Netlify Env-Vars.
// Body: { message: string, history?: [{role, content}], context?: {...} }

'use strict';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';   // schnell + günstig für Chat
const MAX_TOKENS = 600;

const SYSTEM_PROMPT = `Du bist der "Kiek mol in"-Assistent — ein freundlicher Helfer auf der ostfriesischen Gastro-Plattform kiekmolin.de.

DEINE AUFGABE:
- Hilf Gästen, Restaurants zu finden, zu bestellen, Tische zu reservieren
- Beantworte Fragen ZUR APP (wie bestellen, reservieren, bezahlen, Konto, Dark Mode, Favoriten, Push-Benachrichtigungen, Lieferung/Abholung)
- Gib regionale Tipps für Ostfriesland (Greetsiel, Norddeich, Norden, Aurich, Emden)
- Antworte IMMER auf Deutsch (oder in der Sprache des Nutzers wenn explizit anders)

STIL:
- Kurz, freundlich, hilfreich. Maximal 4-5 Sätze.
- Verwende "du" (nicht "Sie")
- Norddeutsche Begrüßung: "Moin"
- Bei App-Fragen: konkrete Schritte (1, 2, 3)
- KEIN Marketing-Sprech, keine "Vielen Dank für Ihre Frage"-Floskeln

APP-WISSEN (wichtig!):
- Bestellen: Restaurant antippen → Speisekarte → Gericht in Warenkorb → Bestellen
- Reservieren: Restaurant → "Tisch reservieren" → Datum/Zeit/Personen → Absenden
- Bezahlen: Bar vor Ort, Karte vor Ort, PayPal online, oder Banküberweisung
- Konto: oben rechts Profil → Registrieren/Anmelden. Bestellen geht auch als Gast.
- Push aktivieren: Banner antippen ODER Profil → Einstellungen → Benachrichtigungen. iPhone: erst "zum Home-Bildschirm hinzufügen".
- Stornieren: Profil → Meine Bestellungen → Bestellung → "Stornieren" (nur solange Status "Eingegangen")
- Dark Mode: Profil → Erscheinungsbild → Hell/Dunkel/Auto
- Sprache: oben rechts DE/EN/NL
- Favoriten: Herz-Icon (braucht Konto)
- Gastronom werden: E-Mail an info@kiekmolin.de, keine Provisionen
- Lieferung: nicht alle Restaurants liefern, Filter "Liefert" oben in der Liste

EINSCHRÄNKUNGEN:
- Du kannst KEINE echten Bestellungen aufgeben oder Reservierungen anlegen — erkläre dem Nutzer den Weg in der App
- Du kennst keine aktuellen Live-Daten zu Restaurants — empfehle Filter & Suche in der App
- Bei rechtlichen / persönlichen Datenfragen: verweise auf info@kiekmolin.de oder /datenschutz`;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured', fallback: true })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const message = (body.message || '').toString().trim();
  if (!message) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'message required' }) };
  }
  if (message.length > 2000) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'message too long (max 2000 chars)' }) };
  }

  // History: optional, max 6 messages (3 turns) für Kontext-Limit
  const rawHistory = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const messages = rawHistory
    .filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; })
    .map(function(m) { return { role: m.role, content: String(m.content).slice(0, 1000) }; });
  messages.push({ role: 'user', content: message });

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText.slice(0, 300));
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'AI service unavailable', fallback: true })
      };
    }

    const data = await res.json();
    const reply = (data.content && data.content[0] && data.content[0].text) || '';

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        reply: reply,
        model: data.model || MODEL,
        usage: data.usage || null
      })
    };
  } catch (err) {
    console.error('chat-ai handler error:', err && err.stack ? err.stack : err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', fallback: true })
    };
  }
};
