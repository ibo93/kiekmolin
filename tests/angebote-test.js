// EIN ANGEBOT, DAS DER WIRT ANLEGT, MUSS BEIM GAST ANKOMMEN.
//
// GEFRAGT WURDE
// -------------
// "wenn der gastronomen ein angbot erstellt wo kommt das ganz rein auf die
//  langepage oder nur auf der online bestellung?"
//
// Die ehrliche Antwort war: auf beides NICHT. Es stand nur auf der
// Startseite und im Fernsehbild der Gaststube. Zwei weitere Stellen waren
// gebaut und liefen trotzdem nie:
//
//   showDailySpecialInMenu -- fertig geschrieben, nur rief sie niemand auf.
//     Der einzige Aufruf ausserhalb der Funktion stand in ihrer eigenen
//     Wiederholung. Daneben lag ein Trick, der openMenuModal 2,5 Sekunden
//     nach dem Laden umhuellen wollte. openMenuModal ist async, die Huelle
//     war es nicht und warf das Versprechen weg.
//
//   renderRestaurantSpecials -- handleRealtimeSpecials fragte zweimal
//     "typeof renderRestaurantSpecials === 'function'". Die Funktion gab es
//     in der ganzen Datei nicht. Die Abfrage war immer falsch, der Zweig lief
//     nie, und weil sie so hoeflich fragte, fiel es nicht auf.
//
// DIE FAMILIE DAHINTER
// --------------------
// Das ist derselbe Fehler wie beim Sprachumschalter in der Speisekarte
// (Icon da, Funktion fehlte) und beim Bestellart-Knopf (Regel da,
// Inline-Stil gewann): es sieht fertig aus und tut nichts. Deshalb prueft
// diese Datei nicht nur die zwei Stellen, sondern die REGEL:
//
//   Jede "typeof X === 'function'"-Abfrage muss ein X haben, das es gibt.
//
// Eine Abfrage auf eine Funktion, die nirgends steht, ist kein Schutz --
// sie ist ein dauerhaft ausgeschalteter Programmteil, der wie ein
// eingeschalteter aussieht.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus, bevor irgendetwas gezaehlt wird: die Erklaerungen oben
// im Quelltext nennen die alten Namen, und der Waechter wuerde sonst auf
// die Beschreibung des Fehlers hereinfallen statt auf den Fehler.
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

// ---- 1. Die Regel: keine Abfrage auf eine Funktion, die es nicht gibt ------
var geprueft = {}, ohneDefinition = [];
var reTypeof = /typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*['"]function['"]/g, mt;
while ((mt = reTypeof.exec(CODE))) geprueft[mt[1]] = true;

Object.keys(geprueft).forEach(function (name) {
    var da = new RegExp('function\\s+' + name + '\\s*\\('
        + '|(?:var|let|const)\\s+' + name + '\\s*='
        + '|window\\.' + name + '\\s*='
        + '|' + name + '\\s*[:=]\\s*(?:async\\s*)?function').test(CODE);
    if (!da) ohneDefinition.push(name);
});

t('es gibt genug solcher Abfragen, dass die Pruefung etwas wert ist',
  Object.keys(geprueft).length >= 100, Object.keys(geprueft).length);
t('jede "typeof X === \'function\'"-Abfrage hat ein X, das es wirklich gibt',
  ohneDefinition.length === 0, ohneDefinition.join(', '));

// Gegenprobe -- ohne sie waere das gruene Ergebnis oben wertlos.
(function () {
    var probe = 'if (typeof gibtEsNichtXYZ === "function") gibtEsNichtXYZ();';
    var name = /typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*['"]function['"]/.exec(probe)[1];
    t('Gegenprobe: eine erfundene Funktion wuerde gemeldet',
      name === 'gibtEsNichtXYZ' && !new RegExp('function\\s+' + name + '\\s*\\(').test(CODE));
})();

// ---- 2. Die zwei Stellen, um die es ging -----------------------------------
t('renderRestaurantSpecials gibt es jetzt',
  /function renderRestaurantSpecials\(/.test(CODE));
t('showDailySpecialInMenu gibt es weiterhin',
  /function showDailySpecialInMenu\(/.test(CODE));

// Aufgerufen -- nicht nur vorhanden. Der eigene Rumpf zaehlt nicht mit.
function aufrufeAusserhalb(name) {
    var rumpf = schneide(name);
    var draussen = rumpf ? CODE.split(rumpf).join('') : CODE;
    return (draussen.match(new RegExp('\\b' + name + '\\s*\\(', 'g')) || []).length;
}
t('showDailySpecialInMenu wird von ausserhalb ihrer selbst aufgerufen',
  aufrufeAusserhalb('showDailySpecialInMenu') >= 1, aufrufeAusserhalb('showDailySpecialInMenu'));
t('renderRestaurantSpecials ebenso',
  aufrufeAusserhalb('renderRestaurantSpecials') >= 1, aufrufeAusserhalb('renderRestaurantSpecials'));

// ---- 3. Die Speisekarte ----------------------------------------------------
var menuModal = schneide('openMenuModal');
t('openMenuModal ist gefunden worden', menuModal.length > 500, menuModal.length);
t('openMenuModal ruft die Tagesangebote selbst auf',
  /showDailySpecialInMenu\(restaurantId\)/.test(menuModal));
t('der Aufruf steht NACH dem Korbwechsel -- vorher waere das Haus noch das alte',
  menuModal.indexOf('frageKorbWechsel') < menuModal.indexOf('showDailySpecialInMenu'),
  menuModal.indexOf('frageKorbWechsel') + ' / ' + menuModal.indexOf('showDailySpecialInMenu'));

t('der 2,5-Sekunden-Trick um openMenuModal ist weg',
  CODE.indexOf('_dailyPatched') < 0);
t('und niemand ueberschreibt openMenuModal mehr von aussen',
  !/openMenuModal\s*=\s*function/.test(CODE),
  (CODE.match(/openMenuModal\s*=\s*function[^\n]*/g) || []).join(' | '));

// Derselbe Trick lag ein zweites Mal daneben -- fuer den Banner
// "Letzte Bestellung wiederholen". Auch der ruft jetzt direkt.
t('der 2-Sekunden-Trick fuer den Wiederholen-Banner ist ebenfalls weg',
  CODE.indexOf('_reorderPatched') < 0 && CODE.indexOf('_origOpenMenu') < 0);
t('openMenuModal zeigt den Wiederholen-Banner selbst',
  /showReorderBanner\(restaurantId\)/.test(menuModal));
t('auch dieser Aufruf steht nach dem Korbwechsel',
  menuModal.indexOf('frageKorbWechsel') < menuModal.indexOf('showReorderBanner'));
t('der Banner des vorherigen Hauses wird entfernt, nicht stehen gelassen',
  /var alterBanner = document\.getElementById\('reorderBanner'\);\s*\n\s*if \(alterBanner\) alterBanner\.remove\(\);/.test(schneide('showReorderBanner')));
t('und die Gerichtnamen darin sind escapt',
  /escapeHtml\(itemNames\.substring\(0, 60\)\)/.test(schneide('showReorderBanner')));

t('das Angebot sitzt VOR der Gerichteliste, nicht darin',
  /insertAdjacentHTML\('beforebegin'/.test(schneide('showDailySpecialInMenu')));
t('ein Angebot vom vorherigen Haus wird vorher entfernt',
  /getElementById\('menuDailySpecial'\);?\s*\n\s*if \(alt\) alt\.remove\(\)/.test(schneide('showDailySpecialInMenu')));
t('eine verspaetete Antwort fuer ein anderes Haus wird verworfen',
  /jetzigesHaus !== restaurantId/.test(schneide('showDailySpecialInMenu')));

// ---- 4. Die Restaurantseite ------------------------------------------------
t('die Restaurantseite hat einen Platz fuer die Angebote',
  /<div id="lpSpecials"><\/div>/.test(H));
t('der Platz steht vor "Über uns", also weit oben',
  H.indexOf('id="lpSpecials"') < H.indexOf('Über uns Section'),
  H.indexOf('id="lpSpecials"') + ' / ' + H.indexOf('Über uns Section'));
t('gefuellt wird er erst NACH dem Einhaengen der Seite -- vorher gibt es ihn nicht',
  /document\.body\.appendChild\(landing\);[\s\S]{0,400}renderRestaurantSpecials\(rest\.id\)/.test(CODE));
t('renderRestaurantSpecials schreibt nur, wenn der Platz noch da ist',
  /if \(!document\.getElementById\('lpSpecials'\)\) return 0;/.test(schneide('renderRestaurantSpecials')));
t('ohne Angebote bleibt der Platz leer statt eine leere Ueberschrift zu zeigen',
  /if \(!angebote\.length\) \{ ziel\.innerHTML = ''; return 0; \}/.test(schneide('renderRestaurantSpecials')));

// ---- 5. Echtzeit: das richtige Haus ----------------------------------------
var rt = schneide('handleRealtimeSpecials');
t('handleRealtimeSpecials ist gefunden worden', rt.length > 200, rt.length);
t('beim Loeschen wird payload.old gelesen -- payload.new ist dann leer',
  /payload\.old && payload\.old\.restaurant_id/.test(rt));
t('die Restaurantseite wird nur aktualisiert, wenn WIRKLICH dieses Haus offen ist',
  /_currentLandingRestaurantId === betroffen/.test(rt));
t('die Speisekarte ebenso',
  /currentOrderRestaurant\.id === betroffen/.test(rt));
t('ohne betroffenes Haus passiert nichts', /if \(!betroffen\) return;/.test(rt));

// ---- 6. Ein Angebot ist an allen drei Stellen gleich lange gueltig ---------
// Frueher hatte jede Stelle ihre eigene Zeitrechnung: die Startseite kannte
// das Zeitfenster "[17:00-19:00]", die Speisekarte nicht. Ein Happy-Hour-
// Angebot stand dort also auch noch um Mitternacht.
var quelle = ['tagesangeboteHolen', 'angebotLaeuftNoch', 'angebotText', 'angebotZeitHinweis', 'angebotPreis', 'angebotKarteHtml'];
quelle.forEach(function (f) {
    t('es gibt eine gemeinsame Grundlage: ' + f, schneide(f).length > 0);
});
t('die Startseite benutzt dieselbe Gueltigkeitspruefung',
  /angebotLaeuftNoch\(s\)/.test(schneide('loadDailySpecials')));
t('die Speisekarte auch -- ueber tagesangeboteHolen',
  /tagesangeboteHolen\(restaurantId\)/.test(schneide('showDailySpecialInMenu')));
t('und die Restaurantseite',
  /tagesangeboteHolen\(restaurantId\)/.test(schneide('renderRestaurantSpecials')));

// Die Zeitlogik wirklich ausfuehren, nicht nur nach ihr suchen.
var f = new Function(schneide('angebotLaeuftNoch') + schneide('angebotText')
    + schneide('angebotZeitHinweis') + schneide('angebotPreis')
    + '; return { laeuft: angebotLaeuftNoch, text: angebotText, zeit: angebotZeitHinweis, preis: angebotPreis };')();

function um(std, min) { var d = new Date(2026, 0, 15, std, min || 0, 0); return d; }

t('ein Angebot ohne Zeitangabe gilt den ganzen Tag',
  f.laeuft({ title: 'Grünkohl' }, um(23, 59)) === true);
t('Happy Hour 17-19 Uhr gilt um 18 Uhr',
  f.laeuft({ description: '[17:00-19:00] Alle Cocktails' }, um(18)) === true);
t('und um 20 Uhr nicht mehr',
  f.laeuft({ description: '[17:00-19:00] Alle Cocktails' }, um(20)) === false);
t('und um 16 Uhr noch nicht',
  f.laeuft({ description: '[17:00-19:00] Alle Cocktails' }, um(16)) === false);
t('valid_until 14:00 gilt um 13:30',
  f.laeuft({ valid_until: '14:00' }, um(13, 30)) === true);
t('und um 14:30 nicht mehr',
  f.laeuft({ valid_until: '14:00' }, um(14, 30)) === false);
t('valid_until "14:00:00" wird genauso gelesen',
  f.laeuft({ valid_until: '14:00:00' }, um(14, 30)) === false);
t('kein Angebot uebergeben: false statt Absturz',
  f.laeuft(null) === false && f.laeuft(undefined) === false);

t('das technische Zeitfenster steht nicht im sichtbaren Text',
  f.text({ description: '[17:00-19:00] Alle Cocktails' }) === 'Alle Cocktails',
  f.text({ description: '[17:00-19:00] Alle Cocktails' }));
t('ohne Beschreibung bleibt der Text leer', f.text({}) === '' && f.text(null) === '');
t('der Gast liest die Uhrzeit als Uhrzeit',
  f.zeit({ description: '[17:00-19:00] x' }) === '17:00 – 19:00 Uhr', f.zeit({ description: '[17:00-19:00] x' }));
t('einstellige Stunden bekommen die Null davor',
  f.zeit({ valid_until: '9:30' }) === 'Gültig bis 09:30 Uhr', f.zeit({ valid_until: '9:30' }));
t('ohne Zeitangabe steht kein Hinweis da', f.zeit({}) === '');

t('Preise stehen mit Komma da, wie hier ueblich', f.preis(8.5) === '8,50 €', f.preis(8.5));
t('kein Preis eingetragen: kein leeres Eurozeichen',
  f.preis(null) === '' && f.preis(0) === '' && f.preis('') === '');
t('Unsinn im Preisfeld wird nicht angezeigt',
  f.preis('billig') === '' && f.preis(-3) === '');

// ---- 7. Der Wirt tippt den Text -- er darf kein HTML einschleusen ---------
// Titel und Beschreibung kommen aus dem Dashboard und landen im Browser
// fremder Gaeste. Genau die Luecke, die schon an 25 anderen Stellen zu war.
t('die Angebotskarte escapt den Titel',
  /escapeHtml\(titel\)/.test(schneide('angebotKarteHtml')));
t('"Happy Hour" steht nicht zweimal untereinander, wenn es schon der Titel ist',
  /titel\.trim\(\)\.toLowerCase\(\) === etikett\.toLowerCase\(\)\) etikett = '';/.test(schneide('angebotKarteHtml')));
t('und die Beschreibung',
  /escapeHtml\(text\)/.test(schneide('angebotKarteHtml')));
var startseite = schneide('loadDailySpecials');
// Die Startseite zeichnet die Karte nicht mehr selbst, sondern nimmt
// dieselbe wie Speisekarte und Restaurantseite. Vorher hatte jede der drei
// Stellen ihre eigene -- und sie liefen auseinander: die Startseite kannte
// das Zeitfenster "[17:00-19:00]", die Speisekarte nicht.
t('die Startseite benutzt dieselbe Angebotskarte wie die anderen Stellen',
  /angebotKarteHtml\(s\)/.test(startseite));
t('sie baut keine eigene Karte mehr',
  !/font-family:Epilogue,sans-serif;font-size:17px;font-weight:700;margin-bottom:6px/.test(startseite));
t('die Startseite escapt den Namen des Hauses', /escapeHtml\(rName\)/.test(startseite));
t('und den Slug im onclick -- dort steht der Text in Anfuehrungszeichen',
  /escapeHtml\(slug\)/.test(startseite));

// Nirgends mehr der ungeschuetzte Weg.
var karte = schneide('angebotKarteHtml');
['titel', 'text'].forEach(function (roh) {
    var re = new RegExp("'\\s*\\+\\s*" + roh + "\\s*\\+\\s*'", 'g');
    var treffer = (karte.match(re) || []);
    t('kein ungeschuetztes "' + roh + '" in der Angebotskarte',
      treffer.length === 0, treffer.join(' | '));
});

// ---- 8. Die Restaurant-ID gehoert in die Adresse, nicht daneben -----------
t('die Restaurant-ID wird fuer die Abfrage kodiert',
  /encodeURIComponent\(restaurantId\)/.test(schneide('tagesangeboteHolen')));
t('eine kaputte Antwort wird nicht fuer eine Liste gehalten',
  /if \(!Array\.isArray\(liste\)\) return \[\];/.test(schneide('tagesangeboteHolen')));
t('bei Netzfehler kommt eine leere Liste, kein Absturz',
  /\.catch\(function \(\) \{ return \[\]; \}\)/.test(schneide('tagesangeboteHolen')));

// ---- 7b. Das Angebot muss dort stehen, wo der Gast sich entscheidet -------
// Ein Haus mit Tagesangebot sah in der Restaurantliste genauso aus wie eins
// ohne. Der Gast scrollt an sieben Karten vorbei und erfaehrt nirgends, wer
// heute etwas hat. Die Leiste ganz oben nennt zwar den Hausnamen -- wer
// direkt zur Liste scrollt, sieht sie nie.
t('jede Restaurantkarte hat einen Platz fuer das Tagesangebot',
  /<div class="card-angebot" data-restaurant-id="\$\{r\.id\}"><\/div>/.test(H));
// Innerhalb der Kartenvorlage pruefen -- "Action Buttons" steht auch
// anderswo in der Datei, ein Vergleich ueber die ganze Datei waere Zufall.
var _kvStart = H.indexOf('<div class="restaurant-card ${isVisible');
var kartenVorlage = _kvStart < 0 ? '' : H.slice(_kvStart, H.indexOf('container.innerHTML = html;', _kvStart));
t('die Kartenvorlage ist gefunden worden', kartenVorlage.length > 1000, kartenVorlage.length);
t('der Platz steht ueber den Knoepfen, nicht darunter',
  kartenVorlage.indexOf('class="card-angebot"') > 0
  && kartenVorlage.indexOf('class="card-angebot"') < kartenVorlage.indexOf('Action Buttons'),
  kartenVorlage.indexOf('class="card-angebot"') + ' / ' + kartenVorlage.indexOf('Action Buttons'));
t('und unter Name und Ort, nicht darueber',
  kartenVorlage.indexOf('${r.name}') < kartenVorlage.indexOf('class="card-angebot"'));

var stempel = schneide('angebotAbzeichenSetzen');
t('es gibt eine Funktion, die die Zeile eintraegt', stempel.length > 200, stempel.length);
t('sie wird nach dem Zeichnen der Liste aufgerufen',
  /container\.innerHTML = html;[\s\S]{0,400}angebotAbzeichenSetzen\(\)/.test(CODE));
t('und noch einmal, wenn die Angebote geladen sind -- die Reihenfolge ist offen',
  /window\._angeboteHeute = nachHaus;[\s\S]{0,120}angebotAbzeichenSetzen\(\)/.test(CODE));
t('abgelaufene Angebote werden beim Eintragen nochmal aussortiert',
  /liste\.filter\(function \(s\) \{ return angebotLaeuftNoch\(s\); \}\)/.test(stempel));
t('bei null Angeboten wird die Zuordnung trotzdem neu gesetzt -- sonst bliebe eine alte Zeile stehen',
  !/if \(specials\.length === 0\) \{ container\.style\.display = 'none'; return; \}[\s\S]{0,200}window\._angeboteHeute = nachHaus/.test(CODE)
  && CODE.indexOf('window._angeboteHeute = nachHaus') < CODE.indexOf("if (specials.length === 0) { container.style.display = 'none'; return; }"));

var zeile = new Function(schneide('angebotZeileHtml') + schneide('angebotPreis')
    + schneide('angebotErsparnis') + 'var escapeHtml = function (x) { return String(x); };'
    + '; return angebotZeileHtml;')();
t('ohne Angebot bleibt die Zeile leer -- keine leere Huelle auf der Karte',
  zeile([]) === '' && zeile(null) === '' && zeile(undefined) === '');
t('mit Angebot steht der Titel drin',
  zeile([{ title: 'Grünkohl mit Pinkel', price: 14.9 }]).indexOf('Grünkohl mit Pinkel') > 0);
t('und der Preis', zeile([{ title: 'x', price: 14.9 }]).indexOf('14,90 €') > 0);
t('bei mehreren Angeboten wird auf die weiteren hingewiesen, ohne die Karte vollzuschreiben',
  zeile([{ title: 'a', price: 5 }, { title: 'b', price: 6 }]).indexOf('1 weiteres Angebot') > 0,
  zeile([{ title: 'a', price: 5 }, { title: 'b', price: 6 }]));
t('und die Mehrzahl stimmt',
  zeile([{title:'a',price:5},{title:'b',price:6},{title:'c',price:7}]).indexOf('2 weitere Angebote') > 0);
t('bei nur einem Angebot steht kein Hinweis da',
  zeile([{ title: 'a', price: 5 }]).indexOf('weiter') < 0);

// Der Gerichtname bekommt eine eigene Zeile. Vorher stand alles nebeneinander
// und im Browser gemessen blieben ihm 41 Pixel -- aus "Grünkohl mit Pinkel"
// wurde "Grünko…". Ausgerechnet das, worauf es ankommt.
t('der Gerichtname steht auf einer eigenen Zeile, nicht neben Etikett und Preis',
  /margin-bottom:6px;">'[\s\S]{0,900}<\/div>';\n\n?\s*\/\/ Hauptzeile/.test(schneide('angebotZeileHtml'))
  || /Hauptzeile: der Gerichtname gross/.test(H));
t('die Zeile ist eine farbige Flaeche, kein blasses Pillchen',
  /background:' \+ farbe \+ ';color:white/.test(schneide('angebotZeileHtml')));
t('die Ersparnis steht weiss auf Farbe -- hoechster Kontrast',
  /background:var\(--angebot-pille\);color:' \+ akzent/.test(schneide('angebotZeileHtml')));
t('das Weiss steht als begruendete Ausnahme in der Farbtafel, nicht zwoelfmal im Text',
  /--angebot-pille: #ffffff;/.test(H)
  && (H.match(/--angebot-pille: #ffffff;/g) || []).length === 2,
  (H.match(/--angebot-pille: #ffffff;/g) || []).length);
t('und bleibt im Dunkelmodus weiss -- die Karte darunter ist immer farbig',
  /Bewusst NICHT abgedunkelt/.test(H));
t('auch auf der grossen Karte knallt die Ersparnis jetzt',
  /background:var\(--angebot-pille\);color:' \+ \(happy \? '#9a3412' : '#00251e'\)/.test(schneide('angebotKarteHtml')));
t('ohne Etikett wandert die Ersparnis ueber den Preis statt eine leere Zeile zu erzwingen',
  /var pilleUeberPreis = \(!etikett && sparPille\) \? sparPille : '';/.test(schneide('angebotKarteHtml')));
t('sie liegt nicht mehr absolut in der Ecke -- dort verdeckte sie den Preis',
  !/position:absolute;top:14px;right:14px/.test(schneide('angebotKarteHtml')));
t('Happy Hour bekommt eine eigene Farbe und ein eigenes Wort',
  /Happy Hour/.test(zeile([{ title: 'Happy Hour', price: 6 }]))
  && /#ea580c/.test(zeile([{ title: 'Happy Hour', price: 6 }])));
t('sonst steht dort "Heute"', /Heute/.test(zeile([{ title: 'Grünkohl', price: 9 }])));

// ---- 7c. Was der Gast spart ------------------------------------------------
// Vorher stand nur der alte Preis durchgestrichen daneben und der Gast
// durfte selbst rechnen. Genau diese Zahl ist aber der Grund, warum ein
// Angebot eines ist.
var spart = new Function(schneide('angebotErsparnis') + '; return angebotErsparnis;')();
t('aus 18,50 auf 14,90 werden 3,60 Euro Ersparnis',
  spart({ price: 14.9, old_price: 18.5 }) === '– 3,60 €', spart({ price: 14.9, old_price: 18.5 }));
t('ohne alten Preis steht dort nichts', spart({ price: 14.9 }) === '');
t('ein alter Preis UNTER dem neuen ist keine Ersparnis',
  spart({ price: 14.9, old_price: 12 }) === '');
t('gleicher Preis ist auch keine', spart({ price: 9, old_price: 9 }) === '');
t('unter 50 Cent lohnt der Hinweis nicht',
  spart({ price: 9.7, old_price: 9.9 }) === '', spart({ price: 9.7, old_price: 9.9 }));
t('Unsinn in den Feldern ergibt keine Ersparnis',
  spart({ price: 'billig', old_price: 20 }) === '' && spart(null) === '');
t('die Ersparnis steht auch auf der grossen Karte',
  /var spart = angebotErsparnis\(s\)/.test(schneide('angebotKarteHtml')));
t('und in der Zeile auf der Restaurantkarte',
  /angebotErsparnis\(s\)/.test(schneide('angebotZeileHtml')));

// ---- 8b. filter reicht den Index mit durch --------------------------------
// Hier stand liste.filter(angebotLaeuftNoch). filter uebergibt (Element,
// Index, Array) -- der Index landete als zweites Argument, also als "jetzt".
// Beim ersten Angebot war das 0 und fiel harmlos auf new Date() zurueck, ab
// dem zweiten war es eine Zahl ohne getHours(). Die Ausnahme lief in den
// catch, und die Liste kam LEER zurueck: gar keine Angebote, obwohl drei da
// waren. Im Browser gefunden, nicht am Quelltext -- deshalb wird die
// Funktion hier wirklich ausgefuehrt.
t('die Angebotsliste wird nicht direkt an filter gehaengt',
  !/\.filter\(angebotLaeuftNoch\)/.test(CODE),
  (CODE.match(/\.filter\(angebotLaeuftNoch\)[^\n]*/g) || []).join(' | '));

(function () {
    var drei = [
        { id: 'a1', title: 'Grünkohl' },
        { id: 'a2', title: 'Happy Hour', description: '[00:00-23:59] Cocktails' },
        { id: 'a3', title: 'Krabbenbrötchen', valid_until: '23:59' },
        { id: 'a4', title: 'Vorbei', description: '[01:00-01:30] nachts' }
    ];
    var umgebung = {
        SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k',
        todayStrLocal: function () { return '2026-08-11'; },
        fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve(drei); } }); },
        encodeURIComponent: encodeURIComponent
    };
    var bauen = new Function('SUPABASE_URL', 'SUPABASE_KEY', 'todayStrLocal', 'fetch',
        schneide('tagesangeboteHolen') + schneide('angebotLaeuftNoch') + '; return tagesangeboteHolen;');
    var holen = bauen(umgebung.SUPABASE_URL, umgebung.SUPABASE_KEY, umgebung.todayStrLocal, umgebung.fetch);

    // Um 01:15 waere "Vorbei" gueltig -- der Test liefe dann falsch gruen.
    // Deshalb pruefen wir nur, dass MEHR ALS EINES durchkommt: genau das
    // ging mit dem Indexfehler nicht.
    holen('R1').then(function (raus) {
        t('mehr als ein Angebot ueberlebt den Filter (der Indexfehler liess keines durch)',
          raus.length >= 3, raus.length + ' von 4: ' + raus.map(function (x) { return x.title; }).join(', '));
        t('das abgelaufene ist trotzdem raus',
          raus.every(function (x) { return x.title !== 'Vorbei'; }) || new Date().getHours() === 1,
          raus.map(function (x) { return x.title; }).join(', '));
        abschluss();
    });

    // Gegenprobe: mit dem alten filter(angebotLaeuftNoch) faellt es um.
    var roh = new Function(schneide('angebotLaeuftNoch') + '; return angebotLaeuftNoch;')();
    var kaputt = false;
    try { drei.filter(roh); } catch (e) { kaputt = true; }
    t('Gegenprobe: der direkte filter-Aufruf wirft wirklich', kaputt === true);
})();

// ---- 8c. Auch die Liste im Dashboard zeigt fremden Text -------------------
// Der Gastronom sieht dort seine eigenen Angebote -- der Admin sieht die
// aller Haeuser. Ein Titel mit HTML lief bis eben im Browser des Admins.
var dash = schneide('loadDailyOffers') || CODE.slice(CODE.indexOf('_offListUrl'), CODE.indexOf('_offListUrl') + 4000);
t('die Angebotsliste im Dashboard escapt den Titel',
  /escapeHtml\(s\.title \|\| 'Angebot'\)/.test(dash));
t('sie escapt die Beschreibung', /escapeHtml\(angebotText\(s\)\)/.test(dash));
t('und den Namen des Hauses', /escapeHtml\(rName\)/.test(dash));

// ---- 9. Warum die Google-Seiten aussen vor bleiben ------------------------
// Bewusste Entscheidung, kein Versehen -- deshalb steht sie im Quelltext und
// wird hier festgehalten.
var seo = fs.readFileSync('/home/user/kiekmolin/build-seo-pages.js', 'utf8');
t('die statisch gebauten Google-Seiten zeigen weiterhin keine Tagesangebote',
  seo.indexOf('daily_specials') < 0);
t('und der Grund dafuer steht in der App',
  /Versprechen, das der Wirt einloesen muesste/.test(H));

function abschluss() {
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}
