// WAS DAS FELD ANZEIGT, MUSS DAS SEIN, WAS DER GAST BEKOMMT.
//
// Gemeldet am 27.08.2026: "habe bei oldersum 15 stehen warum wird
// nicht da angezeigt?"
//
// In der Datenbank stand dort 0,00. Im Dashboard stand 15. Beides
// stimmte -- die Anzeige nahm nur eine andere Quelle:
//
//     restaurant.min_order_value || localStorage.getItem('kin_min_order_' + id)
//
// Steht in der Datenbank 0, ist das falsy. Also sprang die Anzeige auf
// den Wert im Browser DES WIRTS. Er sah 15 EUR und glaubte, die Regel
// gelte. Der Gast hat diesen Speicher nicht -- fuer ihn war der
// Mindestwert 0. Deshalb konnte am 26.08. jemand fuer 12 EUR liefern
// lassen, obwohl 15 hinterlegt schienen.
//
// Die haesslichste Sorte Fehler aus Regel 6: er funktioniert fuer
// genau die eine Person, die ihn prueft, und fuer niemanden sonst. Ein
// Feld, das den falschen Wert anzeigt, ist schlimmer als ein leeres --
// ein leeres verraet sich.
//
// Dieser Test laesst den echten Ladecode aus index.html laufen.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

console.log('\n-- 1. Das ODER, das den Fehler unsichtbar gemacht hat --');
// Kein einziger Ort darf mehr von der Datenbank auf den Browser
// zurueckfallen. Sonst zeigt irgendeine Stelle wieder etwas an, das
// nur auf einem Geraet gilt.
t('nirgends mehr min_order_value || localStorage',
  !/min_order_value\s*\|\|\s*parseFloat\(localStorage/.test(h), 'der Ersatzweg ist wieder da');
t('und auch nicht bei free_delivery_from',
  !/free_delivery_from\s*\|\|\s*parseFloat\(localStorage/.test(h), 'der Ersatzweg ist wieder da');
// Geschrieben wird weiter in den Browser -- das ist der Notnagel, wenn
// der Server gerade nicht antwortet. Nur GELESEN wird er nicht mehr.
t('geschrieben wird weiter lokal, als Notnagel',
  /localStorage\.setItem\('kin_min_order_' \+ restId, minOrder\)/.test(h), 'kein Notnagel mehr');

console.log('\n-- 2. Und der echte Ladecode, ausgefuehrt --');
// Den Abschnitt aus index.html herausschneiden und wirklich laufen
// lassen. Ein Test, der nur nachliest, was der Quelltext behauptet,
// haette den Fehler nie gefunden -- er stand ja genau dort.
var anfang = h.indexOf("    var minOrderEl = document.getElementById('settingMinOrder');");
var ende   = h.indexOf('// Wartezeiten laden', anfang);
t('der Abschnitt liess sich finden', anfang > 0 && ende > anfang, anfang + '/' + ende);
var code = h.slice(anfang, ende);

function laden(inDerDatenbank, imBrowser) {
    var feld  = { value: null };
    var warn  = { style: { display: 'none' }, textContent: '' };
    var welt = {
        restId: 'haus-1',
        restaurant: { id: 'haus-1', min_order_value: inDerDatenbank },
        document: { getElementById: function (id) {
            if (id === 'settingMinOrder')   return feld;
            if (id === 'minOrderNurLokal')  return warn;
            return null;
        } },
        localStorage: { getItem: function (k) {
            return k === 'kin_min_order_haus-1' ? String(imBrowser) : null;
        } },
        Number: Number, parseFloat: parseFloat
    };
    vm.createContext(welt);
    vm.runInContext(code, welt);
    return { feld: feld.value, warnung: warn.style.display === 'block', text: warn.textContent };
}

// a) Der Normalfall: der Wert steht in der Datenbank. Nichts zu melden.
var gut = laden(15, 15);
t('Datenbank 15, Browser 15 -> Feld zeigt 15', gut.feld === 15, gut.feld);
t('und keine Warnung', gut.warnung === false, 'warnt ohne Grund');

// b) DER FALL VON OLDERSUM. Vorher zeigte das Feld 15 und schwieg.
var oldersum = laden(0, 15);
t('Datenbank 0, Browser 15 -> Feld zeigt 0, nicht 15', oldersum.feld === 0, oldersum.feld);
t('und es steht DA, dass die 15 nur auf dem Geraet liegen',
  oldersum.warnung === true, 'schweigt -- genau der alte Fehler');
t('mit beiden Zahlen, damit klar ist was der Gast sieht',
  /15/.test(oldersum.text) && /0/.test(oldersum.text) && /Gast/.test(oldersum.text),
  oldersum.text);
t('und sagt, was zu tun ist',
  /Knöpfe|tippen/.test(oldersum.text), oldersum.text);

// c) Nichts hinterlegt, nirgends -- das ist kein Fehler.
var leer = laden(0, 0);
t('Datenbank 0, Browser 0 -> Feld 0', leer.feld === 0, leer.feld);
t('und keine Warnung', leer.warnung === false, 'warnt ohne Grund');

// d) Der Wirt hat den Wert auf einem anderen Geraet geaendert. Auch
//    das ist eine Abweichung, und auch die soll er sehen.
var anderes = laden(20, 15);
t('Datenbank 20, Browser 15 -> Feld zeigt 20', anderes.feld === 20, anderes.feld);
t('und meldet die Abweichung', anderes.warnung === true, 'schweigt');

console.log('\n-- 3. Der Gast bekommt nur, was auf dem Server steht --');
// Ein Gast hat kin_min_order_* nie im Browser. Der Ersatzweg war fuer
// ihn also immer 0 -- er hat nie etwas genuetzt, aber er hat auf dem
// Geraet des Wirts so ausgesehen, als gelte die Regel.
t('der Warenkorb liest nur den Server',
  /var minVal = Number\(currentOrderRestaurant\.min_order_value\) \|\| 0;/.test(h),
  'liest wieder den Browser');
t('und die Bestellpruefung auch',
  /minOrderVal = Number\(currentOrderRestaurant\.min_order_value\) \|\| 0;/.test(h),
  'liest wieder den Browser');

console.log('\n-- 4. Ein Wert, der sich nicht aendert, muss trotzdem ankommen --');
// GEMESSEN AM 27.08.2026: seit 14 Uhr ging vom Browser genau EIN PATCH
// auf restaurants raus -- beim Eintippen der 15 verliess keine Anfrage
// das Geraet.
//
// onchange feuert nur bei einer AENDERUNG. Im Feld stand schon 15 (aus
// dem Browser-Speicher, nicht aus der Datenbank). 15 ueber 15 tippen
// ist keine Aenderung: kein Ereignis, keine Anfrage, keine Meldung.
// Es sah aus wie gespeichert und war es nie.
var feld = (h.match(/<input[^>]*id="settingMinOrder"[^>]*>/) || [''])[0];
t('das Feld speichert auch beim Verlassen', /onblur="saveMinOrderValue\(\)"/.test(feld),
  'nur onchange -- ein unveraenderter Wert kommt nie an');
t('und weiterhin bei einer Aenderung', /onchange="saveMinOrderValue\(\)"/.test(feld), 'gar nicht mehr');
// Die Schnellknoepfe rufen direkt auf -- die waren nie betroffen, und
// das soll so bleiben.
t('die Schnellknoepfe rufen direkt auf',
  (h.match(/onclick="document\.getElementById\('settingMinOrder'\)\.value='\d+'; saveMinOrderValue\(\);"/g) || []).length >= 4,
  'ein Knopf speichert nicht mehr');

console.log('\n-- 5. Und die Aenderung erreicht die Geraete --');
// Regel 4: ein Fix im Quelltext erreicht niemanden von selbst. Der
// Name des Zwischenspeichers ist der Schalter, der die alte App von
// den Handys raeumt. Diese Aenderung liegt auf einem Gastweg -- also
// muss er hochgezaehlt sein.
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var v = Number((sw.match(/kmi-shell-v(\d+)/) || [])[1]);
t('sw.js steht mindestens auf v5', v >= 5, 'v' + v);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
