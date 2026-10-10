// PDF-KARTE EINLESEN -- im echten Browser, mit einer echten PDF-Datei.
//
// Entstanden am 07.10.2026 (Ibo: "was ich hochlade muss es zu 100
// aufnehmen"). Die Tests lesen Quelltext und füttern den Parser mit Zeilen.
// Dieses Werkzeug geht den ganzen Weg: Chromium druckt eine Probekarte als
// PDF, die App liest sie mit pdf.js 2.16.105 (wie im Betrieb) über
// leseKartePdf, und am Ende wird gezählt: steht jedes Gericht da, ist
// jede Zeile mit Preis ein Gericht, ein Extra oder in der Gegenprobe?
//
// Die Probekarte enthält genau die Schreibweisen, die am 07.10. still
// verloren gingen: Preis ohne €, "7.50 €", Doppelpunkt und Plus im Namen,
// Name eine Zeile über dem Preis, ein Gericht ohne Preis, "0,33 l".
//
// pdf.js kommt aus node_modules (cdnjs sperrt der Proxy):
//   npm i --no-save playwright-core pdfjs-dist@2.16.105
// AUFRUF   node werkzeug/pdf-karte-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var PDFJS = path.join(WURZEL, 'node_modules/pdfjs-dist');
if (!fs.existsSync(PDFJS)) { console.log('pdfjs-dist fehlt: npm i --no-save pdfjs-dist@2.16.105'); process.exit(0); }
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}

var KARTE = '<html><body style="font-family:Arial;padding:30px;width:700px">'
  + '<h1 style="font-size:26px">Imbiss am Hafen</h1>'
  + '<h2 style="font-size:18px">Pizza</h2>'
  + '<p>1. Margherita 7,50</p><p style="font-size:11px">Tomaten, Käse</p>'
  + '<p>2. Pizza Hawaii: Schinken, Ananas 8,50</p>'
  + '<p>3. Tagespizza</p><p style="font-size:11px">fragen Sie unser Personal</p>'
  + '<p>Extra Zutaten: klein 1,00 €, groß 1,50 €</p>'
  + '<h2 style="font-size:18px">Menüs</h2>'
  + '<p>10. Döner + Pommes 9,50 €</p><p>11. Grillteller 12.90 €</p>'
  + '<h2 style="font-size:18px">Kuchen</h2>'
  + '<p>Apfelkuchen</p><p>3,80 €</p><p>Käsekuchen</p><p>4,20 €</p>'
  + '<h2 style="font-size:18px">Getränke</h2>'
  + '<p>Cola 0,33 l 2,50</p><p>Wasser 0,5 l 2,00</p></body></html>';
// Was auf der Karte steht -- Name und Preis (null = kein Preis gedruckt).
var SOLL = [['Margherita', 7.5], ['Pizza Hawaii: Schinken, Ananas', 8.5], ['Tagespizza', null],
            ['Döner + Pommes', 9.5], ['Grillteller', 12.9], ['Apfelkuchen', 3.8], ['Käsekuchen', 4.2],
            ['Cola 0,33 l', 2.5], ['Wasser 0,5 l', 2]];

(async function () {
  var b = await chromium.launch({ executablePath: CHROM });
  var n = 0, ok = 0;
  function t(l, c, x) { n++; if (c) ok++; console.log((c ? 'OK  ' : 'FAIL') + ' | ' + l + (c ? '' : '  -> ' + x)); }
  try {
    var p = await b.newPage();
    await p.setContent(KARTE);
    var pdf = await p.pdf({ format: 'A4' });
    fs.writeFileSync(path.join(AUS, 'probe-karte.pdf'), pdf);

    var q = await b.newPage({ viewport: { width: 820, height: 1100 } });
    await q.route('**/*', function (r) {
      var u = r.request().url();
      var m = u.match(/pdf\.js\/2\.16\.105\/(pdf\.min\.js|pdf\.worker\.min\.js)/);
      if (m) return r.fulfill({ path: path.join(PDFJS, 'build', m[1]), contentType: 'application/javascript' });
      if (/cmaps\//.test(u)) return r.fulfill({ path: path.join(PDFJS, 'cmaps', u.split('cmaps/')[1]) });
      if (u.indexOf('file:') === 0 || u.indexOf('data:') === 0) return r.continue();
      return r.abort();
    });
    await q.goto('file://' + DATEI, { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(2500);
    var daten = 'data:application/pdf;base64,' + pdf.toString('base64');
    var e = await q.evaluate(async function (d) {
      var e = await leseKartePdf(d);
      var m = document.getElementById('karteEinfuegenModal');
      if (m) { m.style.display = 'flex'; m.classList.add('active'); }
      if (e.ok) karteVollZeige(e);
      return { ok: e.ok, grund: e.grund, gp: e.gegenprobe || null,
               items: e.items.map(function (i) { return { name: i.name, price: i.price }; }) };
    }, daten);

    t('PDF wird gelesen', e.ok, e.grund);
    SOLL.forEach(function (s) {
      var g = e.items.filter(function (i) { return i.name === s[0]; })[0];
      t('"' + s[0] + '" ist da' + (s[1] === null ? ' (ohne Preis)' : ' mit ' + s[1]),
        !!g && g.price === s[1], g ? 'Preis ' + g.price : 'fehlt');
    });
    t('keine Gerichte dazuerfunden', e.items.length === SOLL.length, e.items.length + ' statt ' + SOLL.length);
    t('Gegenprobe kommt mit', !!e.gp, 'fehlt');
    if (e.gp) {
      t('"Extra Zutaten" ist ein Extra, kein Gericht', e.gp.extras.length === 1, JSON.stringify(e.gp.extras));
      t('Gegenprobe nennt genau die Tagespizza',
        e.gp.rest.length === 1 && /Tagespizza/.test(e.gp.rest[0].text), JSON.stringify(e.gp.rest));
    }
    var box = await q.$('#karteTextVorschau');
    var sichtbar = box && await box.isVisible();
    t('Vorschau ist sichtbar', !!sichtbar, 'unsichtbar');
    if (sichtbar) {
      var txt = await box.innerText();
      t('Vorschau nennt die Zeile zum Ansehen', /bitte ansehen/.test(txt) && /Tagespizza/.test(txt), txt.slice(0, 120));
      await box.screenshot({ path: path.join(AUS, 'pdf-karte-vorschau.png') });
    }
  } finally { await b.close(); }
  console.log('\n' + ok + ' von ' + n + ' Prüfungen bestanden.' + (ok === n ? '' : ' Bild: werkzeug/ausgabe/pdf-karte-vorschau.png'));
  process.exit(ok === n ? 0 : 1);
})();
