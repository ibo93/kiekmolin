// WAS DER GAST LIEST, HAT ECHTE UMLAUTE.
//
// GEMELDET WURDE
// --------------
// "das tuerkisch muss türkisch sein".
//
// WO ES STAND
// -----------
// Nicht in der App -- index.html war sauber. Sondern in
// build-seo-pages.js, dem Skript, das bei jedem Netlify-Deploy die
// oeffentlichen Landingpages baut. Dort stand im sichtbaren Text:
//     "Doener Kebab und tuerkische Gerichte"
//     "Italienische Küche gehoert in ... laengst zum Alltag"
//     "Von duenner roemischer Pizza ueber neapolitanischen Steinofen"
//     "Schau spaeter wieder vorbei"
// Diese Seiten liest Google und liest der Gast, bevor er ueberhaupt auf
// kiekmolin.de klickt. Gesucht wird nach "Döner Norden", nicht nach
// "Doener Norden" -- die Schreibweise kostet also auch Sichtbarkeit.
//
// WAS NICHT ANGEFASST WIRD
// ------------------------
// 1. Interne Schluessel. "tuerkisch" ist der Wert in der Spalte cuisine
//    und steht in data-filter="tuerkisch". Wer den aendert, findet kein
//    tuerkisches Restaurant mehr. Angezeigt wird er ohnehin nie -- dafuer
//    gibt es cuisineLabel, und da steht laengst "Türkisch".
// 2. Slugs und Pfade. /doener-norden ist eine veroeffentlichte Adresse.
//    Ein Umlaut darin braeche jeden bestehenden Link.
// 3. Quelltext-Kommentare und console.log. Die liest kein Gast; in dieser
//    Datei sind ASCII-Kommentare Konvention.
//
// Der Waechter unten trennt genau diese drei Faelle vom sichtbaren Text.
'use strict';
var fs = require('fs');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var SEO = fs.readFileSync('/home/user/kiekmolin/build-seo-pages.js', 'utf8');
var APP = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');

// ERST EINE WORTLISTE, JETZT EINE REGEL.
//
// Die erste Fassung zaehlte deutsche Woerter auf: ueber, fuer, Kueche,
// gehoert und so weiter. Sie hat den gemeldeten Fall gefunden -- und schon
// beim naechsten Feature versagt: der Selbstcheck kam mit
// "Offline-Faehigkeit", "Kanaelen", "Pruefungen" und "Ungeprueft" daher,
// und keines davon stand auf der Liste. Eine Liste ist immer nur so gut wie
// das letzte Mal, als jemand daran gedacht hat.
//
// Also umgedreht: in deutschem Anzeigetext ist jedes ae, oe, ue innerhalb
// eines Wortes verdaechtig. Ausnahmen gibt es wenige, und die stehen unten
// namentlich -- englische Fachwoerter, Eigennamen, Schriftnamen. Diese
// Liste waechst langsam und bewusst; die andere haette bei jedem neuen Text
// wachsen muessen.
// Was vor dem ae/oe/ue steht, entscheidet fast alles:
//
//   Steht ein VOKAL davor, ist es echtes Deutsch und kein Ersatzzeichen --
//   Steuerung, neue, Feuer, dauern, heute, Zuschauer. Das "ue" gehoert dort
//   zu "eu" oder "au", nicht zu einem "ü".
//
//   Steht ein KONSONANT davor (oder faengt das Wort damit an), ist es fast
//   immer ein ausgeschriebener Umlaut: Kueche, fuer, ueber, Pruefung,
//   Faehigkeit, gehoert, Gaesten, Krummhoern, Hauptmenue.
//
// Zwei Ausnahmen bleiben, beide abzaehlbar und darum als Liste vertretbar:
// Fremdwoerter auf -uell (aktuell, individuell, eventuell) und eine
// Handvoll englischer Woerter auf -ue.
var ENGLISCH = /^(Epilogue|Segoe|Bluetooth|value|true|blue|due|issue|argue|league|revenue|continue|venue|avenue|statue|virtue|tissue|rescue|guest|guide|does|goes|shoes|toes|poem|picturesque|zuerst)s?$/i;
// "ue" nach q ist nie ein Umlaut: question, queue, request, frequent,
// sequence, unique. Eine Regel statt sechs Listeneintraege.
// Bezeichner aus dem Quelltext, die zufaellig im Text stehen koennen.
var SCHLUESSEL = /_|^[a-z]+[A-Z]/;

function hatAsciiUmlaut(text) {
    var woerter = String(text).match(/[A-Za-zÄÖÜäöüß]{3,}/g) || [];
    for (var i = 0; i < woerter.length; i++) {
        var w = woerter[i];
        if (!/ae|oe|ue/.test(w)) continue;
        if (ENGLISCH.test(w) || SCHLUESSEL.test(w)) continue;
        var re = /(^|.)(ae|oe|ue)/g, m, verdaechtig = false;
        while ((m = re.exec(w))) {
            var davor = m[1];
            if (davor && /[aeiou]/i.test(davor)) continue;      // Steuerung, dauern, neue
            if (/^uel/i.test(w.slice(m.index + (m[1] ? 1 : 0)))) continue;  // aktuell, individuell
            if (davor && /q/i.test(davor)) continue;                        // question, queue, request
            verdaechtig = true;
        }
        if (verdaechtig) return w;      // das erste verdaechtige Wort
    }
    return null;
}
var ASCII_UMLAUT = { test: function (s) { return hatAsciiUmlaut(s) !== null; } };

// ---- 1. Der Waechter ---------------------------------------------------------
function sichtbareTexte(quelltext, istJs) {
    var raus = [];
    quelltext.split('\n').forEach(function (z, i) {
        if (/^\s*(\/\/|\*|\/\*|<!--)/.test(z)) return;      // Kommentarzeile
        if (istJs && /console\.(log|warn|error|info)/.test(z)) return;  // nur fuers Terminal
        var re = /'([^'\\]{6,})'|"([^"\\]{6,})"|`([^`\\]{6,})`/g, m;
        while ((m = re.exec(z))) {
            var txt = m[1] || m[2] || m[3];
            if (/^[a-z0-9\-\/_.]+$/.test(txt)) continue;    // Slug, Pfad, Schluessel
            // Der Ausdruck zwischen zwei Strings, nicht der String selbst:
            // aus "' hat ' + oeff.text + ' geoeffnet'" liest die Suche das
            // Stueck " + oeff.text + " als vermeintlichen Text. Genauso bei
            // Tabellen wie "mon: 'Mo', tue: 'Tu'". Beides ist Quelltext.
            if (/\s\+\s/.test(txt)) continue;
            if (/^[,\s]*\w+\s*:\s*$/.test(txt)) continue;
            raus.push({ zeile: i + 1, text: txt });
        }
    });
    return raus;
}

var seoTexte = sichtbareTexte(SEO, true);
t('der Waechter findet ueberhaupt Texte im SEO-Skript', seoTexte.length > 100, seoTexte.length);

// Gemeldet wird das WORT, nicht die Zeile -- sonst sucht man es sich zusammen.
var seoFunde = seoTexte.map(function (s) { return { zeile: s.zeile, wort: hatAsciiUmlaut(s.text) }; })
                       .filter(function (s) { return s.wort; });
t('kein sichtbarer SEO-Text mehr mit ASCII-Umlauten',
  seoFunde.length === 0,
  '\n         ' + seoFunde.slice(0, 14).map(function (f) { return 'Zeile ' + f.zeile + ': ' + f.wort; }).join('\n         '));

// Die App selbst: Text zwischen den Tags, also das was im Fenster steht.
var appFunde = [];
var reTag = />([^<>{}]{6,160})</g, mm;
while ((mm = reTag.exec(APP))) {
    var txt = mm[1].trim();
    // Kein Fliesstext, sondern Quelltext zwischen zwei Tags erwischt: das
    // Muster >...< greift auch ueber JavaScript hinweg, wenn dort irgendwo
    // ein groesser- und ein kleiner-Zeichen stehen. So kam etwa ein Stueck
    // der cuisineLabel-Tabelle als vermeintlicher Anzeigetext herein.
    //
    // Zwei Kennzeichen trennen die beiden zuverlaessig: Quelltext enthaelt
    // gerade Anfuehrungszeichen und Klammern, angezeigter Text nicht -- die
    // App setzt im Fliesstext typografische Zeichen.
    if (/['"]/.test(txt)) continue;
    if (/[{}();]|=>|\+ *$/.test(txt)) continue;
    var wort = hatAsciiUmlaut(txt);
    if (wort) appFunde.push(wort);
}
var appEinmalig = appFunde.filter(function (w, i) { return appFunde.indexOf(w) === i; });
t('kein sichtbarer Text in der App mit ASCII-Umlauten',
  appEinmalig.length === 0, '\n         ' + appEinmalig.slice(0, 20).join('\n         '));

// ---- 1b. Was JavaScript dem Nutzer zeigt -------------------------------------
// Der Waechter sah bisher nur Text ZWISCHEN Tags. Meldungen baut die App aber
// zur Laufzeit: showToast, alert, textContent, Platzhalter, Push-Titel. Genau
// dort standen "die PDF-Qualitaet ist zu niedrig" und "Bitte fuelle alle
// Pflichtfelder" -- beides sieht der Nutzer, beides lief durch.
var JS_TEXTE = [
    /showToast\(\s*'([^']{6,240})'/g,
    /showToast\(\s*"([^"]{6,240})"/g,
    /alert\(\s*'([^']{6,240})'/g,
    /confirm\(\s*'([^']{6,320})'/g,
    /textContent\s*=\s*'([^']{6,240})'/g,
    /placeholder="([^"]{6,160})"/g,
    /title="([^"]{6,160})"/g,
    /aria-label="([^"]{6,160})"/g,
    /alt="([^"]{6,160})"/g,
    /title:\s*'([^']{6,180})'/g,
    /body:\s*'([^']{6,240})'/g,
    // Strings, die JS mit Markup drin zusammenbaut. Genau hier steckte
    // "Kunde sieht Bestaetigung ... musst du nicht oeffnen" -- in einem
    // '<span ...>Text</span>'. Die Fassung davor hat solche Strings
    // uebersprungen, weil sie ein Tag enthielten.
    /'(<[a-z][^']{20,400})'/g
];
var jsFunde = [];
JS_TEXTE.forEach(function (re) {
    var m;
    while ((m = re.exec(APP))) {
        var txt = m[1];
        if (/\$\{|\+ [a-zA-Z_]/.test(txt)) continue;        // Code, kein Fliesstext
        // Markup rausschneiden statt den ganzen String zu verwerfen -- der
        // Text ZWISCHEN den Tags ist genau das, was der Nutzer liest.
        txt = txt.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
        if (!/[a-zäöüß]{3}/.test(txt)) continue;
        // Slug-Beispiele wie "z.B. greetsiler-boerse" zeigen absichtlich die
        // Adressform. Ein Umlaut darin braeche den Link -- also rausnehmen,
        // bevor nach Woertern gesucht wird.
        var rein = txt.replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g, ' ');
        var wort = hatAsciiUmlaut(rein);
        if (wort) jsFunde.push(wort + '  in: ' + txt.slice(0, 70));
    }
});
var jsEinmalig = jsFunde.filter(function (w, i) { return jsFunde.indexOf(w) === i; });
t('auch die Meldungen aus JavaScript haben echte Umlaute',
  jsEinmalig.length === 0, '\n         ' + jsEinmalig.slice(0, 15).join('\n         '));

// Gegenprobe -- ohne die waere ein gruenes Ergebnis oben wertlos.
t('Gegenprobe: "Doener Kebab" wuerde gemeldet', ASCII_UMLAUT.test('Doener Kebab und mehr'));
t('Gegenprobe: "gehoert" wuerde gemeldet', ASCII_UMLAUT.test('Das gehoert dazu'));
t('englisches "value" schlaegt NICHT an', !ASCII_UMLAUT.test('const value = true'));
t('englisches "queue" schlaegt NICHT an', !ASCII_UMLAUT.test('the queue is full'));
t('"true" schlaegt NICHT an', !ASCII_UMLAUT.test('return true'));

// ---- 2. Der Schluessel bleibt, das Label wird angezeigt ---------------------
// Genau die Verwechslung, die diesen Fund ausgeloest hat.
t('der interne Schluessel heisst weiterhin tuerkisch',
  /data-filter="tuerkisch"/.test(APP) && /cuisine === 'tuerkisch'/.test(APP));
t('angezeigt wird daraus "Türkisch"',
  /'tuerkisch':\s*'Türkisch'/.test(APP));
t('und der Filter-Chip zeigt "Döner", nicht "Doener"',
  /data-filter="tuerkisch"[^>]*>Döner</.test(APP));
// Nur der SLUG ist empfindlich -- er steht in veroeffentlichten Adressen.
// Die keywords-Liste enthaelt bewusst beide Schreibweisen, damit Google
// beide Suchbegriffe findet; die darf der Waechter nicht anfassen.
t('der Slug bleibt ohne Umlaut -- sonst braechen veroeffentlichte Links',
  /slug: 'doener'/.test(SEO) && !/slug: '[^']*[äöüß]/.test(SEO));
t('die Keyword-Liste darf beide Schreibweisen fuehren',
  /keywords: \['doener', 'döner'/.test(SEO));

// ---- 3. Die reparierten Stellen ---------------------------------------------
[['Döner Kebab und türkische Gerichte', 'die Seitenbeschreibung'],
 ['Italienische Küche gehört in', 'der Italien-Absatz'],
 ['dünner römischer Pizza über', 'die Pizza-Beschreibung'],
 ['Kalbsdöner', 'der Döner-Absatz'],
 ['Schau später wieder vorbei', 'der Leer-Hinweis'],
 ['Welche Städte sind auf', 'die FAQ-Frage'],
 ['die größte Stadt Ostfrieslands', 'der Emden-Absatz'],
 ['Teemuseums-Nähe', 'der Norden-Absatz']].forEach(function (paar) {
    t(paar[1] + ' hat echte Umlaute', SEO.indexOf(paar[0]) > 0, paar[0]);
});

// ---- 4. Nichts kaputtgemacht -------------------------------------------------
// node --check statt new Function: die Datei faengt mit einer Shebang-Zeile
// an (#!/usr/bin/env node), die new Function nicht parsen kann. Der erste
// Anlauf meldete deshalb faelschlich einen Syntaxfehler.
t('das SEO-Skript ist weiterhin gueltiges JavaScript',
  (function () {
      try {
          require('child_process').execFileSync('node', ['--check', '/home/user/kiekmolin/build-seo-pages.js'],
              { stdio: 'pipe' });
          return true;
      } catch (e) { return String(e.stderr || e.message).slice(0, 120); }
  })() === true);
t('die Datei ist UTF-8 und die Umlaute sind echte Zeichen',
  SEO.indexOf('Ã¶') < 0 && SEO.indexOf('Ã¼') < 0 && APP.indexOf('Ã¶') < 0,
  'Mojibake gefunden -- Datei wurde als Latin-1 geschrieben');

// ---- 5. Der Grund steht im Quelltext -----------------------------------------
t('warum der Schluessel tuerkisch bleiben muss, steht in dieser Datei',
  /findet kein\s*\n\/\/\s*tuerkisches Restaurant mehr/.test(fs.readFileSync(__filename, 'utf8')));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
