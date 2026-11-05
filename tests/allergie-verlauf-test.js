// ALLERGIE MERKT SICH DIE APP (02.11.2026) -- Ibos Idee 5.
// Der Test FUEHRT die Erkennung und den Abgleich ueber die Telefonnummer
// aus und prueft, dass Karte, Kuechenmonitor und alle Bons es zeigen.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
function zeile(re) { var m = re.exec(H); if (!m) throw new Error('fehlt: ' + re); return m[0]; }
var KONTEXT = zeile(/var ALLERGIE_KONTEXT = [^\n]+/);
var ARTEN = H.slice(H.indexOf('var ALLERGIE_ARTEN = ['), H.indexOf('];', H.indexOf('var ALLERGIE_ARTEN = [')) + 2);
var A = new Function('window', 'escapeHtml', KONTEXT + '\n' + ARTEN + '\n' + ['waNummer', 'allergienAus', 'allergienVerlauf', 'allergieText', 'allergieBekannt', 'allergieZeileHtml'].map(fn).join('\n')
    + '; var _allerg = { rid: null, daten: null, fehler: null };'
    + ' return { aus: allergienAus, verlauf: allergienVerlauf, text: allergieText, bekannt: allergieBekannt, zeile: allergieZeileHtml, setze: function (x) { _allerg = x; } };')(
    {}, function (x) { return String(x); });

// ---- Erkennung ----
t('"Nussallergie" -> Nüsse', A.aus('Nussallergie!').join() === 'Nüsse', A.aus('Nussallergie!').join());
t('"allergisch gegen Erdnüsse" -> nur Erdnüsse, keine Baumnuss', A.aus('Sohn ist allergisch gegen Erdnüsse').join() === 'Erdnüsse', A.aus('Sohn ist allergisch gegen Erdnüsse').join());
t('"Zöliakie" -> Gluten, "Laktoseintoleranz" -> Laktose', A.aus('Zöliakie').join() === 'Gluten' && A.aus('Laktoseintoleranz, Hafermilch bitte').join() === 'Laktose', A.aus('Laktoseintoleranz, Hafermilch bitte').join());
t('mehrere: "Allergie: Sellerie und Senf" -> Sellerie, Senf', A.aus('Allergie: Sellerie und Senf').join() === 'Sellerie,Senf', A.aus('Allergie: Sellerie und Senf').join());
t('"glutenfrei bitte" zaehlt (ohne das Wort Allergie)', A.aus('glutenfrei bitte').join() === 'Gluten', '');
t('Wunsch ohne Allergie: "ohne Zwiebeln", "Krabbenbrötchen", "Kinderstuhl" -> nichts', !A.aus('ohne Zwiebeln').length && !A.aus('2x Krabbenbrötchen').length && !A.aus('Kinderstuhl, Fensterplatz').length, '');
t('"bei Allergie bitte Bescheid" -> kein falsches "Ei"', A.aus('Hat eine Allergie, bitte bei Bestellung fragen').indexOf('Ei') < 0, A.aus('Hat eine Allergie, bitte bei Bestellung fragen').join());
t('Allergie ohne bekannte Art -> "Allergie (siehe Notiz)" statt nichts', A.aus('starke Allergie, bitte nachfragen').join() === 'Allergie (siehe Notiz)', A.aus('starke Allergie, bitte nachfragen').join());

// ---- Verlauf ueber die Telefonnummer ----
var daten = {
    reservierungen: [
        { id: 'r1', guest_phone: '0491 123456', reservation_date: '2026-10-01', notes: 'Nussallergie' },
        { id: 'r2', guest_phone: '+49 491 999999', reservation_date: '2026-10-02', notes: 'Laktose-Allergie' },
        { id: 'r3', guest_phone: '0491123456', reservation_date: '2026-11-02', notes: 'Allergie gegen Sesam' }
    ],
    bestellungen: [
        { id: 'o1', customer_phone: '+49491123456', customer_notes: 'glutenfrei bitte!', created_at: '2026-10-20T18:00:00Z' },
        { id: 'o2', customer_phone: '0491 123456', customer_notes: 'Fischallergie', created_at: '2026-11-02T18:00:00Z' }
    ]
};
var v = A.verlauf('0491/123456', daten, 'o2', null);
t('gleiche Nummer in anderer Schreibweise -> Nüsse, Gluten, Sesam gefunden', ['Nüsse', 'Gluten', 'Sesam'].every(function (x) { return v.arten.indexOf(x) > -1; }), v.arten.join());
t('die Bestellung selbst zaehlt nicht ("von früher")', v.arten.indexOf('Fisch') < 0, v.arten.join());
t('anderer Gast (andere Nummer) bleibt draussen', v.arten.indexOf('Laktose') < 0, v.arten.join());
var vr = A.verlauf('0491123456', daten, null, '2026-11-02');
t('Reservierung: nur Besuche VOR heute (heutige Notiz steht ohnehin da)', vr.arten.indexOf('Sesam') < 0 && vr.arten.indexOf('Nüsse') > -1, vr.arten.join());
t('ohne Telefonnummer -> nichts', !A.verlauf('', daten).arten.length, '');

// ---- Karte / Bon ueber allergieBekannt ----
A.setze({ rid: 'R1', daten: daten, fehler: null });
var bestellung = { id: 'o9', restaurant_id: 'R1', customer_phone: '0491 123456' };
t('Bestellkarte: rote Zeile "Allergie: ..." mit "von früher"', /class="kin-allergie"[^>]*>Allergie: [^<]*Nüsse[^<]* <small>· von früher<\/small>/.test(A.zeile(bestellung)), A.zeile(bestellung));
t('Admin-Ansicht: Bestellung eines anderen Lokals -> kein fremder Verlauf', !A.bekannt({ id: 'x', restaurant_id: 'R2', customer_phone: '0491 123456' }).length, '');
t('Gast ohne Allergie-Notiz -> keine Zeile', A.zeile({ id: 'x', restaurant_id: 'R1', customer_phone: '0170 5555555' }) === '', '');
A.setze({ rid: 'R1', daten: null, fehler: 'HTTP 500' });
t('Verlauf nicht geladen -> sagt es (nicht still wie "keine Allergie")', /Allergie-Verlauf gerade nicht geladen/.test(A.zeile(bestellung)), A.zeile(bestellung));

// ---- Wo es erscheint ----
t('Bestellkarte: in NEU (kompakt + gross) und IN ARBEIT', (H.match(/\+ _allergHtml \+ \(_hinw \?/g) || []).length === 3, (H.match(/\+ _allergHtml \+ \(_hinw \?/g) || []).length);
t('Kuechenmonitor-Karte zeigt es', /var _a = allergieZeileHtml\(o\)/.test(fn('_kdsRenderCard')), '');
t('Bon im Browser: "!! Allergie (von früher)"', /allergieBekannt\(order\)[\s\S]{0,200}!! Allergie \(von früher\)/.test(fn('printOrderBrowser')), '');
t('Bon ESC/POS: fett "!! ALLERGIE"', /BOLD_ON \+ '!! ALLERGIE \(von frueher\): '/.test(fn('generateESCPOS')), '');
t('Bon Epson WLAN (ePOS): "!! Allergie"', /!! Allergie \(von früher\): ' \+ _allergEpos\.join/.test(fn('generateEposXML')), '');
t('Reservierung: rotes Abzeichen + Zeile im Gästeprofil', /kmi-allergie-chip/.test(fn('gastProfileLaden')) && /Allergie \(von früher\)/.test(fn('gastProfilZeigen')) && /allergien: allergienVerlauf\(telefon, daten, null, heute\)\.arten/.test(fn('gastProfil')), '');
t('Gaesteprofil liest die Bestell-Notizen mit', /select=id,customer_phone,customer_notes,total/.test(fn('gastProfileLaden')), '');
t('Verlauf wird geladen: Bestellungen und Kuechenmonitor', /allergieVerlaufLaden\(_gastroForce \|\| ordersRestaurantFilter, renderDashboardOrders\)/.test(fn('loadDashboardOrders')) && /allergieVerlaufLaden\(restaurantId, refreshKitchenOrders\)/.test(fn('refreshKitchenOrders')), '');
t('Dunkelmodus: rote Zeile mit !important (gegen ".dark-mode .kin-order-card *")', /\.dark-mode \.kin-order-card \.kin-allergie \{[^}]*color: #fecaca !important/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
