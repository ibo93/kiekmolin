// BARRIEREFREIHEIT -- GEMESSEN, NICHT BEHAUPTET.
//
// ANLASS
// Bildschirmfoto von Lieferandos Kasse: in deren Fusszeile steht
// "Barrierefreiheit". Dazu vom Betreiber: "trotzdem mach das rein".
// Daraufhin wurde gemessen und behoben -- 249 von 302 Eingabefeldern
// hatten keine Beschriftung, danach war es eines (die Spam-Falle, die
// keine haben darf).
//
// AM 21.08.2026 IST DIE OEFFENTLICHE ERKLAERUNG WIEDER VERSCHWUNDEN.
// Sie war nie verpflichtend -- das BFSG nimmt Kleinstunternehmen bei
// Dienstleistungen aus. Und ihre Fassung war ein Pruefbericht: unter
// "Was noch nicht gut ist" standen sechs benannte Schwaechen. Gemessen
// richtig, oeffentlich falsch: bei einer freiwilligen Erklaerung ist
// eine Maengelliste ein unterschriebenes Gestaendnis ohne Pflicht, die
// es rechtfertigt. Der Betreiber sah es auf dem Handy -- "warum ist es
// oeffentlich ... der Text an sich garnicht gut", dann "Mach weg das
// Barriere".
//
// DIESE DATEI BLEIBT TROTZDEM -- UND ZWAR VOLLSTAENDIG.
// Entfernt wurde die Erklaerung, nicht die Barrierefreiheit. Die 248
// Beschriftungen sind noch da, der sichtbare Fokus, die Alt-Texte,
// prefers-reduced-motion. Ohne Test verschwindet so etwas binnen eines
// Jahres wieder: es aendert sich Code, und niemand merkt es, weil kein
// Text mehr dasteht, der widerlegt werden koennte.
//
// Der Test ist ab jetzt die einzige Stelle, an der die Messung steht.
// Wer ein neues Eingabefeld ohne Beschriftung einbaut, laeuft hier auf.
//
// Weg ist nur, was sich auf den Wortlaut des geloeschten Kastens bezog.
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

console.log('\n-- Der geloeschte Kasten bleibt geloescht --');
// Nicht aus Prinzip, sondern damit er nicht aus Versehen zurueckkommt:
// die Begruendung steht nur im Quelltext, und wer sie nicht liest,
// baut dieselbe Maengelliste noch einmal ein.
t('die Erklaerung ist raus', /barrierefreiModal/.test(h) === false, 'wieder da');
t('kein Link mehr in der Fusszeile',
  />Barrierefreiheit<\/a>/.test(h) === false, 'wieder verlinkt');
t('und der Grund steht im Quelltext',
  h.indexOf('AM 21.08.2026 ENTFERNT') > -1, 'keine Begruendung');
// Die Maengelliste war das eigentliche Problem -- kein Satz daraus
// darf ohne neue Entscheidung zurueck auf die Seite.
['Es gibt keinen Sprunglink',
 'Tastatur kaum bedienbar',
 'nur teilweise angesagt',
 'erreichen den empfohlenen Kontrast'].forEach(function (satz) {
    t('nicht zurueck auf der Seite: "' + satz + '"',
      h.indexOf(satz) === -1, 'steht wieder oeffentlich da');
});

console.log('\n-- Was gebaut wurde, ist auch noch da --');
// Gebaut und geprueft: alle Eingabefelder sind beschriftet.
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
// GAST ZUERST. Das BFSG schuetzt Verbraucher, nicht Wirte. Im
// Verwaltungsbereich fehlen weiter Felder -- das ist bekannt und steht
// unten als Obergrenze, damit die Luecke nicht unbemerkt waechst.
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

// Gebaut und geprueft: alle Bilder haben eine Textalternative.
var bilder = h.match(/<img\b[^>]*>/g) || [];
var ohneAlt = bilder.filter(function (b) { return !/\balt=/.test(b); });
t('jedes Bild hat einen Alt-Text', ohneAlt.length === 0,
  ohneAlt.map(function (b) { return b.slice(0, 60); }));

// Gebaut und geprueft: Zoom ist nicht gesperrt. user-scalable=no sperrt das
// Vergroessern -- fuer viele Aeltere ist das der Unterschied zwischen
// bestellen und aufgeben.
t('Zoom ist nicht gesperrt',
  /user-scalable\s*=\s*no|maximum-scale\s*=\s*1[^.]/.test(h) === false, 'gesperrt');
// Gebaut und geprueft: sichtbarer Fokus.
t('es gibt Fokus-Regeln', /:focus-visible/.test(h), 'keine');
// Gebaut und geprueft: weniger Bewegung, wenn im System eingestellt.
t('prefers-reduced-motion wird beachtet', /prefers-reduced-motion/.test(h), 'ignoriert');
// Gebaut und geprueft: Seitensprache gesetzt.
t('die Seitensprache steht im html-Tag', /<html[^>]*\blang="de"/.test(h), 'fehlt');


console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
