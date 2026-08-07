var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var sw=fs.readFileSync('/home/user/kiekmolin/sw.js','utf8');
var html=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');

t('Huelle: Netz zuerst, nicht mehr Cache zuerst',
  /ZUERST DAS NETZ/.test(sw) && !/Cache vorhanden -> sofort anzeigen/.test(sw));
t('Cache nur noch als Rueckfall bei fehlendem Netz',
  /Kein Netz -> letzte bekannte Fassung/.test(sw));
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
