// WENN DIE ANFRAGE DAS GERAET NIE VERLAESST.
//
// Gemeldet am 02.09.2026 beim Vorbestellen: "failed stand da".
//
// Ohne Zahl davor. Nicht "HTTP 401", sondern "Failed to fetch" -- die
// Anfrage ist unterwegs steckengeblieben und nie angekommen. Im
// Supabase-Protokoll stand dazu nichts, weil es dort nichts zu finden
// gab.
//
// UND DAS WAR DER BLINDE FLECK
// Der Fehlermelder in sbWrite sass INNERHALB von "if (!res.ok)" -- also
// im Zweig "Server hat abgelehnt". Wirft das fetch selbst, springt es
// daran vorbei: kein Melder, keine Zeile im Protokoll, nur ein Toast
// beim Wirt. Regel 6, wieder einmal: der Fall, der am schlechtesten
// sichtbar ist, ist der, der bei ihm auf dem Tisch landet.
//
// Diese Datei schneidet sbWrite aus index.html heraus und laesst es
// wirklich laufen -- mit einem fetch, das wirft.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var anfang = h.indexOf('    async function sbWrite(url, options) {');
var ende = h.indexOf('\n    }\n', h.indexOf('return res;', anfang)) + 7;
t('sbWrite liess sich herausschneiden', anfang > 0 && ende > anfang, anfang + '/' + ende);
var quelle = h.slice(anfang, ende);

// welt: was das nachgebaute fetch tun soll.
//   wirft: wie oft es hintereinander wirft, danach antwortet es gut
function laufen(methode, wirft) {
    var versuche = 0, gemeldet = [];
    var welt = {
        setTimeout: function (f) { f(); },          // keine echte Wartezeit im Test
        Promise: Promise,
        Error: Error,
        String: String,
        JSON: JSON,
        console: { error: function () {} },
        meldeFehler: function (m) { gemeldet.push(m); },
        fetch: async function () {
            versuche++;
            if (versuche <= wirft) throw new TypeError('Failed to fetch');
            return { ok: true, status: 200, text: async function () { return ''; } };
        }
    };
    welt.globalThis = welt;
    vm.createContext(welt);
    vm.runInContext('var sbWrite; ' + quelle.replace('    async function sbWrite', 'sbWrite = async function'), welt);
    return welt.sbWrite('https://x/rest/v1/restaurants?id=eq.1', { method: methode })
        .then(function () { return { versuche: versuche, gemeldet: gemeldet, fehler: null }; })
        .catch(function (e) { return { versuche: versuche, gemeldet: gemeldet, fehler: e }; });
}

(async function () {
    console.log('\n-- 1. Ein Aussetzer soll keine Fehlermeldung sein --');
    // Genau der Fall vom 02.09.: einmal steckengeblieben, beim zweiten
    // Versuch geht es. Der Wirt soll davon gar nichts merken.
    var einmal = await laufen('PATCH', 1);
    t('PATCH: nach einem Aussetzer wird nachgefasst', einmal.versuche === 2, einmal.versuche + ' Versuche');
    t('und es kommt kein Fehler beim Wirt an', einmal.fehler === null, einmal.fehler && einmal.fehler.message);
    t('und es wird nichts gemeldet -- war ja kein Fehler', einmal.gemeldet.length === 0, JSON.stringify(einmal.gemeldet));

    console.log('\n-- 2. POST wird NIE wiederholt --');
    // DER GEFAEHRLICHE TEIL.
    // "Nie angekommen" ist nicht dasselbe wie "nie ausgefuehrt": die
    // Anfrage kann den Server erreicht haben und nur die Antwort ging
    // verloren. Bei PATCH ist das egal -- zweimal dieselben features
    // setzen aendert nichts. Bei POST waere es eine ZWEITE BESTELLUNG.
    var post = await laufen('POST', 1);
    t('POST: genau ein Versuch, kein zweiter', post.versuche === 1, post.versuche + ' Versuche');
    t('und der Fehler kommt beim Wirt an', !!post.fehler, 'verschluckt');
    t('DELETE darf dagegen nachfassen', (await laufen('DELETE', 1)).versuche === 2, 'wiederholt nicht');
    t('PUT auch', (await laufen('PUT', 1)).versuche === 2, 'wiederholt nicht');
    // Ohne Methode ist es bei PostgREST ein POST. Im Zweifel nicht
    // wiederholen -- lieber eine Fehlermeldung als eine Doppelbuchung.
    t('ohne Angabe der Methode wird nicht wiederholt', (await laufen(undefined, 1)).versuche === 1, 'wiederholt');

    console.log('\n-- 3. Bleibt es weg, erfahre ICH davon --');
    // Das war der eigentliche Fehler: der Wirt sah einen Toast, im
    // Protokoll stand nichts.
    var weg = await laufen('PATCH', 5);
    t('zweimal vergeblich -> Meldung geht raus', weg.gemeldet.length === 1, weg.gemeldet.length);
    t('und zwar als Netzfehler, nicht als Serverfehler',
      weg.gemeldet[0] && weg.gemeldet[0].kind === 'network', weg.gemeldet[0] && weg.gemeldet[0].kind);
    t('mit Status 0 -- es gab ja keine Antwort',
      weg.gemeldet[0] && weg.gemeldet[0].status === 0, weg.gemeldet[0] && weg.gemeldet[0].status);
    t('und mit der Tabelle, um die es ging',
      weg.gemeldet[0] && weg.gemeldet[0].source === 'restaurants', weg.gemeldet[0] && weg.gemeldet[0].source);
    // Keine Nutzdaten in die Meldung -- da stuenden Namen und Telefonnummern drin.
    t('aber ohne Nutzdaten',
      weg.gemeldet[0] && JSON.stringify(weg.gemeldet[0]).indexOf('body') === -1, 'Nutzdaten dabei');

    console.log('\n-- 4. Und der Wirt liest etwas, das er versteht --');
    // "Failed to fetch" sagt einem Gastronomen nichts.
    t('die Meldung nennt den Grund',
      /keine Verbindung/.test(weg.fehler && weg.fehler.message), weg.fehler && weg.fehler.message);
    t('und sagt, was zu tun ist',
      /noch einmal versuchen/i.test(weg.fehler && weg.fehler.message), weg.fehler && weg.fehler.message);
    t('kein "Failed to fetch" mehr',
      !/Failed to fetch/.test(weg.fehler && weg.fehler.message), weg.fehler && weg.fehler.message);
    t('und der Aufrufer erkennt den Netzfehler',
      weg.fehler && weg.fehler.istNetzFehler === true, 'nicht gekennzeichnet');

    console.log('\n-- 5. Der alte Weg bleibt, wie er war --');
    // Ein ablehnender Server muss weiter "HTTP <Zahl>" liefern -- sonst
    // liesse sich "nie angekommen" nicht mehr von "abgelehnt"
    // unterscheiden, und genau dieser Unterschied war heute der
    // Schluessel.
    t('Serverfehler heissen weiter HTTP + Zahl',
      /new Error\('HTTP ' \+ res\.status/.test(quelle), 'Format geaendert');
    t('und werden weiter als Schreibfehler gemeldet',
      /kind: 'write'/.test(quelle), 'nicht mehr gemeldet');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
