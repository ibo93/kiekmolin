// LINK "BESTELLSTATUS VERFOLGEN" AUS DER MAIL -> "BESTELLUNG NICHT GEFUNDEN".
//
// Gemeldet am 11.11.2026, 07:33 Uhr, mit Bildschirmfoto (Safari aus Gmail).
// Gemessen in den Supabase-Protokollen um 06:33:38 UTC:
//   GET orders?select=*,order_items(*)&order_number=ilike.*ki-261110-017521*
//   -> 200, NULL Zeilen
// Die Bestelltabelle ist fuer den oeffentlichen Schluessel zu -- richtig so,
// eine Bestellnummer ist ratbar. Aber die Seite fragte genau so, und die leere
// Antwort sah aus wie "gibt es nicht" (Regel 6: stiller Ausfall).
//
// Zwei Fehler, beide behoben:
//  1. Der Link in der Mail trug nur die Nummer. order-track.js schrieb seit
//     Monaten "das Geheimnis steht im Link der Bestaetigungsmail" -- es stand
//     nie drin. Jetzt: /order/<nummer>?t=<track_token>.
//  2. Die Seite fragte die gesperrte Tabelle. Jetzt fragt sie order-track mit
//     dem Geheimnis aus dem Link oder von diesem Geraet -- und unterscheidet
//     "Server nicht erreichbar" von "hier nicht zu oeffnen".

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var MAILQ = fs.readFileSync(path.join(KMI, 'netlify/functions/order-email.js'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++;
    var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}

(async function () {
    // ---- 1. Der Link in allen drei Mails -----------------------------------
    var M = require('../netlify/functions/order-email.js')._baue;
    var TOK = '0123456789abcdef0123456789abcdef';
    var o = { id: 'x', order_number: 'KI-261110-017521', track_token: TOK, items: [], total: 10, order_type: 'pickup',
              status: 'accepted', estimated_minutes: 20, customer_name: 'Test', payment_method: 'cash', created_at: new Date().toISOString() };
    var rest = { name: 'Pizza Pronto', slug: 'pizza-pronto' };
    var soll = 'https://kiekmolin.de/order/KI-261110-017521?t=' + TOK;
    var html1 = String((M.buildEmail(o, rest) || {}).html || M.buildEmail(o, rest));
    var html2 = String((M.buildAcceptedEmail(o, rest) || {}).html || M.buildAcceptedEmail(o, rest));
    var html3 = String((M.buildZeitEmail(o, rest) || {}).html || M.buildZeitEmail(o, rest));
    t('Eingangsmail: Link mit Geheimnis', html1.indexOf(soll) >= 0, (html1.match(/kiekmolin\.de\/order\/[^"'<\s]*/) || [])[0]);
    t('Annahmemail: Link mit Geheimnis', html2.indexOf(soll) >= 0, (html2.match(/kiekmolin\.de\/order\/[^"'<\s]*/) || [])[0]);
    t('Neue-Zeit-Mail: Link mit Geheimnis', html3.indexOf(soll) >= 0, (html3.match(/kiekmolin\.de\/order\/[^"'<\s]*/) || [])[0]);
    var ohne = Object.assign({}, o, { track_token: null });
    var h4 = String((M.buildEmail(ohne, rest) || {}).html || M.buildEmail(ohne, rest));
    t('Ohne Geheimnis: kein leeres ?t=', h4.indexOf('/order/KI-261110-017521?t=') < 0 && h4.indexOf('/order/KI-261110-017521') >= 0, '');
    var boese = Object.assign({}, o, { track_token: '"><script>' });
    var h5 = String((M.buildEmail(boese, rest) || {}).html || M.buildEmail(boese, rest));
    t('Kaputtes Geheimnis wird nicht angehaengt', h5.indexOf('<script>') < 0 && h5.indexOf('?t=') < 0, '');
    t('Alle drei Stellen haben die Regel (keine nackte Nummer mehr)',
        (MAILQ.match(/var trackUrl = 'https:\/\/kiekmolin\.de\/order\/' \+ encodeURIComponent\(o\.order_number \|\| ''\)\n/g) || []).length === 3
        && (MAILQ.match(/\? '\?t=' \+ String\(o\.track_token\)\.toLowerCase\(\) : ''\);/g) || []).length === 3, '');

    // ---- 2. Die Seite holt ueber das Geheimnis -----------------------------
    var bon = fn('showOrderBon');
    t('Seite fragt die gesperrte Tabelle NICHT mehr ueber die Nummer', !/\.ilike\('order_number'/.test(bon), '');
    t('Seite fragt bonBestellungHolen mit ?t= aus dem Link', /bonBestellungHolen\(orderNumber, \(new URLSearchParams\(window\.location\.search\)\)\.get\('t'\)\)/.test(bon), '');
    t('Status-Aktualisierung ueber verfolgBestellung, nicht ueber orders', /verfolgBestellung\(order\.id\)/.test(bon) && !/client\.from\('orders'\)/.test(bon), '');
    t('Server nicht erreichbar sieht anders aus als "nicht zu oeffnen"', /Gerade nicht abrufbar/.test(bon) && /Bestellung hier nicht zu öffnen/.test(bon), '');
    t('Gerichte aus der JSON-Liste (order-track liefert keine order_items)', /: \(order\.items \|\| \[\]\);/.test(bon), '');

    function holer(antwort) {
        var gemerkt = [];
        var f = new Function('verfolgHolen', 'verfolgMerken', 'VERFOLG_FORM', fn('bonBestellungHolen') + '; return bonBestellungHolen;')(
            async function () { return antwort; },
            function (art, tok) { gemerkt.push(art + ':' + tok); },
            /^[0-9a-f]{32}$/);
        return { f: f, gemerkt: gemerkt };
    }
    var B = { ok: true, bestellungen: [{ id: '1', order_number: 'KI-261110-017521', track_token: TOK }, { id: '2', order_number: 'KI-261110-000001', track_token: 'f'.repeat(32) }] };
    var A = holer(B);
    var r = await A.f('ki-261110-017521', TOK.toUpperCase());
    t('Kleingeschriebene Nummer aus dem Pfad findet KI-…', r.ok && r.order && r.order.id === '1', JSON.stringify(r));
    t('Geheimnis aus dem Link wird auf dem Geraet gemerkt (klein)', A.gemerkt[0] === 'b:' + TOK, A.gemerkt.join(','));
    var C = holer(B);
    var r2 = await C.f('ki-999', null);
    t('Unbekannte Nummer ohne Geheimnis: order null (nicht die erstbeste)', r2.ok && r2.order === null, JSON.stringify(r2));
    t('Ohne Link-Geheimnis wird nichts gemerkt', C.gemerkt.length === 0, C.gemerkt.join(','));
    var D = holer({ ok: false, bestellungen: [] });
    var r3 = await D.f('ki-261110-017521', TOK);
    t('Server weg: ok=false (wird als "gerade nicht abrufbar" gezeigt)', r3.ok === false, JSON.stringify(r3));
    var E = holer(B);
    var r4 = await E.f('anders-geschrieben', TOK);
    t('Nummer passt nicht, Geheimnis schon: trotzdem die richtige', r4.order && r4.order.id === '1', JSON.stringify(r4));

    // Gegenprobe: Vergleich ohne Kleinschreibung -> der Fehler vom Foto kaeme zurueck
    var Mut = new Function('verfolgHolen', 'verfolgMerken', 'VERFOLG_FORM',
        fn('bonBestellungHolen').replace("String(o.order_number || '').toLowerCase() === nr", "String(o.order_number || '') === String(orderNumber)")
            .replace("|| (VERFOLG_FORM.test(t) ? liste.filter(function (o) { return String(o.track_token || '').toLowerCase() === t; })[0] : null)", '')
        + '; return bonBestellungHolen;')(async function () { return B; }, function () {}, /^[0-9a-f]{32}$/);
    var rm = await Mut('ki-261110-017521', null);
    t('Gegenprobe: ohne Kleinschreibung findet ki-… nichts -- Test wird rot', rm.order === null, JSON.stringify(rm));

    // ---- 3. Auslieferung -----------------------------------------------------
    var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
    t('sw.js CACHE hochgezaehlt (mind. v142)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 142, (/kmi-shell-v(\d+)/.exec(sw) || [])[0]);

    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
