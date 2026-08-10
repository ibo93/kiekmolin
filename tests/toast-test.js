var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var h=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
t('rote Gast-Meldung bei Lesefehlern ist weg', !/Daten konnten nicht geladen werden/.test(h));
t('Fehler geht weiterhin still in die Fehlerliste', /kind: 'read', status: res\.status/.test(h));
t('Konsole nennt Tabelle und Statuscode', /console\.warn\('\[lesen\] ' \+ tabelle/.test(h));
t('Debug-Schalter vorhanden', /localStorage\.getItem\('kmi_debug'\) === '1'/.test(h));
t('Debug-Meldung weiterhin gedrosselt', /_leseFehlerZuletzt > 8000/.test(h));
t('Schreibfehler melden weiterhin (die sind gewollt)', /Löschen fehlgeschlagen/.test(h));
// --- Bedienung rufen + Hinweiskästen im Kiek-Design ---
t('Bedienung-Knopf kennt den Tisch auch ohne URL',
  /window\._qrTableNumber \|\| \(letzte && letzte\.tisch\)/.test(h));
t('Tisch wird beim Bestellen gemerkt', /sessionStorage\.setItem\('kmi_tisch'/.test(h));
t('Tischinfo verfaellt nach zwei Stunden', /2 \* 60 \* 60 \* 1000/.test(h));
t('ohne Tisch kommt eine verstaendliche Meldung',
  /Wir wissen gerade nicht, an welchem Tisch du sitzt/.test(h));
var _pb = h.slice(h.indexOf('function renderPushOptInBanner'), h.indexOf('function requestNotificationPermission'));
t('iPhone-Hinweis ist nicht mehr orange', !/#fff7ed|#fed7aa|#7c2d12/.test(_pb));
t('alle drei Hinweiskaesten nutzen das Kiek-Gruen',
  (h.match(/kmi-push-banner" style="background:rgba\(0,61,51,0\.05\)/g) || []).length >= 3);
t('keine bunten Fremdfarben mehr in den Push-Hinweisen',
  !/#dcfce7|#86efac|#065f46|#f3f4f6|#d1d5db/.test(h.slice(h.indexOf('function renderPushOptInBanner'), h.indexOf('function requestNotificationPermission'))));

console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
