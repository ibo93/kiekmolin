// Kiek mol in — KIN-Assistent, Antwort am Stück (Rückfallebene).
//
// Der schnelle Weg ist chat-ai-stream.mjs: dort erscheinen die Wörter sofort,
// statt dass der Gast auf die fertige Antwort wartet. Diese Function hier ist
// die Rückfallebene, falls das Streamen beim Gast nicht funktioniert (alter
// Browser, Proxy, der den Datenstrom puffert). Antwortformat bleibt deshalb
// unverändert: { reply, model, provider }.
//
// Systemprompt, Kontextaufbau und Anbieterwahl liegen in lib/chat-brain.js --
// beide Functions nutzen dieselbe Quelle, damit sie nicht auseinanderlaufen.
//
// ENV: GEMINI_API_KEY (Standard, kostenlos) | GROQ_API_KEY (kostenlos)
//      CHAT_PROVIDER=anthropic waehlt ausdruecklich den kostenpflichtigen Weg.

'use strict';

var brain = require('./lib/chat-brain');

var ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
var GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
var GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

async function callAnthropic(key, input) {
    var res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: brain.MODELS.anthropic,
            max_tokens: brain.MAX_TOKENS,
            system: input.system,
            messages: input.history.concat([{ role: 'user', content: input.message }])
        })
    });
    if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 200));
    var d = await res.json();
    return (d.content && d.content[0] && d.content[0].text) || '';
}

async function callGemini(key, input) {
    var contents = input.history.map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    });
    contents.push({ role: 'user', parts: [{ text: input.message }] });

    var res = await fetch(GEMINI_API + brain.MODELS.gemini + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: contents,
            generationConfig: {
                maxOutputTokens: brain.MAX_TOKENS,
                temperature: 0.7,
                // Nachdenken aus: es zaehlt gegen dasselbe Ausgabe-Budget und
                // laesst eine kurze Chat-Antwort spuerbar spaeter erscheinen.
                thinkingConfig: { thinkingBudget: 0 }
            }
        })
    });
    if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 200));
    var d = await res.json();
    var c = d.candidates && d.candidates[0];
    var out = '';
    if (c && c.content && Array.isArray(c.content.parts)) {
        c.content.parts.forEach(function (p) { if (p && p.text) out += p.text; });
    }
    return out;
}

async function callGroq(key, input) {
    var res = await fetch(GROQ_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
            model: brain.MODELS.groq,
            messages: [{ role: 'system', content: input.system }]
                .concat(input.history)
                .concat([{ role: 'user', content: input.message }]),
            max_tokens: brain.MAX_TOKENS,
            temperature: 0.7
        })
    });
    if (!res.ok) throw new Error('Groq ' + res.status + ': ' + (await res.text()).slice(0, 200));
    var d = await res.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    var provider = brain.pickProvider(process.env);
    if (!provider) {
        return json(500, { error: 'Kein kostenloser KI-Anbieter konfiguriert (GEMINI_API_KEY oder GROQ_API_KEY in Netlify setzen).', fallback: true });
    }

    var body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return json(400, { error: 'Invalid JSON' }); }

    var input = brain.readInput(body);
    if (input.error) return json(400, { error: input.error });

    // Bei einem Ausfall den naechsten KOSTENLOSEN Anbieter probieren, statt den
    // Assistenten stumm zu lassen. Die Liste kommt aus dem Hirn und enthaelt
    // bewusst keinen kostenpflichtigen Anbieter.
    var order = brain.providerOrder(process.env);
    var lastErr = null;

    for (var i = 0; i < order.length; i++) {
        var p = order[i];
        var key = p === 'anthropic' ? process.env.ANTHROPIC_API_KEY
                : p === 'gemini' ? process.env.GEMINI_API_KEY
                : process.env.GROQ_API_KEY;
        if (!key) continue;
        try {
            var reply = p === 'anthropic' ? await callAnthropic(key, input)
                      : p === 'gemini' ? await callGemini(key, input)
                      : await callGroq(key, input);
            if (reply && reply.trim()) {
                return json(200, { reply: reply.trim(), model: brain.MODELS[p], provider: p });
            }
            console.warn('[chat-ai] ' + p + ' lieferte eine leere Antwort');
        } catch (e) {
            lastErr = e;
            console.warn('[chat-ai] ' + p + ' fehlgeschlagen:', e.message);
        }
    }

    console.error('[chat-ai] kein Anbieter hat geantwortet:', lastErr && lastErr.message);
    return json(502, { error: 'KI gerade nicht erreichbar', fallback: true });
};
