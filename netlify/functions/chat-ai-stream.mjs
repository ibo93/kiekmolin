// Kiek mol in — KIN-Assistent, Antwort im Datenstrom.
//
// WARUM: Bisher wartete der Gast auf die KOMPLETTE Antwort, bevor irgendetwas
// erschien -- bei drei Sätzen sind das mehrere Sekunden Nichts. Hier gehen die
// Wörter raus, sobald das Modell sie erzeugt. Die Gesamtdauer ändert sich kaum,
// aber die gefühlte Wartezeit sinkt von "mehrere Sekunden" auf "sofort", weil
// nach ~1 Sekunde das erste Wort steht.
//
// FORMAT: Netlify Functions v2 (export default + Response). Nur dieses Format
// kann streamen; das klassische exports.handler puffert die ganze Antwort und
// schickt sie am Stück -- damit wäre der ganze Zweck weg.
//
// Ausgabe ist reiner Text, kein SSE: der Browser liest den Body Stück für Stück
// und hängt jedes Stück an die Sprechblase. Kein Parsen, nichts kaputtzumachen.
// Geht hier irgendetwas schief, fällt die App auf /.netlify/functions/chat-ai
// zurück (Antwort am Stück) -- der Assistent bleibt also in jedem Fall nutzbar.
//
// ENV: ANTHROPIC_API_KEY (bevorzugt) | GEMINI_API_KEY
//      CHAT_PROVIDER=gemini erzwingt den kostenlosen Anbieter.

import brain from './lib/chat-brain.js';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const TEXT_HEADERS = {
    ...CORS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    // Verhindert, dass ein Proxy den Datenstrom sammelt und am Stück ausliefert
    // -- das würde das Streamen unbemerkt wirkungslos machen.
    'X-Accel-Buffering': 'no'
};

function fail(code, msg) {
    return new Response(JSON.stringify({ error: msg, fallback: true }), {
        status: code,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}

// Anthropic streamt Server-Sent Events. Uns interessiert nur der Textzuwachs.
async function* anthropicChunks(key, input) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: brain.MODELS.anthropic,
            max_tokens: brain.MAX_TOKENS,
            system: input.system,
            messages: input.history.concat([{ role: 'user', content: input.message }]),
            stream: true
        })
    });
    if (!res.ok || !res.body) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 200));

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // Zeilenweise auswerten; die letzte, evtl. halbe Zeile bleibt im Puffer.
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const ev = JSON.parse(payload);
                if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
                    yield ev.delta.text;
                }
            } catch (e) { /* halbe Zeile -- kommt beim nächsten Stück vollständig */ }
        }
    }
}

// Gemini streamt JSON-Objekte, ebenfalls als "data:"-Zeilen.
async function* geminiChunks(key, input) {
    const contents = input.history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: input.message }] });

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + brain.MODELS.gemini +
                ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(key);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents,
            generationConfig: {
                maxOutputTokens: brain.MAX_TOKENS,
                temperature: 0.7,
                thinkingConfig: { thinkingBudget: 0 }
            }
        })
    });
    if (!res.ok || !res.body) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 200));

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
                const ev = JSON.parse(payload);
                const parts = ev.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) for (const p of parts) if (p.text) yield p.text;
            } catch (e) { /* halbe Zeile */ }
        }
    }
}

export default async (req) => {
    if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (req.method !== 'POST') return fail(405, 'Nur POST');

    const provider = brain.pickProvider(process.env);
    if (provider !== 'anthropic' && provider !== 'gemini') {
        // Groq streamt hier nicht -- die App nimmt dann die Function ohne Strom.
        return fail(501, 'Streamen für diesen Anbieter nicht eingerichtet');
    }

    let body;
    try { body = await req.json(); }
    catch (e) { return fail(400, 'Ungültiger Body'); }

    const input = brain.readInput(body);
    if (input.error) return fail(400, input.error);

    const key = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY;
    const chunks = provider === 'anthropic' ? anthropicChunks(key, input) : geminiChunks(key, input);

    // Erstes Stück VOR dem Öffnen des Datenstroms holen. Scheitert der Anbieter
    // (Schlüssel falsch, Kontingent leer), können wir dann noch sauber einen
    // Fehlercode senden -- sobald der Strom läuft, ginge das nicht mehr und der
    // Gast bekäme eine leere Sprechblase.
    let first;
    try {
        first = await chunks.next();
    } catch (e) {
        console.warn('[chat-ai-stream] ' + provider + ' fehlgeschlagen:', e.message);
        return fail(502, 'KI gerade nicht erreichbar');
    }
    if (first.done) return fail(502, 'KI lieferte keine Antwort');

    const stream = new ReadableStream({
        async start(controller) {
            const enc = new TextEncoder();
            try {
                controller.enqueue(enc.encode(first.value));
                for await (const text of chunks) controller.enqueue(enc.encode(text));
            } catch (e) {
                // Mittendrin abgerissen: das bereits Gesendete bleibt stehen und
                // ergibt Sinn. Ein Hinweis ist ehrlicher als ein halber Satz,
                // der aussieht als wäre er fertig.
                console.warn('[chat-ai-stream] Abbruch:', e.message);
                try { controller.enqueue(enc.encode('\n\n(Abgebrochen – bitte nochmal fragen.)')); } catch (e2) {}
            }
            controller.close();
        }
    });

    return new Response(stream, { status: 200, headers: TEXT_HEADERS });
};
