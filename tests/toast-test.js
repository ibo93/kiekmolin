var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var h=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
t('rote Gast-Meldung bei Lesefehlern ist weg', !/Daten konnten nicht geladen werden/.test(h));
t('Fehler geht weiterhin still in die Fehlerliste', /kind: 'read', status: res\.status/.test(h));
t('Konsole nennt Tabelle und Statuscode', /console\.warn\('\[lesen\] ' \+ tabelle/.test(h));
t('Debug-Schalter vorhanden', /localStorage\.getItem\('kmi_debug'\) === '1'/.test(h));
t('Debug-Meldung weiterhin gedrosselt', /_leseFehlerZuletzt > 8000/.test(h));
t('Schreibfehler melden weiterhin (die sind gewollt)', /Löschen fehlgeschlagen/.test(h));
console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
