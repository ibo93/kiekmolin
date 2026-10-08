// Tisch anlegen, wenn gelöschte Tische ihre Nummer behalten.
//
// Ibo, 08.10.2026: "wenn ich die Tische einfügen möchte, kommt nichts".
// Supabase-Protokoll 08:51:44-08:52:48 UTC: 24 x POST restaurant_tables ->
// 409 "duplicate key ... restaurant_tables_restaurant_id_table_number_key".
// Der Plan lädt nur is_active = true und nahm "höchste + 1"; die Nummer
// gehörte einem gelöschten Tisch. Die Meldung stand oben außer Sicht.
//
// Hier laufen freieNummer / neuerTisch / tischAnlegen echt gegen eine
// nachgebaute Tabelle. Den Browser (Meldung im Blick) misst
// werkzeug/tischplan-messen.js, Teil 6a.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('async function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }

// Tabelle: aktive 1-10, gelöscht 11 und 12. rlsVersteckt = das Konto sieht gelöschte nicht.
function bauen(opt) {
    var zeilen = [];
    for (var i = 1; i <= 10; i++) zeilen.push({ id: 't' + i, table_number: String(i), is_active: true });
    (opt.geloescht || []).forEach(function (nr) { zeilen.push({ id: 'alt' + nr, table_number: String(nr), is_active: false }); });
    var posts = [], meldungen = [];
    var welt = {
        SUPABASE_URL: 'https://x.supabase.co',
        tp: { rid: 'r1', bereich: 'main', tische: zeilen.filter(function (z) { return z.is_active; }).map(function (z) { return { id: z.id, nummer: z.table_number }; }) },
        kopf: function () { return {}; },
        sbRead: async function (url) {
            var sicht = opt.rlsVersteckt ? zeilen.filter(function (z) { return z.is_active; }) : zeilen;
            return { json: async function () { return sicht.map(function (z) { return { table_number: z.table_number }; }); } };
        },
        sbWrite: async function (url, o) {
            var d = JSON.parse(o.body); posts.push(d.table_number);
            if (welt.warten) await welt.warten;
            if (opt.immer || zeilen.some(function (z) { return z.table_number === d.table_number; })) throw new Error('HTTP 409: duplicate key value violates unique constraint "restaurant_tables_restaurant_id_table_number_key"');
            var z = Object.assign({ id: 'neu' + d.table_number }, d); zeilen.push(z);
            return { json: async function () { return [z]; } };
        },
        melden: function (text, art) { meldungen.push([text, art]); },
        zeichnen: function () {}, geaendert: function () {},
        tischVon: function (id) { return welt.tp.tische.find(function (x) { return x.id === id; }); }
    };
    var code = ['freieNummer', 'neuerTisch', 'tischAnlegen'].map(fn).join('\n');
    var f = new Function('w', 'var SUPABASE_URL = w.SUPABASE_URL, tp = w.tp, kopf = w.kopf, sbRead = w.sbRead, sbWrite = w.sbWrite, melden = w.melden, zeichnen = w.zeichnen, geaendert = w.geaendert, tischVon = w.tischVon;\n'
        + code + '\nreturn neuerTisch;')(welt);
    return { neu: f, posts: posts, meldungen: meldungen, welt: welt };
}

(async function () {
    var a = bauen({ geloescht: [11, 12] });
    await a.neu('rund4');
    t('gelöschte 11 und 12 liegen in der Tabelle: neuer Tisch wird 13, im ersten Versuch', a.posts.join(',') === '13' && a.welt.tp.tische.length === 11 && a.welt.tp.tische[10].nummer === '13', a.posts.join(','));

    var b = bauen({ geloescht: [11, 12], rlsVersteckt: true });
    await b.neu('rund4');
    t('darf das Konto gelöschte nicht lesen: nimmt die nächste freie Nummer (11, 12 belegt -> 13)', b.posts.join(',') === '11,12,13' && b.welt.tp.tische.length === 11, b.posts.join(','));
    t('und meldet dabei keinen Fehler', !b.meldungen.some(function (m) { return m[1] === 'fehler'; }), JSON.stringify(b.meldungen));

    var c = bauen({ immer: true });
    await c.neu('rund4');
    t('lehnt die Datenbank alles ab: hört auf (26 Versuche), keine Endlosschleife', c.posts.length === 26, c.posts.length);
    t('... und sagt es: "Tisch nicht angelegt" als Fehler', c.meldungen.length === 1 && c.meldungen[0][1] === 'fehler' && /Tisch nicht angelegt/.test(c.meldungen[0][0]), JSON.stringify(c.meldungen));

    var d = bauen({ geloescht: [11, 12] }), los;
    d.welt.warten = new Promise(function (r) { los = r; });
    var p1 = d.neu('rund4'), p2 = d.neu('rund4'), p3 = d.neu('rund4');
    await new Promise(function (r) { setTimeout(r, 10); }); los(); await Promise.all([p1, p2, p3]);
    t('dreimal schnell getippt, während er anlegt: genau ein Tisch', d.posts.length === 1 && d.welt.tp.tische.length === 11, d.posts.join(','));
    await d.neu('rund4');
    t('danach geht der nächste wieder (14)', d.posts.join(',') === '13,14', d.posts.join(','));

    // Meldung im Blick (Regel 6): ein Fehler holt die Meldung ins Bild
    t('melden(…, "fehler") holt die Meldung ins Bild', /if \(art === 'fehler' && m\.scrollIntoView\) m\.scrollIntoView\(\{ block: 'nearest'/.test(H), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
