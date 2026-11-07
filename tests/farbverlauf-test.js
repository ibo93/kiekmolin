// FARBVERLAUF IM KOPF DER RESTAURANTSEITE (Ibo, 07.11.2026).
// Das Foto laeuft unten in die Wirte-Farbe (--marke) aus, nicht mehr ins Weisse.
// Was hier kaputtgehen kann, ohne dass es auffaellt:
//   - jemand schreibt wieder eine feste Farbe hinein -> alle Seiten gleich
//   - der Rueckfall fehlt -> aeltere iPhones (Safari < 16.2, kein color-mix)
//     bekommen GAR keinen Verlauf, die Karte haengt auf hartem Foto
//   - die Reihenfolge ist falsch -> der Rueckfall ueberschreibt den neuen
var fs = require('fs'), h = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + JSON.stringify(x))); }
var m = /<div class="lp-farbverlauf" style="([^"]*)"/.exec(h);
var st = m ? m[1] : '';
var teile = st.split(/;(?=background:)/);
t('Verlauf-Ebene im Kopf vorhanden', !!m);
t('Neuer Verlauf endet in var(--marke)', /var\(--marke,#003d33\) 100%\)/.test(st), st);
t('Mit color-mix weicher Uebergang in die Marke', /color-mix\(in srgb, var\(--marke/.test(st), st);
t('Rueckfall ohne color-mix steht ZUERST', teile.length >= 2 && !/color-mix/.test(teile[0]) && /color-mix/.test(teile[teile.length - 1]), teile);
t('Oben bleibt der Schatten fuer die schwebende Leiste', /rgba\(0,0,0,0\.4\) 0%, transparent 30%/.test(teile[teile.length - 1] || ''));
t('Verlauf liegt im Kopf (#lpHero), nach dem Foto', h.indexOf('class="lp-farbverlauf"') > h.indexOf('id="lpHeroBg2"') && h.indexOf('class="lp-farbverlauf"') - h.indexOf('id="lpHero"') < 4000);
t('--marke wird an der Seite gesetzt (sonst faellt alles auf Gruen)', /landing\.style\.cssText = '--marke:' \+ _marke/.test(h));
console.log('\n' + ok + '/' + n + (ok === n ? ' grün' : ' ROT'));
process.exit(ok === n ? 0 : 1);
