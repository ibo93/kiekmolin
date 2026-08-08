// Gefaelschte Anthropic-Antwort als DATENSTROM (Server-Sent Events).
//
// menu-scan.js liest die Antwort seit dem Umbau Stueck fuer Stueck mit, statt
// auf die fertige Antwort zu warten. Nur so kann die Function kurz vor dem
// Zeitlimit von Netlify abbrechen und das behalten, was schon da ist.
// Die Tests muessen deshalb denselben Datenstrom liefern wie die echte API --
// eine fertige JSON-Antwort wuerde am Parser vorbeilaufen und jeden Test
// gruen faerben, obwohl im Betrieb nichts ankaeme.
'use strict';

function fehler() {
    var e = new Error('The operation was aborted');
    e.name = 'AbortError';
    return e;
}

function sseAntwort(text, opt) {
    opt = opt || {};
    var stueck = opt.stueck || 400;              // in wie vielen Haeppchen
    var stop = opt.stopReason || 'end_turn';
    var teile = [];
    teile.push('data: ' + JSON.stringify({ type: 'message_start' }) + '\n\n');
    for (var i = 0; i < text.length; i += stueck) {
        teile.push('data: ' + JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: text.slice(i, i + stueck) }
        }) + '\n\n');
    }
    teile.push('data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: stop } }) + '\n\n');

    var enc = new TextEncoder();
    var idx = 0;
    return {
        ok: true,
        status: 200,
        body: {
            getReader: function () {
                return {
                    read: async function () {
                        // "haengt": die API antwortet nie. Wie im Echtbetrieb muss
                        // der Abbruch ueber das AbortSignal kommen -- sonst wartet
                        // der Test (und die Function) ewig.
                        if (opt.haengt) {
                            await new Promise(function (_, ab) {
                                if (!opt.signal) return;                 // ohne Signal: ewig
                                if (opt.signal.aborted) return ab(fehler());
                                opt.signal.addEventListener('abort', function () { ab(fehler()); });
                            });
                        }
                        if (idx >= teile.length) return { done: true, value: undefined };
                        return { done: false, value: enc.encode(teile[idx++]) };
                    }
                };
            }
        }
    };
}

// Gemini schickt denselben Datenstrom-Typ, aber andere Ereignisse.
// Beide Formen muessen getestet werden, sonst faellt beim Anbieterwechsel
// niemandem auf, dass der Parser nur eine Seite kennt.
function sseGemini(text, opt) {
    opt = opt || {};
    var stueck = opt.stueck || 400;
    var teile = [];
    for (var i = 0; i < text.length; i += stueck) {
        teile.push('data: ' + JSON.stringify({
            candidates: [{ content: { parts: [{ text: text.slice(i, i + stueck) }] } }]
        }) + '\n\n');
    }
    teile.push('data: ' + JSON.stringify({
        candidates: [{ content: { parts: [] }, finishReason: opt.stopReason === 'max_tokens' ? 'MAX_TOKENS' : 'STOP' }]
    }) + '\n\n');

    var enc = new TextEncoder(), idx = 0;
    return {
        ok: true, status: 200,
        body: { getReader: function () { return { read: async function () {
            if (opt.haengt) {
                await new Promise(function (_, ab) {
                    if (!opt.signal) return;
                    if (opt.signal.aborted) return ab(fehler());
                    opt.signal.addEventListener('abort', function () { ab(fehler()); });
                });
            }
            if (idx >= teile.length) return { done: true, value: undefined };
            return { done: false, value: enc.encode(teile[idx++]) };
        } }; } }
    };
}

module.exports = { sseAntwort: sseAntwort, sseGemini: sseGemini };
