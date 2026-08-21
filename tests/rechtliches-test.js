// DIE RECHTLICHEN PFLICHTANGABEN.
//
// Diese Datei prueft KEINE Rechtsfragen -- sie haelt fest, was einmal
// geprueft und entschieden wurde, damit es nicht beim naechsten Umbau
// still wieder herausfaellt. Genau das war bei jedem Punkt hier der
// Fall: die richtige Fassung existierte teilweise sogar schon.
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

console.log('\n-- 1. Der Bestellknopf (§ 312j Abs. 3 BGB) --');
// Der Knopf muss die Zahlungspflicht ausdruecken -- "zahlungspflichtig
// bestellen" oder eine ebenso eindeutige Formulierung. Verworfen wurden
// "Bestellen" allein, "Bestellung aufgeben" (LG Karlsruhe), "Senden"
// (LG Stuttgart), "Anmeldung", "Abonnieren". Folge nach Absatz 4: der
// Vertrag kommt nicht zustande -- gekocht, geliefert, und der Gast war
// nie gebunden.
//
// Drei Anlaeufe: "Bestellung abschließen" (falsch), "Zahlungspflichtig
// bestellen" (richtig, aber "hört sich nicht gut an"), "Bestellen"
// (schoen, aber wieder falsch). Aufgeloest hat es ein Bildschirmfoto
// von Lieferandos Kasse -- der groesste deutsche Lieferdienst schreibt
// "Bestellen und bezahlen": alltagssprachlich UND mit dem Bezahlen
// drin.
var knopf = (h.match(/<button onclick="submitOrder\(\)"[\s\S]{0,900}?<\/button>/) || [''])[0];
t('der Knopf sagt "Bestellen und bezahlen"',
  /Bestellen und bezahlen/.test(knopf), knopf.slice(-200));

// DIE EIGENTLICHE PRUEFUNG: irgendein Wort fuers Bezahlen muss drin
// sein. Ein Textvergleich auf genau diesen Satz waere zu eng -- wer
// spaeter auf "Jetzt kaufen" wechselt, soll nicht ueber einen roten
// Test stolpern. Wer aber auf "Bestellen" oder "Weiter" kuerzt, schon.
var GELD = /(bezahl|zahlung|kaufen|kostenpflichtig|entgeltlich)/i;
var sichtbarerKnopf = (knopf.match(/>([^<>]{3,60})<\/span>/) || ['', ''])[1];
t('und nennt das Bezahlen', GELD.test(sichtbarerKnopf), sichtbarerKnopf);
t('kein blosses "Bestellen" mehr',
  sichtbarerKnopf.trim() !== 'Bestellen', sichtbarerKnopf);

// In allen drei Sprachen -- die Verbraucherrechte-Richtlinie verlangt
// die Eindeutigkeit in der Sprache, in der bestellt wird. Vorher sagte
// der englische Knopf "Place binding order now" und der
// niederlaendische "Nu bindend bestellen": beide behaupteten eine
// Bindung, vom Geld stand nichts da.
[['de', 'Bestellen und bezahlen'],
 ['en', 'Order and pay'],
 ['nl', 'Bestellen en betalen']].forEach(function (f) {
    t('Knopftext ' + f[0], h.indexOf("placeOrderNow: '" + f[1] + "'") > -1, 'fehlt');
    t('  und nennt dort das Bezahlen', /(pay|betal|bezahl)/i.test(f[1]), f[1]);
});
t('kein "binding order" mehr', h.indexOf('Place binding order now') < 0, 'noch da');
t('kein "bindend bestellen" mehr', h.indexOf('Nu bindend bestellen') < 0, 'noch da');

// Der Rueckfalltext nach einem Fehler muss derselbe sein -- sonst
// wechselt die Beschriftung mitten im Bestellvorgang, und genau dann
// klickt der Gast noch einmal.
t('der Rueckfall nach einem Fehler sagt dasselbe',
  /_tl\.placeOrderNow \|\| 'Bestellen und bezahlen'/.test(h), 'anderer Text');
t('und die Fehlermeldung verweist auf denselben Knopf',
  /Dann nochmal auf „Bestellen und bezahlen" tippen/.test(h), 'nennt anderen Knopf');

// Die Rechtslage steht im Quelltext -- samt dem, was NICHT geht.
t('die Rechtslage steht daneben',
  h.indexOf('§ 312j Abs. 3 BGB verlangt') > -1, 'keine Notiz');
t('mit der Folge', /der Vertrag kommt nicht zustande/.test(h), 'ohne Folge');
t('und der Bedingung fuer eine Aenderung',
  /das Wort fuers Bezahlen muss drin/.test(h), 'keine Bedingung');

// Die Seitenueberschrift darf weiter "Bestellung abschließen" heissen --
// verlangt ist die Beschriftung des KNOPFES, nicht der Seite.
t('die Seitenueberschrift bleibt unberuehrt',
  /checkout: 'Bestellung abschließen'/.test(h), 'auch geaendert');

console.log('\n-- 2. Der Gesamtpreis steht ueber dem Knopf --');
// § 312j Abs. 2 BGB: Gesamtpreis unmittelbar vor der Bestellung.
var leiste = h.slice(h.indexOf('id="checkoutTotal"') - 600, h.indexOf('id="submitOrderBtn"'));
t('Gesamtbetrag direkt ueber dem Knopf', /Gesamtbetrag/.test(leiste), leiste.slice(0, 200));
// Der Steuersatz stand fest auf 7%. Das gilt fuer Speisen -- Getraenke
// und Alkohol sind 19%. Eine falsche Angabe ist schlechter als keine,
// und die PAngV verlangt nur "inkl. USt", keinen Satz.
t('kein fester Steuersatz mehr', h.indexOf('inkl. 7% MwSt') < 0, 'noch hartcodiert');
// Das Preisfeld darf NICHT am Sprachdurchlauf haengen. Es hing daran:
// der setzt textContent = t['total'], also stand im Betragsfeld das
// Wort "Gesamtbetrag". Aufgefallen ist es nur, weil
// updateCheckoutSummary() den Preis sofort wieder hineinschreibt --
// wer die Sprache wechselt, waehrend die Kasse offen ist, sieht keinen
// Betrag mehr. Genau den verlangt § 312j Abs. 2 BGB an dieser Stelle.
t('das Betragsfeld wird nicht uebersetzt',
  /id="checkoutTotal"[^>]*data-i18n/.test(h) === false, 'haengt am Sprachdurchlauf');
t('dafuer die Beschriftung darueber',
  /data-i18n="total">Gesamtbetrag<\/span>/.test(h), 'Beschriftung fest deutsch');
t('stattdessen "inkl. MwSt."', /inkl\. MwSt\./.test(leiste), leiste.slice(-300));

console.log('\n-- 3. Die abgeschaltete EU-Plattform --');
// Die OS-Plattform der EU-Kommission wurde zum 20.07.2025 eingestellt.
// Ein Link darauf geht ins Leere; auf eine Stelle zu verweisen, die es
// nicht mehr gibt, ist irrefuehrend und abmahnfaehig.
t('kein Link auf die OS-Plattform mehr',
  h.indexOf('ec.europa.eu/consumers/odr') < 0, 'Link noch da');
// Gegen den SICHTBAREN Text pruefen: der Quelltext-Kommentar daneben
// nennt die Plattform absichtlich, damit niemand den Link "wieder
// repariert". Er steht aber in keinem Impressum.
var sichtbar = h.replace(/<!--[\s\S]*?-->/g, '');
t('und auch der Name nicht mehr im sichtbaren Text',
  sichtbar.indexOf('Plattform zur Online-Streitbeilegung') < 0, 'noch erwaehnt');
t('im Quelltext steht dagegen, warum er weg ist',
  h.indexOf('Plattform zur Online-Streitbeilegung') > -1, 'keine Warnung');
// Die Auskunftspflicht nach § 36 VSBG bleibt -- man muss weiter sagen,
// OB man teilnimmt. Ersatzlos streichen waere also auch falsch.
t('die Auskunft nach § 36 VSBG steht weiter da',
  /nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren[\s\S]{0,120}§ 36 VSBG/.test(h),
  'Auskunft fehlt');
t('der Grund fuer die Streichung steht im Quelltext',
  h.indexOf('zum 20.07.2025 abgeschaltet') > -1, 'keine Begruendung');

console.log('\n-- 4. Jugendschutz bei Alkohol --');
// Gerichte konnten schon als alkoholhaltig gekennzeichnet werden
// (is_alcohol, mit eigenem Symbol am Gericht) -- geregelt war es
// nirgends. § 9 JuSchG verbietet die Abgabe an Minderjaehrige.
t('die AGB regeln die Abgabe von Alkohol',
  /§ 9 JugendschutzG/.test(h), 'nicht geregelt');
t('und wer prueft, steht auch dabei',
  /Das Restaurant ist verpflichtet, bei der Übergabe das Alter zu prüfen/.test(h), 'unklar');
// Die uebrige Bestellung darf nicht mitkippen, wenn der Ausweis fehlt.
t('die uebrige Bestellung bleibt unberuehrt',
  /die übrige Bestellung bleibt davon unberührt/.test(h), 'fehlt');

// Der Hinweis an der Kasse -- damit der Ausweis nicht erst an der Tuer
// zum Thema wird.
t('der Warenkorb merkt sich Alkohol je Position',
  /is_alcohol: !!\(currentMenuItem\.is_alcohol \|\| currentMenuItem\.alcohol\)/.test(h), 'nicht gemerkt');
t('es gibt einen Kasten dafuer', /id="alkoholHinweis"/.test(h), 'kein Kasten');
t('er ist anfangs versteckt',
  /id="alkoholHinweis"[^>]*style="display:none/.test(h), 'immer sichtbar');
t('und wird bei jeder Summenrechnung neu entschieden',
  /formatPrice\(total\);\s*\n\s*alkoholHinweisZeigen\(\);/.test(h), 'nur einmal');

// Die Entscheidung wirklich ausfuehren.
function schneide(name) {
    var i = h.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = h.indexOf('{', i), d = 0;
    for (var k = j; k < h.length; k++) {
        if (h[k] === '{') d++;
        else if (h[k] === '}') { d--; if (!d) return h.slice(i, k + 1); }
    }
    return '';
}
var welt = { Array: Array, orderCart: [] };
vm.createContext(welt);
vm.runInContext(schneide('korbHatAlkohol'), welt);
function korb(liste) { welt.orderCart = liste; return welt.korbHatAlkohol(); }
t('leerer Korb: kein Hinweis', korb([]) === false, korb([]));
t('nur Speisen: kein Hinweis',
  korb([{ name: 'Pizza' }, { name: 'Salat', is_alcohol: false }]) === false, 'Hinweis trotzdem');
t('ein Bier reicht',
  korb([{ name: 'Pizza' }, { name: 'Bier', is_alcohol: true }]) === true, 'kein Hinweis');
// Aeltere Koerbe aus dem Speicher haben das Feld nicht -- das darf
// nicht werfen, sonst bleibt die ganze Kasse stehen.
t('alte Koerbe ohne das Feld werfen nicht',
  korb([null, undefined, { name: 'Pizza' }]) === false, 'wirft oder true');
t('kein Korb: kein Hinweis', (welt.orderCart = null, welt.korbHatAlkohol()) === false, 'wirft');

// Der Text kommt uebersetzt, nicht nur auf Deutsch -- Gaeste aus den
// Niederlanden sind hier die halbe Saison.
['Bitte halte bei der Übergabe einen Ausweis bereit',
 'Please have your ID ready on handover',
 'Houd bij de overdracht een identiteitsbewijs klaar'].forEach(function (x) {
    t('Hinweistext vorhanden: ' + x.slice(0, 28), h.indexOf(x) > -1, 'fehlt');
});
// Fremder Text im Hinweis wird entschaerft -- er kommt zwar aus den
// eigenen Uebersetzungen, aber die Regel gilt hier wie ueberall.
t('der Text wird escaped', /escapeHtml\(_ta\.alkoholHinweis/.test(h), 'roh eingesetzt');

console.log('\n-- 5. Was schon da war und dableiben muss --');
// Nicht neu, aber ohne Test jederzeit wieder weg.
t('Impressum nach § 5 DDG', /Angaben gemäß § 5 DDG/.test(h), 'fehlt');
t('Verantwortlicher nach § 18 MStV', /§ 18 Abs\. 2 MStV/.test(h), 'fehlt');
t('Datenschutzerklaerung', /id="datenschutzModal"/.test(h), 'fehlt');
t('Rechte der Betroffenen nach DSGVO', /Ihre Rechte nach DSGVO/.test(h), 'fehlt');
t('Beschwerderecht bei der Aufsichtsbehoerde', /Beschwerderecht/.test(h), 'fehlt');
t('AGB', /id="agbModal"/.test(h), 'fehlt');
t('AGB muessen beim Bestellen bestaetigt werden', /id="checkoutAgbAccepted"/.test(h), 'fehlt');
// Widerruf bei Speisen ist ausgeschlossen -- der Grund gehoert dazu,
// sonst liest es sich wie eine Willkuer des Wirts.
t('Widerruf mit Fundstelle begruendet',
  /§ 312g Abs\. 2 Nr\. 2 BGB/.test(h), 'ohne Fundstelle');
t('Cookie-Hinweis mit echter Wahl', /id="cookieConsent"/.test(h), 'fehlt');
t('Ablehnen ist genauso erreichbar wie Annehmen',
  /Nur Notwendige/.test(h), 'nur Annehmen');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
