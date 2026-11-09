// KUECHEN-DISPLAY NEU (09.11.2026): Schiene, Zeitfarben, Nagel, Ausverkauft.
//
// Ibo hat den Entwurf in Claude Design freigegeben ("Ja mach das"). Diese
// Datei fuehrt die Bausteine aus index.html wirklich aus und fragt vor allem:
// Wie sieht es aus, wenn es kaputt ist?
'use strict';
var fs = require('fs'), path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++;
    var d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
function zeile(re) { var m = re.exec(H); if (!m) throw new Error('fehlt: ' + re); return m[0]; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

var toasts = [], schreib = [];
var welt = {
    escapeHtml: esc, showToast: function (m, a) { toasts.push([m, a]); },
    optionText: function (o) { return typeof o === 'string' ? o : (o && (o.option || o.name)) || ''; },
    allergieZeileHtml: function (o) { return o.allergie ? '<div class="kin-allergie">' + esc(o.allergie) + '</div>' : ''; },
    menuAntwort: null
};
var code = [zeile(/var KDS_GELB_MIN = [^\n]+/), zeile(/var KDS_FERTIG_STATUS = [^\n]+/), zeile(/var GANG_TEXT = [^\n]+/),
    ['gangGruppen', 'gangJetzt', 'gangNaechster', 'kdsStufe', 'kdsZeitText', 'kdsKopf', 'kdsPosHtml', 'kdsZeitBasis', '_kdsRenderCard',
     'kdsFertigChipsHtml', 'kdsHeuteBerlin', 'kdsMorgenText', 'kdsAusverkauftChipsHtml', 'kdsAusverkauftSchalten', 'kdsFertigHeute'].map(fn).join('\n')].join('\n');
var dok = { getElementById: function (id) { return welt.dom[id] || null; }, querySelectorAll: function () { return []; } };
welt.dom = {};
var K = new Function('escapeHtml', 'showToast', 'optionText', 'allergieZeileHtml', 'document', 'window', 'menuSchreiben', 'sb', 'kdsAusverkauftZeigen', 'kdsAusverkaufOeffnen',
    code + '; return { stufe: kdsStufe, zeit: kdsZeitText, kopf: kdsKopf, bon: _kdsRenderCard, chips: kdsFertigChipsHtml, morgen: kdsMorgenText, ausChips: kdsAusverkauftChipsHtml, schalten: kdsAusverkauftSchalten, fertigHeute: kdsFertigHeute };')(
    welt.escapeHtml, welt.showToast, welt.optionText, welt.allergieZeileHtml, dok, welt.win = { _kdsGerichte: [] },
    async function (pfad, methode, daten) { schreib.push([pfad, daten]); return welt.menuAntwort(pfad, daten); },
    { from: function () { var o = { select: function () { return o; }, eq: function () { return o; }, in: function () { return o; }, gte: function () { return o; }, then: function (r) { return r(welt.fertigAntwort); } }; return o; } },
    function () {}, function () {});

(async function () {
    // ---- Zeit und Farbe ----
    t('Gruen unter 10 Min, gelb ab 10, rot ab 15', K.stufe(9.9) === 'gruen' && K.stufe(10) === 'gelb' && K.stufe(14.9) === 'gelb' && K.stufe(15) === 'rot', [K.stufe(9.9), K.stufe(10), K.stufe(15)]);
    t('Zeit als mm:ss, nie negativ', K.zeit(365) === '06:05' && K.zeit(1092) === '18:12' && K.zeit(-5) === '00:00', K.zeit(365));

    // ---- Kopf des Bons ----
    t('Tisch: "T 4", darunter Personen', JSON.stringify(K.kopf({ order_type: 'dine_in', table_number: 4, party_size: 3 })) === '{"gross":"T 4","klein":"Tisch · 3 Pers."}', JSON.stringify(K.kopf({ order_type: 'dine_in', table_number: 4, party_size: 3 })));
    t('Lieferung: Nummer und Strasse', K.kopf({ order_type: 'delivery', order_number: 'KI-1-22', delivery_address: { street: 'Ahornweg', house_number: '3' } }).klein === 'Lieferung · Ahornweg 3' && K.kopf({ order_type: 'delivery', order_number: 'KI-1-22' }).gross === '#22', '');
    t('Abholung mit Uhrzeit, wenn vorbestellt', /^Abholung · \d\d:\d\d$/.test(K.kopf({ order_type: 'pickup', order_number: 'X-21', scheduled_at: '2026-11-09T18:55:00Z' }).klein), K.kopf({ order_type: 'pickup', scheduled_at: '2026-11-09T18:55:00Z' }).klein);

    // ---- Der Bon ----
    var jetzt = Date.now();
    var alt = new Date(jetzt - 18 * 60000).toISOString();
    var b = K.bon({ id: 'o1', status: 'preparing', order_type: 'pickup', order_number: 'KI-1-21', created_at: alt, customer_notes: 'Bitte <b>extra</b> Pita',
        items: [{ name: '<img src=x onerror=alert(1)>', quantity: 2, selected_options: [{ group: 'g', option: 'groß', price_type: 'replace' }] }] });
    t('Gerichtname wird maskiert (kein HTML aus der Bestellung)', b.indexOf('<img src=x') < 0 && b.indexOf('&lt;img src=x') > 0, b.slice(0, 300));
    t('Extras stehen unter dem Gericht', /<small>groß<\/small>/.test(b), '');
    t('Sonderwunsch maskiert und hervorgehoben', /class="kds-wunsch">WUNSCH: Bitte &lt;b&gt;extra&lt;\/b&gt; Pita/.test(b), '');
    t('Ueber 15 Min: Bon rot umrandet, Zeit rot', /class="kds-bon zu-lange"/.test(b) && /class="kds-zeit rot"/.test(b), '');
    t('In Zubereitung: ein Knopf "Fertig" -> ready', /updateKitchenOrderStatus\('o1', 'ready'\)">Fertig</.test(b), '');
    var nb = K.bon({ id: 'o2', status: 'received', order_type: 'pickup', created_at: new Date().toISOString(), items: [{ name: 'X', quantity: 1 }] });
    t('Neu (noch nicht angenommen): gold umrandet, Knopf "Neu – zubereiten"', /class="kds-bon neu"/.test(nb) && /'o2', 'preparing'\)">Neu – zubereiten</.test(nb) && /kds-zeit gruen/.test(nb), '');
    var gb = K.bon({ id: 'o3', status: 'preparing', order_type: 'dine_in', table_number: 9, created_at: new Date().toISOString(),
        items: [{ name: 'Saganaki', quantity: 1, gang: 1 }, { name: 'Lammkotelett', quantity: 2, gang: 2 }] });
    t('Gaenge: spaeterer Gang blass mit "wartet"', /kds-gang wartet">Gang 2 · Hauptgang <small>wartet – Bedienung ruft ab<\/small>/.test(gb) && /class="kds-wartet"/.test(gb), gb);
    t('Gaenge: Kueche kann den naechsten Gang selbst losschicken', /gangAbrufen\('o3'\)">Hauptgang jetzt los</.test(gb), '');
    t('Allergie aus frueheren Besuchen steht auf dem Bon', /kds-allergie-platz"><div class="kin-allergie">Nüsse/.test(K.bon({ id: 'o4', status: 'preparing', created_at: new Date().toISOString(), items: [], allergie: 'Nüsse' })), '');
    t('Ohne Gerichte: sagt es, statt leer', /Keine Gerichte geladen/.test(K.bon({ id: 'o5', status: 'preparing', created_at: new Date().toISOString(), items: [] })), '');

    // ---- Unten: fertig, wartet auf Ausgabe ----
    t('Nichts fertig: ein Satz statt leerer Flaeche', /Gerade nichts – alles raus\./.test(K.chips([])), '');
    t('Fertig-Chip: antippen = raus (delivered)', /updateKitchenOrderStatus\('o9', 'delivered'\)/.test(K.chips([{ id: 'o9', order_type: 'dine_in', table_number: 2, updated_at: new Date().toISOString() }])), '');

    // ---- Zahl am Nagel ----
    welt.dom.kdsNagelZahl = { textContent: '' }; welt.dom.kdsFertigHeute = { textContent: '' };
    welt.fertigAntwort = { count: 14, error: null };
    var z = await K.fertigHeute('r1');
    t('Nagel zeigt die Zahl von heute', z === 14 && welt.dom.kdsNagelZahl.textContent === 14, welt.dom.kdsNagelZahl.textContent);
    welt.fertigAntwort = { count: null, error: { message: 'RLS' } };
    z = await K.fertigHeute('r1');
    t('Fehler beim Zaehlen: "–", keine erfundene Null', z === null && welt.dom.kdsNagelZahl.textContent === '–' && welt.dom.kdsFertigHeute.textContent === '–', welt.dom.kdsNagelZahl.textContent);

    // ---- Ausverkauft ----
    t('Nichts ausverkauft: ein Satz', /Nichts ausverkauft\./.test(K.ausChips([{ id: 'a', name: 'X', is_available: true }])), '');
    t('Ausverkauft-Chip: antippen gibt frei, Name maskiert', /kdsAusverkauftSchalten\('a', false\)/.test(K.ausChips([{ id: 'a', name: 'Lamm<b>', is_available: false }])) && /Lamm&lt;b&gt; ×/.test(K.ausChips([{ id: 'a', name: 'Lamm<b>', is_available: false }])), '');
    t('Morgen-Versprechen nur mit SQL 52 (Feld ausverkauft_am da)', /von selbst wieder da/.test(K.morgen([{ id: 'a', ausverkauft_am: null }])) && /nicht von selbst zurück/.test(K.morgen([{ id: 'a' }])) && /nicht von selbst zurück/.test(K.morgen([])), '');

    welt.win._kdsGerichte = [{ id: 'g1', name: 'Lammhaxe', is_available: true }];
    welt.menuAntwort = function (p, d) { return [{ id: 'g1', is_available: d.is_available, ausverkauft_am: d.ausverkauft_am || null }]; };
    toasts.length = 0; schreib.length = 0;
    await K.schalten('g1', true);
    t('Ausverkauft melden: speichert is_available=false UND den Tag', schreib.length === 1 && schreib[0][1].is_available === false && /^\d{4}-\d\d-\d\d$/.test(schreib[0][1].ausverkauft_am), JSON.stringify(schreib));
    t('... und sagt es (online nicht mehr bestellbar)', /Lammhaxe ist ausverkauft – online nicht mehr bestellbar\.$/.test(toasts[0][0]) && welt.win._kdsGerichte[0].is_available === false, JSON.stringify(toasts));

    welt.win._kdsGerichte = [{ id: 'g1', name: 'Lammhaxe', is_available: true }];
    welt.menuAntwort = function (p, d) { if ('ausverkauft_am' in d) throw new Error("Fehler 400: Could not find the 'ausverkauft_am' column of 'menu_items'"); return [{ id: 'g1', is_available: d.is_available }]; };
    toasts.length = 0; schreib.length = 0;
    await K.schalten('g1', true);
    t('Ohne SQL 52: trotzdem ausverkauft (zweiter Versuch ohne Tag)', schreib.length === 2 && !('ausverkauft_am' in schreib[1][1]) && welt.win._kdsGerichte[0].is_available === false, JSON.stringify(schreib));
    t('Ohne SQL 52: sagt laut, dass es morgen NICHT von selbst zurueckkommt', /kommt morgen NICHT von selbst wieder \(datenbank\/52-ausverkauft\.sql fehlt\)/.test(toasts[0][0]), JSON.stringify(toasts));

    welt.win._kdsGerichte = [{ id: 'g1', name: 'Lammhaxe', is_available: true }];
    welt.menuAntwort = function () { throw new Error('Keine Berechtigung'); };
    toasts.length = 0;
    await K.schalten('g1', true);
    t('Speichern scheitert: rote Meldung, Gericht bleibt bestellbar angezeigt', toasts[0][1] === 'error' && /Nicht gespeichert: Keine Berechtigung/.test(toasts[0][0]) && welt.win._kdsGerichte[0].is_available === true, JSON.stringify(toasts));

    // ---- Einbau ----
    var r = fn('refreshKitchenOrders');
    t('Schiene: Fertige NICHT an der Schiene, aelteste zuerst', /o\.status !== 'ready'/.test(r) && /sort\(function \(a, b\) \{ return kdsZeitBasis\(a\) - kdsZeitBasis\(b\); \}\)/.test(r), '');
    t('Unten stehen die fertigen (ready) Bestellungen', /var fertig = orders\.filter\(function \(o\) \{ return o\.status === 'ready'; \}\);/.test(r) && /kdsFertigChipsHtml\(fertig\)/.test(r), '');
    t('Leere Schiene: ein Satz statt leerer Flaeche', /Nichts am Pass\. Neue Bons erscheinen hier von selbst\./.test(r), '');
    t('Bluetooth-Druck zieht weiter nach', /btKuecheNachziehen\(orders, restaurantId, !!window\._kdsFirstLoad\)/.test(r), '');
    t('Gang losschicken klappt auch vom Kuechen-Display (eigene Liste)', /\|\| \(window\._kdsBestellungen \|\| \[\]\)\.find/.test(fn('gangAbrufen')), '');
    t('Kuechen-Display ist immer dunkel (.kds2) und im App-Dunkelmodus bleibt Papier hell',
        /kitchen\.className = 'kds2';/.test(fn('openKitchenDisplay')) && /\.dark-mode \.kds2 \.kds-bon b, \.dark-mode \.kds2 \.kds-gross, \.dark-mode \.kds2 \.kds-pos \{ color: #191c1d !important; \}/.test(H), '');
    t('Nagel ist ein echter Knopf mit Beschriftung', /<button type="button" class="kds-nagel" onclick="kdsNagelOeffnen\(\)" aria-label="Bonspieß/.test(H), '');

    // ---- Naechtlicher Lauf ----
    var A = require(path.join(KMI, 'netlify', 'functions', 'ausverkauft-zurueck.js'));
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    var aufrufe = [];
    global.fetch = async function (url, o) { aufrufe.push([url, o]); return { ok: true, status: 200, text: async function () { return '[{"id":"a"},{"id":"b"}]'; } }; };
    var s1 = await A._test.freigeben(new Date('2026-11-10T02:30:00Z')); // 03:30 Berlin
    t('Vor 4 Uhr (Berlin): nichts tun', aufrufe.length === 0 && s1.warten === 'vor 4 Uhr', JSON.stringify(s1));
    var s2 = await A._test.freigeben(new Date('2026-11-10T03:10:00Z')); // 04:10 Berlin
    t('Ab 4 Uhr: alles freigeben, was VOR heute ausverkauft wurde', aufrufe.length >= 1 && /menu_items\?ausverkauft_am=lt\.2026-11-10&/.test(aufrufe[0][0]) && JSON.parse(aufrufe[0][1].body).is_available === true && JSON.parse(aufrufe[0][1].body).ausverkauft_am === null && s2.freigegeben === 2, JSON.stringify([aufrufe[0] && aufrufe[0][0], s2]));
    t('Sommerzeit: Berlin-Stunde stimmt (Juli 02:10 UTC = 04 Uhr)', A._test.stundeBerlin(new Date('2026-07-10T02:10:00Z')) === 4, A._test.stundeBerlin(new Date('2026-07-10T02:10:00Z')));
    global.fetch = async function () { return { ok: false, status: 400, text: async function () { return 'column ausverkauft_am does not exist'; } }; };
    var fehlerLog = [], echtError = console.error; console.error = function (m) { fehlerLog.push(m); };
    var antwort = await A.handler();
    console.error = echtError;
    t('Spalte fehlt: steht im Protokoll, Antwort trotzdem 200', antwort.statusCode === 200 && /Fehler 400: column ausverkauft_am/.test(fehlerLog.join(' ')), JSON.stringify([antwort, fehlerLog]));
    var toml = fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8');
    t('Zeitplan in netlify.toml', /\[functions\."ausverkauft-zurueck"\]\s*\n\s*schedule = "5 \* \* \* \*"/.test(toml), '');
    t('SQL 52 legt die Spalte an', /add column if not exists ausverkauft_am date/.test(fs.readFileSync(path.join(KMI, 'datenbank', '52-ausverkauft.sql'), 'utf8')), '');
    var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
    t('sw.js CACHE hochgezaehlt (mind. v134)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 134, '');

    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
