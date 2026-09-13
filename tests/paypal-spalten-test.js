// KAM SQL 30 GANZ AN -- ODER NUR HALB?
//
// Ibo am 13.09.2026: "ist drin...sql".
//
// Das Skript 30-paypal-konto.sql macht zwei Dinge nacheinander: erst legt
// es die Tabelle paypal_konten an, DANACH haengt es zwei Spalten an
// orders. Bricht es dazwischen ab, gibt es die Tabelle -- und die Spalten
// nicht. Genau dieser halbe Zustand war am 13.09. um 16:44 messbar: die
// Tabelle antwortete mit 200, die Spalten hatte nie jemand angefragt.
//
// WARUM DAS NIEMANDEM AUFFAELLT
//
// bestellungSchreiben() wirft eine fehlende Spalte absichtlich raus,
// damit eine bereits bezahlte Bestellung nicht verlorengeht. Das ist
// richtig -- das Geld ist schon weg. Aber es heisst auch: die Bestellung
// kommt an, sieht normal aus, und hat keinen Zahlungsnachweis. Und
// schonGebucht() kann ohne payment_reference nicht mehr erkennen, dass
// eine Zahlung schon gebucht wurde. Zweimal Zurueck im Browser, zwei
// Bestellungen, einmal Geld.
//
// "Wie sieht das aus, wenn es kaputt ist?" -- wie normal. Regel 6.
//
// Darum prueft die Funktion nach und das Dashboard sagt es.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var fn = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'paypal-zahlung.js'), 'utf8');
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- 1. Die Pruefung gibt es und sie fragt die richtigen Spalten ------
console.log('\n-- Die Pruefung --');
t('es gibt spaltenDa()', /async function spaltenDa\s*\(/.test(fn), 'fehlt');
t('sie fragt BEIDE Spalten ab -- eine allein beweist die andere nicht',
  /orders\?select=payment_status,payment_reference&limit=1/.test(fn), 'fragt zu wenig');
t('sie holt nur eine Zeile, nicht die ganze Tabelle',
  /payment_reference&limit=1/.test(fn), 'laedt alles');

// ---- 2. Sie laeuft wirklich -- nicht nur im Quelltext -----------------
//
// Ein Textvergleich haette auch eine Funktion gruen gemeldet, die es gar
// nicht bis in den Aufruf schafft. Also: herausschneiden und ausfuehren.
console.log('\n-- Sie laeuft (echt ausgefuehrt) --');

function schneide(quelle, kopfZeile) {
    var a = quelle.indexOf(kopfZeile);
    if (a === -1) return null;
    var i = quelle.indexOf('{', a), tiefe = 0;
    for (var j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    return null;
}

var quelleSpalten = schneide(fn, 'async function spaltenDa');
t('spaltenDa() laesst sich herausschneiden', !!quelleSpalten, 'Klammern gehen nicht auf');

function bauen(antwort, wirft) {
    var protokoll = [];
    var f = new Function('fetch', 'SUPABASE_URL', 'kopf', 'console',
        quelleSpalten + '; return spaltenDa;')(
        function (url) {
            protokoll.push(url);
            if (wirft) return Promise.reject(new Error('Netz weg'));
            return Promise.resolve(antwort);
        },
        'https://x.supabase.co',
        function () { return {}; },
        { warn: function () {}, error: function () {} }
    );
    return { f: f, protokoll: protokoll };
}

var b1 = bauen({ ok: true, status: 200, text: function () { return Promise.resolve('[]'); } });
var b2 = bauen({ ok: false, status: 400, text: function () { return Promise.resolve('{"message":"column orders.payment_status does not exist","code":"PGRST204"}'); } });
var b3 = bauen({ ok: false, status: 503, text: function () { return Promise.resolve('gateway'); } });
var b4 = bauen(null, true);

Promise.all([b1.f(), b2.f(), b3.f(), b4.f()]).then(function (r) {
    t('Spalten da  -> true', r[0] === true, String(r[0]));
    t('400 mit "does not exist" -> false (gemessen: sie fehlen)', r[1] === false, String(r[1]));
    t('503 -> null, NICHT false -- kaputter Server ist kein Beweis',
      r[2] === null, String(r[2]) + ' (false hier waere eine Falschmeldung)');
    t('Netz weg -> null, NICHT false', r[3] === null, String(r[3]));
    t('sie fragt wirklich orders ab', /\/rest\/v1\/orders\?select=payment_status/.test(b1.protokoll[0] || ''), b1.protokoll[0] || 'keine Anfrage');

    weiter();
});

function weiter() {
// ---- 3. Der Gast bezahlt das nicht mit ------------------------------
console.log('\n-- Nur das Dashboard fragt --');
var kontoBlock = fn.slice(fn.indexOf("if (aktion === 'konto')"), fn.indexOf("// ---------------- 1. Zahlung anlegen"));
t('der Block wurde gefunden', kontoBlock.length > 50 && kontoBlock.length < 2000, 'Laenge ' + kontoBlock.length);
t('geprueft wird NUR bei pruefen:true -- sonst kostet es jeden Gast eine Anfrage',
  /if \(body\.pruefen === true\) antwort0\.spalten = await spaltenDa\(\);/.test(kontoBlock), 'laeuft immer');
var setzt = (kontoBlock.match(/^.*antwort0\.spalten\s*=.*$/gm) || []);
t('spalten wird genau einmal gesetzt', setzt.length === 1, setzt.length + ' Stellen');
t('und diese eine Stelle haengt an pruefen === true',
  setzt.length === 1 && /if \(body\.pruefen === true\)/.test(setzt[0]), setzt[0] || 'keine');

// ---- 4. Das Dashboard fragt auch danach ------------------------------
console.log('\n-- Das Dashboard --');
var laden = schneide(h, 'async function ppcStatusLaden(restId)');
t('ppcStatusLaden gefunden', !!laden, 'fehlt');
t('es schickt pruefen:true mit', /restaurant_id: restId, pruefen: true/.test(laden || ''), 'fragt nie nach');
t('und wertet die Antwort aus', /ppcSpaltenWarnen\(/.test(laden || ''), 'Antwort wird weggeworfen');

// ---- 5. Die Warnung sagt das Richtige -- und nur wenn gemessen -------
console.log('\n-- Die Warnung (echt ausgefuehrt) --');
var quelleWarn = schneide(h, 'function ppcSpaltenWarnen(spalten)');
t('ppcSpaltenWarnen gefunden', !!quelleWarn, 'fehlt');

function lauf(wert, vorher) {
    var el = { textContent: vorher || '', style: { color: '' } };
    var f = new Function('document', quelleWarn + '; return ppcSpaltenWarnen;')({
        getElementById: function (id) { return id === 'ppcMeldungDash' ? el : null; }
    });
    f(wert);
    return el;
}

var rot = lauf(false);
t('fehlt gemessen -> es steht da, dass die Spalten fehlen',
  /payment_status/.test(rot.textContent) && /payment_reference/.test(rot.textContent), rot.textContent.slice(0, 60));
t('und es steht da, WAS dann schiefgeht -- nicht nur ein Spaltenname',
  /zweimal eine Bestellung/.test(rot.textContent), 'Wirt weiss nicht, was das bedeutet');
t('und was zu tun ist', /30-paypal-konto\.sql/.test(rot.textContent), 'kein Weg raus');
t('die Warnung ist rot', rot.style.color === '#b91c1c', rot.style.color);

t('nicht gemessen (undefined) -> keine Behauptung',
  lauf(undefined).textContent === '', 'behauptet etwas Ungemessenes');
t('nicht messbar (null) -> keine Behauptung',
  lauf(null).textContent === '', 'null wird wie false behandelt');
t('nicht gemessen loescht auch keine bestehende Meldung',
  lauf(undefined, 'Wird bei PayPal geprüft…').textContent === 'Wird bei PayPal geprüft…', 'wischt fremde Meldung weg');
t('alles da -> die eigene Warnung verschwindet wieder',
  lauf(true, 'fehlen payment_status und payment_reference').textContent === '', 'Warnung bleibt stehen');
t('alles da -> fremde Meldungen bleiben aber stehen',
  lauf(true, 'Gespeichert.').textContent === 'Gespeichert.', 'loescht fremde Meldung');

// ---- 6. Auslieferung --------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 33 -- sonst behaelt der Browser das alte Dashboard',
  !!m && Number(m[1]) >= 33, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
}
