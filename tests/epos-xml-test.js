// DER BON WURDE ABGEHOLT UND NICHT GEDRUCKT.
//
// Stand am Ende einer langen Fehlersuche: Drucker-Ampel gruen, Freigabe
// bestaetigt ("An 1 Drucker gesendet"), Bestellung als ungedruckt bereit, der
// Epson TM-m30III holt sie alle 5 Sekunden ab -- und kein Papier.
//
// Alles auf unserer Seite war damit geprueft und in Ordnung. Blieb das
// Dokument selbst. Und darin stand in JEDEM Bon:
//
//     <text lang="de" smooth="true"/>
//
// Epson laesst bei lang nur bestimmte Werte zu: en, ja, ko, zh-hans, zh-hant,
// th, vi, mul. "de" ist keiner davon. Ein unzulaessiger Attributwert macht das
// ganze Dokument ungueltig -- der Drucker verwirft es, ohne zu drucken.
//
// Weil die Zeile in jedem Bon stand, scheiterte auch jeder Bon. Und weil sie
// an derselben Stelle in BEIDEN Erzeugern stand (Server-Direct-Print im
// Backend und ePOS-Direktdruck im Frontend), half kein Wechsel des Weges.
//
// Dieser Test haelt beide Erzeuger auf den erlaubten Werten fest.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var POS = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'pos-print.js'), 'utf8');

// Von Epson erlaubte Werte fuer das lang-Attribut.
var ERLAUBT = ['en', 'ja', 'ko', 'zh-hans', 'zh-hant', 'th', 'vi', 'mul'];

// ---- 1. Kein unzulaessiges lang mehr, in keinem der beiden Erzeuger --------
[['index.html', H], ['pos-print.js', POS]].forEach(function (paar) {
    var name = paar[0];
    // Kommentare raus -- die Erklaerung zitiert die alte Zeile.
    var code = paar[1].replace(/^[ \t]*\/\/.*$/gm, '');

    // Alle lang-Attribute INNERHALB von ePOS-Elementen finden. Das lang des
    // <html>-Tags und hreflang gehen uns nichts an -- die sind voellig richtig.
    var treffer = code.match(/<text[^>]*\blang="([^"]*)"/g) || [];
    t(name + ': kein <text lang="de"> mehr', treffer.length === 0 || treffer.every(function (z) {
        var w = (z.match(/lang="([^"]*)"/) || [])[1];
        return ERLAUBT.indexOf(w) >= 0;
    }), treffer.join(' | '));

    t(name + ': das lang des HTML-Dokuments ist unangetastet geblieben',
      name !== 'index.html' || /<html lang="de">/.test(paar[1]));
});

// Gegenprobe auf die konkrete alte Zeile -- sie darf nirgends zurueckkehren.
t('die alte Zeile ist in beiden Dateien verschwunden',
  H.indexOf('<text lang="de"') < 0 && POS.indexOf('<text lang="de"') < 0);

// ---- 2. Das Attribut smooth bleibt erhalten --------------------------------
// Nur lang war falsch. Haette ich das ganze Element geloescht, waere die
// Kantenglaettung mit weggefallen und die Schrift auf dem Bon groeber.
t('smooth="true" steht weiterhin in beiden Erzeugern',
  /<text smooth="true"\/>/.test(H) && /<text smooth="true"\/>/.test(POS));

// ---- 3. Das erzeugte XML wirklich bauen und pruefen ------------------------
(function () {
    function schneide(src, name) {
        var i = src.indexOf('function ' + name + '(');
        if (i < 0) return '';
        var j = src.indexOf('{', i), d = 0;
        for (var k = j; k < src.length; k++) {
            if (src[k] === '{') d++;
            else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
        }
        return '';
    }
    // generateEposBon benutzt lib/zahlart.js. Die Bibliothek wird ECHT
    // hineingegeben statt nachgebaut -- ein Nachbau wuerde genau den
    // Fehler verdecken, gegen den sie gebaut wurde.
    var f = new Function('ZAHLART', 'BESTELLART', schneide(POS, 'xmlEscape') + '\n' + schneide(POS, 'generateEposBon')
        + '\n; return generateEposBon;')(require('../netlify/functions/lib/zahlart.js'),
                                          require('../netlify/functions/lib/bestellart.js'));

    var bon = f({
        order_number: 'KI-260813-677719',
        created_at: '2026-08-13T18:00:00.000Z',
        order_type: 'pickup',
        customer_name: 'Ibo',
        customer_phone: '15204132343',
        items: [{ name: 'Pizza Margherita', quantity: 1, price: 7.5 }],
        total: 7.5
    }, 'Pizzeria Al Porto Oldersum');

    t('das erzeugte XML enthaelt kein lang-Attribut mehr',
      bon.indexOf('lang=') < 0, (bon.match(/lang="[^"]*"/g) || []).join(' | '));
    t('und ist weiterhin ein vollstaendiges ePOS-Dokument',
      /<epos-print xmlns="http:\/\/www\.epson-pos\.com\/schemas\/2011\/03\/epos-print">/.test(bon)
      && /<\/epos-print>/.test(bon));
    t('mit Schnittbefehl am Ende -- sonst haengt der Bon in der Maschine',
      /<cut type="feed"\/>/.test(bon));
    t('die Bestellnummer steht drauf', bon.indexOf('KI-260813-677719') >= 0);

    // Grob auf Wohlgeformtheit pruefen: jedes oeffnende Element wird
    // geschlossen oder ist selbstschliessend.
    var offen = (bon.match(/<(?!\/|\?)[a-zA-Z][^>]*[^\/]>/g) || []).length;
    var zu = (bon.match(/<\/[a-zA-Z]/g) || []).length;
    t('oeffnende und schliessende Elemente gehen auf', offen === zu, offen + ' offen / ' + zu + ' zu');
})();

// ---- 4. Der Grund steht im Quelltext ---------------------------------------
// Damit niemand das Attribut "der Vollstaendigkeit halber" wieder einbaut.
t('warum lang fehlt, steht in pos-print.js', /"de" ist keiner davon/.test(POS));
t('und ebenso in index.html', /"de" ist keiner davon/.test(H));
t('die erlaubten Werte sind mit aufgeschrieben',
  /en, ja, ko, zh-hans, zh-hant, th, vi, mul/.test(POS));

// ---- Die Notiz zum Gericht muss auf den Zettel ----------------------------
// Sie wurde gespeichert und im Dashboard angezeigt -- aber nicht gedruckt.
// In index.html steht beim Speichern sogar "notes MUSS mit. Ohne diese Zeile
// schreibt der Gast 'ohne Zwiebeln' und die Kueche erfaehrt es nie". Die
// Korrektur ging damals nur bis zum Bildschirm. Der Koch arbeitet vom Zettel.
(function () {
    var block = POS.slice(POS.indexOf('items.forEach(function (item)'),
                          POS.indexOf('================================', POS.indexOf('items.forEach')));
    t('der Bon druckt die Notiz zum Gericht', /if \(item\.notes\)/.test(block), block.slice(0, 300));
    // Nicht mehr die Schreibweise im Quelltext, sondern das Ergebnis:
    // der Bon wird gebaut und nachgesehen, wie gross die Notiz gedruckt wird.
    var _V = require('./bon-vorschau.js');
    var _z = _V.alsPapier(_V.ladeBonBauer()({
        order_number: 'B-1', order_type: 'pickup', total: 9,
        items: [{ quantity: 1, name: 'Pizza', notes: 'ohne Zwiebeln' }]
    }, 'Test')).filter(function (x) { return x.text.indexOf('ohne Zwiebeln') >= 0; })[0];
    t('und zwar so gross wie den Gerichtnamen -- eine Sonderbestellung, die '
      + 'man ueberliest, ist dasselbe wie keine',
      !!_z && _z.h > 1, _z ? ('h=' + _z.h) : 'gar nicht gedruckt');
    t('mit eigenem Zeichen davor, damit man sie nicht mit den Extras verwechselt',
      /\*\* ' \+ item\.notes/.test(block), block.slice(-300));
    t('warum sie wichtig ist, steht dabei',
      /man ueberliest, ist dasselbe wie keine/.test(POS), 'Begruendung fehlt');
})();

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
