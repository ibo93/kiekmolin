var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var html=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
var fn=fs.readFileSync('/home/user/kiekmolin/netlify/functions/menu-scan.js','utf8');

// --- Antwortschema fuer Claude ---
t('Claude bekommt jetzt ein festes Antwortschema', /output_config:.*json_schema/s.test(fn));
t('Schema deckt alle Felder als Pflicht ab', /required: \['name', 'description', 'price', 'category', 'dish_number'/.test(fn));
t('Schema verbietet erfundene Zusatzfelder', (fn.match(/additionalProperties: false/g)||[]).length >= 2);
t('Rueckfall ohne Schema, falls es abgelehnt wird', /return callAnthropic\(key, images, text, extra, true, kategorien\)/.test(fn));
t('Gemini behaelt sein Schema', /responseSchema: GEMINI_SCHEMA/.test(fn));

// --- Bildaufbereitung ---
var seg = html.slice(html.indexOf('function splitImageVertically'), html.indexOf('async function startMenuScan'));
t('skaliert auf die lange Kante (2576), nicht auf die Breite',
  /MAX_KANTE = 2576/.test(seg) && /MAX_KANTE \/ Math\.max\(w, sh\)/.test(seg));
t('alte Breiten-Begrenzung 2400 ist weg', !/2400 \/ img\.width/.test(seg));
t('hohe Karten werden in Haelften geschnitten', /teile = 2/.test(seg) && /verhaeltnis >= 1\.25/.test(seg));
t('Panorama bekommt drei Teile', /verhaeltnis >= 2\.4/.test(seg) && /teile = 3/.test(seg));
t('Schnitt quer, nicht laengs (Spalten bleiben heil)',
  /drawImage\(img, 0, y0, w, sh, 0, 0, cw, ch\)/.test(seg));
t('Ueberlappung gegen zerschnittene Zeilen', /UEBERLAPPUNG = 0\.08/.test(seg));
t('weisser Grund gegen schwarze Transparenz', /fillStyle = '#ffffff'/.test(seg));

// --- Paralleles Scannen ---
var scan = html.slice(html.indexOf('async function startMenuScan'), html.indexOf('async function startMenuScan')+4000);
t('Seiten werden parallel gelesen', /await Promise\.all\(images\.map/.test(scan));
t('alte Warteschleife ist weg', !/for \(var pi = 0; pi < images\.length; pi\+\+\)/.test(scan));
t('Fortschritt wird weiterhin angezeigt', /Seiten gelesen/.test(scan));
t('eine kaputte Seite kippt nicht den ganzen Scan', /\.catch\(function \(\) \{ return \[\]; \}\)/.test(scan));

console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
