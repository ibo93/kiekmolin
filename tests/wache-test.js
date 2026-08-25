// DIE WACHE, DIE MERKT, WENN GAESTE VOR DER TUER STEHEN.
//
// Am 25.08.2026 wurden vier Gaeste an einem Tag abgewiesen. Der Fehler
// war in einer Stunde repariert -- gemerkt hat ihn TAGE lang niemand.
//
// Der Grund ist unangenehm einfach: der Betreiber ist angemeldet. Fuer
// ihn ging alles. Der Gast ist niemand, und niemand beschwert sich --
// er geht einfach weg.
//
// Der Betreiber dazu: "Sowas darf nie passieren...muessen bei sowas
// eine Loesung finden."
//
// WARUM UNSERE 3947 TESTS DAS NICHT GEFUNDEN HABEN
// Weil sie alle Quelltext lesen. Dieser Fehler stand nicht im
// Quelltext -- er stand in einer Regel in der Datenbank. Kein
// Textvergleich der Welt findet ihn.
//
// Deshalb zwei Schichten, die beide NICHT auf Quelltext schauen:
//
//   gastweg-wache.js  reserviert alle 15 Minuten selbst einen Tisch,
//                     genau wie ein Gast -- ohne Anmeldung, ohne
//                     Sonderrechte. Klemmt es, klingelt das Handy.
//   reservation-guest ruft beim ERSTEN echten abgewiesenen Gast Alarm.
//
// Diese Datei prueft, dass die beiden richtig gebaut sind. Sie ersetzt
// die Wache nicht -- sie sorgt dafuer, dass niemand sie versehentlich
// entschaerft.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var F = path.join(KMI, 'netlify', 'functions');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function lies(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

console.log('\n-- 1. Die Wache gibt es und sie laeuft von selbst --');
var w = lies(path.join(F, 'gastweg-wache.js'));
t('gastweg-wache.js liegt da', w.length > 500, w.length);
var toml = lies(path.join(KMI, 'netlify.toml'));
t('sie steht im Zeitplan',
  /\[functions\."gastweg-wache"\]/.test(toml), 'kein Eintrag');
// Alle 15 Minuten: oefter waere Laerm, seltener hiesse, dass ein
// Ausfall einen halben Abend lang unbemerkt bleibt.
var takt = (toml.slice(toml.indexOf('[functions."gastweg-wache"]')).match(/schedule = "([^"]+)"/) || [])[1];
t('und zwar mindestens viertelstuendlich', takt === '*/15 * * * *', takt);

console.log('\n-- 2. Sie geht denselben Weg wie ein Gast --');
// Das ist der Kern. Eine Wache, die mit dem Dienstschluessel prueft,
// prueft die eigenen Sonderrechte -- und haette am 25.08. gruen
// gemeldet, waehrend vier Gaeste abgewiesen wurden.
t('sie ruft die echte Gaeste-Tuer',
  w.indexOf('/.netlify/functions/reservation-guest') > -1, 'prueft etwas anderes');
var versuch = w.slice(w.indexOf("SEITE + '/.netlify/functions/reservation-guest'"));
versuch = versuch.slice(0, versuch.indexOf('});'));
t('ohne apikey', versuch.indexOf('apikey') === -1, 'schickt einen Schluessel mit');
t('ohne Authorization', versuch.indexOf('Authorization') === -1, 'meldet sich an');
t('und prueft die Antwort wirklich',
  /antwort\.ok && antwort\.id && antwort\.track_token/.test(w), 'glaubt der Antwort blind');

console.log('\n-- 3. Sie hinterlaesst nichts --');
// Nicht ueber ein Textfenster pruefen -- dazwischen steht noch das
// Suchen des Hauses, und beim ersten Anlauf war dieser Test deshalb rot,
// obwohl die Reihenfolge stimmte. Ueber die Reihenfolge der Stellen ist
// es genau das, was gemeint ist: aufraeumen, versuchen, aufraeumen.
var ersteS = w.indexOf('await aufraeumen();');
var versuchS = w.indexOf("SEITE + '/.netlify/functions/reservation-guest'");
var zweiteS = w.indexOf('await aufraeumen();', versuchS);
t('sie raeumt vor dem Versuch auf', ersteS > 0 && ersteS < versuchS, ersteS + '/' + versuchS);
t('und danach auch', zweiteS > versuchS, zweiteS);
t('das sind genau zwei Male, nicht eins',
  (w.match(/await aufraeumen\(\);/g) || []).length === 2,
  (w.match(/await aufraeumen\(\);/g) || []).length);
t('die Probe traegt einen eindeutigen Namen',
  /var PROBE_NAME = '\[Probe\] Gastweg-Wache';/.test(w), 'kein Kennzeichen');
t('und liegt weit in der Zukunft',
  /300 \* 24 \* 60 \* 60 \* 1000/.test(w), 'koennte jemandem im Weg liegen');

console.log('\n-- 4. Kein Wirt bekommt eine Meldung ueber die Probe --');
// Zwischen Anlegen und Loeschen liegen Millisekunden. Laeuft der Melder
// ausgerechnet dazwischen, meldet er einen Gast, den es nie gab. Ein
// Waechter, der falschen Alarm ausloest, wird nach der dritten Nacht
// abgeschaltet -- und dann ueberwacht gar nichts mehr.
var melder = lies(path.join(F, 'pending-reminder.js'));
t('der Melder ueberspringt Proben',
  /indexOf\('\[Probe\]'\) === 0\) return;/.test(melder), 'meldet sie mit');

console.log('\n-- 5. Beim ersten echten Gast klingelt es sofort --');
var tuer = lies(path.join(F, 'reservation-guest.js'));
t('reservation-guest schlaegt Alarm',
  /alarmModul\.alarm\(/.test(tuer), 'protokolliert nur');
t('aber nicht wegen der eigenen Probe',
  /indexOf\('\[Probe\]'\) !== 0/.test(tuer), 'alarmiert bei jeder Probe mit');
// Ein Alarm, der die Sache kaputtmacht, die er ueberwacht, ist
// schlimmer als keiner.
t('und ein Fehler beim Alarm haelt die Reservierung nicht auf',
  /try \{\s*\n\s*await alarmModul\.alarm\(/.test(tuer), 'kein try/catch');

console.log('\n-- 6. Wer den Alarm bekommt, entscheidet die Datenbank --');
var a = lies(path.join(F, 'lib', 'alarm.js'));
t('lib/alarm.js liegt da', a.length > 500, a.length);
t('die Empfaenger kommen aus customers.role',
  /customers\?role=eq\.superadmin/.test(a), 'woanders her');
// Ein Alarm, den der Aufrufer selbst adressieren kann, ist ein Werkzeug
// fuer den naechsten Angreifer.
t('der Aufrufer kann keinen Empfaenger nennen',
  /function alarm\(titel, text, kennung\)/.test(a), 'nimmt einen Empfaenger entgegen');
t('ohne Handy geht es trotzdem ins Protokoll',
  /console\.error\('\[ALARM\]'/.test(a), 'nur Push, keine Spur');
t('tote Geraete werden aufgeraeumt',
  /statusCode === 404 \|\| err\.statusCode === 410/.test(a), 'Karteileichen bleiben');
t('gleiche Kennung ersetzt die alte Meldung',
  /tag: kennung/.test(a), 'zwanzig gleiche Meldungen uebereinander');


console.log('\n-- 7. Die Wache WIRKLICH laufen lassen --');
// Alles darueber liest Quelltext -- und genau das hat am 25.08. nicht
// gereicht. Hier laeuft die Wache echt, gegen eine nachgebaute Tuer:
// einmal so kaputt wie damals (401), einmal repariert, einmal
// unerreichbar. Wenn sie den Fall von damals nicht rot meldet, ist sie
// wertlos.
var Module = require('module');
var echtesRequire = Module.prototype.require;
var alarme = [];
Module.prototype.require = function (name) {
    if (name === './lib/alarm') {
        return { alarm: async function (titel, text) { alarme.push(titel + ' :: ' + text); return { ok: true }; } };
    }
    // web-push liegt nur in den Netlify-Abhaengigkeiten, nicht hier.
    if (name === 'web-push') {
        return { setVapidDetails: function () {}, sendNotification: async function () {} };
    }
    return echtesRequire.apply(this, arguments);
};

process.env.SUPABASE_SERVICE_KEY = 'probe-schluessel';
process.env.WACHE_RESTAURANT_ID  = 'haus-1';
process.env.URL                  = 'https://probe.test';

var echtesFetch = global.fetch;
var geloescht = 0;

function tuerBaut(fall) {
    global.fetch = async function (url, opt) {
        if (url.indexOf('/reservations') > -1 && opt && opt.method === 'DELETE') {
            geloescht++; return { ok: true };
        }
        if (url.indexOf('/functions/reservation-guest') > -1) {
            if (fall === null) throw new Error('ECONNREFUSED');
            return { status: fall.status, json: async function () { return fall.body; } };
        }
        return { ok: true, json: async function () { return [{ id: 'haus-1' }]; } };
    };
}

var wachePfad = path.join(F, 'gastweg-wache.js');
async function laufen(fall) {
    alarme.length = 0; geloescht = 0;
    tuerBaut(fall);
    delete require.cache[require.resolve(wachePfad)];
    var erg = await require(wachePfad).handler();
    return { code: erg.statusCode, alarme: alarme.slice(), geloescht: geloescht };
}

(async function () {
    // a) Genau der Fehler vom 25.08.2026: die Datenbank weist ab.
    var kaputt = await laufen({ status: 401, body: { ok: false, error: 'Speichern fehlgeschlagen', status: 401 } });
    t('kaputt wie am 25.08. -> die Wache meldet rot', kaputt.code === 500, kaputt.code);
    t('kaputt wie am 25.08. -> und schlaegt Alarm', kaputt.alarme.length === 1, kaputt.alarme);
    t('der Alarm sagt, dass es JEDEN Gast trifft',
      /Gaeste koennen nicht reservieren/.test(kaputt.alarme[0] || ''), kaputt.alarme[0]);
    t('und nennt den Grund, nicht nur "kaputt"',
      /401/.test(kaputt.alarme[0] || ''), kaputt.alarme[0]);

    // b) Repariert: kein Laerm. Eine Wache, die immer schreit, wird
    //    abgeschaltet -- und dann ueberwacht gar nichts mehr.
    var heil = await laufen({ status: 200, body: { ok: true, id: 'r1', track_token: 'a'.repeat(32), status: 'pending' } });
    t('repariert -> die Wache ist still', heil.code === 200 && heil.alarme.length === 0,
      heil.code + ' / ' + heil.alarme.length);
    t('und raeumt die Probe trotzdem weg', heil.geloescht === 2, heil.geloescht);

    // c) Halbe Antwort: ok, aber ohne track_token. Sieht nach Erfolg
    //    aus, waere aber ein Gast ohne Verfolgen-Banner.
    var halb = await laufen({ status: 200, body: { ok: true, id: 'r1' } });
    t('halbe Antwort zaehlt nicht als Erfolg', halb.code === 500 && halb.alarme.length === 1,
      halb.code + ' / ' + halb.alarme.length);

    // d) Tuer ganz weg -- ein kaputter Deploy sieht so aus.
    var weg = await laufen(null);
    t('unerreichbare Tuer -> Alarm', weg.code === 500 && weg.alarme.length === 1, weg.code);
    t('und der Alarm sagt, dass der Server nicht antwortet',
      /nicht erreichbar/.test(weg.alarme[0] || ''), weg.alarme[0]);

    global.fetch = echtesFetch;
    Module.prototype.require = echtesRequire;

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
