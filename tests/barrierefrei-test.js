// BARRIEREFREIHEIT -- WAS BEHAUPTET WIRD, MUSS AUCH STIMMEN.
//
// ANLASS
// Bildschirmfoto von Lieferandos Kasse: in deren Fusszeile steht
// "Barrierefreiheit". Dazu vom Betreiber: "trotzdem mach das rein".
//
// Rechtlich ist es hier NICHT verpflichtend -- das BFSG nimmt
// Kleinstunternehmen bei Dienstleistungen aus. Die Erklaerung steht
// freiwillig da.
//
// GENAU DESHALB IST DIESE DATEI WICHTIG.
// Eine freiwillige Zusage, die niemand nachprueft, wird binnen eines
// Jahres zur Luege: es aendert sich Code, nicht der Text. Und eine
// falsche Zusage zur Barrierefreiheit ist schlimmer als gar keine --
// wer sich darauf verlaesst und rennt vor eine Wand, hat mehr verloren
// als jemand, der es vorher wusste.
//
// Diese Datei prueft deshalb die Punkte, die in der Erklaerung als
// "funktioniert" stehen -- am echten Quelltext.
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

console.log('\n-- 1. Die Erklaerung gibt es und sie ist erreichbar --');
t('der Kasten ist da', /id="barrierefreiModal"/.test(h), 'fehlt');
t('und steht in der Fusszeile neben Impressum und AGB',
  /openModal\('barrierefreiModal'\)[^>]*>Barrierefreiheit<\/a>/.test(h), 'nicht verlinkt');
t('und zwar in derselben Zeile wie Impressum und AGB',
  /impressumModal[\s\S]{0,900}?>Barrierefreiheit<\/a>/.test(h)
  && /agbModal[\s\S]{0,600}?>Barrierefreiheit<\/a>/.test(h), 'woanders');
t('mit Schliessen-Knopf, der einen Namen hat',
  /barrierefreiModal[\s\S]{0,400}?aria-label="Schließen"/.test(h), 'namenloser Knopf');

console.log('\n-- 2. Sie sagt die Rechtslage ehrlich --');
// Nicht so tun, als waere man verpflichtet -- und auch nicht so, als
// waere man fuer immer raus.
t('BFSG mit Datum genannt', /28.&nbsp;Juni 2025/.test(h), 'ohne Datum');
t('die Ausnahme fuer Kleinstunternehmen steht dabei',
  /unter 10 Beschäftigte und höchstens 2&nbsp;Mio/.test(h), 'ohne Ausnahme');
t('und dass es freiwillig ist', /geben wir freiwillig ab/.test(h), 'tut so als muesste er');
t('mit Stand-Datum', /Stand: August 2026/.test(h), 'ohne Stand');
// Der Quelltext sagt, was passiert, wenn der Betrieb waechst.
t('im Quelltext steht, wann es Pflicht wird',
  h.indexOf('Sobald aus dem Betrieb 10 Beschaeftigte werden') > -1, 'kein Hinweis');
t('samt der Beschwerdestelle, die dann dazugehoert',
  /MLBF, Magdeburg/.test(h), 'keine Stelle genannt');

console.log('\n-- 3. Ein Weg, Barrieren zu melden --');
// Ohne Rueckmeldeweg ist so eine Erklaerung nur Dekoration.
t('E-Mail-Adresse zum Melden',
  /barrierefreiModal[\s\S]{0,4000}?mailto:info@kiekmolin\.de/.test(h), 'kein Kontakt');
t('und das Angebot, Auskunft anders zu geben',
  /schicken sie Ihnen in einem Format, das für Sie funktioniert/i.test(h), 'kein Angebot');

console.log('\n-- 4. Was als "funktioniert" behauptet wird, stimmt auch --');
// Behauptung: alle Eingabefelder sind beschriftet.
//
// Vorher hatten 249 von 302 Feldern keine Beschriftung -- bei vielen
// stand nur ein Platzhalter, und der verschwindet beim Tippen. Wer mit
// Screenreader bestellt, hoert dann "Eingabefeld" und weiss nicht,
// was hineingehoert.
//
// Gemessen im Browser: 249 -> 1. Das eine ist die Spam-Falle und DARF
// keine Beschriftung haben (siehe unten).
var felder = (h.match(/<(input|select|textarea)\b[^>]*>/g) || [])
    .filter(function (f) { return !/type="hidden"/.test(f); });
// Drei Wege zaehlen als Beschriftung, alle drei muessen geprueft
// werden -- sonst meldet der Test 198 Felder, die in Wirklichkeit
// laengst beschriftet sind:
//   1. aria-label / aria-labelledby am Feld selbst
//   2. <label for="..."> irgendwo auf der Seite
//   3. das Feld liegt INNERHALB eines <label>...</label>
//      (so sind fast alle Kaestchen gebaut: <label><input> Fisch</label>)
function imLabel(pos) {
    var auf = h.lastIndexOf('<label', pos);
    var zu  = h.lastIndexOf('</label>', pos);
    return auf > -1 && auf > zu;
}
var suchAb = 0;
var ohneNamen = felder.filter(function (f) {
    var pos = h.indexOf(f, suchAb);
    if (pos > -1) suchAb = pos + 1;
    if (/aria-label=|aria-labelledby=/.test(f)) return false;
    if (/id="checkoutWebsite"/.test(f)) return false;   // die Spam-Falle, siehe unten
    var m = f.match(/id="([^"]+)"/);
    if (m && h.indexOf('for="' + m[1] + '"') > -1) return false;
    return !imLabel(pos);
});
// GAST ZUERST. Das BFSG schuetzt Verbraucher, nicht Wirte -- und
// beschoenigt wird hier ohnehin nichts: die Erklaerung sagt selbst,
// dass im Verwaltungsbereich noch Felder fehlen.
//
// Diese Felder fasst der GAST an. Sie werden teils erst per JavaScript
// gebaut und standen deshalb nicht in der Messung im Browser -- genau
// deshalb steht die Liste hier namentlich.
['checkoutName', 'checkoutPhone', 'checkoutEmail', 'guestName', 'guestPhone',
 'guestEmail', 'reservationOccasion', 'itemNotes', 'cartNoteInput_',
 'groupCreatorName', 'groupJoinCode', 'couponCode', 'requestedTimeInput',
 'savedAddressSelect'].forEach(function (fid) {
    var re = new RegExp('<(input|select|textarea)[^>]*id="' + fid.replace('$','\\$') + '[^"]*"[^>]*>');
    var tag = (h.match(re) || [''])[0];
    var beschriftet = /aria-label=|aria-labelledby=/.test(tag)
        || h.indexOf('for="' + fid + '"') > -1;
    t('Gastfeld beschriftet: ' + fid, beschriftet, tag.slice(0, 80) || 'nicht gefunden');
});

// Und eine Obergrenze fuer den Rest, damit die Luecke im
// Verwaltungsbereich nicht unbemerkt wieder waechst. Stand beim
// Schreiben: 123 von 302. Wer neue Felder OHNE Beschriftung einbaut,
// laeuft hier auf.
t('die Luecke im Verwaltungsbereich waechst nicht',
  ohneNamen.length <= 125, ohneNamen.length + ' ohne, zuletzt 123');

// DIE SPAM-FALLE DARF KEINEN NAMEN HABEN.
// Sie liegt ausserhalb des Bildes und faengt Bots, die jedes Feld
// ausfuellen. Wer sie beschriftet, laesst genau die Leute
// hineintippen, denen wir helfen wollten -- und ihre Bestellung wird
// danach als Bot abgewiesen.
var falle = (h.match(/<input[^>]*id="checkoutWebsite"[^>]*>/) || [''])[0];
t('die Spam-Falle hat KEINE Beschriftung', /aria-label=/.test(falle) === false, falle);
t('und ist fuer Screenreader ausgeblendet',
  /aria-hidden="true"[\s\S]{0,200}?id="checkoutWebsite"/.test(h), 'nicht ausgeblendet');
t('und nicht per Tabulator erreichbar', /tabindex="-1"/.test(falle), falle);

// Behauptung: alle Bilder haben eine Textalternative.
var bilder = h.match(/<img\b[^>]*>/g) || [];
var ohneAlt = bilder.filter(function (b) { return !/\balt=/.test(b); });
t('jedes Bild hat einen Alt-Text', ohneAlt.length === 0,
  ohneAlt.map(function (b) { return b.slice(0, 60); }));

// Behauptung: Zoom ist nicht gesperrt. user-scalable=no sperrt das
// Vergroessern -- fuer viele Aeltere ist das der Unterschied zwischen
// bestellen und aufgeben.
t('Zoom ist nicht gesperrt',
  /user-scalable\s*=\s*no|maximum-scale\s*=\s*1[^.]/.test(h) === false, 'gesperrt');
// Behauptung: sichtbarer Fokus.
t('es gibt Fokus-Regeln', /:focus-visible/.test(h), 'keine');
// Behauptung: weniger Bewegung, wenn im System eingestellt.
t('prefers-reduced-motion wird beachtet', /prefers-reduced-motion/.test(h), 'ignoriert');
// Behauptung: Seitensprache gesetzt.
t('die Seitensprache steht im html-Tag', /<html[^>]*\blang="de"/.test(h), 'fehlt');

console.log('\n-- 5. Was als "noch nicht gut" dasteht, wird nicht beschoenigt --');
// Wenn eine dieser Schwaechen behoben wird, soll der Text nachziehen --
// dieser Test erinnert daran, indem er rot wird.
t('die Luecke im Verwaltungsbereich wird benannt',
  /Im Verwaltungsbereich[\s\S]{0,120}nicht alle Eingabefelder beschriftet/.test(h), 'verschwiegen');
t('und die Zusage ist auf Gastwege beschraenkt',
  /In Bestellung, Warenkorb und Reservierung ist jedes Eingabefeld beschriftet/.test(h),
  'verspricht zu viel');
t('kein Sprunglink -- und das steht auch so da',
  /class[^>]*skip-link|id="skipLink"/.test(h) === false
  && /Es gibt keinen Sprunglink/.test(h), 'Text und Wirklichkeit passen nicht');
t('der Tischplan wird als Schwaeche benannt',
  /Tischplan im Verwaltungsbereich[\s\S]{0,80}Tastatur kaum bedienbar/.test(h), 'verschwiegen');
t('und die Ansagen an Screenreader auch',
  /nur teilweise angesagt/.test(h), 'verschwiegen');

console.log('\n-- 6. Der Grund steht im Quelltext --');
t('warum die Erklaerung ueberhaupt da ist',
  h.indexOf('ERKLAERUNG ZUR BARRIEREFREIHEIT') > -1, 'keine Begruendung');
t('und die Warnung, den Text nicht ohne Messen zu aendern',
  h.indexOf('macht daraus eine Behauptung') > -1, 'keine Warnung');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
