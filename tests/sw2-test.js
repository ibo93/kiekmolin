var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var sw=fs.readFileSync(KMI + '/sw.js','utf8');
var html=fs.readFileSync(KMI + '/index.html','utf8');

t('Huelle: Netz zuerst, nicht mehr Cache zuerst',
  /ZUERST DAS NETZ/.test(sw) && !/Cache vorhanden -> sofort anzeigen/.test(sw));
// Erst hiess die Regel "Cache nur bei FEHLENDEM Netz". Das deckte den
// haeufigeren Fall nicht ab: ein langsames Netz schlaegt nicht fehl, es
// dauert -- und der Gast sah dreissig Sekunden weiss, waehrend die Seite im
// Cache lag. Jetzt gilt der Rueckfall auch bei zu langsam; das Verhalten
// dazu steht in sw-geduld-test.js und wird dort wirklich ausgefuehrt.
t('Cache als Rueckfall, wenn das Netz fehlt ODER zu lange braucht',
  /NETZ_GEDULD_MS/.test(sw) && /Promise\.race/.test(sw));
t('Cache-Name hochgezogen (alter Bestand fliegt raus)', /kmi-shell-v2/.test(sw));
t('Notausgang /?nosw=1 bleibt', /nosw'\) === '1'/.test(sw));
t('Fehler beim Cache kippt die Seite nicht', (sw.match(/catch \(e[0-9]?\) \{\}/g)||[]).length >= 3);
t('Bilder/Symbole werden weiterhin gecacht', /png\|jpg\|jpeg\|webp\|svg\|ico\|woff/.test(sw));
t('Datenbank + Functions weiterhin nie gecacht',
  /indexOf\('\/rest\/v1\/'\) === 0\) return/.test(sw) && /indexOf\('\/\.netlify\/'\) === 0\) return/.test(sw));
t('Push-Handler unberuehrt', /addEventListener\('push'/.test(sw));
t('toter Melde-Code raus (sw)', !/melde\(|function kennung/.test(sw));
t('toter Empfaenger raus (app)', !/neue-version/.test(html));

console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
