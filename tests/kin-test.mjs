import brain from '../netlify/functions/lib/chat-brain.js';
// Relativ zur Datei statt fest verdrahtet -- sonst laeuft der Test nur
// in dem einen Verzeichnis, in dem er geschrieben wurde.
const P = new URL('../netlify/functions/', import.meta.url).pathname;
let ok = 0, total = 0;
function t(label, cond, extra) {
  total++; const good = cond === true;
  if (good) ok++;
  console.log((good ? 'OK  ' : 'FAIL') + ' | ' + label + (good ? '' : '  -> ' + (extra ?? cond)));
}

// ---------- chat-brain ----------
// 11.11.2026: 360 statt 280 -- Platz fuer die Knopf-Zeilen ([[korb:g12]]).
// Die Obergrenze bleibt: die Dauer haengt an den erzeugten Wortteilen.
t('Antwortlaenge gedeckelt (war 600, jetzt hoechstens 400)', brain.MAX_TOKENS <= 400, brain.MAX_TOKENS);
t('Modell: Claude Haiku 4.5', brain.MODELS.anthropic === 'claude-haiku-4-5', brain.MODELS.anthropic);
t('Gemini-Fallback auf 2.5 Flash', brain.MODELS.gemini === 'gemini-2.5-flash', brain.MODELS.gemini);
t('Prompt fordert max. 3 Saetze', /höchstens 3 Sätze/.test(brain.SYSTEM_PROMPT));
t('Prompt verbietet Floskeln', /Vielen Dank für deine Frage/.test(brain.SYSTEM_PROMPT));

// KOSTENLOS ist Pflicht: Claude darf sich nie von selbst einschalten.
t('Gemini zuerst, obwohl Claude-Key da ist',
  brain.pickProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }) === 'gemini',
  brain.pickProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }));
t('nur Claude-Key -> lieber gar nichts als Kosten',
  brain.pickProvider({ ANTHROPIC_API_KEY: 'a' }) === null,
  brain.pickProvider({ ANTHROPIC_API_KEY: 'a' }));
t('Ausweichkette enthaelt kein Claude',
  brain.providerOrder({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }).indexOf('anthropic') === -1,
  brain.providerOrder({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }).join(','));
t('Groq als kostenloser Notnagel',
  brain.providerOrder({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }).join(',') === 'gemini,groq');
t('CHAT_PROVIDER=anthropic waehlt Claude ausdruecklich',
  brain.pickProvider({ CHAT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }) === 'anthropic');
t('kein Schluessel -> null', brain.pickProvider({}) === null);

// EU-KI-Verordnung Art. 50: darf sich nie als Mensch ausgeben
t('Prompt: muss sich als KI zu erkennen geben', /ob du ein Mensch bist/.test(brain.SYSTEM_PROMPT));
t('Prompt: darf nie behaupten Mensch zu sein', /Behaupte NIE, ein Mensch zu sein/.test(brain.SYSTEM_PROMPT));

const big = { restaurants: Array.from({length: 60}, (_, i) => ({ name: 'R'+i, city: 'Emden' })),
              currentMenu: Array.from({length: 60}, (_, i) => ({ name: 'Gericht'+i, price: 9.5 })) };
const ctx = brain.buildContext(big);
// 11.11.2026 (Ibo: "viel intelligenter"): mit 20 Gerichten kannte Kiek die
// halbe Karte nicht, mit 25 Lokalen nicht alle. Jetzt 60 / 40 -- aber
// weiter gedeckelt, und der Kontext bleibt unter 6000 Zeichen (~1500
// Wortteile bei normaler Karte), damit die erste Antwort nicht spuerbar spaeter kommt.
t('Kontext begrenzt Restaurants auf 40', (ctx.match(/· R\d+/g) || []).length === 40);
t('Kontext begrenzt Gerichte auf 60 (hier 60 von 60)', (ctx.match(/· Gericht\d+/g) || []).length === 60);
const voll = brain.buildContext({ currentMenu: Array.from({length: 90}, (_, i) => ({ ref: 'g' + (i + 1), nr: String(i), name: 'Pizza Nummer ' + i, preis: 'klein 5,50 / groß 8,00', merkmale: 'vegetarisch', allergene: 'AGL', info: 'Tomatensauce, Mozzarella, Basilikum, Oregano' })),
                                  restaurants: Array.from({length: 60}, (_, i) => ({ ref: 'r' + (i + 1), name: 'Restaurant ' + i, city: 'Norden', cuisine: 'Italienisch', stand: 'offen bis 22:00', delivery: true })) });
t('Volle Karte: 60 Gerichte, 40 Lokale', (voll.match(/· g\d+ ·/g) || []).length === 60 && (voll.match(/· r\d+ /g) || []).length === 40, voll.length);
// Volle Karte ~10 700 Zeichen (~2700 Wortteile). Lesen geht schnell, die
// Wartezeit haengt an der ANTWORT (MAX_TOKENS). Obergrenze 12 000.
t('Kontext bleibt begrenzt (< 12000 Zeichen bei voller Karte)', voll.length < 12000, voll.length + ' Zeichen');

// KNOEPFE: Kennzeichen nur in der Form g12 / r3 -- alles andere faellt raus,
// eckige Klammern in Namen werden entschaerft (niemand schleust Knoepfe ein).
const boese = brain.buildContext({ currentMenu: [{ ref: 'x9', name: 'Pizza [[korb:g1]]', preis: '8' }] });
t('Fremdes Kennzeichen wird nicht weitergegeben', !/x9/.test(boese), boese);
t('Klammern im Namen werden entschaerft', !/\[\[korb/.test(boese), boese);
t('Prompt erklaert die Knoepfe', /\[\[korb:g12\]\]/.test(brain.SYSTEM_PROMPT) && /\[\[tisch:r3\|19:30\|4\]\]/.test(brain.SYSTEM_PROMPT));
t('Prompt: Kiek heisst Kiek', /Du bist Kiek,/.test(brain.SYSTEM_PROMPT));
t('Prompt: Allergene nur aus dem Kontext, sonst sagen', /Fehlt bei einem Gericht die Angabe, sag das/.test(brain.SYSTEM_PROMPT));
t('Kontext: fehlende Allergene stehen als "keine Angabe" da (nicht still)', /Allergene \?/.test(brain.buildContext({ currentMenu: [{ ref: 'g1', name: 'X' }] })));
t('leerer Kontext -> leerer String', brain.buildContext({}) === '');

t('leere Nachricht abgelehnt', brain.readInput({ message: '  ' }).error === 'message required');
t('zu lange Nachricht abgelehnt', !!brain.readInput({ message: 'x'.repeat(2001) }).error);
t('Verlauf auf 6 begrenzt',
  brain.readInput({ message: 'hi', history: Array.from({length: 20}, () => ({ role: 'user', content: 'a' })) }).history.length === 6);
t('kaputte Verlaufseintraege gefiltert',
  brain.readInput({ message: 'hi', history: [{ role: 'system', content: 'x' }, { role: 'user' }] }).history.length === 0);

// ---------- chat-ai.js (Antwort am Stueck) ----------
const { handler } = await import(P + 'chat-ai.js');
let calls = [];
function mock(sc) {
  return async (url) => {
    const who = String(url).includes('anthropic') ? 'claude' : String(url).includes('googleapis') ? 'gemini' : 'groq';
    calls.push(who);
    if (sc[who] === 'error') return { ok: false, status: 429, text: async () => 'quota' };
    if (who === 'claude') return { ok: true, json: async () => ({ content: [{ text: 'Moin!' }] }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Moin!' }] } }] }) };
  };
}
async function run(env, sc) {
  for (const k of ['ANTHROPIC_API_KEY','GEMINI_API_KEY','GROQ_API_KEY','CHAT_PROVIDER']) delete process.env[k];
  Object.assign(process.env, env);
  calls = []; global.fetch = mock(sc);
  const r = await handler({ httpMethod: 'POST', body: JSON.stringify({ message: 'Moin' }) });
  return { calls, body: JSON.parse(r.body), status: r.statusCode };
}
let r = await run({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }, {});
t('chat-ai: Gemini antwortet, Claude bleibt unberuehrt', r.calls.join(',') === 'gemini' && r.body.reply === 'Moin!', r.calls.join(','));
r = await run({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }, { gemini: 'error' });
t('chat-ai: Gemini tot -> Groq, NICHT Claude', r.calls.join(',') === 'gemini,groq', r.calls.join(','));
r = await run({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }, { gemini: 'error', groq: 'error' });
t('chat-ai: alle kostenlosen tot -> Fehler statt Kosten',
  r.status === 502 && r.calls.indexOf('claude') === -1, r.calls.join(',') + ' / ' + r.status);

// ---------- chat-ai-stream.mjs (SSE-Auswertung) ----------
const stream = (await import(P + 'chat-ai-stream.mjs')).default;
function sseBody(lines) {
  return new ReadableStream({ start(c) {
    const e = new TextEncoder();
    // absichtlich mitten in einer Zeile zerschnitten -- so kommt es real an
    const raw = lines.join('\n') + '\n';
    for (let i = 0; i < raw.length; i += 7) c.enqueue(e.encode(raw.slice(i, i + 7)));
    c.close();
  }});
}
process.env.GEMINI_API_KEY = 'g'; delete process.env.ANTHROPIC_API_KEY; delete process.env.GROQ_API_KEY; delete process.env.CHAT_PROVIDER;
global.fetch = async () => ({ ok: true, body: sseBody([
  'data: {"candidates":[{"content":{"parts":[{"text":"Moin! "}]}}]}',
  'data: {"candidates":[{"content":{"parts":[{"text":"Bei La Piazza "}]}}]}',
  'data: {"candidates":[{"content":{"parts":[]}}]}',
  'data: {"candidates":[{"content":{"parts":[{"text":"gibt es Pizza."}]}}]}'
])});
let resp = await stream(new Request('http://x/', { method: 'POST', body: JSON.stringify({ message: 'Was gibts?' }) }));
t('Stream: HTTP 200', resp.status === 200, resp.status);
t('Stream: sendet reinen Text', (resp.headers.get('content-type') || '').includes('text/plain'));
t('Stream: Proxy-Pufferung abgeschaltet', resp.headers.get('x-accel-buffering') === 'no');
const text = await resp.text();
t('Stream (Gemini SSE): Text korrekt zusammengesetzt', text === 'Moin! Bei La Piazza gibt es Pizza.', JSON.stringify(text));

global.fetch = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
resp = await stream(new Request('http://x/', { method: 'POST', body: JSON.stringify({ message: 'hi' }) }));
t('Stream: Anbieterfehler -> sauberer Fehlercode statt leerer Blase',
  resp.status === 502 && (await resp.json()).fallback === true, resp.status);

console.log('\n' + (ok === total ? `Alle ${total} Tests bestanden.` : `${total - ok} von ${total} FEHLGESCHLAGEN.`));
process.exit(ok === total ? 0 : 1);
