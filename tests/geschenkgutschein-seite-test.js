// GESCHENKGUTSCHEINE (03.11.2026) -- Gaesteseite und Dashboard.
// Fuehrt die Bausteine aus: Karte, Teaser nur mit Schalter, Pruefung vor
// der Zahlung, Summen im Dashboard, Einloesen-Meldungen, Schalter.
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
function block(start) { var i = H.indexOf(start); var j = H.indexOf('};', i); return H.slice(i, j + 2); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
var G = new Function('escapeHtml', block('var GG_MOTIVE = {') + '\nvar GG_BETRAEGE = [25, 50, 75, 100];\n'
    + ['ggEuro', 'ggDatum', 'ggVerkauft', 'ggMuster', 'ggKarteHtml', 'ggTeaserHtml', 'ggPruefen', 'ggWirtSummen'].map(fn).join('\n')
    + '; return { euro: ggEuro, karte: ggKarteHtml, teaser: ggTeaserHtml, pruefen: ggPruefen, summen: ggWirtSummen, muster: ggMuster };')(esc);

// ---- Die Karte ----
var k = G.karte({ lokal: 'Hafenkate', betrag: 50, empfaenger: 'Oma <b>', nachricht: 'Frohe "Weihnachten"', von: 'Anna', code: 'KIN-7KQM-4XPA', gueltig_bis: '2029-12-31', motiv: 'festlich' });
t('Karte: Betrag, Empfaenger, Gruss, Code, gueltig bis', /50 €/.test(k) && /für Oma &lt;b&gt;/.test(k) && /„Frohe &quot;Weihnachten&quot;“/.test(k) && /KIN-7KQM-4XPA/.test(k) && /gültig bis 31\.12\.2029/.test(k), k.slice(0, 200));
// Gemessen 03.11.2026: url("...") im style="..."-Attribut beendete das Attribut -> Karte ohne Hintergrund.
var stil = /<div class="gg-karte" style="([^"]*)">/.exec(k);
t('style-Attribut bleibt ganz (kein " im Muster)', !!stil && /--gg-muster:url\('data:image\/svg\+xml,/.test(stil[1]) && /--gg-grund:#5b1a1a/.test(stil[1]), stil ? stil[1].slice(0, 120) : 'kein style');
t('Restguthaben erscheint nur, wenn schon etwas eingeloest ist', /Noch 20 € übrig/.test(G.karte({ betrag: 50, rest: 20 })) && !/übrig/.test(G.karte({ betrag: 50, rest: 50 })), '');
t('Vorschau ohne Code zeigt Platzhalter statt "undefined"', /KIN-••••-••••/.test(G.karte({ betrag: 25 })) && !/undefined/.test(G.karte({ betrag: 25 })), '');
t('Euro: 50 -> "50 €", 12.5 -> "12,50 €"', G.euro(50) === '50 €' && G.euro(12.5) === '12,50 €', G.euro(12.5));

// ---- Teaser nur, wenn der Wirt es will ----
t('Lokalseite ohne Schalter: kein Kasten', G.teaser({ id: 'r', name: 'X', features: ['payment_paypal'] }) === '', '');
t('Lokalseite mit Schalter: Kasten mit Knopf', /ggOeffnen\('r'\)/.test(G.teaser({ id: 'r', name: 'X', features: ['geschenkgutschein'] })), '');
t('Kasten steht in der Lokalseite', /\$\{ggTeaserHtml\(rest\)\}/.test(H), '');

// ---- Pruefung vor der Zahlung ----
var info = { min: 10, max: 300 };
t('ohne E-Mail -> Meldung (dorthin kommt der Gutschein)', /E-Mail/.test(G.pruefen({ betrag: 50, email: '' }, info)), '');
t('Betrag 5 / 25,5 / 500 -> Meldung', !!G.pruefen({ betrag: 5, email: 'a@b.de' }, info) && !!G.pruefen({ betrag: 25.5, email: 'a@b.de' }, info) && !!G.pruefen({ betrag: 500, email: 'a@b.de' }, info), '');
t('50 € mit E-Mail -> ok', G.pruefen({ betrag: 50, email: 'a@b.de' }, info) === '', G.pruefen({ betrag: 50, email: 'a@b.de' }, info));

// ---- Zahlung: Gutschein erst nach Bestaetigung ----
var zahl = fn('ggZurZahlung');
t('Zahlung: anlegen -> PayPal -> buchen (Server), Gutschein erst danach', /action: 'anlegen'/.test(zahl) && /action: 'buchen'/.test(zahl) && /if \(j && j\.ok && j\.gutschein\) \{ ggFertig/.test(zahl), '');
t('bezahlt, aber kein Gutschein -> rote Meldung mit PayPal-Nummer, nie still', /Bitte NICHT erneut bezahlen/.test(zahl) && /daten\.orderID/.test(zahl), '');
t('Link aus der Mail (?gutschein=) oeffnet den Gutschein', /urlParams\.get\('gutschein'\)/.test(H) && /ggAnsehen\(ggParam\)/.test(H), '');
t('Als Bild speichern: eigene Leinwand, teilen oder herunterladen', /createElement\('canvas'\)/.test(fn('ggBildSpeichern')) && /navigator\.share\(\{ files/.test(fn('ggBildSpeichern')) && /a\.download = name/.test(fn('ggBildSpeichern')), '');

// ---- Dunkelmodus ----
t('Dunkelmodus: Kartenschrift fest (gegen ".dark-mode *")', /\.gg-karte \.gg-k-betrag, \.gg-karte \.gg-k-fuer, \.gg-karte \.gg-k-code[^{]*\{ color: var\(--gg-text\); \}/.test(H), '');
t('Kein color-mix (aeltere Handys verlieren sonst den ganzen Hintergrund)', !/\.gg-karte \{[^}]*color-mix/.test(H), '');

// ---- Dashboard ----
var s = G.summen([{ betrag: 50, rest: 20, status: 'aktiv' }, { betrag: 25, rest: 0, status: 'eingeloest' }, { betrag: 100, rest: 100, status: 'storniert' }]);
t('Summen: verkauft 75, offen 20, eingeloest 55 (storniert zaehlt nicht)', s.verkauft === 75 && s.offen === 20 && s.eingeloest === 55 && s.anzahl === 2, JSON.stringify(s));
t('Menuepunkt "Geschenkgutscheine" im Dashboard', /id="navGutscheine" onclick="ggWirtOeffnen\(\)"/.test(H), '');
t('Mitarbeiter duerfen einloesen (Menuepunkt nicht gesperrt)', !/navGutscheine/.test(/var TEAM_ELEMENTE_GESPERRT = \{[\s\S]*?\};/.exec(H)[0]), '');
t('Schalter "online verkaufen" nur fuer den Inhaber', /if \(sch && teamRolle\(\) === 'inhaber'\)/.test(fn('ggWirtLaden')), '');
t('Liste nicht geladen -> Meldung statt leerer Liste', /Liste nicht geladen/.test(fn('ggWirtLaden')), '');

(async function () {
    function sandbox(antwort) {
        var felder = { ggWCode: { value: 'kin abcd 2345' }, ggWBetrag: { value: '12,50' }, ggWStand: { textContent: '', className: '' } }, toasts = [], gesendet = [];
        var E = new Function('document', 'showToast', 'kmiToken', 'fetch', 'getControlRestaurantId', 'currentAdmin', 'ggWirtLaden',
            ['ggEuro', 'ggWirtRid', 'ggWirtAufruf', 'ggWirtEinloesen'].map(fn).join('\n') + '; return ggWirtEinloesen;')(
            { getElementById: function (id) { return felder[id] || null; } }, function (m, a) { toasts.push(a + ':' + m); }, function () { return 't'; },
            async function (u, o) { gesendet.push(JSON.parse(o.body)); return { status: 200, json: async function () { return antwort; } }; },
            function () { return 'R1'; }, { restaurant_id: 'R1' }, function () {});
        return { E: E, felder: felder, toasts: toasts, gesendet: gesendet };
    }
    var X = sandbox({ ok: true, eingeloest: 12.5, rest: 37.5, code: 'KIN-ABCD-2345' });
    var r = await X.E();
    t('Einloesen: Komma-Betrag 12,50 geht als 12.5 raus, Rest wird genannt', r === true && X.gesendet[0].betrag === 12.5 && /Auf KIN-ABCD-2345 sind noch 37,50 €/.test(X.felder.ggWStand.textContent), X.felder.ggWStand.textContent);
    X = sandbox({ ok: false, error: 'Auf dem Gutschein sind nur noch 5,00 € – mehr geht nicht.', gutschein: { rest: 5 } });
    r = await X.E();
    t('Einloesen abgelehnt -> roter Text mit Grund, nichts als erledigt gemeldet', r === false && /Nicht eingelöst: Auf dem Gutschein sind nur noch 5,00 €/.test(X.felder.ggWStand.textContent) && /gg-w-rot/.test(X.felder.ggWStand.className) && !X.toasts.length, X.felder.ggWStand.textContent);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
