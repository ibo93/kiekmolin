var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var fn=fs.readFileSync('/home/user/kiekmolin/netlify/functions/menu-scan.js','utf8');
var h=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');

// ---- Prompt: nur ablesen ----
t('Auswahlliste zum Erfinden ist WEG',
  !/Vorspeisen, Salate, Suppen, Pizza,/.test(fn) || !/Nur wenn wirklich keine passt/.test(fn));
t('Kategorie = gedruckte Ueberschrift', /Die Kategorie eines Gerichts ist die UEBERSCHRIFT/.test(fn));
t('Beispiel "Vom Grill" bleibt "Vom Grill"', /NICHT "Fleischgerichte"/.test(fn));
t('keine Ueberschrift sichtbar -> leerer String', /LEEREN STRING "" zurueck/.test(fn));
t('Raten ausdruecklich verboten', /Rate NICHT, welche Ueberschrift/.test(fn));
t('Server macht aus leer NICHT mehr "Sonstiges"',
  /category: String\(it\.category \|\| ''\)\.trim\(\)/.test(fn));

// ---- Client: Fortschreibung wirklich ausfuehren ----
var m = h.match(/var _letzteKat = '';[\s\S]*?it\.category = 'Sonstiges';\n\s*\}\);/);
var code = 'var aiItems = ITEMS;' + m[0] + '; return aiItems;';
function lauf(items){ return new Function('ITEMS', code)(items); }

var r = lauf([
  { name:'Bruschetta', category:'Vorspeisen' },
  { name:'Carpaccio',  category:'' },            // untere Bildhaelfte
  { name:'Pizza Sal.', category:'Pizzen' },
  { name:'Pizza Funghi', category:'' },          // naechste Seite
  { name:'Tiramisu',   category:'Desserts' }
]);
t('leere Kategorie erbt die vorige',
  r[1].category === 'Vorspeisen' && r[3].category === 'Pizzen',
  JSON.stringify(r.map(function(x){return x.category;})));
t('gesetzte Kategorien bleiben unangetastet',
  r[0].category === 'Vorspeisen' && r[2].category === 'Pizzen' && r[4].category === 'Desserts');

var r2 = lauf([{ name:'Brot', category:'' }, { name:'Oliven', category:'' }]);
t('ganz ohne Ueberschrift -> Sonstiges',
  r2[0].category === 'Sonstiges' && r2[1].category === 'Sonstiges',
  JSON.stringify(r2.map(function(x){return x.category;})));

var r3 = lauf([{ name:'A', category:'  ' }, { name:'B', category:'Suppen' }, { name:'C', category:'   ' }]);
t('Leerzeichen zaehlen als leer',
  r3[0].category === 'Sonstiges' && r3[2].category === 'Suppen',
  JSON.stringify(r3.map(function(x){return x.category;})));

t('Seitenreihenfolge ist Voraussetzung -- dokumentiert',
  /in Seitenreihenfolge zusammenfuegen/.test(h));
console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
