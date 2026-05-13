// Kiek mol in — KI-Assistent
// Provider-Reihenfolge (nimmt den ersten mit gesetzten ENV-Vars):
//   1. GEMINI_API_KEY   -> Google Gemini Flash (KOSTENLOS, 1500/Tag)  ← Standard
//   2. ANTHROPIC_API_KEY -> Claude Haiku (kostenpflichtig)
//   3. GROQ_API_KEY     -> Groq (kostenlos, schnell)
// Body: { message: string, history?: [{role, content}] }

'use strict';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_MODEL = 'gemini-2.0-flash';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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

  // Provider auswaehlen: kostenlose zuerst
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const provider = geminiKey ? 'gemini' : (groqKey ? 'groq' : (anthropicKey ? 'anthropic' : null));

  if (!provider) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        error: 'No AI provider configured. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Netlify env.',
        fallback: true
      })
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
  const history = rawHistory
    .filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; })
    .map(function(m) { return { role: m.role, content: String(m.content).slice(0, 1000) }; });

  try {
    let reply = '';
    let usedModel = '';

    if (provider === 'gemini') {
      // Gemini: System-Prompt + History als "contents" Array
      const contents = history.map(function(m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      });
      contents.push({ role: 'user', parts: [{ text: message }] });

      const res = await fetch(GEMINI_API + '?key=' + encodeURIComponent(geminiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: contents,
          generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Gemini API error:', res.status, errText.slice(0, 300));
        return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: 'AI service unavailable', fallback: true }) };
      }
      const data = await res.json();
      reply = (data.candidates && data.candidates[0] && data.candidates[0].content
              && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
              && data.candidates[0].content.parts[0].text) || '';
      usedModel = GEMINI_MODEL;

    } else if (provider === 'groq') {
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }]
        .concat(history)
        .concat([{ role: 'user', content: message }]);
      const res = await fetch(GROQ_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
        body: JSON.stringify({ model: GROQ_MODEL, messages: messages, max_tokens: MAX_TOKENS, temperature: 0.7 })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Groq API error:', res.status, errText.slice(0, 300));
        return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: 'AI service unavailable', fallback: true }) };
      }
      const data = await res.json();
      reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      usedModel = GROQ_MODEL;

    } else {
      // Anthropic
      const messages = history.concat([{ role: 'user', content: message }]);
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: messages })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Anthropic API error:', res.status, errText.slice(0, 300));
        return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: 'AI service unavailable', fallback: true }) };
      }
      const data = await res.json();
      reply = (data.content && data.content[0] && data.content[0].text) || '';
      usedModel = ANTHROPIC_MODEL;
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ reply: reply, model: usedModel, provider: provider })
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
