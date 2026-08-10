// LADEZEIT: TAILWIND FERTIG GEBAUT STATT IM BROWSER ZUSAMMENGESETZT.
//
// WAS DA LAG
// ----------
// Im <head> stand, blockierend:
//   <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries">
//
// Das ist der Spiel-CDN: rund 400 KB JavaScript, das die Stylesheets ERST IM
// BROWSER erzeugt -- bei jedem Aufruf, bei jedem Gast. Solange es läuft,
// sieht der Gast nichts. Tailwind schreibt selbst in seine Doku, dass das
// nichts im echten Betrieb zu suchen hat.
//
// Nachgezählt: die ganze App benutzt ZEHN Tailwind-Klassen. Dafür lief ein
// Compiler mit.
//
// WARUM ES NICHT REICHT, DAS SKRIPT ZU LOESCHEN
// ---------------------------------------------
// Tailwind bringt Preflight mit (Grundformatierung für Überschriften,
// Listen, Links, Knöpfe, Bilder) und über das forms-Plugin eine
// Vereinheitlichung aller Eingabefelder. Die App baut darauf auf. Einfach
// weglassen hätte das Aussehen an vielen Stellen verschoben.
//
// Deshalb wurde das CSS mit DERSELBEN Tailwind-Version und DERSELBEN
// Konfiguration gebaut, die vorher im <head> stand, und fest eingebettet.
// Gegengeprüft in echtem Chromium: 22 Auswahlen, 0 Unterschiede.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- Der CDN ist weg --------------------------------------------------------
// Der Kommentar an der Stelle DARF den alten Aufruf nennen -- geprüft wird,
// dass kein echtes Skript-Tag mehr da ist.
t('kein Tailwind-CDN mehr im Quelltext',
  H.indexOf('cdn.tailwindcss.com?plugins=forms,container-queries"></script>') < 0
  && (H.match(/cdn\.tailwindcss\.com/g) || []).length === 1);
t('auch die zugehoerige Laufzeit-Konfiguration ist weg',
  !/^\s*tailwind\.config = \{/m.test(H));

// ---- Dafür ist das fertige CSS drin ---------------------------------------
var stil = H.slice(H.indexOf('Tailwind: FERTIG GEBAUT'));
stil = stil.slice(stil.indexOf('<style>') + 7, stil.indexOf('</style>'));
t('das gebaute CSS steht an derselben Stelle', stil.length > 5000, stil.length + ' Zeichen');
t('und ist deutlich kleiner als der Compiler', stil.length < 40000, stil.length + ' Zeichen');

// Die zehn Klassen, die die App wirklich benutzt.
['lg\\:grid-cols-12', 'lg\\:grid-cols-3', 'lg\\:col-span-1', 'lg\\:col-span-2',
 'lg\\:col-span-4', 'lg\\:col-span-5', 'lg\\:col-span-7', 'lg\\:col-span-8',
 '.hidden{', '.block{', '.grid{', '.grid-cols-1{'].forEach(function (k) {
    t('enthaelt ' + k.replace('\\', '').replace('{', ''), stil.indexOf(k) >= 0);
});

// Preflight und das forms-Plugin -- ohne die hätte sich das Aussehen
// verschoben, und zwar überall.
t('Preflight ist dabei (Grundformatierung)',
  /\*,::after,::before\{box-sizing:border-box/.test(stil) || /\*,:after,:before\{box-sizing:border-box/.test(stil),
  stil.slice(0, 80));
t('Ueberschriften bleiben unformatiert wie vorher',
  /h1,h2,h3,h4,h5,h6\{font-size:inherit;font-weight:inherit\}/.test(stil));
t('Listen ohne Aufzaehlungszeichen wie vorher',
  /ol,ul\{list-style:none/.test(stil));
t('Links ohne blaue Standardfarbe wie vorher',
  /a\{color:inherit;text-decoration:inherit\}/.test(stil));
t('das forms-Plugin ist dabei (Eingabefelder)',
  /\[type=text\]/.test(stil) && /appearance:none/.test(stil));

// ---- Der riskante Teil, den ich NICHT gemacht habe --------------------------
// supabase-js blockiert ebenfalls. Es zu verzögern wäre naheliegend --
// direkt darunter steht aber window.supabase.createClient(...) in einem
// gewöhnlichen Inline-Skript. Mit defer wäre die Bibliothek dort noch nicht
// da, das try/catch hätte den Fehler geschluckt und die App liefe still über
// die REST-Notwege. Also bewusst gelassen.
t('supabase-js laedt weiterhin ohne defer -- mit Begruendung im Quelltext',
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/.test(H)
  && /ABSICHTLICH OHNE defer/.test(H));

// ---- Nachbaubar halten -------------------------------------------------------
t('die Tailwind-Konfiguration liegt im Repo',
  fs.existsSync('/home/user/kiekmolin/tailwind/tailwind.config.js'));
t('mit Anleitung zum Neubauen',
  fs.existsSync('/home/user/kiekmolin/tailwind/README.md')
  && /npx tailwindcss/.test(fs.readFileSync('/home/user/kiekmolin/tailwind/README.md', 'utf8')));
var cfg = fs.readFileSync('/home/user/kiekmolin/tailwind/tailwind.config.js', 'utf8');
t('die Konfiguration ist dieselbe wie vorher im head (Farben, Schriften)',
  /"nordic-gold": "#FFD54F"/.test(cfg) && /"headline": \["Epilogue"/.test(cfg));
t('mit beiden Plugins, die der CDN geladen hat',
  /@tailwindcss\/forms/.test(cfg) && /@tailwindcss\/container-queries/.test(cfg));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
