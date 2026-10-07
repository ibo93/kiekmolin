// SPEISEKARTE AM IPAD (07.10.2026).
//
// Gemessen mit werkzeug/speisekarte-messen.js (iPad 1180x820): Knoepfe 32 px,
// Loeschen direkt neben Bearbeiten, nach jedem Tipp auf "Ausverkauft" klappten
// alle Kategorien zu, keine Suche, Kategorien nur per Ziehen sortierbar (am
// iPad praktisch nicht), Gericht-Zeilen ~190 px hoch (die gleichnamige
// .menu-item-image-Regel der Gaeste-Karte galt mit).
//
// Hier laeuft der echte Code in einer Sandbox: Suche, Offen-Halten,
// Escaping, Kategorie-Pfeile, Mehrfach-Ausverkauft mit Teil-Fehler.
//
// Gegenprobe (jede rot): _menuOffen in toggleMenuCategory nicht mehr
// gemerkt, _passt immer true, _esc(cat.name) zu cat.name, Grenzpruefung in
// kategorieVerschieben entfernt, catch in bulkVerfuegbar zaehlt als geklappt,
// 44px-Regel entfernt, #sectionSpeisekarte .menu-item-image entfernt.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; if (H.slice(i - 6, i) === 'async ') i -= 6; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var liste = { innerHTML: '' }, karten = {}, toasts = [], gespeichert = 0, kaputt = {};
function karte(id) { return karten[id] || (karten[id] = { _o: false, classList: { toggle: function () { karte(id)._o = !karte(id)._o; }, contains: function () { return karte(id)._o; } }, querySelector: function () { return null; } }); }
var sb = {
  window: {}, String: String, Object: Object, Promise: Promise, Error: Error, Array: Array, Math: Math,
  document: { getElementById: function (id) { if (id === 'menuCategoriesList') return liste; if (/^category-/.test(id)) return karte(id.slice(9)); return { textContent: '', innerHTML: '', style: {} }; } },
  escapeHtml: function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
  getCategoryIconSVG: function () { return ''; }, getDishNumber: function (i) { return i.nr || ''; },
  formatPrice: function (p) { return p + ' €'; }, verkaufsAnzeige: function () { return ''; }, updateCategorySelect: function () {},
  showToast: function (m, typ) { toasts.push([m, typ]); },
  saveCategoryOrder: function () { gespeichert++; },
  menuSchreiben: function (pfad, m, d) { var id = pfad.split('eq.')[1]; if (kaputt[id]) return Promise.reject(new Error('kein Recht')); return Promise.resolve([{ id: id, is_available: d.is_available }]); }
};
vm.createContext(sb);
vm.runInContext('var menuCategories = [], menuItems = [], bulkSelectedItems = {}, bulkMode = false;\n' +
  ['renderMenuCategories', 'toggleMenuCategory', 'kategorieVerschieben', 'bulkVerfuegbar'].map(fn).join('\n'), sb);
function setze(k, i) { vm.runInContext('menuCategories = ' + JSON.stringify(k) + '; menuItems = ' + JSON.stringify(i) + ';', sb); }
function get(x) { return vm.runInContext(x, sb); }

setze([{ id: 'c1', name: 'Vorspeisen', sort_order: 1 }, { id: 'c2', name: 'Pasta <b>neu</b>', sort_order: 2 }, { id: 'c3', name: 'Fisch', sort_order: 3 }],
  [{ id: 'i1', category_id: 'c1', name: 'Bruschetta', price: 6.5 }, { id: 'i2', category_id: 'c2', name: 'Spaghetti Carbonara', description: 'mit Ei', price: 11.5, nr: '23' },
   { id: 'i3', category_id: 'c2', name: 'Penne <img src=x onerror=alert(1)>', price: 12.5 }, { id: 'i4', category_id: 'c3', name: 'Lachs', price: 18 }]);

sb.renderMenuCategories();
t('ohne Suche: alle 3 Kategorien, alle zu', (liste.innerHTML.match(/class="menu-category-card[" ]/g) || []).length === 3 && !/menu-category-card open/.test(liste.innerHTML), '');
t('Namen werden escaped (kein <img onerror> im Editor)', !/<img src=x onerror/.test(liste.innerHTML) && !/<b>neu<\/b>/.test(liste.innerHTML) && /&lt;b&gt;neu/.test(liste.innerHTML), '');

sb.toggleMenuCategory('c2');
sb.renderMenuCategories();
t('aufgeklappte Kategorie bleibt nach Neuzeichnen offen', /menu-category-card open" id="category-c2"/.test(liste.innerHTML) && !/open" id="category-c1"/.test(liste.innerHTML), liste.innerHTML.match(/menu-category-card[^"]*" id="category-c\d"/g));

sb.window._menuSuche = 'carbo';
sb.renderMenuCategories();
t('Suche "carbo": nur Pasta, offen, nur das eine Gericht', /id="category-c2"/.test(liste.innerHTML) && !/id="category-c1"/.test(liste.innerHTML) && /Carbonara/.test(liste.innerHTML) && !/Penne/.test(liste.innerHTML), '');
sb.window._menuSuche = '23';
sb.renderMenuCategories();
t('Suche nach Gericht-Nummer "23" findet Carbonara', /Carbonara/.test(liste.innerHTML) && !/Lachs/.test(liste.innerHTML), '');
sb.window._menuSuche = '';

sb.kategorieVerschieben('c1', -1);
t('erste Kategorie nach oben: nichts passiert, nichts gespeichert', get('menuCategories.map(function(c){return c.id}).join()') === 'c1,c2,c3' && gespeichert === 0, get('menuCategories.map(function(c){return c.id}).join()'));
sb.kategorieVerschieben('c3', -1);
t('Fisch nach oben: Reihenfolge + sort_order neu, einmal gespeichert', get('menuCategories.map(function(c){return c.id+":"+c.sort_order}).join()') === 'c1:1,c3:2,c2:3' && gespeichert === 1, get('menuCategories.map(function(c){return c.id+":"+c.sort_order}).join()'));
var _dis = (liste.innerHTML.match(/kategorieVerschieben\('c\d',-?1\)"[^>]*disabled/g) || []).map(function (x) { return x.slice(22, 28); });
t('Pfeile: oben bei der ersten, unten bei der letzten gesperrt, sonst frei', _dis.join() === "c1',-1,c2',1)", _dis.join());

(async function () {
  kaputt = { i3: true }; toasts = [];
  vm.runInContext('bulkSelectedItems = { i2: true, i3: true };', sb);
  await sb.bulkVerfuegbar(false);
  t('Mehrfach ausverkauft: i2 aus, i3 bleibt (Fehler), Meldung nennt das Gericht', get('menuItems.find(function(i){return i.id==="i2"}).is_available') === false && get('menuItems.find(function(i){return i.id==="i3"}).is_available') !== false
    && toasts.length === 1 && toasts[0][1] === 'error' && /1 geändert, 1 NICHT \(kein Recht\)/.test(toasts[0][0]) && /Penne/.test(toasts[0][0]), JSON.stringify(toasts));
  kaputt = {}; toasts = [];
  vm.runInContext('bulkSelectedItems = { i2: true };', sb);
  await sb.bulkVerfuegbar(true);
  t('wieder verfuegbar: Erfolg nur, wenn wirklich gespeichert', get('menuItems.find(function(i){return i.id==="i2"}).is_available') === true && /1 Gerichte wieder verfügbar/.test(toasts[0][0]), JSON.stringify(toasts));
  toasts = [];
  await sb.bulkVerfuegbar(true);
  t('ohne Auswahl: Hinweis statt stiller Nichtstun', /Bitte zuerst Gerichte auswählen/.test((toasts[0] || [])[0]), JSON.stringify(toasts));

  // ---------- Markup / CSS ----------
  t('Knoepfe im Editor mind. 44 px', /#sectionSpeisekarte \.menu-item-btn,[^{]*\.menu-category-btn[^{]*\{[^}]*min-width: 44px;[^}]*min-height: 44px;|#sectionSpeisekarte \.menu-item-btn,[^{]*\{[^}]*width: 44px;[^}]*height: 44px;/.test(H), '');
  t('Gericht-Bild im Editor 56 px (Gaeste-Regel 192 px gilt hier nicht)', /#sectionSpeisekarte \.menu-item-image \{ width: 56px; height: 56px; min-height: 56px;/.test(H), '');
  t('Suchfeld + Treffer-Anzeige + Lade-Stand da', /id="menuSuche"/.test(H) && /id="menuSucheTreffer"/.test(H) && /data-ladestand="speisekarte"/.test(H), '');
  t('Mehrere bearbeiten: "Heute ausverkauft" / "Wieder verfügbar"', /bulkVerfuegbar\(false\)[^<]*>[\s\S]{0,200}Heute ausverkauft/.test(H) && /bulkVerfuegbar\(true\)[^<]*>[\s\S]{0,200}Wieder verfügbar/.test(H), '');

  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
