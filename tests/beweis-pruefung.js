// Findet der zweite Blick absichtlich eingebaute Fehler?
// Echter Server-Code, echter Gemini-Aufruf, echtes Bild.
'use strict';
var fs = require('fs');
// Bilder liegen nicht im Repo. Erst erzeugen:
//   python3 tests/testkarte.py /tmp/karten
// Dann (kostet NICHTS, laeuft ueber den kostenlosen Gemini-Schluessel):
//   GKEY=<gemini-schluessel> KARTEN=/tmp/karten/ node tests/beweis-pruefung.js
var S = (process.env.KARTEN || '/tmp/karten').replace(/\/?$/, '/');
var PFAD = '/home/user/kiekmolin/netlify/functions/menu-scan.js';
var BILD = 'data:image/jpeg;base64,' + fs.readFileSync(process.argv[2] ? (process.argv[2].indexOf('/') >= 0 ? process.argv[2] : S + process.argv[2]) : S + 'karte.jpg').toString('base64');

// So hat der erste Durchgang gelesen -- mit VIER eingebauten Fehlern und
// einem fehlenden Gericht.
var GELESEN = [
 '1|Bruschetta|geröstetes Brot, Tomaten, Basilikum, Knoblauch|6.50|Vorspeisen|gluten,milch||v',
 '2|Vitello Tonnato|Kalbfleisch, Thunfischcreme, Kapern|12.90|Vorspeisen|eier,fisch,senf||',
 '3|Caprese|Tomaten, Mozzarella, Basilikum|8.90|Vorspeisen|milch||v',
 '4|Knoblauchbrot||4.50|Vorspeisen|gluten,milch||v',
 '5|Ostfriesische Fischsuppe|mit Nordseekrabben und Sahne|9.80|Suppen|krebstiere,fisch,milch,sellerie||f',
 '6|Tomatencremesuppe|mit Croûtons|6.20|Suppen|gluten,milch,sellerie||v',
 '10|Margherita|Tomaten, Mozzarella|8.50|Pizzen|gluten,milch||v',
 '11|Salami|Tomaten, Mozzarella, Salami|19.50|Pizzen|gluten,milch|2|',      // FEHLER: 9,50
 '12|Prosciutto e Funghi|Tomaten, Mozzarella, Schinken, Champignons|10.50|Pizzen|gluten,milch|2,3|',
 // FEHLER: Diavolo fehlt komplett
 '14|Tonno|Thunfisch, Zwiebeln|10.90|Pizzen|gluten,fisch||f',
 '15|Quattro Formaggi|vier Käsesorten|11.50|Pizzen|gluten,milch||v',
 '20|Rumpsteak 250g|mit Kräuterbutter und Pommes|26.90|Vom Grill|milch,senf||r',
 '21|Lammkoteletts|mit Rosmarinkartoffeln|24.50|Desserts||9|',              // FEHLER: Kategorie
 '22|Hähnchenbrustfilet|mit Gemüse der Saison|18.90|Vom Grill|milch||h',
 '30|Backfisch|Nordseescholle im Bierteig, Remoulade|17.90|Von de Waterkant|gluten,eier,fisch,senf||f',
 '31|Matjes "Hausfrauenart"|mit Bratkartoffeln|14.50|Von de Waterkant|eier,fisch,milch,senf||f',
 '32|Krabbenbrot|Nordseekrabben auf Bauernbrot|16.90|Von de Waterkant|gluten,krebstiere,eier,milch||m',
 '40|Rote Grütze|mit Vanillesauce|6.50|Desserts|eier,milch||v',
 '99|Tiramisu|hausgemacht|6.90|Desserts|gluten,eier,milch||v',              // FEHLER: Nr. 41
 '|Cola (0,3l)||3.20|Getränke||1,3|',
 '|Cola (0,5l)||4.40|Getränke||1,3|',
 '|Apfelschorle (0,3l)||3.00|Getränke|||',
 '|Pils vom Fass (0,3l)||3.50|Getränke|||',
 '|Pils vom Fass (0,5l)||4.60|Getränke|||',
 '|Ostfriesentee|mit Kluntje und Sahne|3.40|Getränke|milch||v',
 '|Espresso||2.40|Getränke|||',
 '|Cappuccino||3.20|Getränke|milch||v'
];

var SOLL = [
  { was: 'Preis 19.50 -> 9.50',        pruef: function (k) { return k.name === 'Salami' && Number(k.price) === 9.5; } },
  { was: 'Kategorie Desserts -> Vom Grill', pruef: function (k) { return k.name === 'Lammkoteletts' && /grill/i.test(k.category); } },
  { was: 'Nummer 99 -> 41',            pruef: function (k) { return k.name === 'Tiramisu' && k.dish_number === '41'; } }
];

(async function () {
    process.env.GEMINI_API_KEY = process.env.GKEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_VISION_API_KEY;
    var handler = require(PFAD).handler;

    var t0 = Date.now();
    var res = await handler({ httpMethod: 'POST', body: JSON.stringify({
        images: [BILD], categories: ['Pizzen', 'Getränke'], pruefen: GELESEN }) });
    var b = JSON.parse(res.body);
    var ms = Date.now() - t0;

    console.log('\n=== ZWEITER BLICK, echter Aufruf ===');
    console.log('Eingebaut: 3 falsche Felder + 1 komplett fehlendes Gericht (Diavolo)');
    console.log('Dauer: ' + (ms / 1000).toFixed(1) + ' s   (Netlify-Limit 10 s)');
    console.log('Korrekturen: ' + (b.korrekturen || []).length + '   Nachgetragen: ' + (b.fehlend || []).length);

    (b.korrekturen || []).forEach(function (k) {
        console.log('  KORR  ' + (k.dish_number || '-') + ' ' + k.name + ' | ' + k.price + ' € | ' + k.category);
    });
    (b.fehlend || []).forEach(function (k) {
        console.log('  FEHLT ' + (k.dish_number || '-') + ' ' + k.name + ' | ' + k.price + ' € | ' + k.category);
    });

    console.log('\nTreffer:');
    var ok = 0;
    SOLL.forEach(function (s) {
        var t = (b.korrekturen || []).some(s.pruef);
        if (t) ok++;
        console.log('  ' + (t ? 'GEFUNDEN ' : 'VERPASST ') + s.was);
    });
    var d = (b.fehlend || []).some(function (k) { return /diavolo/i.test(k.name); });
    if (d) ok++;
    console.log('  ' + (d ? 'GEFUNDEN ' : 'VERPASST ') + 'fehlendes Gericht Diavolo');
    console.log('\n' + ok + ' / 4 eingebaute Fehler gefunden.');
})();
