// FARBVERLAUF IM KOPF DER LOKALSEITE + WARENKORB, DER VON ALLEIN AUFTAUCHTE
// (07.11.2026).
//
// 1. Ibo, mit Vorher/Nachher-Bildern: "Farbverlauf-Overlay ... oben
//    durchsichtig, nach unten in die Markenfarbe". Vorher lief das Foto in
//    WEISS aus. Im Browser gemessen (Chromium, iPhone 13): Rot bei
//    #7a1f2b, Petrol bei #0f4c4c, Gruen ohne eigene Farbe.
// 2. Ibo, Screenshot vom Wirte-Dashboard: der Warenkorb ragte von unten ins
//    Bild, "kommt so von alleine". Geschlossen war er nur nach unten
//    geschoben (translateY 100 %), nicht ausgeblendet -- aendert sich auf dem
//    iPhone die Bildschirmhoehe, lugt er hervor.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function regel(sel) {
    var i = H.indexOf('\n        ' + sel + ' {'); if (i < 0) return '';
    return H.slice(i, H.indexOf('}', i) + 1);
}

// ---- Verlauf ----
t('Kopf hat die Verlaufs-Schicht', /<div class="lp-hero-verlauf" aria-hidden="true"><\/div>/.test(H), '');
t('Der alte Verlauf nach WEISS ist weg', !/transparent 30%, #ffffff 100%/.test(H), 'noch da');
var v = regel('.lp-hero-verlauf');
t('Verlauf endet in der Markenfarbe (--marke, sonst KIN-Gruen)', /linear-gradient\(to bottom, transparent 30%, var\(--marke, #003d33\) 100%\)/.test(v), v);
t('Oben bleibt der Hauch Schwarz fuer die Navigation', /linear-gradient\(to bottom, rgba\(0,0,0,0\.4\) 0%, transparent 30%\)/.test(v), v);
t('Verlauf faengt keine Fingertipps ab', /pointer-events: none/.test(v), v);
t('Kein color-mix (aeltere iPhones)', !/color-mix/.test(v), v);
t('--marke steht auf der Lokalseite (cssText)', /landing\.style\.cssText = '--marke:' \+ _marke/.test(H), '');
var bar = regel('#restaurantLanding .lp-aktionen.kmi-glas-dunkel');
t('Aktionsleiste: heller Rand auf dunklem Grund', /border: 1px solid rgba\(255,255,255,0\.38\) !important/.test(bar), bar);
// Die Leisten-Regel muss NACH der allgemeinen Glas-Regel stehen, sonst gewinnt deren dunkler Rand.
t('Leisten-Regel steht nach der allgemeinen Glas-Rand-Regel', H.indexOf('#restaurantLanding .lp-aktionen.kmi-glas-dunkel {') > H.indexOf(':is(html, #kmi-glas) .kmi-glas-dunkel {'), '');

// ---- Warenkorb ----
var zu = regel('.cart-panel'), auf = regel('.cart-panel.open');
t('Warenkorb geschlossen: unsichtbar', /visibility: hidden;/.test(zu), zu);
t('Warenkorb geschlossen: nicht antippbar', /pointer-events: none;/.test(zu), zu);
t('Ausblenden wartet, bis er hinausgeglitten ist (0,3 s)', /transition: transform 0\.3s ease, visibility 0s linear 0\.3s;/.test(zu), zu);
t('Warenkorb offen: sichtbar, antippbar, sofort', /visibility: visible;/.test(auf) && /pointer-events: auto;/.test(auf) && /visibility 0s linear 0s/.test(auf), auf);
t('Oeffnen geht weiter ueber die Klasse "open"', /document\.getElementById\('cartPanel'\)\.classList\.add\('open'\);/.test(H), '');

var sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
t('sw.js CACHE hochgezaehlt (mind. v132)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 132, '');

console.log('\n' + ok + '/' + n + ' OK');
process.exit(ok === n ? 0 : 1);
