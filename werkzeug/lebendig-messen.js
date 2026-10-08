// LEBENDIGE BILDER -- im echten Browser.
//
// Ibo, 08.10.2026: "bei Getränke, Shisha und andere Sachen, nur 3-4
// animierte Sachen". Misst, was kein Textvergleich sieht:
//   Gast:  läuft die Bewegung wirklich (getAnimations, playState), nur über
//          echten Fotos, höchstens 4, und gar nicht bei "weniger Bewegung"?
//          Steht sie still, wenn das Bild aus dem Blick ist?
//   Wirt:  Auswahl im Dialog "Gericht bearbeiten"; bei 4 vergebenen
//          gesperrt MIT Namen (nicht still); Speichern schreibt
//          "lebendig:perlen" in additives und behält "nr:" / "ohne:".
// Supabase und Fotos beantwortet das Werkzeug selbst (der Proxy sperrt sie).
// AUFRUF   node werkzeug/lebendig-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8891);
var FOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
  + '<stop offset="0" stop-color="#2b1a10"/><stop offset="1" stop-color="#c9772a"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/>'
  + '<rect x="270" y="90" width="100" height="260" rx="14" fill="#e8a33c" opacity=".85"/></svg>';
// 6 Gerichte: 5 mit "lebendig", eins davon ohne Foto -> genau 4 bewegt.
var ITEMS = [
  { id: 'a', name: 'Mojito', category: 'Cocktails', image_url: 'https://bilder.test/a.svg', additives: ['nr:1', 'lebendig:perlen'] },
  { id: 'b', name: 'Shisha Doppelapfel', category: 'Shisha', image_url: 'https://bilder.test/b.svg', additives: ['lebendig:dampf'] },
  { id: 'c', name: 'Tiramisu', category: 'Dessert', image_url: 'https://bilder.test/c.svg', additives: ['lebendig:glanz', 'ohne:Kakao'] },
  { id: 'd', name: 'Pizza Diavolo', category: 'Pizza', image_url: '', additives: ['lebendig:dampf'] },
  { id: 'e', name: 'Eistee', category: 'Getränke', image_url: 'https://bilder.test/e.svg', additives: ['lebendig:perlen'] },
  { id: 'f', name: 'Cola', category: 'Getränke', image_url: 'https://bilder.test/f.svg', additives: ['lebendig:perlen'] },
  { id: 'g', name: 'Wasser', category: 'Getränke', image_url: 'https://bilder.test/g.svg', additives: [] }
].map(function (x, i) { return Object.assign({ restaurant_id: 'r', base_price: 4.5 + i, is_available: true, description: 'Probe' }, x); });

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
  async function seite(ruhig) {
    var ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', reducedMotion: ruhig ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url();
      if (/bilder\.test/.test(u)) return rt.fulfill({ status: 200, contentType: 'image/svg+xml', body: FOTO });
      if (/supabase\.co/.test(u)) return rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    return { s: s, ctx: ctx, fehler: fehler };
  }
  // Gästekarte: die echten Funktionen (gerichtKartenHtml, lebendigBeobachten) in einer Probe-Fläche.
  async function karte(p) {
    return p.s.evaluate(function (items) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      var box = document.createElement('div'); box.id = 'probeKarte';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#fff;padding:24px;';
      document.body.appendChild(box);
      window._menuDisplayItems = items; window._lebendigErlaubt = lebendigErlaubt(items);
      box.innerHTML = '<div class="stitch-menu-grid">' + gerichtKartenHtml(items, 0) + '</div><div style="height:1600px"></div>';
      lebendigBeobachten(box);
    }, ITEMS);
  }
  async function zustand(p) {
    return p.s.evaluate(function () {
      var els = Array.prototype.slice.call(document.querySelectorAll('#probeKarte .kmi-lebendig'));
      return els.map(function (e) {
        var karte = e.parentElement, name = (karte.closest('.glass-card') || karte).querySelector('h3');
        var an = e.querySelectorAll('span')[0] && e.querySelectorAll('span')[0].getAnimations();
        return { art: (e.className.match(/kmi-lebendig-(\w+)/) || [])[1], name: name ? name.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) : '',
          sichtbar: getComputedStyle(e).display !== 'none', laeuft: e.classList.contains('laeuft'),
          anim: an && an.length ? an[0].playState : 'keine' };
      });
    });
  }

  // ---------- Gast ----------
  var p = await seite(false);
  await karte(p); await p.s.waitForTimeout(700);
  var z = await zustand(p);
  pruef('genau 4 bewegte Bilder (5 gewählt, eins ohne Foto -> still)', z.length === 4 && !z.some(function (x) { return /Pizza/.test(x.name); }), JSON.stringify(z));
  pruef('Arten wie gewählt: Perlen, Dampf, Lichtschimmer', z.map(function (x) { return x.art; }).join(',') === 'perlen,dampf,glanz,perlen', z.map(function (x) { return x.art; }).join(','));
  var oben = z.filter(function (x, i) { return i < 3; });
  pruef('im Blick: die Bewegung läuft wirklich (playState running)', oben.every(function (x) { return x.laeuft && x.anim === 'running'; }), JSON.stringify(oben));
  await p.s.waitForTimeout(1600);
  await p.s.locator('#probeKarte .stitch-menu-grid').screenshot({ path: path.join(AUS, 'lebendig-karte.png') });
  await p.s.evaluate(function () { document.getElementById('probeKarte').scrollTop = 4000; }); await p.s.waitForTimeout(500);
  var weg = await zustand(p);
  pruef('aus dem Blick gescrollt: Bewegung steht (paused)', weg.every(function (x) { return !x.laeuft && x.anim === 'paused'; }), JSON.stringify(weg));
  pruef('Gästeseite ohne Seitenfehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  p = await seite(true);
  await karte(p); await p.s.waitForTimeout(500);
  z = await zustand(p);
  pruef('"weniger Bewegung" am Gerät: nur das Foto', z.length === 4 && z.every(function (x) { return !x.sichtbar; }), JSON.stringify(z));
  await p.ctx.close();

  // ---------- Wirt: Dialog "Gericht bearbeiten" ----------
  p = await seite(false);
  var d = await p.s.evaluate(async function (items) {
    menuItems = JSON.parse(JSON.stringify(items)); window.menuItems = menuItems;
    menuCategories = [{ id: 'c1', name: 'Getränke' }]; window.menuCategories = menuCategories;
    var geschrieben = [];
    window.menuSchreiben = menuSchreiben = async function (url, art, daten) { geschrieben.push(daten); return [Object.assign({ id: url.split('eq.')[1] }, daten)]; };
    var raus = {};
    // Wasser: 4 andere haben schon "lebendig" (a, b, c, e, f -> 5 Einträge, d ohne Foto zählt mit)
    editMenuItem('g');
    var sel = document.getElementById('editItemLebendig');
    raus.voll = { da: !!sel, gesperrt: sel && sel.disabled, hinweis: sel && sel.parentElement.querySelector('p').textContent };
    closeGenericModal();
    // drei ausschalten (d, e, f) -> 3 vergeben, dann Wasser auf Perlen
    menuItems.forEach(function (i) { if (i.id === 'f' || i.id === 'd' || i.id === 'e') i.additives = []; });
    editMenuItem('g');
    sel = document.getElementById('editItemLebendig');
    raus.frei = { gesperrt: sel.disabled, optionen: Array.prototype.map.call(sel.options, function (o) { return o.value + ':' + o.textContent; }) };
    sel.value = 'perlen';
    await saveEditedItem('g');
    raus.wasser = geschrieben[geschrieben.length - 1] && geschrieben[geschrieben.length - 1].additives;
    // Mojito: Art wechseln, nr: bleibt
    editMenuItem('a');
    document.getElementById('editItemLebendig').value = 'glanz';
    await saveEditedItem('a');
    raus.mojito = geschrieben[geschrieben.length - 1] && geschrieben[geschrieben.length - 1].additives;
    // Tiramisu: ausschalten, ohne: bleibt
    editMenuItem('c');
    document.getElementById('editItemLebendig').value = '';
    await saveEditedItem('c');
    raus.tiramisu = geschrieben[geschrieben.length - 1] && geschrieben[geschrieben.length - 1].additives;
    raus.zusatz = zusatzstoffeVon({ additives: ['lebendig:perlen', 'nr:3', '2'] });
    return raus;
  }, ITEMS);
  pruef('4 schon vergeben: Auswahl gesperrt, und es steht da, welche', d.voll.da && d.voll.gesperrt && /Schon 4 lebendige Bilder: .*Mojito.*Erst dort ausschalten/.test(d.voll.hinweis), JSON.stringify(d.voll));
  pruef('Platz frei: Auswahl offen, Aus/Perlen/Dampf/Schimmer, Vorschlag bei Getränk = Perlen', !d.frei.gesperrt && d.frei.optionen.length === 4 && /perlen:Perlen \(Getränke\) – passt hier/.test(d.frei.optionen.join('|')), JSON.stringify(d.frei));
  pruef('Speichern schreibt "lebendig:perlen"', Array.isArray(d.wasser) && d.wasser.indexOf('lebendig:perlen') >= 0, JSON.stringify(d.wasser));
  pruef('Art wechseln: genau ein Eintrag, Gerichtnummer bleibt', JSON.stringify(d.mojito) === '["nr:1","lebendig:glanz"]', JSON.stringify(d.mojito));
  pruef('Ausschalten: Eintrag weg, "Bitte ohne" bleibt', JSON.stringify(d.tiramisu) === '["ohne:Kakao"]', JSON.stringify(d.tiramisu));
  pruef('Gast sieht "lebendig:" nie als Zusatzstoff', d.zusatz.length === 1 && !/lebendig/.test(d.zusatz.join()), JSON.stringify(d.zusatz));
  pruef('Dialog ohne Seitenfehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bild: werkzeug/ausgabe/lebendig-karte.png');
  process.exit(rot ? 1 : 0);
})();
