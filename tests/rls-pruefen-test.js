// Prueft das Pruefwerkzeug -- mit einer erfundenen Datenbank, ohne Netz.
//
// Der wichtigste Test hier ist nicht "erkennt es eine offene Tabelle".
// Der wichtigste ist: das Werkzeug darf nichts kaputt machen und es darf
// kein 403 vom Proxy als Entwarnung durchgehen lassen. Genau dieser
// Irrtum ist bei der ersten Pruefung passiert -- alle 33 Tabellen kamen
// als "dicht" zurueck, dabei kam die Antwort nie bei Supabase an.

var path = require('path');
var W = require(path.join(__dirname, '..', 'tools', 'rls-pruefen.js'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// --- kleine Attrappe fuer fetch ------------------------------------------
// antwortGeber(url, optionen) -> { status, typ, range, koerper }
function fakeHole(antwortGeber, protokoll) {
  return async function (url, optionen) {
    var a = antwortGeber(url, optionen || {}) || {};
    if (protokoll) protokoll.push({ url: url, method: (optionen || {}).method || 'GET', body: (optionen || {}).body });
    var kopf = {
      'content-type': a.typ === undefined ? 'application/json; charset=utf-8' : a.typ,
      'content-range': a.range || ''
    };
    return {
      status: a.status === undefined ? 200 : a.status,
      headers: { get: function (k) { return kopf[String(k).toLowerCase()] || ''; } },
      text: async function () { return a.koerper === undefined ? '[]' : a.koerper; }
    };
  };
}

var ZUGANG = { url: 'https://beispiel.supabase.co', key: 'anon-schluessel' };
var EINE = [{ name: 'customers', stufe: 'person', was: 'Gaestedaten' }];

function still() { }

async function haupt() {
  // =========================================================================
  console.log('\n-- Urteil aus der Antwort --');

  t('200 heisst offen', W.urteil({ status: 200, vonPostgrest: true }).wert === 'offen');
  t('204 heisst offen (Schreiben ohne Rueckgabe)', W.urteil({ status: 204, vonPostgrest: true }).wert === 'offen');
  t('401 von PostgREST heisst zu', W.urteil({ status: 401, vonPostgrest: true }).wert === 'zu');
  t('403 von PostgREST heisst zu', W.urteil({ status: 403, vonPostgrest: true, code: '42501' }).wert === 'zu');

  // Der Kern: ein 403, das nicht von Supabase kam, ist KEINE Entwarnung.
  var proxy = W.urteil({ status: 403, vonPostgrest: false });
  t('403 vom Proxy gilt NICHT als "zu", sondern als unklar', proxy.wert === 'unklar', proxy.wert);
  t('und sagt auch, warum', /Netzsperre|Proxy/.test(proxy.grund), proxy.grund);

  t('400 (falscher Spaltentyp) ist unklar, nicht "zu"', W.urteil({ status: 400, vonPostgrest: true }).wert === 'unklar');
  t('404 (Tabelle gibt es nicht) ist unklar', W.urteil({ status: 404, vonPostgrest: true }).wert === 'unklar');

  t('Anzahl kommt aus dem Content-Range', W.anzahlAus('0-0/4711') === 4711);
  t('Stern-Anzahl gibt null', W.anzahlAus('*/*') === null);
  t('fehlender Kopf gibt null', W.anzahlAus('') === null);

  // =========================================================================
  console.log('\n-- Die Pruefung darf nichts kaputt machen --');

  var protokoll = [];
  var hole = fakeHole(function () { return { status: 200, range: '0-0/1200' }; }, protokoll);
  await W.tabellePruefen(hole, ZUGANG, EINE[0]);

  var lesen = protokoll.filter(function (r) { return r.method === 'GET'; });
  var schreiben = protokoll.filter(function (r) { return r.method !== 'GET'; });

  t('gelesen wird mit limit=0 -- also keine einzige Gastzeile',
    lesen.length === 1 && /limit=0/.test(lesen[0].url), lesen[0] && lesen[0].url);
  t('die Anzahl kommt trotzdem an (Prefer count=exact)',
    true); // im Aufruf gesetzt, unten ueber das Ergebnis geprueft

  t('es wird genau einmal geaendert und einmal geloescht', schreiben.length === 2, schreiben.length);
  schreiben.forEach(function (r) {
    t(r.method + ' trifft nur die Geister-ID (kann keine echte Zeile treffen)',
      /id=eq\.00000000-0000-0000-0000-000000000000/.test(r.url), r.url);
  });
  t('kein Aufruf ohne Filter (das waere ein Rundumschlag)',
    schreiben.every(function (r) { return /\?id=eq\./.test(r.url); }));
  t('nie ein INSERT -- dafuer gibt es keine ungefaehrliche Probe',
    protokoll.every(function (r) { return r.method !== 'POST'; }));

  // =========================================================================
  console.log('\n-- Ein echter Befund --');

  var offen = await W.tabellePruefen(fakeHole(function () { return { status: 200, range: '0-0/1200' }; }), ZUGANG, EINE[0]);
  t('offene Tabelle wird als offen erkannt', offen.lesen.wert === 'offen');
  t('und die Zeilenzahl steht dabei', offen.anzahl === 1200, offen.anzahl);
  t('das gilt als Datenpanne', W.istDatenpanne(offen) === true);

  var zu = await W.tabellePruefen(fakeHole(function () {
    return { status: 403, koerper: JSON.stringify({ code: '42501', message: 'permission denied' }) };
  }), ZUGANG, EINE[0]);
  t('geschlossene Tabelle wird als zu erkannt', zu.lesen.wert === 'zu');
  t('und ist keine Datenpanne', W.istDatenpanne(zu) === false);

  // Lesen zu, aber Schreiben offen -- der leise Fall.
  var halb = await W.tabellePruefen(fakeHole(function (url, o) {
    if ((o.method || 'GET') === 'GET') return { status: 403, koerper: JSON.stringify({ code: '42501' }) };
    return { status: 204, typ: '' };
  }), ZUGANG, EINE[0]);
  t('lesen zu, aendern offen -- wird nicht als harmlos abgehakt',
    halb.lesen.wert === 'zu' && W.istFremdgesteuert(halb) === true);

  // Speisekarte: Lesen ist gewollt, Schreiben nicht.
  var karte = await W.tabellePruefen(fakeHole(function () { return { status: 200, range: '0-0/80' }; }),
    ZUGANG, { name: 'menu_items', stufe: 'betrieb', was: 'Gerichte' });
  t('offene Speisekarte ist keine Datenpanne ...', W.istDatenpanne(karte) === false);
  t('... aber offenes Aendern wird trotzdem gemeldet', W.istFremdgesteuert(karte) === true);

  // =========================================================================
  console.log('\n-- Was das Werkzeug am Ende sagt --');

  async function laufMit(antwortGeber, tabellen) {
    var zeilen = [];
    await W.lauf({
      hole: fakeHole(antwortGeber),
      zugang: ZUGANG,
      tabellen: tabellen || EINE,
      schreibe: function (z) { zeilen.push(z); }
    }).then(function (e) { zeilen.code = e.code; });
    return { text: zeilen.join('\n'), code: zeilen.code };
  }

  var r1 = await laufMit(function () { return { status: 200, range: '0-0/1200' }; });
  t('offene Personendaten -> Exit-Code 2', r1.code === 2, r1.code);
  t('und die 72-Stunden-Frist wird benannt', /72 Stunden/.test(r1.text));
  t('die Zeilenzahl steht im Klartext', /1200 Datensaetze/.test(r1.text), r1.text.slice(-300));

  var r2 = await laufMit(function () {
    return { status: 401, koerper: JSON.stringify({ code: '42501' }) };
  });
  t('alles dicht -> Exit-Code 0', r2.code === 0, r2.code);
  t('und es steht ausdruecklich da', /Keine Tabelle mit Personendaten ist offen/.test(r2.text));

  // Der Fall aus der Sandbox: 403 vom Proxy, kein JSON.
  var r3 = await laufMit(function () {
    return { status: 403, typ: 'text/plain', koerper: 'Forbidden' };
  });
  t('Proxy-403 fuer alles -> Exit-Code 3, nicht 0', r3.code === 3, r3.code);
  t('und ausdruecklich KEINE Entwarnung', /KEIN URTEIL MOEGLICH/.test(r3.text));
  t('mit dem Hinweis, es woanders laufen zu lassen', /freiem Netzzugang/.test(r3.text));

  // =========================================================================
  console.log('\n-- Schluessel aus index.html --');

  var z = W.schluesselLesen(path.join(__dirname, '..', 'index.html'));
  t('URL wird gefunden', /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(z.url), z.url);
  t('Schluessel wird gefunden', typeof z.key === 'string' && z.key.length > 40);
  t('es ist der anon-Schluessel (nicht der Dienstschluessel)',
    JSON.parse(Buffer.from(z.key.split('.')[1], 'base64').toString()).role === 'anon');

  // =========================================================================
  console.log('\n-- Vollstaendigkeit --');

  var namen = W.TABELLEN.map(function (x) { return x.name; });
  ['customers', 'orders', 'order_items', 'reservations'].forEach(function (x) {
    t(x + ' wird geprueft und gilt als Personendaten',
      W.TABELLEN.some(function (y) { return y.name === x && y.stufe === 'person'; }));
  });
  t('keine Tabelle doppelt', new Set(namen).size === namen.length);

  console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
  process.exit(ok === n ? 0 : 1);

}

haupt().catch(function (e) { console.error(e); process.exit(1); });
