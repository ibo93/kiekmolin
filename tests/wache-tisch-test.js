// KOMMT DER TISCH IN DER KUECHE AN?
//
// Am 06.10.2026 gefragt: "ich will wissen ob alles geht" -- zum Tisch-QR.
// Die Antwort war: das weiss niemand. Die Gastweg-Wache bestellte seit
// dem 25.08. alle 15 Minuten, aber immer als Abholung. In der ganzen
// Datei stand kein "tisch", kein "dine_in", kein "table_number".
//
// DIESER TEST LIEST NICHT NUR, ER LAESST LAUFEN.
// Die Pruefung bekommt einen nachgebauten Server und muss in jedem Fall
// das Richtige sagen -- auch und gerade dann, wenn etwas kaputt ist. Ein
// Test, der nur den Quelltext liest, haette nie gemerkt, dass
// "gespeichert" und "angekommen" zwei verschiedene Dinge sind. Genau das
// ist der Fehler, den diese Pruefung finden soll: der selbstheilende
// Insert in order-save wirft eine Spalte still heraus, und die Bestellung
// steht ohne Tisch in der Kueche.
//
// KEIN npm IN DER CI. lib/alarm.js laedt 'web-push' -- das gibt es dort
// nicht. Deshalb wird jedes fremde Paket ueber Module._load abgefangen,
// bevor die Wache geladen wird. Ohne das stuerzte die Datei in der CI ab
// und alle Pruefungen darunter liefen nie.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - das Nachlesen aus der Pruefung entfernt
//   - table_number als Text "99" geschickt statt als Zahl
//   - order_type auf 'pickup' gestellt
//   - den Vergleich auf === mit der Zahl umgestellt (Textspalte -> Fehlalarm)
//   - die Pruefung aus der Liste PRUEFUNGEN genommen
'use strict';
var path = require('path');
var Module = require('module');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

// ---- Fremde Pakete und den Alarm abfangen ---------------------------------
var echtLaden = Module._load;
Module._load = function (anfrage, eltern, istHaupt) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    if (/[\\/]lib[\\/]alarm$/.test(anfrage) || anfrage === './lib/alarm') {
        return { senden: async function () {} };
    }
    return echtLaden.apply(this, arguments);
};

process.env.SUPABASE_SERVICE_KEY = 'test-schluessel';
process.env.URL = 'https://beispiel.test';

var W;
try {
    W = require(path.join(KMI, 'netlify', 'functions', 'gastweg-wache.js'));
} catch (e) {
    console.log('FAIL | die Wache laesst sich nicht laden  -> ' + e.message);
    process.exit(1);
}
Module._load = echtLaden;

var I = W._intern || {};
t('die Wache gibt ihre Pruefung fuer den Test heraus', typeof I.pruefeTischBestellung === 'function', Object.keys(I));
if (typeof I.pruefeTischBestellung !== 'function') {
    console.log('\n' + (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'); process.exit(1);
}

// ---- Ein nachgebauter Server ----------------------------------------------
// antwortSpeichern: was order-save sagt. zeile: was beim Nachlesen kommt.
function server(opt) {
    var protokoll = { gesendet: null, nachgelesen: false, adressen: [] };
    global.fetch = async function (url, init) {
        protokoll.adressen.push(String(url));
        if (opt.netzWeg) throw new Error('getaddrinfo ENOTFOUND');
        if (/order-save/.test(url)) {
            protokoll.gesendet = JSON.parse(init.body);
            var a = opt.antwortSpeichern || { ok: true, id: 'probe-123' };
            return { status: opt.statusSpeichern || 200, ok: (opt.statusSpeichern || 200) < 400,
                     json: async function () { return a; } };
        }
        if (/\/rest\/v1\/orders\?id=eq\./.test(url)) {
            protokoll.nachgelesen = true;
            if (opt.nachlesenStatus) return { ok: false, status: opt.nachlesenStatus, json: async function () { return null; } };
            return { ok: true, status: 200, json: async function () { return opt.zeilen; } };
        }
        return { ok: false, status: 404, json: async function () { return null; } };
    };
    return protokoll;
}

async function lauf(opt) {
    var p = server(opt);
    var erg;
    try { erg = await I.pruefeTischBestellung('haus-1'); }
    catch (e) { erg = 'ABSTURZ: ' + e.message; }
    return { erg: erg, p: p };
}

(async function () {

console.log('\n-- 1. Was die Probe schickt --');
var r = await lauf({ zeilen: [{ order_type: 'dine_in', table_number: 99 }] });
var o = (r.p.gesendet && r.p.gesendet.order) || {};
t('sie geht ueber die Gaeste-Tuer order-save, wie ein echter Gast',
  r.p.adressen.some(function (u) { return /\/\.netlify\/functions\/order-save$/.test(u); }), r.p.adressen);
t('sie bestellt VOR ORT', o.order_type === 'dine_in', o.order_type);
t('mit einer Tischnummer', o.table_number != null, o.table_number);
t('als ZAHL -- genau wie der Browser (parseInt aus ?tisch=)', typeof o.table_number === 'number', typeof o.table_number);
t('mit einem Tisch, den es in keinem Lokal gibt', o.table_number === I.PROBE_TISCH && I.PROBE_TISCH >= 50, o.table_number);
t('unter dem Probe-Namen -- sonst raeumt niemand sie weg',
  o.customer_name === I.PROBE_NAME && /^\[Probe\]/.test(o.customer_name), o.customer_name);
t('und die Bestellnummer passt in die Spalte (hoechstens 20 Zeichen)',
  typeof o.order_number === 'string' && o.order_number.length <= 20, o.order_number);

console.log('\n-- 2. Alles heil --');
t('Tisch kommt an, Bestellart kommt an -> kein Alarm', r.erg === null, r.erg);
t('und sie hat WIRKLICH nachgelesen -- "gespeichert" reicht nicht', r.p.nachgelesen === true, r.p.nachgelesen);

var r2 = await lauf({ zeilen: [{ order_type: 'dine_in', table_number: '99' }] });
t('Textspalte liefert "99" statt 99 -> trotzdem kein Fehlalarm', r2.erg === null, r2.erg);

console.log('\n-- 3. Die Faelle, fuer die es diese Pruefung gibt --');
var r3 = await lauf({ zeilen: [{ order_type: 'dine_in', table_number: null }] });
t('Tischnummer unterwegs verloren -> Alarm', typeof r3.erg === 'string', r3.erg);
t('und der Alarm sagt, was das in der Kueche heisst',
  typeof r3.erg === 'string' && /Tischnummer/.test(r3.erg) && /Kueche/.test(r3.erg), r3.erg);

var r4 = await lauf({ zeilen: [{ order_type: 'dine_in', table_number: 7 }] });
t('falsche Tischnummer angekommen -> Alarm', typeof r4.erg === 'string' && /Tischnummer/.test(r4.erg), r4.erg);

var r5 = await lauf({ zeilen: [{ order_type: 'pickup', table_number: 99 }] });
t('aus "vor Ort" wurde Abholung -> Alarm', typeof r5.erg === 'string' && /vor Ort/.test(r5.erg), r5.erg);

var r6 = await lauf({ zeilen: [{ order_type: null, table_number: 99 }] });
t('Bestellart ganz weg -> Alarm', typeof r6.erg === 'string', r6.erg);

console.log('\n-- 4. Wenn schon das Speichern klemmt --');
var r7 = await lauf({ statusSpeichern: 423, antwortSpeichern: { ok: false, error: 'Bestellungen pausiert' } });
t('Zahlsperre / abgewiesen -> Alarm mit Grund',
  typeof r7.erg === 'string' && /Bestellen am Tisch/.test(r7.erg) && /pausiert/.test(r7.erg), r7.erg);
t('und dann wird gar nicht erst nachgelesen', r7.p.nachgelesen === false, r7.p.nachgelesen);

var r8 = await lauf({ antwortSpeichern: { ok: true } });
t('"ok" ohne id -> Alarm, nicht stilles Gruen', typeof r8.erg === 'string', r8.erg);

var r9 = await lauf({ netzWeg: true });
t('Server nicht erreichbar -> Alarm statt Absturz',
  typeof r9.erg === 'string' && r9.erg.indexOf('ABSTURZ') !== 0, r9.erg);

console.log('\n-- 5. Wenn das Nachlesen klemmt --');
var r10 = await lauf({ zeilen: [] });
t('gespeichert gemeldet, aber nicht auffindbar -> Alarm', typeof r10.erg === 'string' && /nicht auffindbar/.test(r10.erg), r10.erg);
var r11 = await lauf({ nachlesenStatus: 500 });
t('Nachlesen mit HTTP 500 -> Alarm mit Code', typeof r11.erg === 'string' && /500/.test(r11.erg), r11.erg);

console.log('\n-- 6. Sie laeuft auch wirklich --');
var liste = (I.PRUEFUNGEN || []).map(function (p) { return p.kennung; });
t('sie steht in der Liste der Pruefungen', liste.indexOf('wache-tisch') >= 0, liste);
t('mit eigener Kennung -- sonst verschluckt ein bekannter Alarm diesen neuen',
  liste.filter(function (k) { return k === 'wache-tisch'; }).length === 1, liste);
t('und die sieben bisherigen sind alle noch da',
  ['wache-seite', 'wache-reservieren', 'wache-bestellen', 'wache-preis', 'wache-mindest',
   'wache-vorbestellung', 'wache-mail'].every(function (k) { return liste.indexOf(k) >= 0; }), liste);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
})();
