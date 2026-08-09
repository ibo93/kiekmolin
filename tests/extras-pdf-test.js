// EXTRAS AUS PDF -- eigener Weg auf der Seite "Optionen & Extras".
//
// Ueber den Speisekarten-Import kamen die Extras nicht an. Dort haengen sie am
// Ende einer langen Kette: lesen, abgleichen, Gerichte schreiben, Fehler
// behandeln, dann erst Extras. Vier Stationen haben sie nacheinander
// verschluckt -- Reihenfolge, Kopfzeilen, stilles continue, leeres catch.
//
// Dieser Weg hat drei Schritte, die man einzeln sieht: PDF lesen, Ergebnis
// zeigen, auf Knopfdruck schreiben. Die Speisekarte wird dabei nicht
// angefasst, und das manuelle Anlegen bleibt daneben bestehen.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var SEITEN = JSON.parse(fs.readFileSync('/home/user/kiekmolin/tests/daten/pronto-pdfjs.json', 'utf8'));
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// --- Oberflaeche -------------------------------------------------------------
t('Knopf "Aus PDF übernehmen" auf der Seite Optionen & Extras',
  /onclick="oeffneExtrasAusPdf\(\)"/.test(H) && /Aus PDF übernehmen/.test(H));
t('"Neue Gruppe" bleibt daneben bestehen -- PDF ist ZUSAETZLICH',
  /onclick="openCreateOptionGroupModal\(\)"/.test(H) && /Neue Gruppe/.test(H));
t('der PDF-Knopf steht vor "Neue Gruppe"',
  H.indexOf('oeffneExtrasAusPdf()') < H.indexOf('openCreateOptionGroupModal()'));
t('eigenes Fenster in der Fenster-Struktur der App',
  /<div class="modal-overlay" id="extrasPdfModal"/.test(H)
  && /id="extrasPdfModal"[\s\S]{0,200}<div class="modal"/.test(H));
t('nimmt nur PDF an', /id="extrasPdfDatei" accept="application\/pdf,\.pdf"/.test(H));
t('auch per Ziehen-und-Ablegen', /ondrop="extrasPdfAbgelegt/.test(H));
t('sagt klar, dass die Speisekarte unangetastet bleibt',
  /An der Speisekarte ändert sich nichts/.test(H));

// --- Was gelesen wird ---------------------------------------------------------
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var F = new Function('pdfTextSeiten', 'window', 'SEITEN',
    vorspann + '\n' + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems', '_nrWert',
        'sortiereNachNummer', 'extrasZuGruppen', 'zutatenAusKategorie', 'extrasMitZutaten',
        'extrasAufAlleKategorien', 'leseKartePdf'].map(schneide).join('\n')
    + '; return leseKartePdf("x");');

(async function () {
    var seitenText = new Function(vorspann + '\n' + schneide('pdfSeiteZuText') + '; return pdfSeiteZuText;')();
    var erg = await F(async function () { return SEITEN.map(function (s) { return seitenText(s.items, s.w); }); }, {}, SEITEN);
    var gruppen = (erg.extras || []).filter(function (g) { return g.optionen && g.optionen.length; });

    t('aus der echten Karte kommen 7 Gruppen', gruppen.length === 7, gruppen.length);
    var pizza = gruppen.filter(function (g) { return g.kategorie === 'Pizza'; })[0];
    t('Pizza mit 13 echten Zutaten', !!pizza && pizza.optionen.length === 13, pizza && pizza.optionen.length);
    t('je 1,00 € Aufpreis', !!pizza && pizza.optionen.every(function (o) { return o.price === 1; }));
    t('das Menü-Upgrade ist dabei',
      gruppen.some(function (g) { return /Upgrade/i.test(g.name) && g.optionen[0].price === 5; }),
      gruppen.map(function (g) { return g.name; }).join(', '));

    // --- Uebernehmen: schreibt, ohne die Speisekarte anzufassen ---------------
    var geschrieben = { gruppen: [], optionen: [] }, toasts = [], status = [];
    global.fetch = async function (url, opts) {
        var u = String(url), b = opts && opts.body ? JSON.parse(opts.body) : null;
        if (/menu_items|menu_categories/.test(u)) throw new Error('Speisekarte darf NICHT angefasst werden: ' + u);
        if (u.indexOf('menu_option_groups') >= 0 && opts.method === 'POST') {
            geschrieben.gruppen.push(b);
            return { ok: true, json: async function () { return [{ id: 'g' + geschrieben.gruppen.length }]; } };
        }
        if (u.indexOf('menu_options') >= 0 && opts.method === 'POST') {
            geschrieben.optionen = geschrieben.optionen.concat(b);
            return { ok: true, json: async function () { return b; } };
        }
        return { ok: true, json: async function () { return []; }, text: async function () { return ''; } };
    };
    var haken = gruppen.map(function (g, i) { return { checked: i < 2, dataset: { i: String(i) } }; });
    var doc = {
        getElementById: function (id) {
            if (id === 'extrasPdfStatus') return { style: {}, set textContent(v) { status.push(v); }, get textContent() { return ''; } };
            return { style: {}, textContent: '', disabled: false, innerHTML: '' };
        },
        querySelectorAll: function () { return { forEach: function (f) { haken.forEach(f); } } }
    };
    var win = { _gastroOnlyRestaurantId: 'r1', _scanExtras: null };
    var f2 = new Function('document', 'window', 'showToast', 'closeModal', 'loadOptionGroups',
        'openModal', 'currentMenuRestaurant', 'RESTAURANT_ID', 'SUPA_URL', 'SUPA_KEY', 'SUPABASE_URL',
        'SUPABASE_KEY', 'sbRead', '_extrasPdfGefunden',
        schneide('_extrasPdfSage') + '\n' + schneide('legeExtrasAn') + '\n' + schneide('extrasPdfUebernehmen')
        + '; return extrasPdfUebernehmen();');
    await f2(doc, win, function (m) { toasts.push(m); }, function () {}, function () {}, function () {},
        null, null, 'https://x', 'k', 'https://x', 'k', function (u, o) { return fetch(u, o); }, gruppen);

    t('nur die angehakten Gruppen werden angelegt', geschrieben.gruppen.length === 2, geschrieben.gruppen.length);
    t('mit ihren Optionen', geschrieben.optionen.length === 13 + 2, geschrieben.optionen.length);
    t('die Speisekarte wird dabei NICHT angefasst', true);   // die Attrappe wirft sonst
    t('Erfolg wird gemeldet', toasts.some(function (m) { return /Extra-Gruppen? angelegt/.test(m); }), JSON.stringify(toasts));
    t('window._scanExtras bleibt danach unveraendert (kein Nebeneffekt auf den Import)',
      win._scanExtras === null, JSON.stringify(win._scanExtras));

    // --- DER FALL, DER WIRKLICH AUFTRAT: die Datenbank verbietet das Schreiben
    //
    // Nach rund einem Dutzend Runden "die Extras sind leer" kam endlich eine
    // Meldung durch -- und zwar diese:
    //   {"code":"42501","message":"new row violates row-level security
    //    policy for table \"menu_option_groups\""}
    // Roh, als JSON, mitten im Satz abgeschnitten. Kein Mensch liest daraus
    // "in Supabase fehlt eine Regel". Alle vorher gefundenen Fehler waren echt,
    // aber keiner war der Grund.
    var RLS = JSON.stringify({ code: '42501', details: null, hint: null,
        message: 'new row violates row-level security policy for table "menu_option_groups"' });

    function laufMitFehler(antwortText, statusCode) {
        var toasts2 = [], status2 = [], eingefuegt = [];
        var fetch2 = async function (url, opts) {
            var u = String(url);
            if (/menu_items|menu_categories/.test(u)) throw new Error('Speisekarte angefasst: ' + u);
            if (u.indexOf('menu_option_groups') >= 0 && opts && opts.method === 'POST') {
                return { ok: false, status: statusCode,
                         clone: function () { return this; },
                         text: async function () { return antwortText; } };
            }
            return { ok: true, json: async function () { return []; }, text: async function () { return ''; } };
        };
        var vorschau = { style: {}, innerHTML: '',
            querySelector: function () { return null; },
            insertAdjacentHTML: function (wo, html) { eingefuegt.push(html); } };
        var doc2 = {
            getElementById: function (id) {
                if (id === 'extrasPdfStatus') return { style: {}, set textContent(v) { status2.push(v); }, get textContent() { return ''; } };
                if (id === 'extrasPdfVorschau') return vorschau;
                return { style: {}, textContent: '', disabled: false, innerHTML: '' };
            },
            querySelectorAll: function () { return { forEach: function (f) { haken.forEach(f); } } }
        };
        var f3 = new Function('document', 'window', 'showToast', 'closeModal', 'loadOptionGroups',
            'openModal', 'currentMenuRestaurant', 'RESTAURANT_ID', 'SUPA_URL', 'SUPA_KEY',
            'sbRead', '_extrasPdfGefunden', 'fetch',
            schneide('fehlerKlartext') + '\n' + schneide('istRechteFehler') + '\n'
            + H.slice(H.indexOf('var _RECHTE_SQL ='), H.indexOf('function _zeigeRechteHilfe', H.indexOf('var _RECHTE_SQL ='))) + '\n'
            + schneide('_zeigeRechteHilfe') + '\n' + schneide('_extrasPdfSage') + '\n'
            + schneide('legeExtrasAn') + '\n' + schneide('extrasPdfUebernehmen')
            + '; return extrasPdfUebernehmen();');
        return f3(doc2, { _gastroOnlyRestaurantId: 'r1' }, function (m) { toasts2.push(m); },
            function () { throw new Error('Fenster darf nicht zugehen, der Befehl steht darin'); },
            function () {}, function () {}, null, null, 'https://x', 'k',
            function (u, o) { return fetch2(u, o); }, gruppen, fetch2)
            .then(function () { return { toasts: toasts2, status: status2, eingefuegt: eingefuegt }; });
    }

    var r = await laufMitFehler(RLS, 403);
    t('kein rohes JSON mehr im Fenster',
      !r.status.some(function (s) { return /42501|\{"code/.test(s); }), JSON.stringify(r.status));
    t('der Grund steht in Klartext da',
      r.status.some(function (s) { return /Datenbank nimmt die Extras nur nicht an/.test(s); }), JSON.stringify(r.status));
    t('der fertige Supabase-Befehl wird eingeblendet',
      r.eingefuegt.length === 1 && /create policy/.test(r.eingefuegt[0]), r.eingefuegt.length);
    t('der Befehl setzt das Recht fuer BEIDE Tabellen',
      /menu_option_groups[\s\S]*for insert/.test(r.eingefuegt[0])
      && /menu_options\b[\s\S]*for insert/.test(r.eingefuegt[0]));
    t('mit Knopf zum Kopieren', /_kopiereRechteSQL/.test(r.eingefuegt[0]));
    t('das Fenster bleibt offen -- sonst waere der Befehl sofort wieder weg', true); // closeModal wirft
    t('der Toast sagt, wo der Befehl steht',
      r.toasts.some(function (m) { return /keine Schreibrechte/.test(m) && /Fenster/.test(m); }), JSON.stringify(r.toasts));

    // 42501 kommt auch ohne die Zeichenfolge "row-level security" vor.
    var r2 = await laufMitFehler('{"code":"42501","message":"permission denied for table menu_option_groups"}', 403);
    t('auch "permission denied" fuehrt zum selben Hinweis',
      r2.eingefuegt.length === 1 && /create policy/.test(r2.eingefuegt[0]), r2.eingefuegt.length);

    // Ein ANDERER Fehler darf den Rechte-Hinweis NICHT ausloesen -- sonst
    // schickt man den Gastronomen in Supabase eine Regel anlegen, die nichts
    // aendert, und der echte Grund bleibt im Dunkeln.
    var r3 = await laufMitFehler('{"code":"23505","message":"duplicate key value violates unique constraint"}', 409);
    t('ein anderer Fehler zeigt den Rechte-Befehl NICHT',
      r3.eingefuegt.length === 0, r3.eingefuegt.length);
    t('er nennt trotzdem einen Grund in Klartext',
      r3.status.some(function (s) { return /Nichts angelegt/.test(s) && !/\{"code/.test(s); }), JSON.stringify(r3.status));

    // --- Der Text selbst ---------------------------------------------------
    t('fehlerKlartext uebersetzt 42501',
      /42501\|permission denied\|row-level security/.test(H) && /keine Schreibrechte in der Datenbank/.test(H));
    t('der SQL-Befehl schaltet RLS nicht einfach ab (das oeffnet die ganze Tabelle)',
      !/disable row level security/i.test(H));
    t('Lesen bleibt fuer den Gast erlaubt', /create policy \\"extras lesen\\"/.test(H));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
