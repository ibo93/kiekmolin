// DEN BON WIRKLICH ANSEHEN, STATT QUELLTEXT ZU VERGLEICHEN.
//
// Die Bon-Tests haben bisher im Quelltext von pos-print.js nach
// Zeichenketten gesucht. Das prueft nur, dass eine Zeile dasteht -- nicht,
// was am Ende aus dem Drucker kommt. Beim Umbau am 13.09.2026 gingen
// deshalb vier Tests rot, obwohl die Zusicherung dieselbe geblieben war.
//
// Dieses Werkzeug fuehrt generateEposBon() aus und rechnet das epos-XML in
// das um, was auf dem Papier steht. Damit kann ein Test fragen: "steht die
// Adresse gross drauf?" statt "kommt die Zeichenkette width=2 vor?".
//
// WICHTIG fuer die Breite: der Drucker hat 32 Zeichen. Bei width="2" sind
// es nur noch 16 -- eine lange Strasse in doppelter Breite bricht um oder
// faellt ab. Darum gibt jede Zeile ihre effektive Breite mit an.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var POS_PFAD = path.join(__dirname, '..', 'netlify', 'functions', 'pos-print.js');

function schneide(quelle, kopf) {
    var a = quelle.indexOf(kopf);
    if (a === -1) return null;
    var i = quelle.indexOf('{', a), tiefe = 0;
    for (var j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    return null;
}

function ladeBonBauer() {
    var pos = fs.readFileSync(POS_PFAD, 'utf8');
    var gen = schneide(pos, 'function generateEposBon(');
    var esc = schneide(pos, 'function xmlEscape(');
    if (!gen || !esc) throw new Error('generateEposBon oder xmlEscape nicht gefunden');
    // generateEposBon benutzt die gemeinsame Zahlart-Bibliothek. Sie wird
    // hier ECHT hineingegeben -- nicht nachgebaut. Ein Nachbau wuerde
    // genau den Fehler verdecken, gegen den die Bibliothek gebaut wurde:
    // zwei Stellen, zwei Zuordnungen.
    var welt = { ZAHLART: require(path.join(__dirname, '..', 'netlify', 'functions', 'lib', 'zahlart.js')) };
    vm.createContext(welt);
    vm.runInContext(esc + '\n' + gen + '\nthis.bau = generateEposBon;', welt);
    return welt.bau;
}

// epos-XML -> was auf dem Papier steht
function alsPapier(xml) {
    var zeilen = [];
    // Selbstschliessende <text .../> ZUERST -- sonst frisst die gepaarte
    // Variante alles bis zum naechsten </text> und der halbe Bon verschwindet.
    var re = /<text[^>]*\/>|<text([^>]*)>([\s\S]*?)<\/text>|<symbol[^>]*>([\s\S]*?)<\/symbol>|<feed[^>]*\/>|<cut[^>]*\/>/g;
    var m;
    while ((m = re.exec(xml)) !== null) {
        if (/^<text[^>]*\/>$/.test(m[0])) continue;   // reine Einstellung, druckt nichts
        if (m[0].indexOf('<symbol') === 0) { zeilen.push({ text: '[QR-CODE]', w: 1, align: 'center', qr: true }); continue; }
        if (m[0].indexOf('<feed') === 0) { zeilen.push({ text: '', w: 1, align: 'left', leer: true }); continue; }
        if (m[0].indexOf('<cut') === 0) { zeilen.push({ text: '--- ABSCHNITT ---', w: 1, align: 'center', schnitt: true }); continue; }
        var attr = m[1] || '';
        var roh = (m[2] || '')
            .replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        var w = Number((attr.match(/width="(\d+)"/) || [])[1] || 1);
        var h = Number((attr.match(/height="(\d+)"/) || [])[1] || 1);
        var align = (attr.match(/align="(\w+)"/) || [])[1] || 'left';
        roh.split('\n').forEach(function (t, i, alle) {
            if (t === '' && i === alle.length - 1) return;
            zeilen.push({ text: t, w: w, h: h, align: align });
        });
    }
    return zeilen;
}

// Der Drucker bricht zu lange Zeilen selbst um. Das ist bei einem Hinweis
// in Ordnung -- bei einer Ueberschrift in doppelter Breite sieht es kaputt
// aus. Darum wird hier umgebrochen UND vermerkt, was nicht gepasst haette.
function umbrechen(text, platz) {
    if (text.length <= platz) return [text];
    var teile = [], rest = text;
    while (rest.length > platz) {
        var schnitt = rest.lastIndexOf(' ', platz);
        if (schnitt <= 0) schnitt = platz;
        teile.push(rest.slice(0, schnitt));
        rest = rest.slice(schnitt).replace(/^ /, '');
    }
    if (rest) teile.push(rest);
    return teile;
}

function ausdruck(xml, mitMarken) {
    var BREITE = 32;
    var raus = [];
    alsPapier(xml).forEach(function (z) {
        var platz = Math.floor(BREITE / (z.w || 1));
        umbrechen(z.text, platz).forEach(function (t, i) {
            var pad = '';
            if (z.align === 'center') pad = ' '.repeat(Math.max(0, Math.floor((platz - t.length) / 2)));
            else if (z.align === 'right') pad = ' '.repeat(Math.max(0, platz - t.length));
            var marke = mitMarken === false ? '' : ((z.w > 1 || z.h > 1) ? 'GROSS |' : '      |');
            var bruch = i > 0 ? '  (Umbruch)' : '';
            raus.push(marke + ' ' + pad + t + bruch);
        });
    });
    return raus.join('\n');
}

// Fuer Tests: Zeilen, die in ihrer Schriftbreite NICHT auf die Rolle passen.
function zuBreit(xml) {
    var BREITE = 32;
    return alsPapier(xml).filter(function (z) {
        return z.text && z.text.length > Math.floor(BREITE / (z.w || 1));
    }).map(function (z) { return z.text + ' (' + z.text.length + ' Zeichen, Platz ' + Math.floor(BREITE / (z.w || 1)) + ')'; });
}

module.exports = { ladeBonBauer: ladeBonBauer, alsPapier: alsPapier, ausdruck: ausdruck, zuBreit: zuBreit };
