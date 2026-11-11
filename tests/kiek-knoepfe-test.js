// KIEK: KNOEPFE IN DER ANTWORT (11.11.2026, Entwurf in Claude Design).
//
// Kiek haengt [[korb:g12]], [[lokal:r3]], [[tisch:r3|19:30|4]] an seine
// Antwort. Der Browser macht daraus Knoepfe -- aber nur fuer Kennzeichen,
// die er selbst vergeben hat. Wie es kaputt aussaehe:
//  - ein erfundenes Kennzeichen wuerde einen Knopf ins Leere ergeben, oder
//    schlimmer: ein fremdes Gericht in den Korb legen. -> nur bekannte Refs.
//  - die Marken stuenden als "[[korb:g12]]" sichtbar im Text. -> entfernt,
//    auch ein halbes "[[ko" waehrend des Schreibens.
//  - Kiek legt etwas heimlich in den Korb. -> "+ Korb" oeffnet nur das
//    Gericht-Fenster; Groesse und Extras waehlt der Gast.
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++; var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}
var re = /var KIEK_KNOPF_RE = (.*);/.exec(H)[1];
function bauen(quelle) {
    return new Function('getDishNumber', 'var KIEK_KNOPF_RE = ' + re + '; var _kiekRefs = { g: {}, r: {} };'
        + fn('kiekGerichtZeile', quelle) + fn('kiekTextOhneKnoepfe', quelle) + fn('kiekKnoepfeLesen', quelle) + fn('kiekKnoepfeHtml', quelle)
        + '; return { zeile: kiekGerichtZeile, text: kiekTextOhneKnoepfe, lesen: kiekKnoepfeLesen, html: kiekKnoepfeHtml };')(function (m) { return m.dish_number || ''; });
}
var K = bauen();
var marg = { id: 'uuid-marg', name: 'Pizza Margherita', dish_number: '31', sizes: [{ name: 'klein', price: 5.5 }, { name: 'groß', price: 8 }], is_vegetarian: true, allergens: ['A', 'G'] };
var lokal = { id: 'uuid-pp', name: 'Pizza Pronto', slug: 'pizza-pronto' };
var refs = { g: { g1: { item: marg, restaurant: lokal } }, r: { r2: lokal } };

var antwort = 'Die Margherita passt.\n[[korb:g1]]\n[[lokal:r2]]\n[[tisch:r2|19:30|4]]\n[[korb:g99]]\n[[lokal:r77]]';
var k = K.lesen(antwort, refs);
t('Bekannte Kennzeichen werden Knoepfe (korb, lokal, tisch)', k.length === 3 && k[0].art === 'korb' && k[1].art === 'lokal' && k[2].art === 'tisch', JSON.stringify(k.map(function (x) { return x.art + x.ref; })));
t('Erfundene Kennzeichen (g99, r77) ergeben keinen Knopf', !k.some(function (x) { return x.ref === 'g99' || x.ref === 'r77'; }), '');
t('Tisch: Uhrzeit und Personen uebernommen', k[2].zeit === '19:30' && k[2].personen === 4, JSON.stringify(k[2]));
t('Tisch mit 99 Personen: Personen verworfen (nur 1-30)', K.lesen('[[tisch:r2|19:30|99]]', refs)[0].personen === 0, '');
t('Hoechstens 4 Knoepfe', K.lesen('[[lokal:r2]][[korb:g1]][[tisch:r2]][[tisch:r2|20:00]][[tisch:r2|21:00]][[tisch:r2|22:00]]', refs).length === 4, '');
t('Doppelte Knoepfe nur einmal', K.lesen('[[korb:g1]] [[korb:g1]]', refs).length === 1, '');
t('Marken verschwinden aus dem Text', K.text(antwort) === 'Die Margherita passt.', JSON.stringify(K.text(antwort)));
t('Halbe Marke beim Schreiben wird versteckt', K.text('Die Margherita passt.\n[[ko') === 'Die Margherita passt.', JSON.stringify(K.text('Die Margherita passt.\n[[ko')));
var html = K.html(k);
t('Gericht-Knopf zeigt Nummer, Name, Groessen-Preise und "+ Korb"', /kin-nr">31</.test(html) && /Pizza Margherita/.test(html) && /klein 5,50 \/ groß 8,00 €/.test(html) && /\+ Korb/.test(html), html);
t('Tisch-Knopf: "Tisch anfragen · Pizza Pronto · 19:30 · 4 Pers."', /Tisch anfragen · Pizza Pronto · 19:30 · 4 Pers\./.test(html), html);
t('Namen werden maskiert', !/<img/.test(K.html(K.lesen('[[korb:g1]]', { g: { g1: { item: { name: '<img src=x>' }, restaurant: lokal } }, r: {} }))), '');
var z = K.zeile(marg, 'g1');
t('Gericht im Kontext: Nr, Groessen, vegetarisch, Allergene', z.nr === '31' && z.preis === 'klein 5,50 / groß 8,00' && z.merkmale === 'vegetarisch' && z.allergene === 'AG', JSON.stringify(z));

var M = bauen(H.replace("if (art === 'korb' && refs.g[ref]) {", "if (art === 'korb') {"));
var km = []; try { km = M.lesen('[[korb:g99]]', refs); } catch (e) { km = ['wirft']; }
t('Gegenprobe: ohne Ref-Pruefung gaebe g99 einen Knopf -- Test wird rot', km.length === 1, JSON.stringify(km));

var aus = fn('kiekKnopfAusfuehren');
t('+ Korb oeffnet das Gericht-Fenster (openItemOptions), legt nichts direkt in den Korb', /openItemOptions\(m\.id, m\)/.test(aus) && !/addItemToCart|cart\.push/.test(aus), '');
t('+ Korb oeffnet erst die Karte des richtigen Lokals', /currentOrderRestaurant\.id === r\.id/.test(aus) && /openMenuModal\(r\.id\)/.test(aus), '');
t('Tisch anfragen: Reservierung des Lokals, Personen vorgewaehlt', /openReservation\(k\.lokal\.id\)/.test(aus) && /resGuestSelect\(k\.personen\)/.test(aus), '');
t('Knopf "Frag Kiek" statt Kreis', /id="assistantBtn">\s*<span class="kiek-knopf-marke" aria-hidden="true">Kiek<\/span><span class="kiek-knopf-text">Frag Kiek<\/span>/.test(H), '');
t('Kopfzeile: Kiek mit KI-Kennzeichen', /assistant-header-name">\s*Kiek\s*<span class="assistant-ai-badge">KI<\/span>/.test(H), '');
t('Vorschlaege passend zur Seite', /Was ist ohne Nüsse\?/.test(fn('kiekVorschlaege')) && /Wer hat jetzt auf\?/.test(fn('kiekVorschlaege')), '');
t('Kontext: jedes Lokal mit offen/zu', /stand: st\.text/.test(fn('_kinContext')) && /checkIfOpen/.test(fn('kiekLokalStand')), '');
var sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
t('sw.js CACHE hochgezaehlt (mind. v145)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 145, (/kmi-shell-v(\d+)/.exec(sw) || [])[0]);
console.log('\n' + ok + '/' + n + ' OK');
process.exit(ok === n ? 0 : 1);
