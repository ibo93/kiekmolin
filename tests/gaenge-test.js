// GAENGE 1 / 2 / 3 (31.10.2026) -- nach dem Vergleich mit GastroTap.
// Der Test FUEHRT die Bausteine aus: Gang aus der Kategorie, Gruppen,
// wartende Gaenge am Tisch, Abrufen.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var GT = /var GANG_TEXT = (\{[^}]*\});/.exec(H)[1];
var G = new Function('window', 'escapeHtml', 'formatPrice', 'var GANG_TEXT = ' + GT + ';\n' + ['gangVon', 'postenGang', 'gangGruppen', 'gangJetzt', 'gangNaechster', 'bestellExtrasText', 'bestellPosHtml'].map(fn).join('\n')
    + '; return { von: gangVon, posten: postenGang, gruppen: gangGruppen, jetzt: gangJetzt, naechster: gangNaechster, html: bestellPosHtml };')(
    { _menuAllItems: [{ id: 'm1', category_id: 'k1' }], _menuCategories: [{ id: 'k1', name: 'Desserts' }] }, function (x) { return String(x); }, function (x) { return x + ' €'; });

// ---- Gang aus der Kategorie ----
t('Vorspeisen / Suppen / Antipasti -> 1', G.von('Vorspeisen') === 1 && G.von('Suppen') === 1 && G.von('Antipasti') === 1, '');
t('Pizza / Pasta / Hauptgerichte / Fisch -> 2', G.von('Pizza') === 2 && G.von('Pasta') === 2 && G.von('Hauptgerichte') === 2 && G.von('Fischgerichte') === 2, '');
t('Desserts / Nachtisch / Eis / Dolci -> 3', G.von('Desserts') === 3 && G.von('Nachtisch') === 3 && G.von('Eis') === 3 && G.von('Dolci') === 3, '');
t('Getränke / Biere / Weine / Kaffee -> 0 (sofort)', G.von('Getränke') === 0 && G.von('Biere vom Fass') === 0 && G.von('Weine') === 0 && G.von('Kaffee & Tee') === 0, '');
t('Rotwein / Hauswein / Weizenbier / Eiskaffee -> 0', G.von('Rotwein') === 0 && G.von('Hauswein') === 0 && G.von('Weizenbier') === 0 && G.von('Eiskaffee') === 0, [G.von('Rotwein'), G.von('Hauswein'), G.von('Weizenbier')].join());
t('"Eisbein" ist kein Eis, "Weinbergschnecken"-Vorspeise bleibt Vorspeise', G.von('Eisbein & Haxe') === 2 && G.von('Vorspeisen & Weinbergschnecken') === 1, G.von('Eisbein & Haxe') + '/' + G.von('Vorspeisen & Weinbergschnecken'));
t('Posten ohne Gang: ueber das Gericht und seine Kategorie', G.posten({ menu_item_id: 'm1' }) === 3 && G.posten({ gang: 1 }) === 1 && G.posten({}) === null, '');

// ---- Gruppen ----
var bestellung = [{ name: 'Tiramisu', gang: 3 }, { name: 'Cola', gang: 0 }, { name: 'Bruschetta', gang: 1 }, { name: 'Schnitzel', gang: 2 }];
var gr = G.gruppen(bestellung);
t('mehrere Gaenge -> Gruppen in der Reihenfolge Getraenke, 1, 2, 3', gr && gr.map(function (x) { return x.gang; }).join(',') === '0,1,2,3', JSON.stringify(gr));
t('nur ein Essens-Gang (z. B. 2 Pizzen + Cola) -> keine Ueberschriften, Liste wie bisher', G.gruppen([{ gang: 2 }, { gang: 2 }, { gang: 0 }]) === null, '');
t('alte Bestellungen ohne Gang -> wie bisher', G.gruppen([{ name: 'A' }, { name: 'B' }]) === null, '');

// ---- Am Tisch: spaetere Gaenge warten ----
var tisch = { order_type: 'dine_in', items: bestellung };
t('am Anfang ist Gang 1 dran, als Naechstes Gang 2', G.jetzt(tisch) === 1 && G.naechster(tisch) === 2, G.jetzt(tisch) + '/' + G.naechster(tisch));
var h = G.html(bestellung, false, tisch);
t('Bestellkarte: Gang 2 und 3 stehen als "wartet"', (h.match(/kin-gang wartet/g) || []).length === 2 && /Gang 1 · Vorspeise<\/span><\/div>/.test(h), h.slice(0, 300));
tisch.gang_jetzt = 2;
t('Gang 2 abgerufen -> nur noch Gang 3 wartet, als Naechstes Gang 3', (G.html(bestellung, false, tisch).match(/kin-gang wartet/g) || []).length === 1 && G.naechster(tisch) === 3, '');
tisch.gang_jetzt = 3;
t('alle abgerufen -> kein weiterer Knopf', G.naechster(tisch) === null, '');
t('Abholung: Ueberschriften ja, aber nichts wartet (kommt alles zusammen)', !/wartet/.test(G.html(bestellung, false, { order_type: 'pickup', items: bestellung })) && /kin-gang/.test(G.html(bestellung, false, { order_type: 'pickup', items: bestellung })), '');

// ---- Einbau ----
t('Warenkorb merkt sich den Gang des Gerichts', /gang: postenGang\(\{ menu_item_id: currentMenuItem\.id, category_name:/.test(H), '');
t('Bestellung schickt den Gang je Posten mit', /options: \(item\.selected_options \|\| \[\]\)\.map\(optionText\)\.filter\(Boolean\)\.join\(', '\),\s*gang: postenGang\(item\)/.test(H), '');
t('Dashboard laedt Gang und gang_jetzt', /gang: item\.gang\s*\}\)\)/.test(H) && /gang_jetzt: order\.gang_jetzt \|\| null,/.test(H), '');
t('Karte "In Arbeit": Knopf "Gang N abrufen" nur am Tisch', /var _gN = order\.order_type === 'dine_in' \? gangNaechster\(order\) : null;/.test(fn('renderDashboardOrders')), '');
var ga = fn('gangAbrufen');
t('Abrufen: return=representation, leere Antwort = Meldung, fehlende Spalte = SQL 50', /Prefer: 'return=representation'/.test(ga) && /Nicht abgerufen – die Datenbank hat die Änderung nicht übernommen/.test(ga) && /50-gaenge\.sql/.test(ga), '');
t('Kuechenbildschirm zeigt die Gaenge, wartende blass', /var _kdsGr = gangGruppen\(items\)/.test(fn('_kdsRenderCard')) && /wartet – Bedienung ruft ab/.test(fn('_kdsRenderCard')), '');
(async function () {
    var toasts = [], antwort = '[]', status = 200, gerendert = 0;
    var dash = [{ id: 'o1', order_type: 'dine_in', items: bestellung, gang_jetzt: null }];
    var AB = new Function('dashboardOrders', 'fetch', 'showToast', 'renderDashboardOrders', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken',
        'var GANG_TEXT = ' + GT + ';\n' + ['gangGruppen', 'gangJetzt', 'gangNaechster', 'gangAbrufen'].map(fn).join('\n') + '; return gangAbrufen;')(
        dash, async function () { return { ok: status < 400, status: status, text: async function () { return antwort; } }; },
        function (m, art) { toasts.push(art + ':' + m); }, function () { gerendert++; }, 'https://x', 'k', function () { return 't'; });
    await AB('o1');
    t('Abrufen ohne gespeicherte Zeile -> Fehlermeldung, Gang bleibt', dash[0].gang_jetzt === null && /error:Nicht abgerufen – die Datenbank/.test(toasts.join('|')), toasts.join('|'));
    toasts = []; status = 400; antwort = '{"message":"column orders.gang_jetzt does not exist"}';
    await AB('o1');
    t('Abrufen ohne SQL 50 -> sagt es', dash[0].gang_jetzt === null && /50-gaenge\.sql/.test(toasts.join('|')), toasts.join('|'));
    toasts = []; status = 200; antwort = '[{"id":"o1","gang_jetzt":2}]';
    await AB('o1');
    t('Abrufen klappt -> Gang 2 dran, Karte neu gezeichnet', dash[0].gang_jetzt === 2 && gerendert === 1 && /success:Gang 2/.test(toasts.join('|')), toasts.join('|'));
    // Dunkelmodus: ".dark-mode .kin-order-card *" faerbt jede Schrift hell
    // (mit !important) -- auf dem gelben Knopf unlesbar, gemessen 31.10.
    t('Abruf-Knopf im Dunkelmodus: dunkle Schrift mit !important', /\.dark-mode \.kin-order-card \.kin-gang-abruf[^{]*\{[^}]*color:\s*#00251e\s*!important/.test(H));
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
})();
