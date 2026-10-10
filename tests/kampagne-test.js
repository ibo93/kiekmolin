// KAMPAGNE (10.10.2026) -- aus welchem Video ein Gast kam.
//
// Ibo: "Beweisen, wie viele Gaeste ein Video bringt." Das Studio haengt
// ?ref=reel-pizzatag an jeden Video-Link; bucht der Gast, steht der Code an
// der Reservierung/Bestellung, und kampagnen-zahlen.js gibt dem Studio
// NUR Zahlen je Code.
//
// Hier laufen reservation-guest, order-save und kampagnen-zahlen ECHT gegen
// eine nachgebaute Datenbank. Wichtigster Fall: die Spalte fehlt noch
// (41-kampagne.sql nicht eingespielt) -- dann darf KEINE Buchung scheitern
// und die Zahlen-Abfrage darf nicht still "0 ueber Videos" melden.
//
// Gegenprobe (jede rot): Muster-Pruefung entfernt (beliebiger Text kaeme in
// die Datenbank), Selbstheilung weg (Buchung scheitert ohne Spalte), Code
// immer mitgeschickt (jede normale Buchung zwei Anfragen), Schluessel-Pruefung
// weg, Gastdaten in der Zahlen-Abfrage, "Spalte fehlt" still als 0 gemeldet,
// ref im Browser nicht an die Reservierung gegeben.
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module');
var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var FN = path.join(WURZEL, 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + JSON.stringify(x))); }
function antwort(d, status) { return { ok: !status || status < 400, status: status || 200, json: async function () { return d; }, text: async function () { return typeof d === 'string' ? d : JSON.stringify(d); } }; }
var FEHLT = '{"code":"PGRST204","message":"Could not find the \'kampagne\' column of \'reservations\' in the schema cache"}';

(async function () {
  process.env.SUPABASE_SERVICE_KEY = 'test';
  var echtLaden = Module._load;
  Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    if (/[\\/]lib[\\/]alarm$/.test(anfrage) || anfrage === './lib/alarm') return { alarm: async function () {}, senden: async function () {} };
    return echtLaden.apply(this, arguments);
  };
  var K = require(path.join(FN, 'lib', 'kampagne.js'));
  var RG = require(path.join(FN, 'reservation-guest.js'));
  var OS = require(path.join(FN, 'order-save.js'));
  var KZ = require(path.join(FN, 'kampagnen-zahlen.js'));
  Module._load = echtLaden;

  // ---- 1. Muster ------------------------------------------------------
  t('gueltige Codes', K.pruefe('reel-pizzatag') === 'reel-pizzatag' && K.pruefe('Story-12') === 'story-12' && K.pruefe('tv1') === 'tv1', '');
  t('Unsinn wird null (kein Text in die Datenbank)', [null, '', 'ab', "x'; drop table orders;--", 'a b c', '-start', 'ä-umlaut', 'x'.repeat(49), 42, {}].every(function (x) { return K.pruefe(x) === null; }), '');

  // ---- 2. reservation-guest --------------------------------------------
  var RID = '11111111-2222-3333-4444-555555555555';
  var spalteDa = true, eingefuegt = [];
  global.fetch = async function (url, init) {
    url = String(url);
    if (/\/rest\/v1\/aktionen\?/.test(url)) return antwort([]);
    if (/select=zahlsperre/.test(url)) return antwort([{ zahlsperre: 'keine' }]);
    if (/\/rest\/v1\/restaurants\?/.test(url)) return antwort([{ id: RID, is_active: true, features: [] }]);
    if (/\/rest\/v1\/reservations\?/.test(url)) return antwort([]);
    if (/\/rest\/v1\/reservations$/.test(url) && init && init.method === 'POST') {
      var k = JSON.parse(init.body); eingefuegt.push(k);
      if (!spalteDa && 'kampagne' in k) return antwort(FEHLT, 400);
      return antwort([{ id: 'r1', track_token: 'x'.repeat(32), status: 'pending' }], 201);
    }
    return antwort([]);
  };
  function reservierung(extra) {
    var r = { restaurant_id: RID, guest_name: 'Celina', guest_phone: '0151 1234567', party_size: 2, reservation_date: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), reservation_time: '19:00' };
    Object.keys(extra || {}).forEach(function (x) { r[x] = extra[x]; });
    return RG.handler({ httpMethod: 'POST', body: JSON.stringify(r), headers: {} });
  }
  var a = await reservierung({ kampagne: 'reel-pizzatag' });
  t('Reservierung mit Video-Code: gespeichert, Code steht dran', a.statusCode === 200 && eingefuegt[0] && eingefuegt[0].kampagne === 'reel-pizzatag', { code: a.statusCode, body: a.body, e: eingefuegt });
  eingefuegt = []; a = await reservierung({ kampagne: '<script>' });
  t('ungueltiger Code: Reservierung geht durch, ohne Code', a.statusCode === 200 && eingefuegt.length === 1 && !('kampagne' in eingefuegt[0]), eingefuegt);
  eingefuegt = []; a = await reservierung({});
  t('ohne Code: genau EINE Anfrage, kein Feld kampagne (normale Buchung wie bisher)', a.statusCode === 200 && eingefuegt.length === 1 && !('kampagne' in eingefuegt[0]), eingefuegt);
  spalteDa = false; eingefuegt = []; a = await reservierung({ kampagne: 'reel-pizzatag' });
  t('SPALTE FEHLT NOCH: Reservierung scheitert NICHT (zweiter Versuch ohne Code)', a.statusCode === 200 && JSON.parse(a.body).ok === true && eingefuegt.length === 2 && !('kampagne' in eingefuegt[1]), { code: a.statusCode, body: a.body, n: eingefuegt.length });
  spalteDa = true;

  // ---- 3. order-save ----------------------------------------------------
  var KARTE = [{ id: 'i-pizza', name: 'Pizza Margherita', base_price: 8.5, sizes: null }];
  var bestellt = [];
  global.fetch = async function (url, init) {
    var u = String(url);
    if (u.indexOf('restaurants?') >= 0) return antwort([{ id: 'r1', delivery_fee: 2.5, features: [] }]);
    if (u.indexOf('menu_items?') >= 0) return antwort(KARTE);
    if (u.indexOf('/orders') >= 0 && init && init.method === 'POST') {
      var b = JSON.parse(init.body); bestellt.push(b);
      if (!spalteDa && 'kampagne' in b) return antwort(FEHLT.replace('reservations', 'orders'), 400);
      return antwort([{ id: 'o1' }], 201);
    }
    return antwort([]);
  };
  function bestellung(extra) {
    var o = { order_number: 'KI-' + Math.random().toString(36).slice(2, 7), restaurant_id: 'r1', order_type: 'delivery', status: 'received',
      items: [{ menu_item_id: 'i-pizza', name: 'Pizza Margherita', quantity: 1, price: 8.5 }], subtotal: 8.5, delivery_fee: 2.5, tip: 0, discount: 0, total: 11.0 };
    Object.keys(extra || {}).forEach(function (x) { o[x] = extra[x]; });
    return OS.handler({ httpMethod: 'POST', body: JSON.stringify({ order: o }) });
  }
  var b1 = await bestellung({ kampagne: 'reel-pizzatag' });
  t('Bestellung mit Video-Code: gespeichert, Code steht dran', b1.statusCode === 200 && bestellt[0] && bestellt[0].kampagne === 'reel-pizzatag', { code: b1.statusCode, body: b1.body });
  bestellt = []; await bestellung({ kampagne: 'DROP TABLE' });
  t('ungueltiger Code bei Bestellung: ohne Code gespeichert', bestellt.length === 1 && !('kampagne' in bestellt[0]), bestellt);
  bestellt = []; await bestellung({});
  t('Bestellung ohne Code: EINE Anfrage, kein Feld kampagne', bestellt.length === 1 && !('kampagne' in bestellt[0]), bestellt.length);
  spalteDa = false; bestellt = []; var b2 = await bestellung({ kampagne: 'reel-pizzatag' });
  t('SPALTE FEHLT NOCH: Bestellung scheitert NICHT', b2.statusCode === 200 && JSON.parse(b2.body).ok === true && bestellt.length === 2 && !('kampagne' in bestellt[1]), { code: b2.statusCode, body: b2.body });
  spalteDa = true;

  // ---- 4. kampagnen-zahlen ----------------------------------------------
  process.env.STUDIO_ZAHLEN_TOKEN = 'geheim-studio-1234';
  var abgefragt = [];
  var RES = [{ kampagne: 'reel-pizzatag', party_size: 4 }, { kampagne: 'reel-pizzatag', party_size: 2 }, { kampagne: null, party_size: 3 }, { kampagne: 'story-tartufo', party_size: 2 }];
  var ORD = [{ kampagne: 'reel-pizzatag', total: 24.5 }, { kampagne: null, total: 11 }];
  global.fetch = async function (url) {
    var u = decodeURIComponent(String(url)); abgefragt.push(u);
    if (/\/restaurants\?slug=eq\.die-millis/.test(u)) return antwort([{ id: RID, name: 'Die Millis', slug: 'die-millis' }]);
    if (/\/restaurants\?/.test(u)) return antwort([]);
    if (/\/reservations\?.*reservation_date=gte/.test(u)) return antwort([{ reservation_date: new Date().toISOString().slice(0, 10), reservation_time: '19:00', party_size: 4 }]);
    if (/\/reservations\?/.test(u)) return (!spalteDa && /kampagne/.test(u)) ? antwort('{"code":"42703","message":"column reservations.kampagne does not exist"}', 400) : antwort(RES.map(function (z) { var c = Object.assign({}, z); if (!/kampagne/.test(u)) delete c.kampagne; return c; }));
    if (/\/orders\?/.test(u)) return (!spalteDa && /kampagne/.test(u)) ? antwort('{"code":"42703","message":"column orders.kampagne does not exist"}', 400) : antwort(ORD.map(function (z) { var c = Object.assign({}, z); if (!/kampagne/.test(u)) delete c.kampagne; return c; }));
    if (/\/restaurant_tables\?/.test(u)) return antwort([{ max_capacity: 4 }, { max_capacity: 6 }]);
    return antwort([]);
  };
  function zahlen(token, wer) { return KZ.handler({ httpMethod: 'GET', headers: token ? { authorization: 'Bearer ' + token } : {}, queryStringParameters: { restaurant: wer || 'die-millis', tage: '30' } }); }
  var z0 = await zahlen(null);
  var z1 = await zahlen('falsch-falsch-falsch');
  t('ohne/mit falschem Schluessel: nichts (401)', z0.statusCode === 401 && z1.statusCode === 401 && !/Millis/.test(z0.body + z1.body), [z0.statusCode, z1.statusCode]);
  delete process.env.STUDIO_ZAHLEN_TOKEN; var z2 = await zahlen('geheim-studio-1234'); process.env.STUDIO_ZAHLEN_TOKEN = 'geheim-studio-1234';
  t('Schluessel in Netlify nicht eingetragen: gesperrt (503) und sagt es', z2.statusCode === 503 && /STUDIO_ZAHLEN_TOKEN/.test(z2.body), z2.body);
  abgefragt = []; var z = await zahlen('geheim-studio-1234'), d = JSON.parse(z.body);
  var pz = (d.kampagnen || []).find(function (k) { return k.kampagne === 'reel-pizzatag'; }) || {};
  t('Zahlen je Video stimmen (2 Reservierungen, 6 Personen, 1 Bestellung, 24,50 EUR)', z.statusCode === 200 && pz.reservierungen === 2 && pz.personen === 6 && pz.bestellungen === 1 && pz.umsatz === 24.5, d);
  t('Gesamt und Anteil ueber Videos', d.gesamt && d.gesamt.reservierungen === 4 && d.gesamt.ueberVideos.reservierungen === 3 && d.gesamt.umsatz === 35.5, d.gesamt);
  t('Auslastung: 14 Tage, Plaetze aus dem Tischplan (10)', d.auslastung && d.auslastung.tage.length === 14 && d.auslastung.plaetze === 10 && d.auslastung.tage[0].personen === 4, d.auslastung);
  t('KEINE Gastdaten abgefragt (kein guest_/customer_/phone/email/notes im select)', abgefragt.every(function (u) { var s = (u.match(/select=([^&]*)/) || [])[1] || ''; return !/guest_|customer_|phone|email|notes|address/.test(s); }), abgefragt);
  t('KEINE Gastdaten in der Antwort', !/Celina|0151|guest_|customer_/.test(z.body), z.body.slice(0, 200));
  t('Stornierte zaehlen nicht (status not.in.(cancelled...))', abgefragt.filter(function (u) { return /\/(reservations|orders)\?/.test(u); }).every(function (u) { return /status=not\.in\.\(cancelled/.test(u); }), abgefragt);
  spalteDa = false; var zf = JSON.parse((await zahlen('geheim-studio-1234')).body); spalteDa = true;
  t('SPALTE FEHLT: nicht still "0 ueber Videos", sondern Hinweis auf 41-kampagne.sql', zf.ok === true && zf.kampagnenSpalte === false && /41-kampagne\.sql/.test(zf.hinweis || '') && zf.gesamt.reservierungen === 4, zf);
  abgefragt = [];
  var zm = JSON.parse((await KZ.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer geheim-studio-1234' }, queryStringParameters: { restaurant: 'die-millis', von: '2026-09-01', bis: '2026-10-01' } })).body);
  var buchAbfragen = abgefragt.filter(function (u) { return /\/(reservations|orders)\?.*created_at/.test(u); });
  t('fester Zeitraum (Monatsbericht): von UND bis in jeder Buchungs-Abfrage', zm.ok && zm.zeitraum.von.indexOf('2026-09-01') === 0 && zm.zeitraum.bis.indexOf('2026-10-01') === 0 && buchAbfragen.length >= 2 && buchAbfragen.every(function (u) { return /created_at=gte\.2026-09-01/.test(u) && /created_at=lt\.2026-10-01/.test(u); }), buchAbfragen);
  var zu = await zahlen('geheim-studio-1234', 'gibt-es-nicht');
  t('unbekanntes Restaurant: 404 statt leerer Zahlen', zu.statusCode === 404, zu.statusCode);

  // ---- 5. Gaesteseite ---------------------------------------------------
  var m = H.match(/var KMI_KAMPAGNE = \(function \(\) \{[^\n]*\}\)\(\);/);
  t('Gaesteseite liest ?ref= mit demselben Muster', !!m && m[0].indexOf("get('ref')") > 0 && m[0].indexOf(K.MUSTER.source) > 0, m && m[0]);
  t('... nur im Arbeitsspeicher (kein localStorage/Cookie mit dem Code)', !/KMI_KAMPAGNE[^\n]{0,80}(localStorage|sessionStorage|document\.cookie)/.test(H) && !/(localStorage|sessionStorage)\.setItem\([^)]*kampagne/i.test(H), '');
  var iR = H.indexOf("fetch('/.netlify/functions/reservation-guest'"), iW = H.indexOf("fetch('/.netlify/functions/reservation-guest'", iR + 10);
  t('Reservierung gibt den Code mit', iR > 0 && /kampagne: \(typeof KMI_KAMPAGNE !== 'undefined' && KMI_KAMPAGNE\) \|\| undefined/.test(H.slice(iR, iR + 1400)), '');
  t('Warteliste gibt den Code mit', iW > 0 && /kampagne: \(typeof KMI_KAMPAGNE !== 'undefined' && KMI_KAMPAGNE\) \|\| undefined/.test(H.slice(iW, iW + 900)), '');
  t('Bestellung (auch PayPal und Notweg) gibt den Code mit', /var _orderPayload = \{\s*kampagne: \(typeof KMI_KAMPAGNE !== 'undefined' && KMI_KAMPAGNE\) \|\| undefined/.test(H), '');
  var PP = fs.readFileSync(path.join(FN, 'paypal-zahlung.js'), 'utf8');
  t('PayPal-Server prueft und uebernimmt den Code', /'kampagne'\s*\]/.test(PP) && /require\('\.\/lib\/kampagne'\)\.pruefe\(order\.kampagne\)/.test(PP), '');
  var SQL = fs.readFileSync(path.join(WURZEL, 'datenbank', '41-kampagne.sql'), 'utf8');
  t('SQL: beide Spalten, Muster als Regel, ohne alte Zeilen zu pruefen', /reservations add column if not exists kampagne text/.test(SQL) && /orders\s+add column if not exists kampagne text/.test(SQL) && (SQL.match(/\) not valid;/g) || []).length === 2 && SQL.indexOf("'^[a-z0-9][a-z0-9-]{2,47}$'") > 0, '');

  console.log('\n' + ok + '/' + n + (ok === n ? ' -- alles gruen' : ' -- FEHLER'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
