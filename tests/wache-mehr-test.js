// DIE WACHE MUSS DIE WEGE GEHEN, AN DENEN ES HEUTE GEKNALLT HAT.
//
// Am 14.09.2026 kamen drei Fehler heraus, alle monatelang unbemerkt:
// Vorbestellungen liefen nie, die Zahlart stand nie auf dem Bon, die
// Notiz kam nie bei der Kasse an. Gefunden hat sie keiner der 5300
// Tests, sondern der Betreiber, weil ihm etwas auffiel.
//
// Der Grund: fast alle Tests lesen Quelltext. Die Wache ist die
// einzige, die den ECHTEN Weg geht -- und sie prueft fuenf Dinge.
// Zwei kommen dazu, beide aus den Fehlern von heute:
//
//   Vorbestellung -- kommt scheduled_at durch und steht es hinterher
//                    wirklich in der Bestellung?
//   Mailversand   -- ohne RESEND_API_KEY verschickt order-email
//                    ABSICHTLICH still gar nichts. Faellt der Schluessel
//                    weg, bekommt kein Gast mehr eine Bestaetigung, und
//                    im Dashboard sieht alles normal aus.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var W = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'gastweg-wache.js'), 'utf8');

function schneide(quelle, kopf) {
    var a = quelle.indexOf(kopf);
    if (a === -1) return '';
    var i = quelle.indexOf('{', a), tiefe = 0;
    for (var j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    return '';
}

// ---- 1. Beide Pruefungen laufen wirklich mit ---------------------------
console.log('\n-- Sie stehen in der Liste --');
var liste = W.slice(W.indexOf('var PRUEFUNGEN = ['), W.indexOf('];', W.indexOf('var PRUEFUNGEN = [')));
t('die Liste wurde gefunden', liste.length > 100, liste.length);
t('Vorbestellung ist dabei', /kennung: 'wache-vorbestellung'/.test(liste), 'laeuft nie');
t('Mailversand ist dabei', /kennung: 'wache-mail'/.test(liste), 'laeuft nie');
t('die bisherigen fuenf sind noch da',
  ['wache-seite', 'wache-reservieren', 'wache-bestellen', 'wache-preis', 'wache-mindest']
    .every(function (k) { return liste.indexOf(k) >= 0; }), 'eine ist verschwunden');
t('der Kopfkommentar zaehlt nicht mehr drei', !/DREI PRUEFUNGEN/.test(W), 'Kommentar luegt');

// ---- 2. Vorbestellung: "gespeichert" reicht nicht ----------------------
console.log('\n-- Vorbestellung --');
var vb = schneide(W, 'async function pruefeVorbestellung(haus)');
t('die Pruefung gibt es', vb.length > 200, vb.length);
t('sie schickt einen Zeitpunkt mit', /scheduled_at:\s*wann/.test(vb), 'prueft nichts Besonderes');
t('der Zeitpunkt liegt in der Zukunft', /Date\.now\(\) \+ 26 \* 60 \* 60 \* 1000/.test(vb), 'heute -- waere keine Vorbestellung');
t('sie liest die Bestellung danach WIRKLICH nach -- "gespeichert" reicht nicht',
  /select=scheduled_at/.test(vb), 'glaubt der Antwort');
t('und meldet, wenn der Zeitpunkt unterwegs verlorenging',
  /verlorengegangen/.test(vb), 'stiller Verlust');
t('die Meldung sagt auch, was das bedeutet',
  /Kueche faengt sofort an zu kochen/.test(vb), 'nur ein Feldname');
t('sie benutzt den Probe-Namen, damit das Aufraeumen sie findet',
  /customer_name: PROBE_NAME/.test(vb), 'Probe bleibt liegen');

// Der Aufraeumer muss sie auch wirklich wegbekommen.
var auf = schneide(W, 'async function aufraeumen()');
t('der Aufraeumer loescht Bestellungen mit dem Probe-Namen',
  /orders\?customer_name=eq\.' \+ encodeURIComponent\(PROBE_NAME\)/.test(auf), 'Proben haeufen sich');

// ---- 3. Mailversand ----------------------------------------------------
console.log('\n-- Mailversand --');
var ml = schneide(W, 'async function pruefeMailversand()');
t('die Pruefung gibt es', ml.length > 150, ml.length);
t('sie benutzt die Selbstauskunft, verschickt also nichts',
  /order-email\?test=1/.test(ml) && !/&to=/.test(ml), 'schickt echte Mails');
t('fehlt der Schluessel, wird es gemeldet', /key_gesetzt === false/.test(ml), 'merkt es nicht');
t('die Meldung sagt, wo er fehlt', /in Netlify/.test(ml), 'Wirt sucht im Falschen');
t('und beruhigt: die Bestellungen kommen trotzdem an',
  /Bestellungen kommen trotzdem an/.test(ml), 'macht unnoetig Panik');

// Die Entscheidung ausfuehren -- "nicht erreichbar" ist NICHT "kein Schluessel".
var pruef = new Function('SEITE', 'fetch', ml + '; return pruefeMailversand;');
function lauf(antwort, wirft) {
    return pruef('https://x', function () {
        if (wirft) return Promise.reject(new Error('Netz weg'));
        return Promise.resolve(antwort);
    })();
}
Promise.all([
    lauf({ ok: true, json: function () { return Promise.resolve({ ok: true, key_gesetzt: true }); } }),
    lauf({ ok: true, json: function () { return Promise.resolve({ ok: false, key_gesetzt: false }); } }),
    lauf({ ok: false, status: 502, json: function () { return Promise.resolve(null); } }),
    lauf(null, true)
]).then(function (r) {
    t('Schluessel da -> kein Alarm', r[0] === null, String(r[0]));
    t('Schluessel fehlt -> Alarm', typeof r[1] === 'string' && /RESEND_API_KEY/.test(r[1]), String(r[1]));
    t('Funktion antwortet mit 502 -> eigener Text, nicht "Schluessel fehlt"',
      typeof r[2] === 'string' && /HTTP 502/.test(r[2]) && !/RESEND_API_KEY/.test(r[2]), String(r[2]));
    t('Netz weg -> eigener Text, nicht "Schluessel fehlt"',
      typeof r[3] === 'string' && /nicht erreichbar/.test(r[3]) && !/RESEND_API_KEY/.test(r[3]), String(r[3]));

    console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exit(1);
});
