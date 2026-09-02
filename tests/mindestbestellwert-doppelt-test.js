// DER MINDESTBESTELLWERT, DER WIEDER AUF 0 FIEL.
//
// Gemeldet am 02.09.2026: "hab es geaendert es geht wieder auf 0 EUR
// wieder".
//
// GEMESSEN, nicht vermutet. In den Edge-Protokollen ging bei jeder
// Aenderung nicht EIN PATCH auf restaurants raus, sondern zwei:
//
//     19:44:20.338  PATCH restaurants?id=eq.a004eaca...  204
//     19:44:22.119  PATCH restaurants?id=eq.a004eaca...  204
//     13:50:24.466 / :25.375 / :27.270                   sogar drei
//     16:29:07.999 / 16:29:09.350  (sein Handy)          zwei
//
// Woher der zweite kam: die Knoepfe "Kein / 10 / 15 / 20" stehen neben
// dem Eingabefeld. Ein Mausklick nimmt dem Feld ZUERST den Fokus. blur
// feuert also, BEVOR der Knopf seinen Wert setzt -- der Browser schickt
// erst den ALTEN Wert los, gleich danach den neuen.
//
// Zwei Anfragen, die um dieselbe Zeile rennen. Und Anfragen kommen nicht
// in der Reihenfolge an, in der sie losgehen. Ueberholt die erste die
// zweite, steht am Ende der alte Wert in der Datenbank -- bei ihm die 0.
// Beide antworten mit 204, "gespeichert" erscheint. Niemand sieht etwas.
//
// Dieser Test stellt genau diesen Ablauf nach.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// Den Block von den Hilfsvariablen bis zum Ende von saveMinOrderValue
// herausschneiden.
var a = h.indexOf('var _minKette = Promise.resolve()');
var e = h.indexOf('window.savePaymentSettings', a);
if (e < 0) e = h.indexOf('\nasync function savePaymentSettings', a);
var quelle = a < 0 ? '' : h.slice(a, h.indexOf('\n}\n', h.indexOf('async function saveMinOrderValue', a)) + 3);

t('der Speicher-Block wurde gefunden', quelle.length > 400, quelle.length);

// ---- Nachgebaute Umgebung ----------------------------------------------
var HAUS = 'a004eaca-c89d-4396-bce6-884d7c9ccd2d';

function bauen(dbWert) {
    var feld = { value: String(dbWert) };
    var geschrieben = [];       // was wirklich rausging, in Reihenfolge
    var toasts = [];
    var offen = 0, maxOffen = 0, gerufen = 0;

    var ctx = {
        document: {
            getElementById: function (id) {
                if (id === 'settingMinOrder') return feld;
                if (id === 'ordersRestaurantSelect') return { value: HAUS };
                if (id === 'minOrderNurLokal') return { style: {} };
                return null;
            }
        },
        localStorage: { _d: {}, setItem: function (k, v) { this._d[k] = String(v); }, getItem: function (k) { return this._d[k] || null; } },
        window: {},
        showToast: function (m, art) { toasts.push(art + ': ' + m); },
        kmiToken: function () { return 'tok'; },
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_KEY: 'anon',
        currentOrderRestaurant: null,
        Promise: Promise, JSON: JSON, Number: Number, String: String,
        parseFloat: parseFloat, isFinite: isFinite, console: console,
        setTimeout: setTimeout,
        fetch: function (url, o) {
            var wert = JSON.parse(o.body).min_order_value;
            offen++; if (offen > maxOffen) maxOffen = offen;
            // Absichtlich ungleich lange Laufzeiten: der ZUERST
            // losgeschickte ist der langsamere. Genau so ueberholt ihn
            // der zweite -- und der alte Wert landet zuletzt in der
            // Datenbank. Der Zaehler muss HIER stehen, beim Losschicken:
            // an geschrieben.length festgemacht saehen zwei gleichzeitige
            // Anfragen beide dieselbe 0 und bekaemen dieselbe Laufzeit --
            // dann kann gar nichts ueberholen und der Test prueft nichts.
            gerufen++;
            var dauer = gerufen === 1 ? 40 : 5;
            return new Promise(function (fertig) {
                setTimeout(function () {
                    offen--;
                    geschrieben.push(wert);
                    fertig({ ok: true, status: 204 });
                }, dauer);
            });
        }
    };
    ctx.APP_DATA = { restaurants: [{ id: HAUS, min_order_value: dbWert }] };
    vm.createContext(ctx);
    vm.runInContext(quelle, ctx);
    ctx.minStandMerken(HAUS, dbWert);   // so wie es das Laden tut
    return { ctx: ctx, feld: feld, geschrieben: geschrieben, toasts: toasts,
             maxOffen: function () { return maxOffen; } };
}

// ---- 1. Der gemeldete Ablauf -------------------------------------------
console.log('\n-- Der Klick auf "15 EUR", so wie der Browser ihn ausloest --');

var u = bauen(0);
// blur zuerst -- das Feld zeigt noch die alte 0
var p1 = u.ctx.saveMinOrderValue();
// dann setzt der Knopf den Wert und ruft noch einmal
u.feld.value = '15';
var p2 = u.ctx.saveMinOrderValue();

Promise.all([p1, p2]).then(function () {
    t('es geht genau EINE Anfrage raus, nicht zwei',
      u.geschrieben.length === 1, u.geschrieben.join(', '));
    t('und darin steht die 15, nicht die 0',
      u.geschrieben[0] === 15, u.geschrieben[0]);
    t('nichts laeuft gleichzeitig (kein Ueberholen moeglich)',
      u.maxOffen() <= 1, u.maxOffen() + ' gleichzeitig');

    // ---- 2. Reihenfolge bei echten Aenderungen -------------------------
    console.log('\n-- Zwei echte Aenderungen kurz hintereinander --');
    var v = bauen(0);
    v.feld.value = '10'; var q1 = v.ctx.saveMinOrderValue();
    v.feld.value = '20'; var q2 = v.ctx.saveMinOrderValue();
    return Promise.all([q1, q2]).then(function () {
        t('beide gehen raus', v.geschrieben.length === 2, v.geschrieben.join(', '));
        t('in der Reihenfolge, in der getippt wurde',
          v.geschrieben[0] === 10 && v.geschrieben[1] === 20, v.geschrieben.join(' dann '));
        t('der zuletzt getippte Wert steht am Ende',
          v.geschrieben[v.geschrieben.length - 1] === 20, v.geschrieben.join(', '));
        t('auch hier nie zwei gleichzeitig unterwegs',
          v.maxOffen() <= 1, v.maxOffen() + ' gleichzeitig');
    });
}).then(function () {
    // ---- 3. Leeres Feld ------------------------------------------------
    console.log('\n-- Ein leeres Feld ist keine Null --');
    var w = bauen(15);
    w.feld.value = '';
    return w.ctx.saveMinOrderValue().then(function () {
        t('leeres Feld schreibt nichts', w.geschrieben.length === 0, w.geschrieben.join(', '));
        t('und stellt den gespeicherten Wert wieder hin', w.feld.value === 15, w.feld.value);

        var w2 = bauen(15);
        w2.feld.value = 'abc';
        return w2.ctx.saveMinOrderValue().then(function () {
            t('Unsinn im Feld schreibt auch nichts', w2.geschrieben.length === 0, w2.geschrieben.join(', '));
        });
    });
}).then(function () {
    // ---- 4. Der unveraenderte Wert -------------------------------------
    console.log('\n-- Was schon in der Datenbank steht --');
    var x = bauen(15);
    var r1 = x.ctx.saveMinOrderValue();        // blur ohne Aenderung
    x.feld.value = '15';
    var r2 = x.ctx.saveMinOrderValue();        // und noch einmal
    return Promise.all([r1, r2]).then(function () {
        t('wird nicht noch einmal geschrieben', x.geschrieben.length === 0, x.geschrieben.join(', '));

        // Aber eine echte Aenderung danach MUSS durchgehen --
        // sonst haette die Sperre den Wert eingefroren.
        x.feld.value = '0';
        return x.ctx.saveMinOrderValue().then(function () {
            t('eine echte Aenderung geht trotzdem durch',
              x.geschrieben.length === 1 && x.geschrieben[0] === 0, x.geschrieben.join(', '));
            t('"Kein Minimum" laesst sich also weiterhin setzen',
              x.geschrieben[0] === 0, x.geschrieben[0]);
        });
    });
}).then(function () {
    // ---- 5. Die Kette darf nie abreissen -------------------------------
    console.log('\n-- Ein Fehler blockiert nicht alles Weitere --');
    var y = bauen(0);
    var ersteWeg = true;
    y.ctx.fetch = function (url, o) {
        var wert = JSON.parse(o.body).min_order_value;
        if (ersteWeg) { ersteWeg = false; return Promise.reject(new Error('kein Netz')); }
        y.geschrieben.push(wert);
        return Promise.resolve({ ok: true, status: 204 });
    };
    y.feld.value = '10';
    return y.ctx.saveMinOrderValue().then(function () {
        y.feld.value = '20';
        return y.ctx.saveMinOrderValue().then(function () {
            t('nach einem Netzfehler geht das naechste Speichern wieder durch',
              y.geschrieben.indexOf(20) >= 0, y.geschrieben.join(', '));
            t('und der Fehler wurde gesagt, nicht verschwiegen',
              y.toasts.some(function (s) { return /warning/.test(s); }), y.toasts.join(' | '));
        });
    });
}).then(function () {
    // ---- 6. Was im Quelltext stehen muss -------------------------------
    console.log('\n-- Der Bau selbst --');
    t('die Schreibvorgaenge haengen an einer Kette',
      /_minKette = _minFertig\.catch/.test(quelle));
    t('der Stand wird ERST nach der Bestaetigung gemerkt',
      quelle.indexOf('minStandMerken(restId, minOrder)') > quelle.indexOf('await _minFertig'));
    t('beim Laden wird der Datenbank-Wert festgehalten',
      /minStandMerken\(restId, minServer\)/.test(h));
    t('aus einem leeren Feld wird keine 0 mehr',
      !/parseFloat\(document\.getElementById\('settingMinOrder'\)\?\.value\) \|\| 0/.test(h));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}).catch(function (err) {
    console.log('FAIL | Test selbst abgestuerzt -> ' + err.stack);
    process.exit(1);
});
