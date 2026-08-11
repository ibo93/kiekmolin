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

// Deutsche Woerter, die jemand ohne Umlaut getippt hat. Bewusst eine Liste
// echter Woerter statt "irgendwo steht ue" -- sonst schlaegt es bei jedem
// englischen "value", "queue" oder "true" an.
var ASCII_UMLAUT = /\b(ueber|fuer|Kueche|kueche|gehoert|laengst|duenn\w*|roemisch\w*|Doener|Kalbsdoener|tuerkisch\w*|Kaese\w*|Broetchen|Gruenkohl|Staedte|Straende|groesst\w*|naechst\w*|spaet\w*|schoen\w*|hoechst\w*|Fruehstueck|gemuetlich\w*|Spezialitaeten|Getraenke|taeglich|Qualitaet|Naehe|Auswaehl\w*|Verfuegbar\w*|zurueck)\b/;

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
            raus.push({ zeile: i + 1, text: txt });
        }
    });
    return raus;
}

var seoTexte = sichtbareTexte(SEO, true);
t('der Waechter findet ueberhaupt Texte im SEO-Skript', seoTexte.length > 100, seoTexte.length);

var seoFunde = seoTexte.filter(function (s) { return ASCII_UMLAUT.test(s.text); });
t('kein sichtbarer SEO-Text mehr mit ASCII-Umlauten',
  seoFunde.length === 0,
  '\n         ' + seoFunde.slice(0, 10).map(function (f) { return 'Zeile ' + f.zeile + ': ' + f.text.slice(0, 90); }).join('\n         '));

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
    if (ASCII_UMLAUT.test(txt)) appFunde.push(txt.slice(0, 90));
}
t('kein sichtbarer Text in der App mit ASCII-Umlauten',
  appFunde.length === 0, '\n         ' + appFunde.slice(0, 10).join('\n         '));

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
