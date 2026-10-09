// Abmelden von WhatsApp-Angeboten -- der Link in jeder Kampagnen-Nachricht.
//
// GET /abmelden?t=<abmelde_token>   (netlify.toml leitet hierher)
// Setzt widerrufen_at. Antwortet IMMER mit einer kurzen Seite: auch ein
// alter oder doppelt geklickter Link soll den Gast nicht ratlos lassen.
'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';

function seite(code, titel, text) {
    return {
        statusCode: code,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
        body: '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>' + titel + '</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f4ef;color:#102a24;'
            + 'display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}'
            + '.k{max-width:420px;background:#fff;border-radius:24px;padding:32px 28px;box-shadow:0 8px 32px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 10px}p{line-height:1.5;margin:0;color:#3d524c}'
            + '@media (prefers-color-scheme:dark){body{background:#121414;color:#f3f4f4}.k{background:#1a1d1c}p{color:#c9cfcd}}</style></head>'
            + '<body><div class="k"><h1>' + titel + '</h1><p>' + text + '</p></div></body></html>'
    };
}

exports.handler = async function (event) {
    var t = String((event.queryStringParameters || {}).t || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
        return seite(400, 'Link unvollständig', 'Dieser Abmelde-Link ist nicht vollständig. Antworte einfach mit „STOP“ auf die WhatsApp-Nachricht – dann trägt dich das Lokal aus.');
    }
    if (!SERVICE_KEY) { console.error('[whatsapp-abmelden] SUPABASE_SERVICE_KEY fehlt'); return seite(503, 'Gerade nicht möglich', 'Bitte versuche es später noch einmal oder antworte mit „STOP“ auf die Nachricht.'); }
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/gast_einwilligungen?abmelde_token=eq.' + t + '&widerrufen_at=is.null', {
            method: 'PATCH',
            headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify({ widerrufen_at: new Date().toISOString() })
        });
        if (!res.ok) { console.error('[whatsapp-abmelden] PATCH', res.status); return seite(502, 'Gerade nicht möglich', 'Bitte versuche es später noch einmal oder antworte mit „STOP“ auf die Nachricht.'); }
        var z = await res.json().catch(function () { return []; });
        // Leer heisst: schon abgemeldet (oder unbekannt) -- fuer den Gast dasselbe Ergebnis.
        return seite(200, 'Abgemeldet', (Array.isArray(z) && z.length)
            ? 'Du bekommst von diesem Lokal keine Angebote mehr per WhatsApp. Deine Bestellungen und Reservierungen laufen ganz normal weiter.'
            : 'Du bist bereits abgemeldet und bekommst von diesem Lokal keine Angebote per WhatsApp.');
    } catch (e) {
        console.error('[whatsapp-abmelden]', e && e.message);
        return seite(500, 'Gerade nicht möglich', 'Bitte versuche es später noch einmal oder antworte mit „STOP“ auf die Nachricht.');
    }
};
