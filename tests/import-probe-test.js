// DER IMPORT WIRD WIRKLICH AUSGEFUEHRT -- gegen eine Datenbank-Attrappe, die
// vier Spalten nicht kennt.
//
// Der Fehler, den diese Datei festhält, kam so aus dem Betrieb:
// "beim Importieren fehlen paar ... die ersten Pizzen waren es".
//
// Kennt die Datenbank eine Spalte nicht, meldet PostgREST 400 und nennt sie.
// Der Import nahm das Feld heraus und versuchte es GENAU EINMAL erneut. Bei
// mehreren unbekannten Spalten scheiterte der zweite Versuch am nächsten
// Feld -- das Gericht war weg. Jede unbekannte Spalte kostete also ein
// Gericht, und immer eines der ERSTEN: danach war das Feld gemerkt und wurde
// gar nicht mehr mitgeschickt.
//
// Nachgestellt mit vier unbekannten Spalten: Pizza 1, 2 und 3 gingen
// verloren, ab Pizza 4 lief alles. Genau das Bild.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
const fs = require('fs');

// Seit die App das Sitzungs-Token benutzt, ruft der ausgeschnittene
// Code kmiToken(). Im Browser ist das eine globale Funktion -- hier
// gehoert sie zur nachgebauten Umgebung, genau wie sbRead oder showToast.
var KMI_STUB = 'var kmiToken = function () { return typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY '
    + ': (typeof SUPA_KEY !== "undefined" ? SUPA_KEY : "anon"); };\n';

const H = fs.readFileSync(KMI + '/index.html', 'utf8');
console.error = function () {};   // erwartete Meldungen der Attrappe
function cut(n){let i=H.indexOf('async function '+n+'(');if(i<0)i=H.indexOf('function '+n+'(');
 const j=H.indexOf('{',i);let d=0;for(let k=j;k<H.length;k++){if(H[k]==='{')d++;else if(H[k]==='}'){d--;if(!d)return H.slice(i,k+1);}}}

const FEHLT = (process.env.NUR_TYP ? [] : ['sizes','is_lamb','allergens','additives']);
const NUR_TEXT = process.env.NUR_TYP === '1';   // Spalte da, aber text statt jsonb
let gespeichert = [];

global.fetch = async function (url, opts) {
  const u = String(url);
  if (u.indexOf('menu_categories') >= 0) {
    if (opts && opts.method === 'POST') return { ok:true, json: async()=>[{id:'k1', name:'Pizza'}] };
    return { ok:true, json: async()=>[{id:'k1', name:'Pizza'}] };
  }
  if (u.indexOf('menu_items') >= 0 && opts && opts.method === 'POST') {
    const b = JSON.parse(opts.body);
    // Spalte existiert, hat aber den falschen Typ: die Datenbank lehnt nur
    // den WERT ab. Früher war das Feld damit verloren.
    if (NUR_TEXT && typeof b.sizes === 'object' && b.sizes !== null) {
      return { ok:false, status:400,
        clone: () => ({ text: async () => JSON.stringify({ message: 'invalid input syntax for type json' }) }),
        text: async () => 'invalid input syntax for type json' };
    }
    const treffer = FEHLT.filter(f => f in b);
    if (treffer.length) {
      return { ok:false, status:400,
        clone: () => ({ text: async () => JSON.stringify({ message: "Could not find the '" + treffer[0] + "' column of 'menu_items'" }) }),
        text: async () => "Could not find the '" + treffer[0] + "' column" };
    }
    gespeichert.push(b.name);
    return { ok:true, json: async()=>[{id:'x'}] };
  }
  if (u.indexOf('activity_log') >= 0) return { ok:true };
  return { ok:true, json: async()=>[], text: async()=>'' };
};

const umw = {
  SUPA_URL:'https://x', SUPA_KEY:'k', SUPABASE_URL:'https://x', SUPABASE_KEY:'k',
  currentMenuRestaurant:'r1', RESTAURANT_ID:'r1',
  showToast:()=>{}, sbRead:(u,o)=>fetch(u,o), sbWrite:(u,o)=>fetch(u,o),
  document:{ querySelector:()=>null, getElementById:()=>null },
  loadMenuForRestaurant:()=>{}, katSchluessel:(x)=>String(x).toLowerCase(),
  findeKategorie:()=>null, sichereKarte:async()=>true, karteAbgleichen:()=>null,
  zeigeKartenAbgleich:()=>{}, window:{ menuItems: [] },
  // Die Anleitung bei fehlenden Spalten braucht das DOM -- hier nicht nötig,
  // geprüft wird sie in tests/größe-bestellung-test.js.
  _zeigeSpaltenHilfe:()=>{},
  // Extras sind ein eigener Weg -- geprüft in tests/extras-test.js.
  legeExtrasAn: async () => ({ angelegt: 0, uebersprungen: 0 }),
  // is_spicy ist in der Datenbank eine Zahl, keine Ja/Nein-Spalte.
  // Geprüft wird die Umrechnung in tests/gericht-speichern-test.js.
  scharfWert: (x) => (x ? 1 : 0)
};

const gerichte = [];
for (let i = 1; i <= 10; i++) gerichte.push({ name:'Pizza '+i, price:7, category:'Pizza',
  dish_number:String(i), selected:true, description:'', sizes:[{name:'klein',price:7},{name:'groß',price:9}],
  allergens:['gluten'], additives:['1'], is_vegetarian:false });

(async () => {
  const f = new Function(...Object.keys(umw), 'GERICHTE',
    KMI_STUB + 'var scannedMenuItems = GERICHTE;\n' + cut('importScannedMenu')
    + '\nreturn importScannedMenu();');
  await f(...Object.values(umw), gerichte);
  console.log('Datenbank kennt diese Spalten nicht: ' + FEHLT.join(', '));
  console.log('hineingegeben: ' + gerichte.length + '   gespeichert: ' + gespeichert.length);
  const fehlt = gerichte.map(g=>g.name).filter(n => gespeichert.indexOf(n) < 0);
  var ok = 0, n = 0;
  function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
  t('kein Gericht geht verloren, egal wieviele Spalten fehlen',
    fehlt.length === 0, 'FEHLEN: ' + fehlt.join(', '));
  t('alle 10 sind gespeichert', gespeichert.length === 10, gespeichert.length);
  t('falscher Spaltentyp (text statt jsonb) kostet ebenfalls kein Gericht',
    /invalid input syntax\|malformed\|cannot be cast/.test(H)
    && /_alsTextSenden\[k\] = 1/.test(H));
  t('die Entscheidung "als Text senden" gilt fuer ALLE weiteren Gerichte',
    /Object\.keys\(_alsTextSenden\)\.forEach\(function \(k\) \{\s*\n\s*if \(itemData\[k\] && typeof itemData\[k\] === 'object'\)/.test(H));
  t('die Wiederholung laeuft in einer Schleife, nicht genau einmal',
    /while \(!itemRes\.ok && itemRes\.status === 400 && versuche < 12\)/.test(H));
  t('bei einem ANDEREN Fehler wird abgebrochen, nicht endlos wiederholt',
    /if \(!spalte \|\| !\(spalte in itemData\)\) break;/.test(H));
  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})();
