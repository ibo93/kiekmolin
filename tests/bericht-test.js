var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var h=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
// Der Kern (Prompt, Parser, Modellaufruf) liegt seit dem Umbau in
// lib/scan-kern.js und wird von beiden Wegen benutzt -- dem einfachen
// ohne Zeitlimit und der Rueckfallebene mit Abschnitten. Die Pruefungen
// muessen deshalb BEIDE Dateien sehen.
var fn=fs.readFileSync('/home/user/kiekmolin/netlify/functions/menu-scan.js','utf8')
      + fs.readFileSync('/home/user/kiekmolin/netlify/functions/lib/scan-kern.js','utf8');

// --- Prompt: Ueberschrift gilt fuer ALLES darunter ---
t('Prompt erklaert, wie eine Speisekarte aufgebaut ist',
  /SO FUNKTIONIERT EINE SPEISEKARTE/.test(fn));
t('Prompt: alle zwoelf Pizzen, nicht nur die erste',
  /bekommen ALLE ZWOELF die Kategorie "Pizza"/.test(fn));
t('Prompt: leer NUR beim Bildanfang mitten im Abschnitt',
  /NUR EIN EINZIGER FALL ergibt eine leere Kategorie/.test(fn));
t('Prompt verbietet ausdruecklich das alte Missverstaendnis',
  /Lass die Kategorie NIEMALS leer,/.test(fn));

// --- Server liefert Diagnose ---
t('Antwort enthaelt meta', /meta: \{[\s\S]{0,400}modell: ANTHROPIC_MODEL/.test(fn));
t('meta zaehlt Rohtreffer und Duplikate', /roh: alle\.length/.test(fn) && /duplikate: alle\.length - deduped\.length/.test(fn));
t('meta sagt, ob die OCR lief', /ocr: ocr\.length > 0/.test(fn));
t('meta zeigt Dauer und Zeitbudget an', /ms: Date\.now\(\) - T0/.test(fn) && /budget: BUDGET_MS/.test(fn));
t('meta sagt, ob abgebrochen wurde und warum', /abgebrochen: !!r\.abgebrochen/.test(fn) && /stopReason: r\.stopReason/.test(fn));

// --- Client sammelt und zeigt ---
t('Client hebt meta auf', /window\._scanMeta = window\._scanMeta \|\| \[\]\)\.push\(j\.meta\)/.test(h));
t('Bericht wird nach dem Scan gebaut', /window\._scanBericht = \{/.test(h));
t('Bericht misst die Dauer', /_scanStart/.test(h));
t('Bericht zaehlt Gerichte ohne Preis', /ohnePreis:/.test(h));
t('Bericht zeigt vorhandene UND erkannte Kategorien',
  /vorhandeneKategorien: _vorhandeneKats/.test(h) && /kategorien: kats/.test(h));
t('Aufklappbarer Bericht in der Pruefliste', /Scan-Bericht/.test(h) && /<details/.test(h));
t('Kopier-Knopf vorhanden', /kopiereScanBericht/.test(h));

// --- Kopierfunktion wirklich ausfuehren ---
function schneide(src,name){var i=src.indexOf('function '+name+'(');var j=src.indexOf('{',i),d=0;
  for(var k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
var kopiert=null;
var sandbox = {
  window:{ _scanBericht:{dauer:'12.4 s',modell:'claude-sonnet-5',bilder:4,seitenOhneErgebnis:0,
            ocr:'nein',rohTreffer:82,nachDuplikaten:78,ohnePreis:2,
            vorhandeneKategorien:['Pizzen'],kategorien:{'Pizzen':12,'Vom Grill':6}},
           scannedMenuItems:[{category:'Pizzen',name:'Margherita',price:8.5,allergens:['gluten']},
                             {category:'Vom Grill',name:'Rumpsteak',price:26}] },
  navigator:{ clipboard:{ writeText:function(txt){ kopiert=txt; return Promise.resolve(); } } },
  document:{ createElement:function(){return {style:{},addEventListener:function(){},select:function(){},remove:function(){}};},
             body:{appendChild:function(){}} },
  setTimeout:function(){}
};
new Function('window','navigator','document','setTimeout',
  schneide(h,'kopiereScanBericht')+';'+schneide(h,'_berichtNotfall')+';kopiereScanBericht(null);')
  (sandbox.window,sandbox.navigator,sandbox.document,sandbox.setTimeout);

t('Kopierter Text enthaelt die Kennzahlen',
  /Erkannt: 82 -> nach Duplikaten 78/.test(kopiert||''), JSON.stringify((kopiert||'').slice(0,80)));
t('Kopierter Text listet die Kategorien', /Pizzen: 12/.test(kopiert||''));
t('Kopierter Text zeigt Beispielgerichte mit Preis und Allergen',
  /\[Pizzen\] Margherita \| 8\.5 EUR \| gluten/.test(kopiert||''),
  (kopiert||'').split('\n').slice(-2)[0]);
t('Kopierter Text nennt die vorhandenen Kategorien', /Vorhandene Kategorien: Pizzen/.test(kopiert||''));

console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
