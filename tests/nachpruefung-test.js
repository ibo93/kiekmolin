// EINE BESTAETIGUNG ERST, WENN DIE BESTELLUNG NACHWEISLICH DA IST.
//
// WORAUF DAS AUFBAUT
// ------------------
// Schritt 1 (tests/bestellverlust-test.js) hat dafuer gesorgt, dass ein
// fehlgeschlagenes Speichern keine Bestaetigungsseite mehr erzeugt. Das
// stuetzte sich aber allein auf _saveOk -- und _saveOk sagt nur: der Server
// hat mit 2xx geantwortet.
//
// Fast immer ist das dasselbe wie "gespeichert". Eben nur fast: ein
// Netlify-Fallback, der ok meldet ohne zu schreiben, oder eine Antwort, die
// unterwegs verlorengeht, sehen von aussen genauso aus. Bei einer Bestellung
// ist das der Unterschied zwischen "Essen kommt" und "Gast sitzt umsonst da".
//
// Deshalb wird jetzt einmal nachgefragt, bevor die Bestaetigung erscheint.
//
// DIE ENTSCHEIDENDE REGEL
// -----------------------
// Nur ein eindeutiges "nicht da" gilt als Fehlschlag. Klemmt die Nachfrage
// selbst, bleibt es bei bestellt. Sonst wuerde eine wackelige Leitung eine
// Bestellung zurueckziehen, die laengst in der Kueche liegt -- der Gast
// bestellt ein zweites Mal und das Restaurant kocht doppelt. Im Zweifel gilt
// der Bon. Die Tests unten pruefen genau diese Asymmetrie.
//
// AUSSERDEM: STILLE POSITIONEN
// ----------------------------
// Schlugen einzelne order_items fehl, stand darueber nur ein console.error.
// Die Kueche merkt davon nichts -- die Gerichte haengen zusaetzlich als
// JSONB an der Bestellung und das Kuechenbrett faellt darauf zurueck. Schief
// werden die Auswertungen: "Beliebteste Gerichte" (Zeile ~45050) und die
// Umsatzstatistik lesen order_items. Was durchfaellt, fehlt dem Wirt in
// seinen Zahlen, ohne dass er es je erfaehrt. Das geht jetzt ins
// Ereignis-Protokoll.

// Seit die App das Sitzungs-Token benutzt, ruft der ausgeschnittene
// Code kmiToken(). Im Browser ist das eine globale Funktion -- hier
// gehoert sie zur nachgebauten Umgebung, genau wie sbRead oder showToast.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
var KMI_STUB = 'var kmiToken = function () { return typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY '
    + ': (typeof SUPA_KEY !== "undefined" ? SUPA_KEY : "anon"); };\n';

'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// ---- 1. Die Nachfrage selbst -------------------------------------------------
function pruefer(antwort) {
    var geholt = [];
    var abgebrochen = false;
    var F = new Function('fetch', 'SUPABASE_URL', 'SUPABASE_KEY', 'AbortController',
        'setTimeout', 'clearTimeout',
        KMI_STUB + schneide('_bestellungNachpruefen') + '; return _bestellungNachpruefen;')(
        function (url, opt) {
            geholt.push(url);
            if (antwort === 'werfen') return Promise.reject(new Error('Netzwerk weg'));
            if (antwort === 'fehler') return Promise.resolve({ ok: false, status: 500 });
            if (antwort === 'kaputt') return Promise.resolve({ ok: true, json: function () { return Promise.reject(new Error('kein JSON')); } });
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve(antwort); } });
        },
        'https://test.supabase.co', 'schluessel',
        function () { return { abort: function () { abgebrochen = true; }, signal: 'S' }; },
        function () { return 1; }, function () {});
    return { F: F, geholt: geholt };
}

(async function () {
    // Die Nachfrage geht seit dem Zumachen von orders NICHT mehr direkt in
    // die Tabelle, sondern ueber /.netlify/functions/order-exists. Der
    // Endpunkt antwortet mit { ok:true, da:true|false } -- eine Zeile
    // bekommt der Browser nicht mehr zu sehen, nur noch ja oder nein.
    var da = pruefer({ ok: true, da: true });
    t('gefundene Bestellung -> "da"', (await da.F('KI-260811-000123')) === 'da');
    t('gefragt wird ueber den Endpunkt, nicht in der Tabelle',
      da.geholt[0].indexOf('/.netlify/functions/order-exists') === 0, da.geholt[0]);
    t('gefragt wird nach genau dieser Bestellnummer',
      /[?&]n=KI-260811-000123/.test(da.geholt[0]), da.geholt[0]);
    t('die Tabelle orders wird nicht mehr angefasst',
      /rest\/v1\/orders/.test(da.geholt[0]) === false, da.geholt[0]);

    t('ausdrueckliches da:false -> "weg" (das ist der Fehlschlag)',
      (await pruefer({ ok: true, da: false }).F('KI-1')) === 'weg');

    // Neu und wichtig: der Endpunkt meldet Stoerungen mit ok:false. Das
    // darf NICHT als "nicht angekommen" durchgehen -- sonst bestellt der
    // Gast ein zweites Mal, waehrend die erste schon in der Kueche liegt.
    t('ok:false -> "unklar", NICHT "weg"',
      (await pruefer({ ok: false, error: 'Server nicht eingerichtet' }).F('KI-1')) === 'unklar');
    t('fehlendes da-Feld -> "unklar"',
      (await pruefer({ ok: true }).F('KI-1')) === 'unklar');
    t('da als Text statt als Ja/Nein -> "unklar"',
      (await pruefer({ ok: true, da: 'false' }).F('KI-1')) === 'unklar');

    // Die Asymmetrie: alles Unklare gilt als bestellt.
    t('Serverfehler -> "unklar", NICHT "weg"', (await pruefer('fehler').F('KI-1')) === 'unklar');
    t('Netzwerk weg -> "unklar"', (await pruefer('werfen').F('KI-1')) === 'unklar');
    t('unlesbare Antwort -> "unklar"', (await pruefer('kaputt').F('KI-1')) === 'unklar');
    t('gar keine Antwort -> "unklar" statt Absturz', (await pruefer(null).F('KI-1')) === 'unklar');
    t('eine Liste statt eines Objekts -> "unklar"', (await pruefer([]).F('KI-1')) === 'unklar');
    t('ohne Bestellnummer wird gar nicht erst gefragt',
      (await pruefer({ ok: true, da: true }).F('')) === 'unklar'
      && pruefer({ ok: true, da: true }).geholt.length === 0);

    t('die Nachfrage hat einen Deckel, damit nichts haengt',
      /setTimeout\(function \(\) \{ stop\.abort\(\); \}, 3000\)/.test(schneide('_bestellungNachpruefen')));
    t('der Deckel wird nach der Antwort wieder abgeraeumt',
      /clearTimeout\(uhr\)/.test(schneide('_bestellungNachpruefen')));

    // ---- 2. Einbau in submitOrder -------------------------------------------
    var senden = schneide('submitOrder');
    var iPruef = senden.indexOf('_bestellungNachpruefen(orderNumber)');
    var iGuard = senden.indexOf('if (!_saveOk) {');
    t('nachgeprueft wird VOR dem Abbruch-Guard aus Schritt 1',
      iPruef > 0 && iPruef < iGuard, iPruef + ' / ' + iGuard);
    t('auf die Antwort wird gewartet', /await _bestellungNachpruefen\(/.test(senden));
    t('geprueft wird nur, wenn das Speichern ueberhaupt geklappt hat',
      /if \(_saveOk\) \{[\s\S]{0,120}_bestellungNachpruefen/.test(senden));
    t('NUR "weg" kippt die Bestellung -- "unklar" nicht',
      /if \(_befund === 'weg'\)/.test(senden) && !/_befund !== 'da'/.test(senden));
    t('dabei wird _saveOk zurueckgesetzt, damit der Guard greift',
      /_befund === 'weg'\) \{\s*\n\s*_saveOk = false;/.test(senden));
    t('der Gast bekommt einen verstaendlichen Grund',
      /nach dem Speichern nicht auffindbar/.test(senden));
    t('und der Wirt einen Eintrag im Protokoll',
      /'order_verify_failed'/.test(senden));

    // ---- 3. Stille Positionen sind nicht mehr still --------------------------
    t('fehlgeschlagene Positionen landen im Ereignis-Protokoll',
      /'order_items_unvollstaendig'/.test(senden));
    t('mit Anzahl und Bestellnummer, nicht nur "ein Fehler"',
      /_failedItems \+ ' von ' \+ orderCart\.length \+ ' Positionen/.test(senden));
    t('die Meldung sagt dem Wirt auch, was NICHT betroffen ist',
      /die Kueche[\s\S]{0,60}sieht die Gerichte/.test(senden), 'Hinweis auf Kueche fehlt');
    // Wichtig: das kippt die Bestellung NICHT. Die Gerichte haengen als JSONB
    // an der Bestellung, die Kueche sieht sie.
    t('eine unvollstaendige Position macht die Bestellung nicht ungueltig',
      !/_failedItems > 0[\s\S]{0,400}_saveOk = false/.test(senden));

    // ---- 4. Der Grund steht im Quelltext ------------------------------------
    t('warum "unklar" als bestellt gilt, steht in der Datei',
      /Im Zweifel gilt der Bon/.test(H));
    t('und warum stille Positionen dem Wirt schaden',
      /fehlt dem Wirt[\s\S]{0,40}in seinen Zahlen/.test(H));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
