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
function zeile(re) { var m = re.exec(H); if (!m) throw new Error('fehlt: ' + re); return m[0]; }
function block(start) { var i = H.indexOf(start); var j = H.indexOf('};', i); return H.slice(i, j + 2); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
var KOPF = zeile(/var GG_GOLD = [^\n]+/) + '\n' + zeile(/var GG_SCHNITT_GOLD = [^\n]+/) + '\n' + block('var GG_MOTIVE = {') + '\nvar GG_BETRAEGE = [25, 50, 75, 100];\n' + zeile(/var GG_KORN = [^\n]+/) + '\n';
var G = new Function('escapeHtml', KOPF
    + ['ggEuro', 'ggDatum', 'ggVerkauft', 'ggMono', 'ggZufall', 'ggMuster', 'ggVars', 'ggAbriss', 'ggKarteHtml', 'ggRueckHtml', 'gg3dHtml', 'ggTeaserHtml', 'ggPruefen', 'ggWirtSummen', 'ggVorOrtPruefen', 'ggZustellText'].map(fn).join('\n')
    + '; return { euro: ggEuro, karte: ggKarteHtml, rueck: ggRueckHtml, drei: gg3dHtml, teaser: ggTeaserHtml, pruefen: ggPruefen, summen: ggWirtSummen, vorort: ggVorOrtPruefen, mono: ggMono, zustell: ggZustellText };')(esc);

// ---- Die Karte (21 x 10 cm, Abriss rechts) ----
var k = G.karte({ lokal: 'Hafenkate', ort: 'Greetsiel', betrag: 50, empfaenger: 'Oma <b>', nachricht: 'Frohe "Weihnachten"', von: 'Anna', code: 'KIN-7KQM-4XPA', gueltig_bis: '2029-12-31', motiv: 'festlich' });
t('Karte: Betrag, Empfaenger, Gruss, Unterschrift, Code, gueltig bis', /gg-k-zahl">50</.test(k) && /für <b>Oma &lt;b&gt;<\/b>/.test(k) && /„Frohe &quot;Weihnachten&quot;“/.test(k) && /– Anna/.test(k) && /KIN-7KQM-4XPA/.test(k) && /gültig bis 31\.12\.2029/.test(k), k.slice(0, 200));
t('Format 21 x 10 cm im CSS (Karte und 3D)', /\.gg-karte \{[^}]*aspect-ratio: 21 \/ 10/.test(H) && /\.gg-3d \{[^}]*aspect-ratio: 21 \/ 10/.test(H), '');
t('Abriss rechts mit Monogramm des Lokals, Lokal + Ort oben', /gg-k-abriss"><span class="gg-k-mono gg-folie">H</.test(k) && /Hafenkate · Greetsiel/.test(k), '');
// Gemessen 03.11.2026: ein " im style-Attribut beendete es -> Karte ohne Hintergrund.
var stil = /<div class="gg-karte" style="([^"]*)">/.exec(k);
t('style-Attribut bleibt ganz (kein " in den Farben)', !!stil && /--gg-a:#8a2329/.test(stil[1]) && /--gg-gold:linear-gradient/.test(stil[1]) && /--gg-schnitt:/.test(stil[1]), stil ? stil[1].slice(0, 120) : 'kein style');
t('Restguthaben erscheint nur, wenn schon etwas eingeloest ist', /Noch 20 € übrig/.test(G.karte({ betrag: 50, rest: 20 })) && !/übrig/.test(G.karte({ betrag: 50, rest: 50 })), '');
t('Vorschau ohne Code zeigt Platzhalter statt "undefined"', /KIN-••••-••••/.test(G.karte({ betrag: 25 })) && !/undefined/.test(G.karte({ betrag: 25 })), '');
t('Rueckseite: drei Schritte und das Guthaben', /SO LÖST DU IHN EIN/.test(G.rueck({ lokal: 'Hafenkate', betrag: 50, rest: 30 })) && /Bei Hafenkate den Code/.test(G.rueck({ lokal: 'Hafenkate', betrag: 50 })) && /gg-r-guthaben">30 €/.test(G.rueck({ betrag: 50, rest: 30 })), '');
var d3 = G.drei({ lokal: 'X', betrag: 50, motiv: 'klassisch' }, 'kippen');
t('3D: Vorder- und Rueckseite, dazwischen Schichten (Goldschnitt)', (d3.match(/gg-3d-schicht/g) || []).length === 13 && /gg-3d-v/.test(d3) && /gg-3d-r/.test(d3) && /gg-3d-kippen/.test(d3), '');
t('3D-Rueckseite unsichtbar von vorn (backface-visibility)', /\.gg-3d-v, \.gg-3d-r \{[^}]*backface-visibility: hidden/.test(H), '');
t('Monogramm: erster Buchstabe, sonst K', G.mono('hafenkate') === 'H' && G.mono('') === 'K' && G.mono('#1 Grill') === 'K', G.mono('#1 Grill'));
t('Euro: 50 -> "50 €", 12.5 -> "12,50 €"', G.euro(50) === '50 €' && G.euro(12.5) === '12,50 €', G.euro(12.5));
t('Serifenschrift liegt im Haus (keine Google-Schrift)', /@font-face\{font-family:'Fraunces'[^}]*src:url\(\/public\/fonts\/fraunces-latin\.woff2\)/.test(H) && fs.existsSync(path.join(__dirname, '..', 'public', 'fonts', 'fraunces-latin.woff2')) && fs.existsSync(path.join(__dirname, '..', 'public', 'fonts', 'LIZENZ-Fraunces.txt')), '');

// ---- Teaser nur, wenn der Wirt es will ----
t('Lokalseite ohne Schalter: kein Kasten', G.teaser({ id: 'r', name: 'X', features: ['payment_paypal'] }) === '', '');
t('Lokalseite mit Schalter: Kasten mit Knopf', /ggOeffnen\('r'\)/.test(G.teaser({ id: 'r', name: 'X', features: ['geschenkgutschein'] })), '');
t('Kasten steht in der Lokalseite (3D, schwebt)', /\$\{ggTeaserHtml\(rest\)\}/.test(H) && /gg-3d-schwebt/.test(G.teaser({ id: 'r', name: 'X', features: ['geschenkgutschein'] })), '');

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
t('Bild: 21 x 10 cm bei 300 dpi = 2480 x 1181 Pixel', /var GG_DRUCK = \{ w: 2480, h: 1181 \};/.test(H) && /c\.width = W; c\.height = H;/.test(fn('ggBildMalen')), '');
t('Als Bild speichern: teilen oder herunterladen', /navigator\.share\(\{ files/.test(fn('ggBildSpeichern')) && /a\.download = name/.test(fn('ggBildSpeichern')), '');
t('Drucken in Originalgroesse: @page 210 x 100 mm', /@page\{size:210mm 100mm;margin:0\}/.test(fn('ggDrucken')) && /width:210mm;height:100mm/.test(fn('ggDrucken')), '');
t('Fertig und Link-Ansicht: Karte zum Kippen und Drucken', /gg3dHtml\(ggDaten\(g\), 'kippen'\)/.test(fn('ggFertig')) && /ggKippen\(/.test(fn('ggFertig')) && /ggDrucken\(\)/.test(fn('ggFertig')) && /gg3dHtml\(ggDaten\(g\), 'kippen'\)/.test(fn('ggAnsehen')) && /ggDrucken\(\)/.test(fn('ggAnsehen')), '');
t('Beschenkter sieht: "Für dich, <Name>!" und von wem', /'Für dich, ' \+ escapeHtml\(g\.empfaenger\)/.test(fn('ggAnsehen')) && /schenkt dir einen Abend bei/.test(fn('ggAnsehen')), '');

// ---- Dunkelmodus ----
t('Dunkelmodus: Kartenschrift fest (gegen ".dark-mode *")', /\.gg-karte \.gg-k-zahl \{[^}]*color: var\(--gg-text\)/.test(H) && /\.gg-karte \.gg-k-code \{[^}]*color: var\(--gg-text\)/.test(H) && /\.gg-folie \{[^}]*color: transparent !important/.test(H), '');
t('Kein color-mix (aeltere Handys verlieren sonst den ganzen Hintergrund)', !/\.gg-karte \{[^}]*color-mix/.test(H), '');

// ---- Dashboard ----
var s = G.summen([{ betrag: 50, rest: 20, status: 'aktiv' }, { betrag: 25, rest: 0, status: 'eingeloest' }, { betrag: 100, rest: 100, status: 'storniert' }]);
t('Summen: verkauft 75, offen 20, eingeloest 55 (storniert zaehlt nicht)', s.verkauft === 75 && s.offen === 20 && s.eingeloest === 55 && s.anzahl === 2, JSON.stringify(s));
t('Menuepunkt "Geschenkgutscheine" im Dashboard', /id="navGutscheine" onclick="ggWirtOeffnen\(\)"/.test(H), '');
t('Mitarbeiter duerfen einloesen (Menuepunkt nicht gesperrt)', !/navGutscheine/.test(/var TEAM_ELEMENTE_GESPERRT = \{[\s\S]*?\};/.exec(H)[0]), '');
t('Schalter "online verkaufen" nur fuer den Inhaber', /if \(sch && teamRolle\(\) === 'inhaber'\)/.test(fn('ggWirtLaden')), '');
t('Liste nicht geladen -> Meldung statt leerer Liste', /Liste nicht geladen/.test(fn('ggWirtLaden')), '');

// ---- Direkt an den Beschenkten ----
t('Kauf-Fenster: E-Mail des Beschenkten + Zustelltag (leer = sofort)', /id="ggEmpfMail"/.test(fn('ggFormular')) && /id="ggVersandAm"/.test(fn('ggFormular')) && /empfaenger_email: d\.empfMail/.test(fn('ggZurZahlung')) && /versand_am: d\.versandAm/.test(fn('ggZurZahlung')), '');
t('Empfaenger-Mail kaputt -> Meldung vor der Zahlung', /Beschenkten sieht nicht richtig aus/.test(G.pruefen({ betrag: 50, email: 'a@b.de', empfMail: 'kaputt' }, info)), '');
t('Wunschtag ohne Empfaenger-Mail -> Meldung', /E-Mail des Beschenkten/.test(G.pruefen({ betrag: 50, email: 'a@b.de', versandAm: '2099-12-24' }, info, '2026-11-04')), '');
t('Wunschtag in der Vergangenheit -> Meldung', /Vergangenheit/.test(G.pruefen({ betrag: 50, email: 'a@b.de', empfMail: 'o@b.de', versandAm: '2026-01-01' }, info, '2026-11-04')), '');
t('direkt + Wunschtag richtig -> ok', G.pruefen({ betrag: 50, email: 'a@b.de', empfMail: 'o@b.de', versandAm: '2026-12-24' }, info, '2026-11-04') === '', '');
t('Fertig-Seite: "geht am 24.12.2099 ab 8 Uhr an Oma"', /geht am 24\.12\.2099 ab 8 Uhr an Oma/.test(G.zustell({ am: '2099-12-24', gesendet: false }, { empfaenger: 'Oma' }).text), JSON.stringify(G.zustell({ am: '2099-12-24', gesendet: false }, { empfaenger: 'Oma' })));
t('Fertig-Seite: "unterwegs" / nicht raus -> rot mit naechstem Versuch', /unterwegs/.test(G.zustell({ gesendet: true }, { empfaenger: 'Oma' }).text) && G.zustell({ gesendet: false }, {}).rot === true && /nächsten Stunde/.test(G.zustell({ gesendet: false }, {}).text), '');
t('ohne Zustellung -> kein Hinweis', G.zustell(null, {}) === null, '');
t('stuendlicher Versand steht im Zeitplan', /\[functions\."gutschein-versand"\]\s+schedule = "35 \* \* \* \*"/.test(fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8')), '');

// ---- Vor Ort verkaufen ----
t('Knopf "Gutschein vor Ort verkaufen" im Wirt-Fenster', /ggVorOrtFormular\(\)">\+ Gutschein vor Ort verkaufen/.test(fn('ggWirtOeffnen')), '');
t('vor Ort: ohne Zahlart -> Meldung', /Bar oder Karte/.test(G.vorort({ betrag: 50, zahlart: '' })), '');
t('vor Ort: Betrag 3 € / 600 € -> Meldung, 12,50 € bar ok', !!G.vorort({ betrag: 3, zahlart: 'bar' }) && !!G.vorort({ betrag: 600, zahlart: 'bar' }) && G.vorort({ betrag: 12.5, zahlart: 'bar' }) === '', '');
t('vor Ort: E-Mail optional, aber wenn, dann richtig', G.vorort({ betrag: 50, zahlart: 'karte', email: '' }) === '' && /E-Mail/.test(G.vorort({ betrag: 50, zahlart: 'karte', email: 'kaputt' })), '');
t('vor Ort angelegt -> Karte zum Kippen + Drucken + Bild + Link', /gg3dHtml\(ggDaten\(g\), 'kippen'\)/.test(fn('ggVorOrtAnlegen')) && /ggDrucken\(\)/.test(fn('ggVorOrtAnlegen')) && /ggBildSpeichern\(\)/.test(fn('ggVorOrtAnlegen')) && /ggTeilen\(\)/.test(fn('ggVorOrtAnlegen')), '');
t('vor Ort nicht angelegt -> rote Meldung (der Gast hat schon bezahlt)', /Nicht angelegt: /.test(fn('ggVorOrtAnlegen')), '');

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
