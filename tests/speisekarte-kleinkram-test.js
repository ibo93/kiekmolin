// SPEISEKARTE: LOESCHEN MIT RUECKGAENGIG, ESCAPING, KOMBI NICHT HALB (07.10.2026).
//
// 1. Ein Gericht loeschen: vorher drei Wege nacheinander, und lieferte die
//    Leseprobe danach [] (z.B. ohne Leserecht), hiess es "Gericht geloescht".
//    Jetzt ein DELETE mit Zeilen-Pruefung + 10 Sekunden "Rückgängig".
// 2. Bearbeiten-Dialog: Beschreibung mit "&lt;" oder "</textarea>" kam
//    veraendert zurueck bzw. zerbrach den Dialog.
// 3. Kombi-Menue: scheiterte eine Auswahl-Gruppe, stand das Menue schon
//    bestellbar in der Karte -- ohne die Auswahl.
// 4. Gemessen, NICHT gebaut: Gerichtfotos sind nur Links (kein base64 in
//    image_url) -- dafuer war nichts zu reparieren.
//
// Gegenprobe (jede rot): "schonWeg = true" ohne Leseprobe, fertig-Sperre im
// Rueckgaengig-Knopf entfernt, escapeHtml in der textarea entfernt,
// is_available: true beim ersten Anlegen, catch-Zweig in kombiAnlegen entfernt.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; if (H.slice(i - 6, i) === 'async ') i -= 6; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }
function antw(status, body) { return Promise.resolve({ ok: status < 300, status: status, text: function () { return Promise.resolve(body == null ? '' : JSON.stringify(body)); }, json: function () { return Promise.resolve(body); } }); }

var db = {}, toasts = [], anfragen = [], kinder = [], lese = 'ok';
var box = { appendChild: function (e) { kinder.push(e); } };
function el() { var e = { style: {}, attrs: {}, kids: [], setAttribute: function (k, v) { e.attrs[k] = v; }, appendChild: function (k) { e.kids.push(k); }, remove: function () { var i = kinder.indexOf(e); if (i > -1) kinder.splice(i, 1); } }; return e; }
var sb = {
  window: {}, String: String, Array: Array, JSON: JSON, Promise: Promise, Error: Error, Object: Object, encodeURIComponent: encodeURIComponent,
  SUPABASE_URL: 'https://x', SUPABASE_KEY: 'anon', SUPA_URL: 'https://x', SUPA_KEY: 'anon',
  kmiToken: function () { return 'nutzer'; }, menuSitzungAuffrischen: function () { return Promise.resolve(); },
  kinConfirm: function () { return Promise.resolve(true); },
  renderMenuCategories: function () {}, updateMenuStats: function () {},
  showToast: function (m, typ) { toasts.push([m, typ || '']); },
  setTimeout: function () {},
  document: { getElementById: function (id) { return id === 'toastContainer' ? box : null; }, createElement: el },
  sbRead: function (u) { anfragen.push(['GET', u]); if (lese === 'kaputt') return antw(500, {}); var id = u.split('eq.')[1].split('&')[0]; return antw(200, db[id] ? [{ id: id }] : []); },
  fetch: function (u, o) {
    anfragen.push([o.method, u]);
    var id = (u.split('id=eq.')[1] || '');
    if (o.method === 'DELETE') { if (sb._ohneRecht) return antw(200, []); var z = db[id]; delete db[id]; return antw(200, z ? [z] : []); }
    if (o.method === 'POST') { var r = JSON.parse(o.body); db[r.id] = r; return antw(201, [r]); }
    return antw(400, {});
  }
};
vm.createContext(sb);
vm.runInContext('var menuItems = [];\n' + ['menuKeinRechtText', 'menuSchreiben', 'deleteMenuItem', 'gerichtWiederherstellen', 'menuRueckgaengigAnbieten'].map(fn).join('\n'), sb);
function setze(liste) { vm.runInContext('menuItems = ' + JSON.stringify(liste) + ';', sb); }
function ids() { return vm.runInContext('menuItems.map(function(i){return i.id}).join()', sb); }

(async function () {
  var lachs = { id: 'i1', name: 'Lachs', base_price: 18, category_id: 'c1', allergens: ['d'] };
  db = { i1: JSON.parse(JSON.stringify(lachs)), i2: { id: 'i2', name: 'Penne' } };
  setze([lachs, { id: 'i2', name: 'Penne' }]);

  await sb.deleteMenuItem('i1');
  t('Loeschen: ein DELETE, aus der Liste raus', ids() === 'i2' && !db.i1 && anfragen.filter(function (a) { return a[0] === 'DELETE'; }).length === 1, JSON.stringify(anfragen));
  var hinweis = kinder[0];
  var knopf = hinweis && hinweis.kids[1];
  t('Hinweis "„Lachs“ gelöscht" mit Knopf "Rückgängig" (44 px)', !!knopf && hinweis.kids[0].textContent === '„Lachs“ gelöscht' && knopf.textContent === 'Rückgängig' && /min-height:44px/.test(knopf.style.cssText), hinweis && hinweis.kids[0].textContent);
  knopf.onclick(); knopf.onclick();
  await new Promise(function (r) { setImmediate(r); }); await new Promise(function (r) { setImmediate(r); });
  t('Rueckgaengig: genau EIN Wiedereinfuegen, alle Felder wie vorher', anfragen.filter(function (a) { return a[0] === 'POST'; }).length === 1 && JSON.stringify(db.i1) === JSON.stringify(lachs) && /i1/.test(ids()), JSON.stringify(db.i1));
  t('... und es wird gesagt', toasts.some(function (x) { return /„Lachs“ ist wieder da/.test(x[0]); }), JSON.stringify(toasts));

  // ohne Recht: DELETE liefert [] und das Gericht ist noch da -> FEHLER
  toasts = []; kinder = []; sb._ohneRecht = true;
  await sb.deleteMenuItem('i2');
  t('ohne Recht: "Nicht gelöscht", Gericht bleibt, kein Rückgängig', /i2/.test(ids()) && toasts.length === 1 && toasts[0][1] === 'error' && /^Nicht gelöscht/.test(toasts[0][0]) && kinder.length === 0, JSON.stringify(toasts));

  // ohne Recht UND Leseprobe kaputt -> trotzdem kein "schon weg"
  toasts = []; lese = 'kaputt'; delete db.i2;
  await sb.deleteMenuItem('i2');
  t('Leseprobe kaputt: KEIN "schon gelöscht" geraten', /i2/.test(ids()) && toasts[0][1] === 'error', JSON.stringify(toasts));

  // wirklich schon weg (anderes Geraet): Leseprobe [] -> raus, mit Hinweis
  toasts = []; lese = 'ok';
  await sb.deleteMenuItem('i2');
  t('schon von anderem Geraet geloescht: raus aus der Liste, Hinweis', !/i2/.test(ids()) && /War schon gelöscht/.test(toasts[0][0]), JSON.stringify(toasts));
  sb._ohneRecht = false;

  // ---------- Bearbeiten-Dialog ----------
  var ed = fn('editMenuItem');
  t('Dialog: Beschreibung, Name, Nr., Bild, Kategorien escaped',
    /escapeHtml\(item\.description \|\| ''\) \+ '<\/textarea>/.test(ed) && /id="editItemName" value="' \+ escapeHtml\(item\.name/.test(ed)
    && /id="editItemNr" value="' \+ escapeHtml\(dishNr/.test(ed) && /id="editItemImage" value="' \+ escapeHtml\(item\.image_url/.test(ed) && /escapeHtml\(c\.name\)/.test(ed), '');
  t('Groessen-Zeilen escaped', /escapeHtml\(name == null \? '' : name\)/.test(fn('groessenZeile')), '');
  t('Options-Gruppen und Optionen escaped (beide Listen)', (H.match(/escapeHtml\(g\.name\) \+ '<\/strong>/g) || []).length === 2 && (H.match(/escapeHtml\(o\.name\) \+ (defaultBadge|' <span)/g) || []).length === 2, '');

  // ---------- Kombi ----------
  var kdb = [], kaputtBei = 'menu_options', geloescht = null, gepatcht = null;
  var sk = {
    SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', kmiToken: function () { return 'k'; }, JSON: JSON, Array: Array, Number: Number, Error: Error, encodeURIComponent: encodeURIComponent,
    fetch: function (u, o) {
      var tab = u.split('/rest/v1/')[1].split('?')[0];
      if (o.method === 'POST') { if (tab === kaputtBei) return antw(403, { message: 'kein Recht' }); var r = JSON.parse(o.body); r.id = tab + kdb.length; kdb.push([tab, r]); return antw(201, [r]); }
      if (o.method === 'DELETE') { geloescht = u; return antw(200, [{ id: 'x' }]); }
      if (o.method === 'PATCH') { gepatcht = JSON.parse(o.body); return antw(200, [{ id: 'x' }]); }
    }
  };
  vm.createContext(sk); vm.runInContext(fn('kombiAnlegen'), sk);
  var fehler = null;
  try { await sk.kombiAnlegen('r1', 'c1', 'Mittagsmenue', 12.9, [{ name: 'Vorspeise', gerichte: [{ name: 'Suppe' }] }]); } catch (e) { fehler = e; }
  t('Kombi: erst versteckt angelegt', kdb[0] && kdb[0][1].is_available === false, JSON.stringify(kdb[0]));
  t('Kombi: Teil scheitert -> halbes Menue geloescht, Fehler sagt "nichts angelegt"', !!fehler && /nichts angelegt/.test(fehler.message) && /menu_items\?id=eq\.menu_items0/.test(geloescht || '') && gepatcht === null, fehler && fehler.message);
  kdb = []; kaputtBei = ''; geloescht = null;
  await sk.kombiAnlegen('r1', 'c1', 'Mittagsmenue', 12.9, [{ name: 'Vorspeise', gerichte: [{ name: 'Suppe' }] }]);
  t('Kombi: alles da -> erst dann sichtbar geschaltet', gepatcht && gepatcht.is_available === true && geloescht === null, JSON.stringify(gepatcht));

  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
