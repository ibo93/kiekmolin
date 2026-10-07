// JEDES SYMBOL STECKT IN DER EINGEBAUTEN SCHRIFT (07.10.2026).
//
// Die Symbolschrift ist eine Teilmenge (KIN-SYMBOLSCHRIFT-INHALT). Fehlt ein
// Zeichen, steht der NAME als Wort da. Dreimal an einem Tag gesehen:
// "HOURGLASS_TOP" (Gerade bei uns), "CURITY" im Konto-Menue (security),
// und beim Reservieren haetten Gaeste "DECK" / "DIAMOND" / "PLACE" gelesen.
// symbolschrift-test.js sieht nur Symbole, die im HTML stehen -- nicht die
// in JavaScript-Objekten (icon: 'deck'). Dieser Test sieht beide.
//
// Gegenprobe: icon: 'security' zurueck -> rot.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
var sub = new Set((H.match(/KIN-SYMBOLSCHRIFT-INHALT: ([a-z_0-9,]+)/) || [, ''])[1].split(','));
t('Liste der eingebauten Zeichen gefunden', sub.size > 150, sub.size);
// Nur Daten, die NIE als Zeichen gezeichnet werden (Kategorien-Vorlage ohne Symbol).
var NUR_DATEN = { pizza: 1, pasta: 1, salad: 1, burger: 1, drink: 1 };
var fehlt = {};
function pruefe(name, wo) { if (!/^[a-z][a-z0-9_]{1,40}$/.test(name) || sub.has(name) || NUR_DATEN[name]) return; (fehlt[name] = fehlt[name] || []).push(wo); }
var m, re1 = /material-symbols-outlined[^>]*>\s*([a-z_0-9]+)\s*</g, re2 = /\bicon\s*:\s*['"]([a-z_0-9]+)['"]/g;
while ((m = re1.exec(H))) pruefe(m[1], 'HTML');
while ((m = re2.exec(H))) pruefe(m[1], 'icon:');
var liste = Object.keys(fehlt);
t('kein Symbol fehlt in der Schrift (sonst steht das WORT da)', liste.length === 0, liste.map(function (k) { return k + ' (' + fehlt[k].join(',') + ')'; }).join(', '));
var a = H.indexOf('function loadMenuCategories('), b = H.indexOf('\n}\n', a), koerper = H.slice(a, b);
t('die Kategorien-Vorlage mit pizza/pasta/... wird wirklich nicht als Zeichen gezeichnet', a > 0 && /translateCategory\(cat\.name/.test(koerper) && !/cat\.icon/.test(koerper), koerper.slice(0, 80));
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
