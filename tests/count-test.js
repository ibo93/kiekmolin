var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var h=fs.readFileSync(KMI + '/index.html','utf8');
t('kein "select=count" mehr in echten Abfragen',
  (h.match(/select=count`/g)||[]).length === 0);
t('presence zaehlt jetzt ueber Kopf statt Spalte', /presence\?[^`]*select=id&limit=1/.test(h));
t('activity_log ebenso', /activity_log\?[^`]*select=id&limit=1/.test(h));
t('Prefer count=exact bleibt (daher kommt die Zahl)', (h.match(/'Prefer': 'count=exact'/g)||[]).length >= 2);
t('Content-Range wird weiterhin ausgelesen', /content-range'\)\?\.split\('\/'\)\[1\]/.test(h));
console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
