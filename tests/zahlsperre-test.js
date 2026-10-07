// WENN EINE RECHNUNG OFFEN BLEIBT -- drei Stufen, von Hand.
//
// Ibo am 24.09.2026: "wenn Kunden nicht bezahlen, dass ich mit einem
// Knopf es schliesse, nur der Admin ... drei Stufen ist gut ... ich will
// es selber steuern".
//
//     keine     alles normal
//     hinweis   roter Balken im Dashboard, nur der Wirt sieht ihn
//     pause     der Gast kann nicht bestellen; RESERVIEREN GEHT WEITER,
//               das Dashboard bleibt offen
//     aus       beides zu
//
// Das Dashboard wird NIE gesperrt: Bestellungen kaemen weiter herein, der
// Gast saehe eine normale Seite -- und niemand wuerde kochen.
//
// Die wichtigste Zusicherung hier ist die letzte Gruppe: IM ZWEIFEL
// OFFEN. Ein Fehler, der einen zahlenden Kunden am Freitagabend
// aussperrt, kostet diesen Kunden.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const KMI = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
const FN = path.join(KMI, 'netlify', 'functions', 'zahlsperre.js');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

// Die echten Funktionen aus index.html ausfuehren.
const welt = { window: {}, console: console };
welt.window = welt;
vm.createContext(welt);
vm.runInContext(H.slice(H.indexOf('var ZAHLSPERRE_STUFEN'),
                        H.indexOf('window.zahlsperreGastText = zahlsperreGastText;')), welt);

console.log('-- Die vier Stufen --');
const FAELLE = [
    ['keine',   false, false],
    ['hinweis', false, false],   // der Gast merkt NICHTS
    ['pause',   true,  false],   // bestellen zu, reservieren offen
    ['aus',     true,  true]
];
FAELLE.forEach(function (f) {
    const r = { zahlsperre: f[0] };
    t('"' + f[0] + '": bestellen ' + (f[1] ? 'zu' : 'offen'),
      welt.zahlsperreBestellenAus(r) === f[1], welt.zahlsperreBestellenAus(r));
    t('"' + f[0] + '": reservieren ' + (f[2] ? 'zu' : 'offen'),
      welt.zahlsperreReservierenAus(r) === f[2], welt.zahlsperreReservierenAus(r));
});
t('bei "hinweis" merkt der Gast NICHTS -- das ist der Sinn der Stufe',
  !welt.zahlsperreBestellenAus({ zahlsperre: 'hinweis' })
  && !welt.zahlsperreReservierenAus({ zahlsperre: 'hinweis' })
  && welt.zahlsperreGastText({ zahlsperre: 'hinweis' }) === '', 'Gast sieht etwas');
t('bei "pause" steht ausdruecklich, dass Reservieren weiter geht',
  /reservieren geht weiter/i.test(welt.zahlsperreGastText({ zahlsperre: 'pause' })),
  welt.zahlsperreGastText({ zahlsperre: 'pause' }));

console.log('\n-- Kein Wort ueber Rechnungen vor dem Gast --');
// Das geht ihn nichts an, und es beschaedigt den Betrieb vor seinen
// eigenen Gaesten.
['pause', 'aus'].forEach(function (st) {
    const txt = welt.zahlsperreGastText({ zahlsperre: st });
    t('"' + st + '": der Gasttext nennt weder Rechnung noch Zahlung noch Sperre',
      !/rechnung|bezahl|zahlung|gesperrt|sperre|schuld/i.test(txt), txt);
});

console.log('\n-- IM ZWEIFEL OFFEN --');
// Ein Fehler darf nie einen zahlenden Kunden aussperren.
const ZWEIFEL = [
    ['Feld fehlt ganz',        {}],
    ['null',                   { zahlsperre: null }],
    ['leerer Text',            { zahlsperre: '' }],
    ['unbekannter Wert',       { zahlsperre: 'irgendwas' }],
    ['Zahl statt Text',        { zahlsperre: 1 }],
    ['ganzes Restaurant fehlt', null]
];
ZWEIFEL.forEach(function (f) {
    t(f[0] + ' -> alles offen',
      welt.zahlsperreStufe(f[1]) === 'keine'
      && !welt.zahlsperreBestellenAus(f[1]) && !welt.zahlsperreReservierenAus(f[1]),
      welt.zahlsperreStufe(f[1]));
});
t('Grossschreibung zaehlt trotzdem -- PAUSE ist pause',
  welt.zahlsperreStufe({ zahlsperre: 'PAUSE' }) === 'pause', welt.zahlsperreStufe({ zahlsperre: 'PAUSE' }));

// ---- Die Function --------------------------------------------------
async function ruf(koerper, opt) {
    opt = opt || {};
    const gesendet = [];
    const altFetch = global.fetch;
    const altKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_SERVICE_KEY = opt.ohneKey ? '' : 'dienst-schluessel';
    delete require.cache[require.resolve(FN)];
    global.fetch = function (url, o) {
        const u = String(url);
        gesendet.push({ url: u, opt: o || {} });
        const antwort = (status, koerper) => Promise.resolve({
            ok: status >= 200 && status < 300, status: status,
            json: () => Promise.resolve(koerper),
            text: () => Promise.resolve(JSON.stringify(koerper))
        });
        if (/\/auth\/v1\/user/.test(u)) {
            return opt.keinNutzer ? antwort(401, {}) : antwort(200, { email: 'ibo@example.de' });
        }
        if (/customers\?role=eq\.superadmin/.test(u)) {
            return antwort(200, opt.keinAdmin ? [] : [{ email: 'ibo@example.de' }]);
        }
        if (/restaurants/.test(u)) {
            if (opt.spalteFehlt) return Promise.resolve({ ok: false, status: 400,
                text: () => Promise.resolve('{"message":"column restaurants.zahlsperre does not exist"}') });
            if (opt.nichtGetroffen) return antwort(200, []);
            return antwort(200, [{ id: 'r1', name: 'Test', zahlsperre: (koerper || {}).stufe }]);
        }
        return antwort(200, {});
    };
    const modul = require(FN);
    try {
        const e = await modul.handler({
            httpMethod: opt.methode || 'POST',
            queryStringParameters: opt.action ? { action: opt.action } : {},
            headers: opt.ohneToken ? {} : { authorization: 'Bearer sitzungs-token' },
            body: JSON.stringify(koerper || {})
        });
        return { antwort: e, koerper: JSON.parse(e.body), gesendet: gesendet };
    } finally {
        global.fetch = altFetch;
        if (altKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
        else process.env.SUPABASE_SERVICE_KEY = altKey;
    }
}

(async function () {
    console.log('\n-- Nur der Verwalter darf --');
    const gut = await ruf({ restaurant_id: 'r1', stufe: 'pause' });
    t('der Superadmin darf setzen', gut.koerper.ok === true, gut.koerper);

    for (const [name, opt] of [
        ['ohne Token', { ohneToken: true }],
        ['mit ungueltiger Sitzung', { keinNutzer: true }],
        ['als angemeldeter Wirt (kein superadmin)', { keinAdmin: true }]
    ]) {
        const r = await ruf({ restaurant_id: 'r1', stufe: 'aus' }, opt);
        t(name + ': 403', r.antwort.statusCode === 403, r.antwort.statusCode);
        t(name + ': und es wurde NICHTS geschrieben',
          !r.gesendet.some(g => (g.opt.method || 'GET') === 'PATCH'), 'doch geschrieben');
    }

    console.log('\n-- Was gesetzt werden darf --');
    const quatsch = await ruf({ restaurant_id: 'r1', stufe: 'geloescht' });
    t('eine erfundene Stufe wird abgewiesen',
      quatsch.antwort.statusCode === 400 && !quatsch.gesendet.some(g => g.opt.method === 'PATCH'),
      quatsch.koerper);
    const ohneId = await ruf({ stufe: 'pause' });
    t('ohne restaurant_id: 400', ohneId.antwort.statusCode === 400, ohneId.koerper);

    console.log('\n-- "keine" raeumt die Spuren mit weg --');
    // Sonst steht spaeter ein Datum da, zu dem es keine Sperre mehr gibt.
    const frei = await ruf({ restaurant_id: 'r1', stufe: 'keine', notiz: 'egal' });
    const patch = frei.gesendet.filter(g => g.opt.method === 'PATCH')[0];
    const gesetzt = JSON.parse(patch.opt.body);
    t('zahlsperre_seit wird geleert', gesetzt.zahlsperre_seit === null, gesetzt);
    t('die Notiz auch', gesetzt.zahlsperre_notiz === null, gesetzt);
    const sperre = await ruf({ restaurant_id: 'r1', stufe: 'pause', notiz: 'Rechnung 2026-09' });
    const g2 = JSON.parse(sperre.gesendet.filter(g => g.opt.method === 'PATCH')[0].opt.body);
    t('beim Sperren wird ein Zeitpunkt gesetzt', !!g2.zahlsperre_seit, g2);
    t('und die Notiz uebernommen', g2.zahlsperre_notiz === 'Rechnung 2026-09', g2);

    console.log('\n-- Ein 204 gilt nicht als Beweis --');
    // Bei einer Abschaltung ist "vielleicht gesetzt" nicht gut genug.
    const daneben = await ruf({ restaurant_id: 'gibt-es-nicht', stufe: 'aus' }, { nichtGetroffen: true });
    t('trifft der Schreibzugriff keine Zeile, ist es ein Fehler',
      daneben.antwort.statusCode === 500 && /gibt es nicht|verworfen/.test(daneben.koerper.fehler),
      daneben.koerper);
    const q = fs.readFileSync(FN, 'utf8');
    t('dafuer wird return=representation verlangt',
      /return=representation/.test(q), 'glaubt dem Status');

    console.log('\n-- Fehlt das SQL, wird es gesagt --');
    const ohneSql = await ruf({ restaurant_id: 'r1', stufe: 'pause' }, { spalteFehlt: true });
    t('die Meldung nennt SQL 36', /SQL 36/.test(ohneSql.koerper.fehler || ''), ohneSql.koerper);

    console.log('\n-- Von Hand, nie automatisch --');
    // Eine Automatik sperrt irgendwann einen aus, der laengst ueberwiesen hat.
    t('die Function kennt keinen Zeitplan',
      !/schedule|cron|setInterval|setTimeout/.test(q), 'es gibt eine Automatik');
    const toml = fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8');
    t('und sie steht in keinem Zeitplan in netlify.toml',
      !/zahlsperre/.test(toml), 'zahlsperre ist eingeplant');

    console.log('\n-- Das SQL entzieht das Schreibrecht --');
    // Der Wirt darf seine Zeile aendern -- aber nicht diese Spalte.
    const sql = fs.readFileSync(path.join(KMI, 'datenbank', '36-zahlsperre.sql'), 'utf8');
    t('revoke update auf die drei Spalten',
      /revoke update \(zahlsperre, zahlsperre_seit, zahlsperre_notiz\)/i.test(sql), 'kein revoke');
    t('und zwar fuer anon UND authenticated',
      /from anon, authenticated/i.test(sql), 'nur fuer einen');
    t('die erlaubten Stufen stehen als Regel in der Datenbank',
      /check \(zahlsperre in \('keine', 'hinweis', 'pause', 'aus'\)\)/i.test(sql), 'keine Regel');
    t('Voreinstellung ist "keine"', /default 'keine'/i.test(sql), 'faengt gesperrt an');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
