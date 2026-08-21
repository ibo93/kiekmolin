// Prueft die drei Endpunkte, die den Gast von den Tabellen trennen.
//
// Warum es sie gibt: orders und reservations waren fuer jeden lesbar, und
// die App selbst nutzte das aus -- sie suchte Bestellungen ueber
// customer_phone=ilike.*<8 Ziffern>*. Wer eine fremde Nummer eintippte,
// bekam Name, Telefon und Lieferadresse. Diese drei Endpunkte holen
// jeweils genau das, was die Anzeige braucht, und nichts weiter:
//
//   order-track.js       -- die eigenen Bestellungen, ueber ein Geheimnis
//   order-exists.js      -- nur ja/nein: ist die Bestellung angekommen?
//   order-counts.js      -- nur Summen pro Betrieb
//   res-availability.js  -- nur die Belegung eines Tages

var KMI = require('path').join(__dirname, '..');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

// Gefaelschter Server. Merkt sich, welche Adressen abgefragt wurden.
var gerufen = [];
function fakeFetch(antwort, status) {
    return function (url, opt) {
        gerufen.push(String(url));
        return Promise.resolve({
            ok: (status || 200) < 400,
            status: status || 200,
            json: function () { return Promise.resolve(antwort); },
            text: function () { return Promise.resolve(JSON.stringify(antwort)); }
        });
    };
}
function laden(datei) {
    delete require.cache[require.resolve(KMI + '/netlify/functions/' + datei)];
    return require(KMI + '/netlify/functions/' + datei);
}
function GET(q) { return { httpMethod: 'GET', queryStringParameters: q }; }

process.env.SUPABASE_SERVICE_KEY = 'test-dienstschluessel';
process.env.SUPABASE_URL = 'https://beispiel.supabase.co';

// ===================================================================
console.log('\n-- order-track: nur mit Geheimnis --');
var GUELTIG = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
var track = laden('order-track.js');

(async function () {
    gerufen = [];
    global.fetch = fakeFetch([{ id: 1, order_number: 'KI-1-000001' }]);
    var r = await track.handler(GET({ b: GUELTIG }));
    t('gueltiges Geheimnis -> 200', r.statusCode === 200, r.statusCode);
    t('Bestellung kommt zurueck', JSON.parse(r.body).bestellungen.length === 1, r.body);

    gerufen = [];
    r = await track.handler(GET({}));
    t('ohne Geheimnis -> 400', r.statusCode === 400, r.statusCode);
    t('ohne Geheimnis wird die Datenbank gar nicht gefragt', gerufen.length === 0, gerufen);

    gerufen = [];
    r = await track.handler(GET({ b: 'nicht-hex' }));
    t('unbrauchbares Geheimnis -> 400', r.statusCode === 400, r.statusCode);
    t('und ebenfalls keine Abfrage', gerufen.length === 0, gerufen);

    // Der Kern: nichts darf ungefiltert in die Abfrage geraten.
    // Beide Listen mitgeben -- sonst laeuft die Reservierungs-Abfrage gar
    // nicht und die Pruefungen darauf waeren wertlos.
    var GUELTIG2 = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
    gerufen = [];
    await track.handler(GET({ b: GUELTIG + ',*,or=(1.eq.1)', r: GUELTIG2 }));
    var alle = gerufen.join(' ');
    t('beide Tabellen wurden gefragt', gerufen.length === 2, gerufen);
    t('nur das gueltige Geheimnis landet in der Adresse',
      alle.indexOf('or=(1.eq.1)') === -1 && alle.indexOf(GUELTIG) > -1, gerufen);
    t('kein select=* -- Felder sind einzeln aufgezaehlt',
      alle.indexOf('select=*') === -1 && alle.indexOf('customer_name') > -1, gerufen);

    // party_size, nicht guests. Mit dem falschen Namen antwortet PostgREST
    // mit 400 und der Gast liest "Datenbank nicht erreichbar".
    t('Reservierungen fragen nach party_size', alle.indexOf('party_size') > -1, gerufen);
    t('und NICHT nach guests', /[?&,]guests[,&]/.test(alle) === false, gerufen);

    // Mehr als 20 Geheimnisse: der Rest wird abgeschnitten, nicht angehaengt.
    gerufen = [];
    var viele = [];
    for (var i = 0; i < 30; i++) viele.push(String(i).padStart(2, '0').repeat(16));
    await track.handler(GET({ b: viele.join(',') }));
    var inListe = (gerufen.join(' ').match(/[0-9a-f]{32}/g) || []).length;
    t('hoechstens 20 Geheimnisse pro Abfrage', inListe === 20, inListe);

    // Ohne Dienstschluessel KEINE leere Liste -- die saehe aus wie
    // "du hast nie bestellt".
    process.env.SUPABASE_SERVICE_KEY = '';
    var track2 = laden('order-track.js');
    r = await track2.handler(GET({ b: GUELTIG }));
    t('ohne Dienstschluessel -> 503, nicht 200 mit leerer Liste', r.statusCode === 503, r.statusCode);
    process.env.SUPABASE_SERVICE_KEY = 'test-dienstschluessel';

    // ===================================================================
    console.log('\n-- order-exists: nur ja oder nein --');
    var exists = laden('order-exists.js');

    gerufen = [];
    global.fetch = fakeFetch([{ id: 'geheime-id-42' }]);
    r = await exists.handler(GET({ n: 'KI-260819-004821' }));
    var b = JSON.parse(r.body);
    t('bekannte Nummer -> da:true', r.statusCode === 200 && b.da === true, r.body);
    t('die Antwort enthaelt KEINE Kennung', r.body.indexOf('geheime-id-42') === -1, r.body);
    t('die Antwort enthaelt nur ok und da',
      Object.keys(b).sort().join(',') === 'da,ok', Object.keys(b));

    global.fetch = fakeFetch([]);
    r = await exists.handler(GET({ n: 'KI-260819-004821' }));
    t('unbekannte Nummer -> da:false', JSON.parse(r.body).da === false, r.body);

    gerufen = [];
    r = await exists.handler(GET({ n: 'quatsch' }));
    t('unbrauchbare Nummer -> 400', r.statusCode === 400, r.statusCode);
    t('und keine Abfrage', gerufen.length === 0, gerufen);

    process.env.SUPABASE_SERVICE_KEY = '';
    r = await laden('order-exists.js').handler(GET({ n: 'KI-260819-004821' }));
    t('ohne Dienstschluessel -> 503, NICHT da:false', r.statusCode === 503, r.statusCode);
    t('denn da:false hiesse "nochmal bestellen"', r.body.indexOf('"da":false') === -1, r.body);
    process.env.SUPABASE_SERVICE_KEY = 'test-dienstschluessel';

    // ===================================================================
    console.log('\n-- order-counts: nur Summen --');
    var counts = laden('order-counts.js');
    global.fetch = fakeFetch([
        { restaurant_id: 'aaa' }, { restaurant_id: 'aaa' }, { restaurant_id: 'bbb' }, { restaurant_id: null }
    ]);
    gerufen = [];
    r = await counts.handler(GET({}));
    var z = JSON.parse(r.body).zaehler;
    t('zaehlt pro Betrieb', z.aaa === 2 && z.bbb === 1, z);
    t('Zeilen ohne Betrieb werden uebergangen', Object.keys(z).length === 2, z);
    t('fragt nur nach restaurant_id', gerufen.join(' ').indexOf('select=restaurant_id') > -1, gerufen);
    t('Storniertes zaehlt nicht mit', gerufen.join(' ').indexOf('status=neq.cancelled') > -1, gerufen);

    // ===================================================================
    console.log('\n-- res-availability: nur die Belegung --');
    var verf = laden('res-availability.js');
    var RID = '11111111-2222-3333-4444-555555555555';

    global.fetch = fakeFetch([{ reservation_time: '18:00', party_size: 4, status: 'confirmed', table_id: 't1' }]);
    gerufen = [];
    r = await verf.handler(GET({ r: RID, d: '2026-08-19' }));
    t('gueltige Anfrage -> 200', r.statusCode === 200, r.statusCode);
    t('Belegung kommt zurueck', JSON.parse(r.body).belegung.length === 1, r.body);

    var adr = gerufen.join(' ');
    t('fragt nur die vier Belegungsfelder ab',
      adr.indexOf('select=reservation_time,party_size,status,table_id') > -1, gerufen);
    ['guest_name', 'guest_phone', 'guest_email', 'notes'].forEach(function (f) {
        t('fragt NICHT nach ' + f, adr.indexOf(f) === -1, gerufen);
    });

    gerufen = [];
    r = await verf.handler(GET({ r: 'kein-uuid', d: '2026-08-19' }));
    t('unbrauchbare Betriebskennung -> 400', r.statusCode === 400, r.statusCode);
    r = await verf.handler(GET({ r: RID, d: '19.08.2026' }));
    t('unbrauchbares Datum -> 400', r.statusCode === 400, r.statusCode);
    t('bei beidem keine Abfrage', gerufen.length === 0, gerufen);

    process.env.SUPABASE_SERVICE_KEY = '';
    r = await laden('res-availability.js').handler(GET({ r: RID, d: '2026-08-19' }));
    t('ohne Dienstschluessel -> 503, NICHT leere Belegung', r.statusCode === 503, r.statusCode);
    // Eine leere Belegung hiesse fuer die App "alles frei".
    t('keine leere Belegung als Antwort', r.body.indexOf('"belegung":[]') === -1, r.body);
    process.env.SUPABASE_SERVICE_KEY = 'test-dienstschluessel';

    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exit(1);
})();
