// PDF-KARTE: KATEGORIEN -- im echten Browser, mit echten PDF-Dateien.
//
// Entstanden am 07.10.2026 (Ibo: "auch kategorie besser lesen so annehmen").
// Chromium druckt dieselbe kleine Karte neunmal, jedes Mal mit anderen
// Überschriften (größer, fett, fette Gerichte, GROSSBUCHSTABEN, andere
// Schrift, farbig, unterstrichen) plus eine Gegenprobe mit einer
// Ein-Wort-Zutat unter jedem Gericht. Die App liest jede PDF mit pdf.js
// 2.16.105 über leseKartePdf. Geprüft wird: Kategorien wie gedruckt, kein
// Gericht unter dem Restaurantnamen.
//
// Vorher: 2 von 8. Mit AUS=tests/daten/proben/ueberschriften.json werden
// die pdf.js-Daten für tests/pdf-kategorien-test.js neu geschrieben.
//   npm i --no-save playwright-core pdfjs-dist@2.16.105
// AUFRUF   node werkzeug/pdf-kategorien-messen.js [datei]
'use strict';
const path = require('path'), fs = require('fs');
let chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
const WURZEL = path.resolve(__dirname, '..');
const DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
const PDFJS = path.join(WURZEL, 'node_modules/pdfjs-dist');
if (!fs.existsSync(PDFJS)) { console.log('pdfjs-dist fehlt: npm i --no-save pdfjs-dist@2.16.105'); process.exit(0); }
const CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const gericht = (n, name, p, fett) => `<p style="margin:3px 0;${fett ? 'font-weight:bold' : ''}">${n}. ${name} ${p}</p><p style="margin:0 0 4px;font-size:11px">Tomaten, Käse</p>`;
const karte = (kopf, fettGericht) => `<html><body style="font-family:Arial;font-size:14px;padding:30px;width:700px">
  <h1 style="font-size:26px;margin:0 0 10px">Imbiss am Hafen</h1>
  ${kopf('Pizza')}${gericht(1, 'Margherita', '7,50 €', fettGericht)}${gericht(2, 'Salami', '8,00 €', fettGericht)}
  ${kopf('Pasta')}${gericht(10, 'Spaghetti Bolognese', '9,50 €', fettGericht)}${gericht(11, 'Penne Arrabbiata', '8,90 €', fettGericht)}
  ${kopf('Salate')}${gericht(20, 'Bauernsalat', '7,90 €', fettGericht)}</body></html>`;
const KLASSISCH = `<html><body style="font-family:Arial;font-size:14px;padding:30px;width:700px"><h1 style="font-size:26px">Imbiss</h1><h2 style="font-size:20px">Pizza</h2>
  <p>1. Margherita 7,50 €</p><p>Klassisch</p><p>2. Salami 8,00 €</p><p>Würzig</p><p>3. Funghi 8,50 €</p><p>Pilzig</p><p>4. Tonno 9,00 €</p><p>Fischig</p><p>5. Hawaii 9,00 €</p><p>Fruchtig</p></body></html>`;
const FAELLE = {
  'groesser': [k => `<h2 style="font-size:20px;margin:12px 0 4px">${k}</h2>`, false],
  'gleich gross, fett': [k => `<p style="font-weight:bold;margin:12px 0 4px">${k}</p>`, false],
  'fett, Gerichte auch fett': [k => `<p style="font-weight:bold;margin:12px 0 4px">${k}</p>`, true],
  'GROSSBUCHSTABEN, normal': [k => `<p style="margin:12px 0 4px">${k.toUpperCase()}</p>`, false],
  'GROSSBUCHSTABEN fett, Gerichte fett': [k => `<p style="font-weight:bold;margin:12px 0 4px">${k.toUpperCase()}</p>`, true],
  'andere Schrift (Georgia), gleich gross': [k => `<p style="font-family:Georgia;margin:12px 0 4px">${k}</p>`, false],
  'farbig, gleich gross': [k => `<p style="color:#b00;margin:12px 0 4px">${k}</p>`, false],
  'unterstrichen': [k => `<p style="text-decoration:underline;margin:12px 0 4px">${k}</p>`, false],
};
(async () => {
  const b = await chromium.launch({ executablePath: CHROM });
  const p = await b.newPage();
  const q = await b.newPage();
  await q.route('**/*', r => { const u = r.request().url(); const m = u.match(/pdf\.js\/2\.16\.105\/(pdf\.min\.js|pdf\.worker\.min\.js)/);
    if (m) return r.fulfill({ path: PDFJS + '/build/' + m[1], contentType: 'application/javascript' });
    if (/cmaps\//.test(u)) return r.fulfill({ path: PDFJS + '/cmaps/' + u.split('cmaps/')[1] });
    if (u.startsWith('file:') || u.startsWith('data:')) return r.continue(); return r.abort(); });
  await q.goto('file://' + DATEI, { waitUntil: 'domcontentloaded' }); await q.waitForTimeout(2000);
  let gut = 0, n = 0; const daten = [];
  for (const [name, [kopf, fett]] of Object.entries(FAELLE)) {
    await p.setContent(karte(kopf, fett));
    const pdf = await p.pdf({ format: 'A4' });
    const e = await q.evaluate(async d => { window._roh = []; if (!window._orig) { window._orig = pdfSeiteZuText; } pdfSeiteZuText = function (it, w) { window._roh.push({ w: w, items: it }); return window._orig(it, w); }; const e = await leseKartePdf(d); e.roh = window._roh; return { ok: e.ok, grund: e.grund, items: e.items.map(i => i.category + '|' + i.name), roh: e.roh }; }, 'data:application/pdf;base64,' + pdf.toString('base64'));
    const kats = [...new Set(e.items.map(x => x.split('|')[0]))];
    const ok = JSON.stringify(kats.map(k => k.toLowerCase())) === JSON.stringify(['pizza', 'pasta', 'salate']) && e.items.length === 5;
    n++; if (ok) gut++; daten.push({ name: name, seiten: e.roh });
    console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + name.padEnd(40) + ' -> ' + (e.ok ? e.items.length + ' Gerichte, Kategorien: ' + kats.join(' / ') : e.grund));
  }
  await p.setContent(KLASSISCH); { const pdf = await p.pdf({ format: 'A4' });
    const e = await q.evaluate(async d => { window._roh = []; pdfSeiteZuText = function (it, w) { window._roh.push({ w: w, items: it }); return window._orig(it, w); }; const e = await leseKartePdf(d); return { items: e.items.map(i => i.category + '|' + i.name + '|' + i.description), roh: window._roh }; }, 'data:application/pdf;base64,' + pdf.toString('base64'));
    const kats = [...new Set(e.items.map(x => x.split('|')[0]))]; const ok = kats.length === 1 && kats[0] === 'Pizza' && e.items.length === 5 && /Klassisch/.test(e.items[0]);
    n++; if (ok) gut++; daten.push({ name: 'Ein-Wort-Zutat unter jedem Gericht', seiten: e.roh });
    console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + 'Ein-Wort-Zutat unter jedem Gericht'.padEnd(40) + ' -> ' + e.items.length + ' Gerichte, Kategorien: ' + kats.join(' / ') + ' | ' + e.items[0]); }
  console.log(gut + ' von ' + n); if (process.env.AUS) fs.writeFileSync(process.env.AUS, JSON.stringify(daten));
  process.exitCode = gut === n ? 0 : 1;
  await b.close();
})();
