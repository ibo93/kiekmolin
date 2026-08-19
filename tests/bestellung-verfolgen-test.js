// Prueft den Endpunkt, ueber den ein Gast seine eigene Bestellung abholt.
//
// Der Endpunkt ersetzt eine Abfrage, die nach Telefonnummer suchte. Der
// wichtigste Test ist deshalb nicht "findet er die Bestellung", sondern:
// findet er sie AUSSCHLIESSLICH ueber das Geheimnis -- und laesst sich das
// Geheimnis nicht durch etwas anderes ersetzen.

var KMI = require('path').join(__dirname, '..');
var PF = KMI + '/netlify/functions/order-track.js';

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var GEFRAGT = [];
var ANTWORT = { ok: true, rows: [] };

global.fetch = async function (url) {
    GEFRAGT.push(String(url));
    if (ANTWORT.status && ANTWORT.status >= 400) {
        return {
            ok: false, status: ANTWORT.status,
            text: async function () { return ANTWORT.text || ''; },
            json: async function () { return {}; }
        };
    }
    var tabelle = /\/rest\/v1\/([a-z_]+)/.exec(String(url))[1];
    return {
        ok: true, status: 200,
        text: async function () { return ''; },
        json: async function () { return (ANTWORT.rows || []).filter(function (r) { return r._tabelle === tabelle; }); }
    };
};

function laden(dienstschluessel) {
    delete require.cache[require.resolve(PF)];
    if (dienstschluessel === null) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = dienstschluessel;
    return require(PF).handler;
}

async function ruf(query, schluessel) {
    GEFRAGT = [];
    var hd = laden(schluessel === undefined ? 'dienst-schluessel' : schluessel);
    var r = await hd({ httpMethod: 'GET', queryStringParameters: query });
    return { code: r.statusCode, body: JSON.parse(r.body || '{}'), gefragt: GEFRAGT };
}

var T1 = 'a'.repeat(32);
var T2 = 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

(async function () {

console.log('\n-- Ohne Geheimnis gibt es nichts --');

var r = await ruf({});
t('ohne Kennzeichen: 400, und die Datenbank wird gar nicht erst gefragt',
  r.code === 400 && r.gefragt.length === 0, r.code + ' / ' + r.gefragt.length);

r = await ruf({ b: 'kurz' });
t('ein zu kurzes Kennzeichen zaehlt nicht als Kennzeichen',
  r.code === 400 && r.gefragt.length === 0, r.code);

r = await ruf({ b: 'ZZZZ' + 'a'.repeat(28) });
t('Zeichen ausserhalb von 0-9a-f fliegen raus', r.code === 400, r.code);

// Der klassische Versuch, aus einem Parameter eine zweite Abfrage zu machen.
r = await ruf({ b: '*' });
t('ein Sternchen ist kein Kennzeichen (kein Rundumschlag)',
  r.code === 400 && r.gefragt.length === 0, JSON.stringify(r.body));

r = await ruf({ b: 'a'.repeat(32) + ')&customer_phone=ilike.*49*&x=(' });
t('ein angehaengter Filter wird nicht mitgeschickt',
  r.code === 400 && r.gefragt.length === 0, r.gefragt[0]);

console.log('\n-- Mit Geheimnis --');

ANTWORT = { rows: [{ _tabelle: 'orders', id: '1', order_number: 'B-100', track_token: T1 }] };
r = await ruf({ b: T1 });
t('gueltiges Kennzeichen: 200', r.code === 200, r.code);
t('gefragt wird ueber track_token, nicht ueber die Telefonnummer',
  /track_token=in\.\(/.test(r.gefragt[0]) && !/customer_phone=/.test(r.gefragt.join(' ')), r.gefragt[0]);
t('die Bestellung kommt zurueck', r.body.bestellungen.length === 1 && r.body.bestellungen[0].order_number === 'B-100');

r = await ruf({ b: T1.toUpperCase() });
t('Grossbuchstaben werden angenommen (Link aus der Mail)',
  r.code === 200 && r.gefragt[0].indexOf(T1) >= 0, r.gefragt[0]);

r = await ruf({ b: T1 + ',' + T2 });
t('mehrere Kennzeichen in einem Aufruf', /track_token=in\.\([0-9a-f,]+\)/.test(r.gefragt[0]) &&
  r.gefragt[0].indexOf(T1) > 0 && r.gefragt[0].indexOf(T2) > 0, r.gefragt[0]);

r = await ruf({ b: T1 + ',unsinn,' + T2 });
t('Unsinn dazwischen wird weggeworfen, der Rest zaehlt',
  r.code === 200 && !/unsinn/.test(r.gefragt[0]), r.gefragt[0]);

var viele = [];
for (var i = 0; i < 40; i++) viele.push(String(i).padStart(32, '0'));
r = await ruf({ b: viele.join(',') });
// Nur die Kommas IM Filter zaehlen -- die Feldliste des select hat auch welche.
var wieviele = /track_token=in\.\(([^)]*)\)/.exec(r.gefragt[0])[1].split(',').length;
t('hoechstens 20 Kennzeichen pro Aufruf', wieviele <= 20, wieviele);

console.log('\n-- Reservierungen --');

ANTWORT = { rows: [
    { _tabelle: 'orders', id: '1', track_token: T1 },
    { _tabelle: 'reservations', id: '9', track_token: T2 }
] };
r = await ruf({ b: T1, r: T2 });
t('beides in einem Aufruf',
  r.body.bestellungen.length === 1 && r.body.reservierungen.length === 1, JSON.stringify(r.body));
t('Reservierungen werden ebenfalls ueber das Geheimnis gesucht',
  r.gefragt.some(function (u) { return /reservations\?/.test(u) && /track_token=in\./.test(u); }) &&
  !/guest_phone=/.test(r.gefragt.join(' ')), r.gefragt.join(' | '));

r = await ruf({ r: T2 });
t('nur Reservierungen geht auch', r.code === 200 && r.body.reservierungen.length === 1);
t('dann wird orders nicht gefragt',
  !r.gefragt.some(function (u) { return /\/orders\?/.test(u); }), r.gefragt.join(' | '));

console.log('\n-- Was zurueckgegeben wird --');

r = await ruf({ b: T1 });
var url = r.gefragt.filter(function (u) { return /\/orders\?/.test(u); })[0];
t('kein select=* -- neue Spalten landen nicht automatisch beim Gast',
  !/select=\*/.test(url), url);
['customer_name', 'delivery_address', 'status', 'total'].forEach(function (f) {
    t('das Feld ' + f + ' wird geholt (die Ansicht braucht es)', url.indexOf(f) > 0);
});
// Der Gast sieht seine eigenen Daten -- das ist in Ordnung. Was nicht in
// Ordnung waere: interne Vermerke, die niemand fuer ihn geschrieben hat.
['pos_log', 'internal', 'admin'].forEach(function (f) {
    t('das Feld ' + f + ' wird NICHT geholt', url.indexOf(f) < 0);
});

console.log('\n-- Wenn etwas fehlt --');

r = await ruf({ b: T1 }, null);
t('ohne Dienstschluessel: 503, nicht eine leere Liste',
  r.code === 503 && r.body.ok === false, r.code);
// Eine leere Liste waere hier die schlechteste Antwort: sie sieht aus wie
// "du hast nichts bestellt", und der Gast sucht den Fehler bei sich.
t('und es steht nicht "keine Bestellungen" drin',
  !/bestellungen/i.test(JSON.stringify(r.body)) || r.body.bestellungen === undefined, JSON.stringify(r.body));

ANTWORT = { status: 400, text: JSON.stringify({ message: "column orders.track_token does not exist" }) };
r = await ruf({ b: T1 });
t('fehlende Spalte: 503 mit eigenem Wortlaut (Einrichtungsfehler)',
  r.code === 503 && /eingerichtet/i.test(r.body.error), r.code + ' ' + r.body.error);

ANTWORT = { status: 500, text: 'kaputt' };
r = await ruf({ b: T1 });
t('Datenbank kaputt: 502, keine leere Liste', r.code === 502, r.code + ' ' + JSON.stringify(r.body));

ANTWORT = { rows: [] };
r = await ruf({ b: T1 });
t('gueltiges Kennzeichen ohne Treffer: 200 mit leerer Liste',
  r.code === 200 && r.body.ok === true && r.body.bestellungen.length === 0, JSON.stringify(r.body));

console.log('\n-- Methode --');

var hd = laden('dienst-schluessel');
var p = await hd({ httpMethod: 'POST', queryStringParameters: { b: T1 } });
t('POST wird abgewiesen', p.statusCode === 405, p.statusCode);
var o = await hd({ httpMethod: 'OPTIONS', queryStringParameters: {} });
t('OPTIONS beantwortet den Vorabcheck', o.statusCode === 204, o.statusCode);

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
})();
