// DIE DATENSCHUTZERKLAERUNG MUSS STIMMEN.
//
// Bis zum 06.10.2026 stand in der Datenschutzerklaerung woertlich:
//
//     "Es werden keine Tracking-Cookies, kein Google Analytics und
//      keine Werbepixel verwendet."
//
// Und in Zeile 21 von index.html stand:
//
//     <script async src="https://www.googletagmanager.com/gtag/js
//                        ?id=G-E2J0WW6NCN"></script>
//
// Beides gleichzeitig, monatelang. Das ist schwerer als das Tracking
// selbst: ein Bussgeld trifft eine Zeile, eine Erklaerung die nicht
// stimmt macht jedes andere Dokument angreifbar -- den AVV, die AGB, den
// Vertrag.
//
// WARUM ES NIEMANDEM AUFFIEL
// Weil beides stimmte, als es geschrieben wurde. Der Satz war aelter als
// das Skript. Niemand liest beim Einbauen eines Zaehlers nochmal die
// Datenschutzerklaerung durch -- genau dafuer ist diese Datei da.
//
// WAS SIE PRUEFT
// Nicht "ist Analytics weg". Sondern BEIDE RICHTUNGEN:
//   was die App TUT, muss in der Erklaerung STEHEN  (Art. 13 DSGVO)
//   was die Erklaerung VERNEINT, darf die App nicht TUN
// BEHAUPTUNG UND WIRKLICHKEIT PASSEN ZUSAMMEN. Wer Analytics wieder einbaut, muss zuerst den Satz
// aendern -- dann wird dieser Test von allein wieder gruen. Ein Test,
// der eine Entscheidung verbietet, waere so falsch wie der, der die
// Google-Schriften einforderte.
//
// GEGENPROBE BEIM SCHREIBEN (06.10.2026): das gtag-Skript wieder
// eingesetzt, waehrend der Satz stehen blieb -> rot. Danach zusaetzlich
// den Satz entfernt -> wieder gruen, weil kein Widerspruch mehr da ist.
var path = require('path');
var fs = require('fs');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var html = fs.readFileSync(KMI + '/index.html', 'utf8');

// Kommentare raus: im Kopf steht die Begruendung, warum Analytics WEG
// ist, und darin kommen die Namen vor.
function ohneKommentare(s) {
    return String(s).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
var code = ohneKommentare(html);

console.log('\n-- 1. Was zaehlt, muss auch dastehen --');

// KEIN VERBOT. Dieser Teil hat frueher verlangt, dass GAR KEIN
// Zaehldienst laeuft -- und damit die Entscheidung verboten, je wieder
// einen einzubauen. Beim Gegenprobe-Lauf am 06.10.2026 ist das
// aufgefallen: derselbe Fehler wie der Test, der die Google-Schriften
// EINFORDERTE, nur mit umgekehrtem Vorzeichen.
//
// Die Regel, die wirklich gilt, ist nicht "nicht zaehlen", sondern:
// WER ZAEHLT, MUSS ES SAGEN. Art. 13 DSGVO verlangt genau das. Wer
// Analytics wieder einbaut und in der Datenschutzerklaerung nennt, ist
// hier gruen -- und soll es sein.
var ZAEHLDIENSTE = [
    { name: 'Google Analytics / Tag Manager',
      re: /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(/,
      nennung: /Google Analytics|Google Tag Manager/i },
    { name: 'Facebook/Meta-Pixel',
      re: /connect\.facebook\.net|fbq\s*\(/, nennung: /Meta|Facebook/i },
    { name: 'Matomo',
      re: /\bmatomo\b|\bpiwik\b/i, nennung: /Matomo|Piwik/i },
    { name: 'Hotjar / Session Replay',
      re: /hotjar|clarity\.ms|fullstory|logrocket|smartlook/i,
      nennung: /Hotjar|Clarity|FullStory|LogRocket|Smartlook|Session.?Replay/i },
    { name: 'TikTok-Pixel',
      re: /analytics\.tiktok\.com|\bttq\s*\./, nennung: /TikTok/i }
];

var laufen = ZAEHLDIENSTE.filter(function (d) { return d.re.test(code); });
if (!laufen.length) console.log('     (es laeuft zurzeit keiner -- Stand 06.10.2026)');

laufen.forEach(function (d) {
    // Die Nennung muss in der Datenschutzerklaerung stehen, nicht
    // irgendwo. Das Fenster datenschutzModal ist der Ort dafuer.
    var i = code.indexOf('id="datenschutzModal"');
    var erklaerung = i < 0 ? '' : code.slice(i, i + 60000);
    t(d.name + ' laeuft -- und wird in der Datenschutzerklaerung genannt',
      d.nennung.test(erklaerung),
      'wer zaehlt, muss es nach Art. 13 DSGVO sagen');
});

// Damit der Abschnitt nie leer durchlaeuft und wie bestanden aussieht.
t('die Zaehldienste wurden ueberhaupt geprueft', ZAEHLDIENSTE.length >= 5, null);

console.log('\n-- 2. Was die App ueber sich behauptet --');

// Der Satz steht im Fenster datenschutzModal und noch einmal im Banner.
var BEHAUPTUNGEN = [
    { was: 'kein Google Analytics', re: /kein Google Analytics/i,
      widerspruch: /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(/ },
    { was: 'keine Tracking-Cookies', re: /keine Tracking-Cookies/i,
      widerspruch: /googletagmanager\.com|connect\.facebook\.net|hotjar|matomo/i },
    { was: 'keine Werbepixel', re: /keine Werbepixel/i,
      widerspruch: /connect\.facebook\.net|fbq\s*\(|analytics\.tiktok\.com/ }
];

BEHAUPTUNGEN.forEach(function (b) {
    // code, NICHT html: eine Behauptung zaehlt nur, wenn ein Gast sie
    // lesen kann. Im Kopf von index.html steht der alte Satz als Zitat in
    // einem Kommentar ("HIER LIEF BIS ZUM 06.10.2026 ..."). Beim
    // Gegenprobe-Lauf K am 06.10.2026 hat dieser Test genau darauf
    // angeschlagen und eine Behauptung gemeldet, die niemand sieht.
    var behauptet = b.re.test(code);
    var tut = b.widerspruch.test(code);
    // Grün ist beides: nicht behaupten, oder behaupten UND einhalten.
    t('"' + b.was + '" -- behauptet: ' + (behauptet ? 'ja' : 'nein')
      + ', eingehalten: ' + (tut ? 'NEIN' : 'ja'),
      !(behauptet && tut),
      'Die Datenschutzerklaerung sagt das Gegenteil von dem, was der Code tut.');
});

console.log('\n-- 3. Der Ersatz ist da --');

// Analytics ist nicht ersatzlos weg: der Lead-Zaehler beantwortet die
// Frage, die Ibo am 24.09.2026 gestellt hat -- ohne IP, ohne Cookie.
var zaehler = KMI + '/netlify/functions/lead-zaehler.js';
t('lead-zaehler.js gibt es noch', fs.existsSync(zaehler), null);
if (fs.existsSync(zaehler)) {
    var z = fs.readFileSync(zaehler, 'utf8');
    t('und er kommt weiter ohne IP und ohne Cookie aus',
      /keine IP/i.test(z) && /kein Cookie/i.test(z),
      'wenn der Zaehler anfaengt, Besucher zu kennzeichnen, braucht er eine Einwilligung');
}

console.log('\n-- 4. Das Banner bleibt, nur ohne die Analytics-Zeile --');

t('es gibt weiter ein Einwilligungsbanner', /id="cookieConsent"/.test(code), null);
t('und zwei Knoepfe -- Ablehnen genauso sichtbar',
  /acceptCookies\(\)/.test(html) && /acceptEssentialOnly\(\)/.test(html), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
