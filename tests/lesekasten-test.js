// Prueft, dass Flaechen mit Text zum Lesen nicht durchsichtig sind.
//
// Der Fehler, den das verhindert: Das Glas-Thema setzt --bg-card auf 45 %
// Weiss. Fuer Kacheln ist das huebsch. Der Gericht-Info-Kasten benutzte
// denselben Ton -- und hat keine .modal-Klasse, also griff auch die Regel
// nicht, die echten Fenstern 85 % und Unschaerfe gibt. Ergebnis: die
// Speisekarte schlug durch den Kasten durch, quer ueber die Allergene.
//
// Ausgerechnet dort. Ein Gast mit Nussallergie liest diesen Text, bevor er
// bestellt.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- Der deckende Ton --');

t('--bg-solid ist im hellen Thema definiert', /--bg-solid:\s*#ffffff/.test(h));
t('--bg-solid ist im dunklen Thema definiert', /--bg-solid:\s*#1a2e27/.test(h));

// Der Kern: das Glas-Thema darf ihn NICHT weichspuelen. Sonst ist der
// Kasten beim naechsten Themenwechsel wieder durchsichtig.
var glasBlock = h.slice(h.indexOf('LIQUID GLASS THEME'));
glasBlock = glasBlock.slice(0, glasBlock.indexOf('</style>') > 0 ? 12000 : 12000);
t('das Glas-Thema fasst --bg-solid nicht an',
  glasBlock.indexOf('--bg-solid') < 0, glasBlock.slice(0, 200));
t('das Glas-Thema macht --bg-card weiterhin durchsichtig (so gewollt, fuer Kacheln)',
  /--bg-card:\s*rgba\(255,255,255,0\.45\)/.test(h));

console.log('\n-- Die Kaesten, auf denen gelesen wird --');

var info = h.slice(h.indexOf('function openGerichtInfo'));
info = info.slice(0, info.indexOf('function closeGerichtInfo'));
t('der Gericht-Info-Kasten ist deckend', /background:var\(--bg-solid\)/.test(info), info.slice(0, 300));
t('und benutzt nicht mehr die durchsichtige Kartenfarbe',
  info.indexOf('background:var(--bg-card)') < 0);

var conf = h.slice(h.indexOf('function showReservationConfirmation'));
conf = conf.slice(0, 3000);
t('die Reservierungs-Bestaetigung ist deckend',
  /position:fixed[^']*var\(--bg-solid\)/.test(conf), conf.slice(conf.indexOf('cssText'), conf.indexOf('cssText') + 200));

console.log('\n-- Der Allergen-Text selbst --');

// Er steht IM Kasten. Faellt er raus, ist der Kasten zwar deckend und
// trotzdem wertlos.
t('"Keine Angaben hinterlegt" steht weiterhin drin', /Keine Angaben hinterlegt/.test(h));
t('und der Spuren-Hinweis auch', /Übergang von Spuren/.test(h));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
