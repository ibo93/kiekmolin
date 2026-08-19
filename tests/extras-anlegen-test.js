// EXTRAS ANLEGEN -- wird wirklich ausgeführt, gegen Datenbank-Attrappen.
//
// Im Dashboard stand "Keine Optionsgruppen vorhanden", obwohl der Scanner
// sechs Gruppen gefunden hatte. Grund: schlug das Anlegen fehl, stand das
// ausschliesslich in der Browser-Konsole --
//     if (!grpRes.ok) { console.warn(...); continue; }
// -- und die Schleife machte mit der nächsten Gruppe weiter. Kennt die
// Datenbank eine Spalte nicht (etwa internal_name), scheiterten damit ALLE
// Gruppen, ohne dass irgendwo ein Grund zu sehen war.

// Seit die App das Sitzungs-Token benutzt, ruft der ausgeschnittene
// Code kmiToken(). Im Browser ist das eine globale Funktion -- hier
// gehoert sie zur nachgebauten Umgebung, genau wie sbRead oder showToast.
var KMI_STUB = 'var kmiToken = function () { return typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY '
    + ': (typeof SUPA_KEY !== "undefined" ? SUPA_KEY : "anon"); };\n';

'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

var EXTRAS = [
    { name: 'Extra Zutaten', kategorie: 'Pizza', mehrfach: true,
      optionen: [{ name: 'Salami', price: 1 }, { name: 'Paprika', price: 1 }] },
    { name: 'Menü-Upgrade', kategorie: 'Burger',
      optionen: [{ name: 'Burger + Getränk + Pommes', price: 5 }] }
];

// welt.fehlendeGruppenSpalten / .fehlendeOptionsSpalten = was die DB nicht kennt
async function lauf(welt) {
    var gruppen = [], optionen = [], toasts = [];
    global.fetch = async function (url, opts) {
        var u = String(url), b = opts && opts.body ? JSON.parse(opts.body) : null;
        if (u.indexOf('menu_option_groups') >= 0 && opts.method === 'POST') {
            if (welt.hartFehler) {
                var hf = welt.hartFehler === true ? 'permission denied for table menu_option_groups' : welt.hartFehler;
                return { ok: false, status: 400,
                    clone: function () { return { text: async function () { return hf; } }; },
                    text: async function () { return hf; } };
            }
            var fehlt = (welt.fehlendeGruppenSpalten || []).filter(function (f) { return f in b; });
            if (fehlt.length) return { ok: false, status: 400,
                clone: function () { return { text: async function () { return "Could not find the '" + fehlt[0] + "' column"; } }; },
                text: async function () { return "Could not find the '" + fehlt[0] + "' column"; } };
            gruppen.push(b);
            return { ok: true, json: async function () { return [{ id: 'g' + gruppen.length }]; } };
        }
        if (u.indexOf('menu_options') >= 0 && opts.method === 'POST') {
            var f2 = (welt.fehlendeOptionsSpalten || []).filter(function (f) { return b[0] && (f in b[0]); });
            if (f2.length) return { ok: false, status: 400,
                clone: function () { return { text: async function () { return "Could not find the '" + f2[0] + "' column"; } }; },
                text: async function () { return "Could not find the '" + f2[0] + "' column"; } };
            optionen = optionen.concat(b);
            return { ok: true, json: async function () { return b; } };
        }
        if (u.indexOf('menu_option_groups') >= 0) return { ok: true, json: async function () { return welt.vorhanden || []; } };
        return { ok: true, json: async function () { return []; }, text: async function () { return ''; } };
    };
    var f = new Function('SUPA_URL', 'SUPABASE_URL', 'SUPA_KEY', 'sbRead', 'showToast', 'window',
        KMI_STUB + schneide('fehlerKlartext') + '\n' + schneide('istRechteFehler') + '\n'
        + schneide('legeExtrasAn') + '; return legeExtrasAn("r1", {});');
    var erg = await f('https://x', 'https://x', 'k', function (u, o) { return fetch(u, o); },
        function (m) { toasts.push(m); }, { _scanExtras: EXTRAS });
    return { erg: erg, gruppen: gruppen, optionen: optionen, toasts: toasts };
}

(async function () {
    // --- Normalfall ---
    var r = await lauf({});
    t('beide Gruppen werden angelegt', r.erg.angelegt === 2, r.erg.angelegt);
    t('mit Kategorie-Bindung', r.gruppen[0].internal_name === 'cats:Pizza', r.gruppen[0].internal_name);
    t('Zutaten als Mehrfachauswahl', r.gruppen[0].selection_type === 'multiple', r.gruppen[0].selection_type);
    t('drei Optionen insgesamt geschrieben', r.optionen.length === 3, r.optionen.length);
    t('Zutaten sind Aufpreis, kein Ersatzpreis',
      r.optionen.every(function (o) { return o.price_type === 'add'; }), JSON.stringify(r.optionen[0]));

    // --- DER FEHLER: Datenbank kennt internal_name nicht ---
    var r2 = await lauf({ fehlendeGruppenSpalten: ['internal_name'] });
    t('unbekannte Spalte kostet KEINE Gruppe mehr', r2.erg.angelegt === 2, r2.erg.angelegt);
    t('die Gruppe wird ohne das Feld angelegt',
      r2.gruppen.length === 2 && !('internal_name' in r2.gruppen[0]), JSON.stringify(r2.gruppen[0]));

    var r3 = await lauf({ fehlendeOptionsSpalten: ['is_default'] });
    t('unbekannte Spalte bei den Optionen ebenso', r3.erg.angelegt === 2, r3.erg.angelegt);

    // --- Geht wirklich nichts, muss man es SEHEN ---
    // Ein Fehler, der sich NICHT durch Weglassen einer Spalte beheben lässt
    // (z.B. fehlende Schreibrechte) -- der muss auf den Bildschirm.
    var r4 = await lauf({ hartFehler: 'irgendwas ist kaputt' });
    t('geht es wirklich nicht, wird es gemeldet statt verschluckt',
      r4.toasts.length > 0 && /Extras konnten nicht angelegt werden/.test(r4.toasts[0]),
      JSON.stringify(r4.toasts));
    t('und der Grund steht dabei', r4.erg.fehler.length > 0, JSON.stringify(r4.erg.fehler));

    // --- DER FALL AUS DEM ECHTEN BETRIEB: 42501, fehlende Schreibrechte ----
    // Dagegen hilft kein Weglassen einer Spalte und kein zweiter Versuch.
    // Das muss anders gemeldet werden als "irgendwas ging schief", sonst
    // tippt der Gastronom noch zehnmal auf denselben Knopf.
    var r4b = await lauf({ hartFehler: '{"code":"42501","message":"new row violates row-level security policy for table \\"menu_option_groups\\""}' });
    t('fehlende Schreibrechte werden als solche erkannt', r4b.erg.rechte === true, JSON.stringify(r4b.erg));
    t('und in Klartext gemeldet, nicht als JSON',
      r4b.toasts.some(function (m) { return /keine Schreibrechte/.test(m) && !/42501/.test(m); }),
      JSON.stringify(r4b.toasts));
    t('kein rohes JSON in der Fehlerliste',
      r4b.erg.fehler.every(function (f) { return !/\{"code/.test(f); }), JSON.stringify(r4b.erg.fehler));
    t('ein gewoehnlicher Fehler wird NICHT als Rechte-Problem ausgegeben',
      r4.erg.rechte === false, JSON.stringify(r4.erg));

    // --- Nichts doppelt ---
    var r5 = await lauf({ vorhanden: [{ id: 'x', name: 'Extra Zutaten', internal_name: 'cats:Pizza' }] });
    t('vorhandene Gruppe wird uebersprungen, nicht verdoppelt',
      r5.erg.angelegt === 1 && r5.erg.uebersprungen === 1,
      'angelegt=' + r5.erg.angelegt + ' uebersprungen=' + r5.erg.uebersprungen);

    // --- Die zwei Fehler, an denen es zuletzt hing -------------------------
    var wa = H.slice(H.indexOf('async function wendeKartenAbgleichAn('));
    wa = wa.slice(0, wa.indexOf('\n}\n') + 3);
    t('der Abgleich legt Extras VOR dem Fehler-Zweig an',
      wa.indexOf('legeExtrasAn') > 0 && wa.indexOf('legeExtrasAn') < wa.indexOf('\n        return;'),
      'extras@' + wa.indexOf('legeExtrasAn') + ' return@' + wa.indexOf('\n        return;'));
    t('legeExtrasAn setzt eigene Kopfzeilen und verlangt die Antwort',
      /Prefer': 'return=representation'/.test(H)
      && /SUPA_H = \{ 'apikey': SUPA_KEY/.test(H));
    t('warum: ohne Antwort keine Gruppen-ID und damit keine Optionen',
      /die neu angelegte\s*\n\s*\/\/ Gruppe hat keine ID/.test(H));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
