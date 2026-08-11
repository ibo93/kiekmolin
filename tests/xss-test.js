// FREMDER TEXT WIRD KEIN CODE.
//
// WAS GEFUNDEN WURDE
// ------------------
// Ein Gast tippt ins Notizfeld einer Reservierung:
//     Bitte Fensterplatz <img src=x onerror="...">
// Das landete ueber loadReservationsForRestaurant roh in
// container.innerHTML -- im DASHBOARD DES WIRTS, der eingeloggt ist.
// Im Browser mit dem echten Aufbaumuster der App nachgestellt: guest_name
// und notes haben beide gefeuert. Ebenso guest_phone, das in einem
// href="tel:..."-Attribut steht.
//
// Das ist keine Schoenheitsfrage: der Code laeuft in der angemeldeten
// Sitzung des Gastronomen, nicht beim Gast.
//
// DAS BITTERE DARAN
// -----------------
// safeHTML() gab es bereits, DOMPurify war geladen -- benutzt wurde der
// Schutz an EINER von 445 innerHTML-Stellen. Jemand hatte ihn gebaut und
// nicht angeschlossen. Dieselbe Krankheit wie der tote Sprach-Knopf und die
// nie gelesene Fehlervariable: es sieht fertig aus und wirkt nicht.
//
// Deshalb ist der wichtigste Teil dieser Datei nicht der Nachweis, dass die
// bekannten Stellen jetzt dicht sind, sondern der WAECHTER weiter unten. Er
// prueft jedes Gast-Feld, das irgendwo in HTML wandert -- auch das, das
// morgen dazukommt.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

var F = new Function('window', schneide('escapeHtml') + '\n' + schneide('adresseHtml')
    + '; return { esc: escapeHtml, adr: adresseHtml };')({});

// ---- 1. escapeHtml -- besonders die Anfuehrungszeichen ----------------------
// Die alte Fassung ging ueber div.textContent. Das erwischt & < > aber KEINE
// Anfuehrungszeichen -- und genau die braucht man, weil guest_phone in einem
// href="tel:..."-Attribut steht.
t('kleiner als wird ersetzt', F.esc('<b>') === '&lt;b&gt;', F.esc('<b>'));
t('kaufmaennisches Und wird ersetzt', F.esc('A & B') === 'A &amp; B', F.esc('A & B'));
t('doppelte Anfuehrungszeichen -- der Attribut-Ausbruch',
  F.esc('x" onmouseover="y') === 'x&quot; onmouseover=&quot;y', F.esc('x" onmouseover="y'));
t('einfache Anfuehrungszeichen ebenso',
  F.esc("x' onmouseover='y") === 'x&#39; onmouseover=&#39;y', F.esc("x' onmouseover='y"));
t('das Und zuerst, sonst entstehen doppelte Ersetzungen',
  F.esc('<') === '&lt;' && F.esc('&lt;') === '&amp;lt;', F.esc('&lt;'));

// Ein Bildschirmname darf nicht zu "" werden, nur weil er null ist.
t('null wird zu leerem Text, nicht zu "null"', F.esc(null) === '', JSON.stringify(F.esc(null)));
t('undefined ebenso', F.esc(undefined) === '', JSON.stringify(F.esc(undefined)));
t('Zahlen ueberleben', F.esc(42) === '42', F.esc(42));
t('die Null bleibt sichtbar (nicht als leer verschluckt)', F.esc(0) === '0', JSON.stringify(F.esc(0)));
t('harmloser Text bleibt unveraendert',
  F.esc('Bitte Fensterplatz, danke!') === 'Bitte Fensterplatz, danke!');

// Die echten Nutzlasten aus dem Nachweis.
['<img src=x onerror="alert(1)">',
 '<script>alert(1)</' + 'script>',
 '"><svg onload=alert(1)>',
 "javascript:alert(1)"].forEach(function (böse, i) {
    var raus = F.esc(böse);
    t('Nutzlast ' + (i + 1) + ' enthaelt danach keine spitze Klammer und kein Anfuehrungszeichen',
      raus.indexOf('<') < 0 && raus.indexOf('>') < 0 && raus.indexOf('"') < 0, raus);
});

// ---- 2. adresseHtml ----------------------------------------------------------
var boeseAdresse = { street: '<img src=x onerror=alert(1)>', house_number: '1"', zip: '26736', city: "O'Neill" };
var a = F.adr(boeseAdresse);
t('die Adresse escapt alle vier Felder',
  a.indexOf('<') < 0 && a.indexOf('"') < 0 && a.indexOf("'") < 0, a);
t('und bleibt trotzdem lesbar', /26736/.test(a) && /O&#39;Neill/.test(a), a);
t('Standardtrenner ist ein Komma',
  /, /.test(F.adr({ street: 'Deichstr', house_number: '3', zip: '26736', city: 'Greetsiel' })));
t('der Trenner laesst sich auf Zeilenumbruch stellen (Bon)',
  F.adr({ street: 'Deichstr', house_number: '3', zip: '26736', city: 'Greetsiel' }, '<br>')
  === 'Deichstr 3<br>26736 Greetsiel',
  F.adr({ street: 'Deichstr', house_number: '3', zip: '26736', city: 'Greetsiel' }, '<br>'));
t('fehlende Felder erzeugen kein "undefined"',
  F.adr({ street: 'Deichstr' }).indexOf('undefined') < 0, F.adr({ street: 'Deichstr' }));
t('ohne Adresse kommt leerer Text', F.adr(null) === '' && F.adr(undefined) === '');

// ---- 3. DER WAECHTER ---------------------------------------------------------
// Jedes Feld, das ein GAST ausfuellt. Taucht eines davon in einer Zeile auf,
// die HTML zusammenbaut, muss escapeHtml oder adresseHtml drumherum stehen.
var GASTFELDER = ['guest_name', 'guest_phone', 'guest_email', 'customer_name',
                  'customer_phone', 'delivery_address', 'notes', 'customer_note',
                  'customer_notes', 'delivery_notes'];
// Zeilen, die HTML bauen: Zuweisung an innerHTML, Anhaengen an eine
// html-Variable, oder ein Template mit einem Tag darin.
function bautHtml(z) {
    return /innerHTML\s*[+]?=/.test(z)
        || /\b(html|detailsHtml|kundeHtml|noteHtml)\w*\s*\+?=/.test(z)
        || /['"`]\s*<(div|span|p|a|strong|br|td|tr|li)\b/.test(z);
}
var zeilen = H.split('\n');
var offen = [];
zeilen.forEach(function (z, i) {
    if (!bautHtml(z)) return;
    if (/^\s*(\/\/|\*|<!--)/.test(z)) return;                 // Kommentarzeilen
    GASTFELDER.forEach(function (feld) {
        // "+ irgendwas.feld" oder "${irgendwas.feld}" -- also interpoliert
        var re = new RegExp("(\\+\\s*|\\$\\{\\s*)(?:\\w+\\.)*" + feld + "\\b", 'g'), m;
        while ((m = re.exec(z))) {
            var danach = z.slice(m.index + m[0].length);
            // "${feld ? ..." ist die BEDINGUNG eines Ternaers, kein Einsetzen.
            // Dort steht nur zur Frage, ob der Block ueberhaupt kommt -- der
            // Wert selbst wird weiter hinten eingesetzt und dort geprueft.
            if (/^\s*\?[^.]/.test(danach)) continue;
            // Steht ein Escaper unmittelbar davor? Dann ist es in Ordnung.
            var davor = z.slice(Math.max(0, m.index - 60), m.index + feld.length + 20);
            if (/escapeHtml\s*\(|adresseHtml\s*\(|safeHTML\s*\(|_esc\w*\s*\(/.test(davor)) continue;
            offen.push('Zeile ' + (i + 1) + ' [' + feld + ']: ' + z.trim().slice(0, 100));
        }
    });
});
t('der Waechter durchsucht die ganze Datei (Zeilen gelesen)', zeilen.length > 60000, zeilen.length);
t('KEIN Gast-Feld wandert ungeschuetzt in HTML',
  offen.length === 0, '\n         ' + offen.slice(0, 12).join('\n         '));

// Gegenprobe: der Waechter muss auch wirklich anschlagen. Sonst waere ein
// gruenes Ergebnis oben nichts wert.
(function () {
    var probe = "html += '<div>' + r.guest_name + '</div>';";
    var schlaegtAn = false;
    GASTFELDER.forEach(function (feld) {
        var re = new RegExp("(\\+\\s*|\\$\\{\\s*)(?:\\w+\\.)*" + feld + "\\b", 'g'), m;
        while ((m = re.exec(probe))) {
            var davor = probe.slice(Math.max(0, m.index - 60), m.index + feld.length + 20);
            if (!/escapeHtml\s*\(|adresseHtml\s*\(/.test(davor)) schlaegtAn = true;
        }
    });
    t('Gegenprobe: eine ungeschuetzte Zeile wuerde der Waechter melden', schlaegtAn);
})();

// ---- 4. Die bekannten Stellen sind versorgt ---------------------------------
t('die Reservierungsliste escapt den Gastnamen',
  /escapeHtml\(r\.guest_name \|\| 'Gast'\)/.test(H));
t('die Telefonnummer auch im href-Attribut',
  /tel:' \+ escapeHtml\(r\.guest_phone\)/.test(H));
t('und die Notiz des Gastes', /escapeHtml\(r\.notes\)/.test(H));
t('die Bestellkarte escapt den Kundennamen', /escapeHtml\(order\.customer_name\)/.test(H));
t('der Bon nutzt den Adress-Helfer', /adresseHtml\(order\.delivery_address, '<br>'\)/.test(H));

// Die Karten-URL darf NICHT escapt sein -- encodeURIComponent('&amp;') wuerde
// die Adresse verstuemmeln. Zwei Fassungen, mit Absicht.
t('die Karten-URL bekommt die rohe Adresse, nicht die escapte',
  /encodeURIComponent\(addrRoh\.trim\(\)\)/.test(H));
t('der Bon daneben bekommt die escapte', /var addr = adresseHtml\(order\.delivery_address\);/.test(H));

// ---- 5. Der Grund steht im Quelltext ----------------------------------------
t('warum die Anfuehrungszeichen dazukamen, steht in der Datei',
  /In Fliesstext reicht das; in\s*\n\/\/ einem Attribut nicht|einem Attribut nicht/.test(H));
t('und warum es zwei Adress-Fassungen gibt', /Zwei Fassungen derselben Adresse/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
