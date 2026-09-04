// 204 IST KEIN BEWEIS.
//
// Gemeldet am 04.09.2026: "es speichert nicht". Auf dem Bild von
// Pizzeria Pronto Riepe stand im Feld 0 EUR und darunter in Rot:
// "Achtung: 18 EUR stehen nur auf diesem Geraet. Der Gast sieht 0 EUR."
//
// Also: 18 im Browser, 0 in der Datenbank. Und localStorage wird an
// genau EINER Stelle beschrieben -- in saveMinOrderValue. Die Funktion
// ist gelaufen. Der Server hat den Wert trotzdem nicht.
//
// Zwei Fehler stecken darin, beide belegbar ohne Server:
//
// 1. 'Prefer: return=minimal' liefert 204, EGAL ob eine Zeile
//    geschrieben wurde. Verweigert RLS die Zeile, antwortet PostgREST
//    mit demselben 204 wie bei Erfolg. Das Dashboard meldete gruen
//    "Mindestbestellwert: 18 EUR" und in der Datenbank stand 0.
//    Der stillste aller Ausfaelle (Regel 6).
//
// 2. Der rote Hinweis riet: "Einmal auf einen der Knoepfe tippen, dann
//    gilt es ueberall." Die Knoepfe heissen Kein / 10 / 15 / 20.
//    Einen 18er gibt es nicht. Wer dem Rat folgte, aenderte seinen
//    Mindestbestellwert auf eine Zahl, die er nie gewollt hat.
//
// Dazu ein dritter, beim Nachsehen gefunden: minOrderOffen() hing als
// oninput am Feld, war aber INNERHALB von saveMinOrderValue definiert
// und wurde erst dort an window gehaengt. Beim allerersten Tippen --
// bevor je ein blur die Funktion gerufen hat -- gab es einen
// ReferenceError statt eines Hinweises.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var a = h.indexOf('var _minKette = Promise.resolve()');
var quelle = a < 0 ? '' : h.slice(a, h.indexOf('\n}\n', h.indexOf('async function saveMinOrderValue', a)) + 3);
t('der Speicher-Block wurde gefunden', quelle.length > 400, quelle.length);

var HAUS = 'rest-1';

// ---- Nachgebaute Umgebung ---------------------------------------------
function bauen(dbWert, antwortGeber) {
    var gesagt = [];
    var felder = {};
    function el(id, wert) {
        felder[id] = {
            id: id, value: wert, textContent: '', style: { display: 'none', cssText: '' },
            kinder: [], type: '',
            appendChild: function (k) { this.kinder.push(k); }
        };
        return felder[id];
    }
    el('settingMinOrder', String(dbWert));
    el('ordersRestaurantSelect', HAUS);
    el('minOrderOffen', '');
    el('minOrderNurLokal', '');

    var speicher = {};
    var ctx = {
        document: {
            getElementById: function (id) { return felder[id] || null; },
            createElement: function (tag) {
                return {
                    tag: tag, textContent: '', type: '', onclick: null,
                    style: { cssText: '' }, kinder: [],
                    appendChild: function (k) { this.kinder.push(k); }
                };
            }
        },
        localStorage: {
            getItem: function (k) { return speicher[k] != null ? speicher[k] : null; },
            setItem: function (k, v) { speicher[k] = String(v); },
            removeItem: function (k) { delete speicher[k]; }
        },
        showToast: function (text, art) { gesagt.push({ text: text, art: art }); },
        kmiToken: function () { return 'tok'; },
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_KEY: 'anon',
        currentOrderRestaurant: null,
        Promise: Promise, JSON: JSON, Number: Number, String: String, Array: Array,
        parseFloat: parseFloat, isFinite: isFinite, console: console, setTimeout: setTimeout,
        fetch: function (url, o) {
            var wert = JSON.parse(o.body).min_order_value;
            return Promise.resolve(antwortGeber(wert, url));
        }
    };
    ctx.APP_DATA = { restaurants: [{ id: HAUS, min_order_value: dbWert }] };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(quelle, ctx);
    ctx.minStandMerken(HAUS, dbWert);
    return { ctx: ctx, gesagt: gesagt, felder: felder, speicher: speicher };
}

function gruen(g) { return g.filter(function (m) { return m.art === 'success'; }); }
function laut(g) { return g.filter(function (m) { return m.art === 'error' || m.art === 'warning'; }); }

// ---- 1. Der Fall Pronto Riepe: 204, aber keine Zeile -------------------
console.log('\n-- Die Datenbank sagt ja und schreibt nichts --');

var leer = bauen(0, function () {
    // Genau das, was PostgREST bei verweigerter RLS liefert.
    return { ok: true, status: 200, json: function () { return Promise.resolve([]); } };
});
leer.felder.settingMinOrder.value = '18';
// Das tut im Browser das oninput am Feld. Fehlt die Funktion, ist das
// ein Befund und kein Grund, den ganzen Lauf abzubrechen.
t('minOrderOffen ist da, bevor je gespeichert wurde',
  typeof leer.ctx.minOrderOffen === 'function', typeof leer.ctx.minOrderOffen);
if (typeof leer.ctx.minOrderOffen === 'function') leer.ctx.minOrderOffen();

leer.ctx.saveMinOrderValue().then(function () {
    t('kein gruenes "gespeichert", wenn keine Zeile zurueckkam',
      gruen(leer.gesagt).length === 0, JSON.stringify(leer.gesagt));
    t('es wird laut gesagt', laut(leer.gesagt).length === 1, JSON.stringify(leer.gesagt));
    t('und der Text nennt das Schreibrecht',
      /Schreibrecht/.test((laut(leer.gesagt)[0] || {}).text || ''), (laut(leer.gesagt)[0] || {}).text);

    // DAS ist, was Ibo auf dem Bildschirm hatte: 18 im Browser, 0 in der DB.
    t('der abgelehnte Wert landet NICHT im Browser-Speicher',
      leer.speicher['kin_min_order_' + HAUS] === undefined,
      leer.speicher['kin_min_order_' + HAUS]);
    t('und auch nicht in APP_DATA',
      leer.ctx.APP_DATA.restaurants[0].min_order_value === 0,
      leer.ctx.APP_DATA.restaurants[0].min_order_value);
    t('der Hinweis "noch nicht gespeichert" bleibt stehen',
      leer.felder.minOrderOffen.style.display === 'block',
      leer.felder.minOrderOffen.style.display);

    // ---- 2. Der alte Weg mit 204 ohne Koerper -------------------------
    console.log('\n-- Ein 204 ohne Zeile zaehlt nicht mehr als Erfolg --');
    var stumm = bauen(0, function () {
        return { ok: true, status: 204, json: function () { return Promise.reject(new Error('kein Koerper')); } };
    });
    stumm.felder.settingMinOrder.value = '18';
    return stumm.ctx.saveMinOrderValue().then(function () {
        t('204 ohne Zeile gilt nicht als gespeichert', gruen(stumm.gesagt).length === 0, JSON.stringify(stumm.gesagt));
        t('der Stand bleibt auf dem DB-Wert', stumm.ctx._minStand[HAUS] === 0, stumm.ctx._minStand[HAUS]);

        // ---- 3. Der gute Fall ----------------------------------------
        console.log('\n-- Kommt die Zeile zurueck, gilt es --');
        var gut = bauen(0, function (w) {
            return { ok: true, status: 200, json: function () { return Promise.resolve([{ id: HAUS, min_order_value: w }]); } };
        });
        gut.felder.settingMinOrder.value = '18';
        return gut.ctx.saveMinOrderValue().then(function () {
            t('jetzt wird Erfolg gemeldet', gruen(gut.gesagt).length === 1, JSON.stringify(gut.gesagt));
            t('der Stand ist 18', gut.ctx._minStand[HAUS] === 18, gut.ctx._minStand[HAUS]);
            t('und der Browser-Speicher zieht nach',
              gut.speicher['kin_min_order_' + HAUS] === '18', gut.speicher['kin_min_order_' + HAUS]);
            t('der Hinweis ist weg', gut.felder.minOrderOffen.style.display === 'none',
              gut.felder.minOrderOffen.style.display);

            // ---- 4. Geschrieben, aber etwas anderes --------------------
            console.log('\n-- Steht etwas anderes drin, gilt das --');
            var anders = bauen(0, function () {
                return { ok: true, status: 200, json: function () { return Promise.resolve([{ id: HAUS, min_order_value: 5 }]); } };
            });
            anders.felder.settingMinOrder.value = '18';
            return anders.ctx.saveMinOrderValue().then(function () {
                t('kein Erfolg gemeldet', gruen(anders.gesagt).length === 0, JSON.stringify(anders.gesagt));
                t('das Feld zeigt, was wirklich drin steht',
                  anders.felder.settingMinOrder.value === 5, anders.felder.settingMinOrder.value);
                t('der Stand folgt der Datenbank', anders.ctx._minStand[HAUS] === 5, anders.ctx._minStand[HAUS]);

                pruefungAbschluss();
            });
        });
    });
}).catch(function (e) {
    t('kein Absturz', false, e && e.stack);
    pruefungAbschluss();
});

function pruefungAbschluss() {
    // ---- 5. Der Hinweis muss befolgbar sein ---------------------------
    console.log('\n-- Der rote Hinweis bietet den eigenen Wert an --');

    var b = bauen(0, function () { return { ok: true, status: 200, json: function () { return Promise.resolve([]); } }; });
    var kasten = b.felder.minOrderNurLokal;
    t('minOrderHinweisBauen gibt es',
      typeof b.ctx.minOrderHinweisBauen === 'function', typeof b.ctx.minOrderHinweisBauen);
    if (typeof b.ctx.minOrderHinweisBauen !== 'function') {
        t('der Hinweis nennt beide Zahlen', false, 'kein Baumeister');
        t('es gibt zwei Knoepfe', false, 'kein Baumeister');
        t('einer traegt den EIGENEN Wert 18', false, 'kein Baumeister');
        t('der andere den Weg zurueck', false, 'kein Baumeister');
        t('der 18er-Knopf traegt 18 ins Feld', false, 'kein Baumeister');
        t('und stoesst das Speichern an', false, 'kein Baumeister');
        t('der Weg zurueck loescht den Browser-Wert', false, 'kein Baumeister');
        t('und blendet die rote Zeile aus', false, 'kein Baumeister');
        return abschlussMelden();
    }
    b.ctx.minOrderHinweisBauen(kasten, 18, 0);

    var alleTexte = [];
    var knoepfe = [];
    kasten.kinder.forEach(function (k) {
        if (k.tag === 'button') { knoepfe.push(k); alleTexte.push(k.textContent); }
        else if (k.kinder && k.kinder.length) {
            k.kinder.forEach(function (kk) { if (kk.tag === 'button') { knoepfe.push(kk); alleTexte.push(kk.textContent); } });
        }
        if (k.textContent) alleTexte.push(k.textContent);
    });
    var zusammen = alleTexte.join(' | ');

    t('der Hinweis nennt beide Zahlen', /18/.test(zusammen) && /0/.test(zusammen), zusammen);
    t('es gibt zwei Knoepfe', knoepfe.length === 2, knoepfe.length);
    t('einer traegt den EIGENEN Wert 18', /18/.test(knoepfe[0] ? knoepfe[0].textContent : ''), zusammen);
    t('der andere den Weg zurueck', /0/.test(knoepfe[1] ? knoepfe[1].textContent : ''), zusammen);

    // Der Knopf muss auch etwas TUN.
    var gerufen = 0;
    b.ctx.saveMinOrderValue = function () { gerufen++; return Promise.resolve(); };
    if (knoepfe[0] && knoepfe[0].onclick) knoepfe[0].onclick();
    t('der 18er-Knopf traegt 18 ins Feld', b.felder.settingMinOrder.value === 18, b.felder.settingMinOrder.value);
    t('und stoesst das Speichern an', gerufen === 1, gerufen);

    // Der Weg zurueck raeumt wirklich auf.
    b.speicher['kin_min_order_' + HAUS] = '18';
    if (knoepfe[1] && knoepfe[1].onclick) knoepfe[1].onclick();
    t('der Weg zurueck loescht den Browser-Wert',
      b.speicher['kin_min_order_' + HAUS] === undefined, b.speicher['kin_min_order_' + HAUS]);
    t('und blendet die rote Zeile aus', kasten.style.display === 'none', kasten.style.display);

    // ---- 6. Der tote Rat darf nicht zurueckkommen ---------------------
    t('der Rat "auf einen der Knoepfe tippen" steht nicht mehr da',
      h.indexOf('Knöpfe tippen') === -1 && h.indexOf('Knöpfe tippen') === -1,
      'der Hinweis riet zu Knoepfen, die es fuer 18 nicht gibt');

    // ---- 7. minOrderOffen muss vor dem ersten blur da sein ------------
    console.log('\n-- Der Hinweis beim allerersten Tippen --');

    var frisch = bauen(0, function () { return { ok: true, status: 200, json: function () { return Promise.resolve([]); } }; });
    t('minOrderOffen gibt es, OHNE dass vorher gespeichert wurde',
      typeof frisch.ctx.minOrderOffen === 'function', typeof frisch.ctx.minOrderOffen);
    if (typeof frisch.ctx.minOrderOffen === 'function') {
        frisch.ctx.minOrderOffen();
        t('und es zeigt den Hinweis auch beim ersten Mal',
          frisch.felder.minOrderOffen.style.display === 'block',
          frisch.felder.minOrderOffen.style.display);
    } else {
        t('und es zeigt den Hinweis auch beim ersten Mal', false, 'nicht vorhanden');
    }

    // Im Quelltext: die Helfer stehen ausserhalb von saveMinOrderValue.
    var vorSave = quelle.slice(0, quelle.indexOf('async function saveMinOrderValue'));
    t('minOrderOffen ist auf oberster Ebene definiert',
      vorSave.indexOf('function minOrderOffen') !== -1, 'steht noch in saveMinOrderValue');

    // ---- 8. Der Bau selbst -------------------------------------------
    console.log('\n-- Der Bau selbst --');
    t('es wird return=representation verlangt',
      /return=representation/.test(quelle), 'noch return=minimal');
    // Kommentarzeilen weg: sonst trifft der Test meinen eigenen
    // Erklaertext ("'return=representation' statt 'return=minimal'")
    // statt des Codes -- so ein Test prueft nichts.
    var ohneKommentar = quelle.split('\n').filter(function (z) {
        return z.trim().indexOf('//') !== 0;
    }).join('\n');
    t('return=minimal kommt nicht mehr vor',
      ohneKommentar.indexOf('return=minimal') === -1, 'minimal steht noch im Code');
    t('die geaenderte Spalte wird mit angefordert',
      /select=id,min_order_value/.test(quelle), 'kein select in der URL');

    abschlussMelden();
}

function abschlussMelden() {
    console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exit(1);
}
