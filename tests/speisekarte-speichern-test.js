// SPEISEKARTE: KEIN SCHEINBARES SPEICHERN (07.10.2026).
//
// Durchsicht des Editors: "ausverkauft", "Gericht gespeichert", "N Preise
// aktualisiert", "Kategorie gelöscht" kamen auch dann, wenn die Datenbank
// nichts geaendert hatte (RLS: 200 mit [] oder 204). Ein leeres Preisfeld
// speicherte 0,00 €. Kategorie loeschen loeschte erst die Gerichte.
//
// Hier laufen die echten Funktionen in einer Sandbox gegen eine
// nachgebaute Datenbank: einmal mit Recht (Zeile zurueck), einmal ohne
// (200 mit []).
//
// Gegenprobe (jede rot): toggleSoldOut wieder nur res.ok, Preis wieder
// "|| 0", deleteCategory wieder Gerichte zuerst, Bulk-Preis ohne Pruefung.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + JSON.stringify(x))); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; if (H.slice(i - 6, i) === 'async ') i -= 6; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

function welt(recht) {
  var w = { toasts: [], anfragen: [], felder: {}, bestaetigt: true };
  var sb = {
    SUPA_URL: 'https://x', SUPA_KEY: 'anon', SUPABASE_KEY: 'anon', kmiToken: function () { return 'jwt'; },
    window: {}, console: { warn: function () {}, error: function () {} },
    showToast: function (m, a) { w.toasts.push([m, a]); },
    renderMenuCategories: function () {}, updateMenuStats: function () {}, updateBulkCounter: function () {}, closeGenericModal: function () {},
    kinConfirm: function () { return Promise.resolve(w.bestaetigt); },
    sichereKarte: function () { return Promise.resolve(true); },
    groessenAusMaske: function () { return null; }, scharfWert: function (x) { return x; },
    document: { getElementById: function (id) { return w.felder[id] || { value: '', checked: false }; } },
    currentMenuRestaurant: 'r1',
    menuItems: [{ id: 'i1', name: 'Matjes', base_price: 12, is_available: true, category_id: 'k1' }, { id: 'i2', name: 'Scholle', base_price: 18, category_id: 'k1' }],
    menuCategories: [{ id: 'k1', name: 'Fisch' }],
    bulkSelectedItems: {},
    fetch: function (url, o) {
      var body = o && o.body ? JSON.parse(o.body) : null;
      w.anfragen.push({ url: url, m: o && o.method, body: body, prefer: o && o.headers && o.headers.Prefer });
      var zeilen = recht ? [Object.assign({ id: 'i1', name: 'Matjes', is_available: true }, body || {})] : [];
      return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(zeilen)); }, clone: function () { return { json: function () { return Promise.resolve(zeilen); } }; } });
    },
    Promise: Promise, JSON: JSON, Number: Number, Math: Math, String: String, Array: Array, Object: Object, isFinite: isFinite, Error: Error, Event: function () {}
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(['menuPreisLesen', 'menuSitzungAuffrischen', 'menuKeinRechtText', 'menuSchreiben', 'menuZeilenOk', 'toggleSoldOut', 'saveEditedItem', 'calcNewPrice', 'applyBulkPrice', 'deleteCategory'].map(fn).join('\n'), sb);
  w.sb = sb;
  return w;
}

(async function () {
  // Preis lesen
  var w = welt(true);
  t('Preis: "12,50" -> 12.5, "€ 9,90" -> 9.9, "" -> null, "abc" -> null, "0" -> 0',
    w.sb.menuPreisLesen('12,50') === 12.5 && w.sb.menuPreisLesen('€ 9,90') === 9.9 && w.sb.menuPreisLesen('') === null && w.sb.menuPreisLesen('abc') === null && w.sb.menuPreisLesen('0') === 0, '');

  // Ausverkauft
  w = welt(false); await w.sb.toggleSoldOut('i1');
  t('ohne Recht: KEIN "ausverkauft", sondern Fehler -- Gericht bleibt im Dashboard verfuegbar',
    w.sb.menuItems[0].is_available === true && w.toasts.length === 1 && w.toasts[0][1] === 'error' && /weiter bestellbar/.test(w.toasts[0][0]), w.toasts);
  t('... und es wurde mit return=representation gefragt', w.anfragen[0].prefer === 'return=representation', w.anfragen[0]);
  w = welt(true); await w.sb.toggleSoldOut('i1');
  t('mit Recht: ausverkauft', w.sb.menuItems[0].is_available === false && /ausverkauft/.test(w.toasts[0][0]), w.toasts);

  // Gericht bearbeiten
  function maske(w, preis) { w.felder = { editItemName: { value: 'Matjes' }, editItemDesc: { value: '' }, editItemPrice: { value: preis }, editItemCat: { value: 'k1' }, editItemVeg: { checked: false }, editItemVegan: { checked: false }, editItemSpicy: { checked: false }, editItemAvail: { checked: true } }; }
  w = welt(true); maske(w, ''); await w.sb.saveEditedItem('i1');
  t('leeres Preisfeld: NICHT gespeichert (frueher 0,00 €)', w.anfragen.length === 0 && /gültigen Preis/.test(w.toasts[0][0]), w.toasts);
  w = welt(true); maske(w, '12,50'); await w.sb.saveEditedItem('i1');
  t('"12,50" wird 12.5 gespeichert (frueher 12)', w.anfragen[0] && w.anfragen[0].body.base_price === 12.5 && /gespeichert/.test(w.toasts[0][0]), w.anfragen[0] && w.anfragen[0].body);
  w = welt(false); maske(w, '12,50'); await w.sb.saveEditedItem('i1');
  t('ohne Recht: "Nicht gespeichert", kein "Gericht gespeichert!"', w.toasts.length === 1 && /Nicht gespeichert/.test(w.toasts[0][0]) && w.toasts[0][1] === 'error', w.toasts);

  // Bulk-Preis
  w = welt(false); w.sb.bulkSelectedItems = { i1: true, i2: true }; w.felder = { bulkPriceValue: { value: '1' } };
  await w.sb.applyBulkPrice('add');
  t('Bulk-Preis ohne Recht: Fehler mit Anzahl, Preise im Dashboard unveraendert',
    /0 Preise geändert, 2 NICHT/.test(w.toasts[0][0]) && w.sb.menuItems[0].base_price === 12 && w.sb.menuItems[1].base_price === 18, w.toasts);

  // Kategorie loeschen
  w = welt(false); await w.sb.deleteCategory('k1');
  var dels = w.anfragen.filter(function (a) { return a.m === 'DELETE'; });
  t('Kategorie ohne Recht: KEIN Gericht geloescht (erst Rechte-Probe an der Kategorie)', dels.length === 0 && w.sb.menuItems.length === 2 && /nicht gelöscht/.test(w.toasts[0][0]), { anfragen: w.anfragen.map(function (a) { return a.m + ' ' + a.url; }), toasts: w.toasts });
  w = welt(true); await w.sb.deleteCategory('k1');
  var reihe = w.anfragen.map(function (a) { return a.m + ' ' + a.url.replace('https://x/rest/v1/', ''); });
  t('mit Recht: Probe an der Kategorie, dann Gerichte, dann Kategorie', reihe.join(' | ') === 'PATCH menu_categories?id=eq.k1 | DELETE menu_items?category_id=eq.k1 | DELETE menu_categories?id=eq.k1', reihe);
  w = welt(true); w.sb.menuItems = []; w.bestaetigt = false; await w.sb.deleteCategory('k1');
  t('auch eine LEERE Kategorie wird nur nach Rueckfrage geloescht', w.anfragen.length === 0, w.anfragen);

  // Quelltext: Allergene, Abgleich, Sortieren, Laden
  t('Allergene: return=representation und Zeilen-Pruefung', /'Prefer': 'return=representation' \},\s*body: JSON\.stringify\(\{ allergens: g\.allergens \}\)[\s\S]{0,200}if \(await menuZeilenOk\(res\)\)/.test(H), '');
  t('Abgleich zaehlt nur bestaetigte Zeilen', (H.match(/await menuZeilenOk\(r2?\)/g) || []).length >= 3, '');
  var sort = fn('saveCategoryOrder') + fn('saveItemOrder');
  t('Sortieren: .select() und Zeilen-Pruefung, bei Fehler neu laden', (sort.match(/\.select\('id'\)/g) || []).length === 3 && (sort.match(/throw new Error\(menuKeinRechtText\(\)\)/g) || []).length === 3 && (sort.match(/menuNeuLaden\(\)/g) || []).length === 2, '');
  t('Erstes Laden prueft res.ok und ob eine Liste kommt', /if \(!res\.ok\) throw new Error\('Kategorien: Fehler '/.test(H) && /if \(!Array\.isArray\(items\)\) throw new Error\('Gerichte: unerwartete Antwort'\)/.test(H), '');
  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
