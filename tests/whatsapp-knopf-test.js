// DER WHATSAPP-KNOPF KAM IMMER -- AUCH ZUR FESTNETZNUMMER.
//
// GEMELDET WURDE
// --------------
// "der whatsapp button kommt immer ... wenn der radius zu weit ist kommt
// laden anrufen oder whatsapp button".
//
// WAS DA STAND
// ------------
//     var waBtn = phone ? '<a href="https://wa.me/' + phoneIntl + ...
//
// Der Knopf hing am TELEFON. Jedes Restaurant hat eine Telefonnummer, also
// kam der Knopf immer. Nur ist der Festnetzanschluss eines Restaurants bei
// WhatsApp nicht angemeldet: der Gast tippt drauf, WhatsApp geht auf und
// sagt "Diese Telefonnummer ist nicht bei WhatsApp registriert".
//
// Ein Knopf, der zuverlaessig in eine Sackgasse fuehrt, ist schlimmer als
// kein Knopf. Er kostet den Gast den Versuch, und uns den Eindruck, dass
// hier irgendetwas nicht stimmt.
//
// Die Spalte restaurants.whatsapp gibt es laengst, im Dashboard steht auch
// ein Feld dafuer. An dieser Stelle hat sie niemand benutzt.
//
// DIE ZWEITE HAELFTE: DIE UMRECHNUNG
// -----------------------------------
//     phone.replace(/[^0-9]/g,'').replace(/^0/,'49')
//
// wa.me braucht die Nummer international, ohne Plus und ohne fuehrende Null.
// Die Zeile macht aus "0049 176 123" -> "049176123": von den zwei Nullen
// faellt nur eine weg, uebrig bleibt Unsinn. Getroffen haette es jeden, der
// seine Nummer in dieser Schreibweise eintraegt -- und niemand haette
// gemerkt, warum die Nachricht nicht ankommt.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    throw new Error('nicht zu Ende gelesen: ' + name);
}

// ---- 1. Die Umrechnung, wirklich ausgefuehrt -------------------------------
var waNummer = new Function('window', schneide('waNummer') + '; return waNummer;')({});

[
    ['+49 176 12345678', '4917612345678', 'mit Plus und Landesvorwahl'],
    ['0176 12345678',    '4917612345678', 'deutsche Schreibweise mit fuehrender Null'],
    ['0049 176 12345678','4917612345678', 'mit doppelter Null -- der Fall, der vorher kaputt war'],
    ['49 176 12345678',  '4917612345678', 'ohne alles, schon international'],
    ['+49 (0)176 / 123-45678', '4901761234567' + '8', 'mit Klammern, Schraegstrich und Strich']
].forEach(function (f) {
    t('waNummer: ' + f[2], waNummer(f[0]) === f[1], f[0] + ' -> ' + waNummer(f[0]) + ' (erwartet ' + f[1] + ')');
});

t('leer bleibt leer', waNummer('') === '' && waNummer(null) === '' && waNummer(undefined) === '');
t('reiner Unsinn ergibt keine Nummer', waNummer('ruf mich an') === '', waNummer('ruf mich an'));
// Lieber gar kein Knopf als einer, der ins Leere fuehrt.
t('zu kurz ergibt keine Nummer', waNummer('0176 12') === '', waNummer('0176 12'));
t('zu lang ebenfalls nicht', waNummer('+49 176 1234567890123456') === '',
  waNummer('+49 176 1234567890123456'));

// Die alte Zeile zum Vergleich -- damit schwarz auf weiss dasteht, was sie
// aus derselben Eingabe gemacht hat.
(function () {
    var alt = function (p) { return p.replace(/[^0-9]/g, '').replace(/^0/, '49'); };
    t('die alte Umrechnung machte aus "0049 176 12345678" wirklich Unsinn',
      alt('0049 176 12345678') === '4949' + '17612345678'
      || alt('0049 176 12345678') !== waNummer('0049 176 12345678'),
      'alt: ' + alt('0049 176 12345678') + '  neu: ' + waNummer('0049 176 12345678'));
})();

// ---- 2. Der Knopf im Radius-Banner -----------------------------------------
// Der echte Banner wird gebaut und angesehen: ist der gruene Knopf drin oder
// nicht?
function banner(phone, whatsapp) {
    var angehaengt = null;
    var dok = {
        getElementById: function () { return null; },
        createElement: function () {
            return {
                id: '', innerHTML: '', style: { cssText: '' },
                addEventListener: function () {},
                remove: function () {}
            };
        },
        body: { appendChild: function (el) { angehaengt = el; } }
    };
    new Function('document', 'distKm', 'maxKm', 'phone', 'restName', 'whatsapp', 'waNummer',
        schneide('_showDeliveryRadiusBanner')
        + '\n; _showDeliveryRadiusBanner(distKm, maxKm, phone, restName, whatsapp);'
    )(dok, 12, 5, phone, 'Zur Post', whatsapp, waNummer);
    return angehaengt ? angehaengt.innerHTML : '';
}

(function () {
    // Der gemeldete Fall: Festnetz da, WhatsApp nicht hinterlegt.
    var nurTelefon = banner('04926 12345', '');
    t('nur Festnetz: der Anrufen-Knopf ist da',
      /href="tel:/.test(nurTelefon) && /Anrufen/.test(nurTelefon));
    t('nur Festnetz: KEIN WhatsApp-Knopf mehr -- das war die Meldung',
      nurTelefon.indexOf('wa.me') < 0,
      (nurTelefon.match(/wa\.me\/[0-9]*/) || [''])[0]);

    // Mit hinterlegter WhatsApp-Nummer soll er selbstverstaendlich kommen.
    var beides = banner('04926 12345', '+49 176 12345678');
    t('mit WhatsApp-Nummer kommt der Knopf',
      /wa\.me\/4917612345678\?/.test(beides),
      (beides.match(/wa\.me\/[^"?]*/) || [''])[0]);
    t('und der Anrufen-Knopf bleibt daneben stehen', /href="tel:/.test(beides));

    // WhatsApp ohne Festnetz -- gibt es auch (Imbiss mit Handy).
    var nurWa = banner('', '0176 12345678');
    t('nur WhatsApp: der Knopf ist da, ohne Anrufen',
      /wa\.me\/4917612345678/.test(nurWa) && nurWa.indexOf('href="tel:') < 0);

    // Gar kein Kontakt: dann darf da auch nicht "Kontaktiere sie direkt"
    // stehen -- das waere eine Aufforderung ohne Weg.
    var nichts = banner('', '');
    t('ohne jeden Kontakt gibt es keinen der beiden Knoepfe',
      nichts.indexOf('wa.me') < 0 && nichts.indexOf('href="tel:') < 0);
    t('und der Text fordert nicht zu etwas auf, was nicht geht',
      nichts.indexOf('Kontaktiere') < 0 && /liefert leider nicht so weit/.test(nichts),
      nichts.slice(0, 100));

    // Die Entfernung gehoert in die Nachricht, sonst muss der Gast sie tippen.
    t('in der vorbereiteten Nachricht steht die Entfernung',
      /12%20km%20entfernt/.test(beides));
})();

// ---- 3. Die Aufrufer geben die WhatsApp-Nummer auch weiter -----------------
// Ohne das waere der Knopf ueberall weg -- die Funktion bekaeme nie eine
// Nummer zu sehen. Genau die Sorte Halbfix, die sich wie eine Loesung anfuehlt.
(function () {
    // Bis zum Semikolon lesen, nicht bis zur ersten Klammer -- die schliesst
    // sonst schon hinter Math.round(dist).
    var aufrufe = CODE.match(/_showDeliveryRadiusBanner\(.*?\);/g) || [];
    var echte = aufrufe.filter(function (a) { return a.indexOf('distKm') < 0; });
    t('es gibt die beiden Aufrufe (Koordinaten und PLZ-Weg)', echte.length === 2, echte.join(' | '));
    t('beide geben die WhatsApp-Nummer mit',
      echte.every(function (a) { return /_rWa2?\)/.test(a); }), echte.join(' | '));
    t('und sie holen sie aus dem Feld whatsapp, nicht aus phone',
      (CODE.match(/var _rWa2? = currentOrderRestaurant\.whatsapp \|\| '';/g) || []).length === 2);
})();

// ---- 4. Dieselbe Falle an den anderen Stellen ------------------------------
// "whatsapp ODER phone" ist genau der Rueckfall, der den Knopf immer zeigt.
// Er stand an drei Stellen; nach dem Aufraeumen soll er nirgends mehr stehen.
(function () {
    var rueckfaelle = CODE.match(/whatsapp \|\| [a-zA-Z_]+\.phone/g) || [];
    t('kein "whatsapp oder telefon"-Rueckfall mehr im Code',
      rueckfaelle.length === 0, rueckfaelle.join(', '));

    // Und jede wa.me-Adresse mit Nummer muss durch dieselbe Umrechnung laufen.
    //
    // Vor dem Aufraeumen gab es SIEBEN Stellen mit je eigener Fassung: eine
    // liess das Plus stehen (wa.me/+49... kennt WhatsApp nicht), eine kannte
    // "0049" nicht, eine machte gar nichts. Genau so entsteht ein Fehler, den
    // man an einer Stelle behebt und der an sechs anderen weiterlebt.
    //
    // Geprueft wird der Name, der in der Adresse steht: entweder er wird
    // sichtbar aus waNummer() gefuellt, oder er steht direkt als Aufruf da.
    var namen = [];
    var re = /https:\/\/wa\.me\/(?:\$\{([^}]*)\}|' \+ ([A-Za-z_$][\w$]*) \+ ')/g, m;
    while ((m = re.exec(CODE))) namen.push((m[1] || m[2]).trim());

    t('es gibt ueberhaupt wa.me-Adressen mit Nummer', namen.length >= 6, namen.length + '');

    var ungesaeubert = namen.filter(function (name) {
        if (name.indexOf('waNummer(') === 0) return false;              // direkt im Text
        // Sonst muss die Variable sichtbar aus waNummer kommen.
        var zuweisung = new RegExp('(?:var|let|const)\\s+' + name.replace(/\$/g, '\\$') + '\\s*=\\s*waNummer\\(');
        return !zuweisung.test(CODE);
    });
    t('jede davon geht durch waNummer', ungesaeubert.length === 0, ungesaeubert.join(', '));

    // Die Teilen-Funktion hat gar keine Nummer -- sie oeffnet nur die
    // Kontaktauswahl. Die soll es weiterhin geben.
    t('die Teilen-Funktion ohne Nummer bleibt unangetastet',
      /wa\.me\/\?text=/.test(CODE));
})();

// ---- 5. Warum es so ist, steht im Code -------------------------------------
t('der Grund steht bei der Funktion',
  /bei WhatsApp nicht angemeldet/.test(H) && /Sackgasse/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
