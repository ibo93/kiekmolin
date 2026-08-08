var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var html=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
var fn=fs.readFileSync('/home/user/kiekmolin/netlify/functions/menu-scan.js','utf8');

// ---- Server: Allergen-Normalisierung wirklich ausfuehren ----
var m = fn.match(/var ALLERGEN_CODES[\s\S]*?\nfunction normZusatzstoffe[\s\S]*?\n\}/);
var mod = new Function(m[0] + '; return { a: normAllergene, z: normZusatzstoffe };')();
t('Codes werden uebernommen', JSON.stringify(mod.a(['gluten','milch'])) === '["gluten","milch"]');
t('Buchstaben A/C/G werden uebersetzt',
  JSON.stringify(mod.a(['A','C','G'])) === '["gluten","eier","milch"]', JSON.stringify(mod.a(['A','C','G'])));
t('Klammern und Punkte stoeren nicht', JSON.stringify(mod.a(['(a)','c.'])) === '["gluten","eier"]');
t('ausgeschriebene Woerter werden erkannt',
  JSON.stringify(mod.a(['Weizen','Laktose','Nüsse'])) === '["gluten","milch","schalenfruechte"]', JSON.stringify(mod.a(['Weizen','Laktose','Nüsse'])));
t('Doppelte fliegen raus', JSON.stringify(mod.a(['a','A','gluten'])) === '["gluten"]');
t('Unsinn wird verworfen', JSON.stringify(mod.a(['zzz','','42'])) === '[]');
t('Zusatzstoffe: nur Ziffern 1-13', JSON.stringify(mod.z(['1','2','13'])) === '["1","2","13"]');
t('Zusatzstoffe: 0 und 14 raus', JSON.stringify(mod.z(['0','14','7'])) === '["7"]');
t('Zusatzstoffe: Buchstaben landen NICHT hier', JSON.stringify(mod.z(['a','c'])) === '[]');
t('Zusatzstoffe: "Nr. 3" wird zu 3', JSON.stringify(mod.z(['Nr. 3'])) === '["3"]');

// ---- Server: Prompt + Schema ----
t('Prompt wirft Klammer-Codes nicht mehr weg', !/NICHT in die Beschreibung uebernehmen/.test(fn));
t('Prompt erklaert die Buchstaben-Zuordnung', /A=gluten B=krebstiere C=eier/.test(fn));
t('Prompt verbietet Raten', /Rate NICHT/.test(fn));
t('Prompt: Kategorie ist die gedruckte Ueberschrift, nicht frei gewaehlt',
  /DU ERFINDEST KEINE KATEGORIEN/.test(fn) && /liest die Ueberschriften der Karte ab/.test(fn));
// Die Liste der vorhandenen Kategorien geht NICHT mehr an das Modell.
// Auf einer echten Karte landeten damit 48 Pizzen unter "Fleischgerichte" --
// ein Wort, das auf der Karte nirgends steht. Das Modell liest Ueberschriften
// ab; das Zusammenfuehren mit vorhandenen Kategorien macht die App in Code.
t('Prompt verbietet das Einsortieren nach Inhalt',
  /Du sortierst NICHT ein\. Du schreibst ab\./.test(fn)
  && /wird NICHT zu "Fleischgerichte"/.test(fn));
t('Ausgabeformat kennt Allergene und Zusatzstoffe als eigene Felder',
  /Allergene: die CODES/.test(fn) && /Zusatzstoffe: NUR Ziffern mit Komma getrennt/.test(fn));
t('Kategorienliste geht NICHT mehr in den Prompt', !/VORHANDENE KATEGORIEN/.test(fn));
t('im Abschnittsmodus wird die Kategorie erzwungen, nicht erbeten',
  /if \(abschnitt\) \{\n\s*alle\.forEach\(function \(it\) \{ it\.category = abschnitt; \}\);/.test(fn));
t('Ueberschriften-Suche verbietet Erfinden ausdruecklich',
  /ERFINDE KEINE UEBERSCHRIFT/.test(fn) && /nicht "Fleischgerichte"/.test(fn));

// ---- Frontend: Kategorie-Zuordnung wirklich ausfuehren ----
// Funktion sauber ueber Klammerzaehlung ausschneiden -- ein Regex greift zu viel.
function schneide(src, name) {
  var i = src.indexOf('function ' + name + '(');
  var j = src.indexOf('{', i), d = 0;
  for (var k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('nicht gefunden: ' + name);
}
var fm = new Function(
  schneide(html, '_editDistance') + ';' +
  schneide(html, 'katSchluessel') + ';' +
  schneide(html, 'findeKategorie') +
  '; return { k: katSchluessel, f: findeKategorie };')();
var vorhanden = {}; ['Pizzen','Salate','Getränke','Suppen'].forEach(function(x){ vorhanden[fm.k(x)] = 'ID_'+x; });
t('"Pizza" findet vorhandene "Pizzen"', fm.f('Pizza', vorhanden) === 'ID_Pizzen', fm.f('Pizza', vorhanden));
t('"Salat" findet vorhandene "Salate"', fm.f('Salat', vorhanden) === 'ID_Salate', fm.f('Salat', vorhanden));
t('"Getraenke" findet "Getränke" (Umlaut)', fm.f('Getraenke', vorhanden) === 'ID_Getränke', fm.f('Getraenke', vorhanden));
t('"GETRÄNKE" findet es auch', fm.f('GETRÄNKE', vorhanden) === 'ID_Getränke');
t('"Desserts" bleibt neu (kein Fehltreffer)', fm.f('Desserts', vorhanden) === null, fm.f('Desserts', vorhanden));
t('"Suppen" faellt NICHT mit "Suessspeisen" zusammen',
  fm.f('Suessspeisen', vorhanden) === null, fm.f('Suessspeisen', vorhanden));
t('"Bier" trifft nicht auf "Biergarten"',
  fm.f('Biergarten', { bier: 'ID_Bier' }) === null, fm.f('Biergarten', { bier: 'ID_Bier' }));

// ---- Frontend: Verdrahtung ----
t('Kategorien werden beim Scannen mitgeschickt', /aiMenuScan\(\{ images: \[bild\], categories: kategorien, weiter: weiter, abschnitt:/.test(html));
t('Kategorien gehen an jede Seite', /scanSeiteParallel\(bild, _vorhandeneKats,/.test(html));
t('Import speichert allergens', /allergens: Array\.isArray\(item\.allergens\)/.test(html));
t('Import haengt Zusatzstoffe an die Gerichtnummer an', /\.concat\(Array\.isArray\(item\.additives\)/.test(html));
t('Neu angelegte Kategorien landen auch in der Zuordnung', /katNorm\[katSchluessel\(catName\)\] = newCat\[0\]\.id/.test(html));

console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
