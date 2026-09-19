// TOTE ABFRAGEN -- eine Tabelle abfragen, die es nicht gibt.
//
// Gefunden am 18.09.2026 in den edge_logs von Supabase:
//
//     /rest/v1/google_reviews    148 x HTTP 404 in 24 Stunden
//
// index.html holte diese Tabelle eine Sekunde nach dem App-Start. Es gab
// sie nie -- kein datenbank/*.sql legt sie an. Der catch-Zweig schrieb
// dann fest eingetippte Bewertungen nach window._featuredGoogleReviews.
//
// Das Bittere daran: dieses Objekt wurde NIRGENDS gelesen. Die Abfrage
// hat vier Monate lang ausschliesslich 404er erzeugt -- und die decken im
// Protokoll die echten Fehler zu. Am 15.09. wurde an derselben Abfrage
// sogar schon einmal "repariert" (select=* statt Spaltenliste), ohne dass
// jemand nachgesehen hat, ob die Tabelle existiert.
//
// Dieser Test haelt drei Dinge fest:
//   1. Die Abfrage ist weg und die erfundenen Ersatzbewertungen auch.
//   2. rls-pruefen.js wertet 404 als eigenen Befund ('fehlt') und nicht
//      mehr als 'unklar' -- "unklar" liest man weg.
//   3. rls-pruefen.js vergleicht, was index.html abfragt, mit der Liste
//      der geprueften Tabellen. Beide Richtungen muessen auffallen.
//
// Geprueft wird durch AUSFUEHREN, nicht durch Textvergleich: urteil(),
// tabellenAusHtml() und lauf() werden mit gestellten Antworten gerufen.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var R = require(path.join(KMI, 'tools', 'rls-pruefen.js'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function lies(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

// Kommentare weg, sonst erfuellt eine Notiz die Zusicherung.
function ohneKommentare(html) {
    return String(html)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
}

var H = lies(path.join(KMI, 'index.html'));
var HC = ohneKommentare(H);

// ---- 1. Die Abfrage ist weg --------------------------------------------
t('index.html fragt google_reviews nicht mehr ab',
  HC.indexOf('google_reviews') < 0, 'die Abfrage steht noch im Code');
t('der Speicher window._featuredGoogleReviews ist weg',
  HC.indexOf('_featuredGoogleReviews') < 0, 'das Objekt wird noch gefuellt');
t('loadFeaturedGoogleReviews wird nirgends mehr gerufen',
  HC.indexOf('loadFeaturedGoogleReviews') < 0, 'der Aufruf steht noch da');

// Die erfundenen Ersatzbewertungen. Fest eingetippte Bewertungen mit Namen
// und Sternen sind nach Nr. 23 des Anhangs zu Paragraf 3 Abs. 3 UWG
// unzulaessig, sobald sie als echt ausgegeben werden.
['Marco B.', 'Sandra K.', 'Jens H.', 'Heike M.', 'Peter R.', 'Julia F.'].forEach(function (name) {
    t('keine Ersatzbewertung von "' + name + '" im Quelltext',
      H.indexOf(name) < 0, 'steht noch drin');
});
t('auch kein fest eingetipptes "vor 2 Wochen" als Bewertungsdatum',
  HC.indexOf("date: 'vor ") < 0, 'ein Datum steht fest im Code');

// Der ehrliche Weg muss dagegen stehenbleiben: Google-Bewertung aus
// restaurants.rating, gekennzeichnet und verlinkt.
t('die echte Google-Bewertung wird weiter gezeigt',
  H.indexOf('bei Google</span>') > -1 && H.indexOf('Auf Google ansehen') > -1,
  'der ehrliche Block ist mit rausgeflogen');

// ---- 2. 404 ist ein eigener Befund -------------------------------------
var u404 = R.urteil({ status: 404, vonPostgrest: true });
t('404 heisst jetzt "fehlt"', u404.wert === 'fehlt', u404.wert);
t('und sagt auch, was es heisst',
  /gibt es nicht/.test(u404.grund), u404.grund);
t('400 bleibt "unklar"',
  R.urteil({ status: 400, vonPostgrest: true, nachricht: 'x' }).wert === 'unklar');
t('200 bleibt "offen"', R.urteil({ status: 200, vonPostgrest: true }).wert === 'offen');
t('403 bleibt "zu"', R.urteil({ status: 403, vonPostgrest: true }).wert === 'zu');
t('eine Antwort vom Proxy bleibt "unklar"',
  R.urteil({ status: 404, vonPostgrest: false }).wert === 'unklar',
  'ein 404 vom Proxy wuerde als fehlende Tabelle gelten');

// ---- 3. Was fragt die App ab -------------------------------------------
var ausFixture = R.tabellenAusHtml(
    "fetch(U+'/rest/v1/orders?select=*');\n" +
    "// alt: fetch(U+'/rest/v1/google_reviews')\n" +
    "/* auch alt: /rest/v1/tote_tabelle */\n" +
    "<!-- /rest/v1/noch_toter -->\n" +
    "fetch(U+'/rest/v1/rpc/summe');\n"
);
t('eine echte Abfrage wird gefunden', ausFixture.indexOf('orders') > -1, ausFixture.join(','));
t('eine auskommentierte NICHT', ausFixture.indexOf('google_reviews') < 0, ausFixture.join(','));
t('ein Blockkommentar ebenso nicht', ausFixture.indexOf('tote_tabelle') < 0, ausFixture.join(','));
t('ein HTML-Kommentar ebenso nicht', ausFixture.indexOf('noch_toter') < 0, ausFixture.join(','));
t('rpc ist keine Tabelle', ausFixture.indexOf('rpc') < 0 && ausFixture.indexOf('summe') < 0,
  ausFixture.join(','));
t('genau eine Tabelle uebrig', ausFixture.length === 1, ausFixture.join(','));

// Und am echten index.html: alles, was dort literal abgefragt wird, muss
// in der Liste von rls-pruefen.js stehen. Sonst wird es nie auf RLS
// geprueft.
var abgefragt = R.tabellenAusHtml(H);
var gelistet = {};
R.TABELLEN.forEach(function (x) { gelistet[x.name] = true; });
var ungeprueft = abgefragt.filter(function (name) { return !gelistet[name]; });
t('index.html fragt mindestens 20 Tabellen ab (der Leser funktioniert)',
  abgefragt.length >= 20, abgefragt.length);
t('jede davon steht in der Liste von rls-pruefen.js',
  ungeprueft.length === 0, 'nicht geprueft: ' + ungeprueft.join(', '));
t('google_reviews steht nicht mehr in der Liste',
  !gelistet['google_reviews'], 'wird weiter geprueft, obwohl es sie nicht gibt');
t('die neuen Tabellen stehen drin',
  !!gelistet['guest_funnel'] && !!gelistet['vertraege'] && !!gelistet['vertrag_fassungen'],
  'guest_funnel / vertraege / vertrag_fassungen fehlen');
t('vertraege gilt als Personendaten -- da steht eine Unterschrift drin',
  R.TABELLEN.filter(function (x) { return x.name === 'vertraege'; })[0].stufe === 'person');

// ---- 4. Der Bericht sagt es laut ---------------------------------------
// Gestellte Datenbank: jede Antwort kommt "von Postgrest", der Status
// haengt an der Tabelle.
function stelleDb(statusJeTabelle) {
    return function (url) {
        var name = String(url).split('/rest/v1/')[1].split('?')[0];
        var s = statusJeTabelle[name] || 401;
        return Promise.resolve({
            status: s,
            headers: { get: function (k) {
                return k === 'content-type' ? 'application/json'
                     : k === 'content-range' ? (s === 200 ? '0-0/7' : '') : '';
            } },
            text: function () { return Promise.resolve('{}'); }
        });
    };
}

async function lauf(tabellen, status, abgefragtListe) {
    var aus = [];
    var e = await R.lauf({
        hole: stelleDb(status),
        tabellen: tabellen,
        abgefragt: abgefragtListe,
        zugang: { url: 'https://test.supabase.co', key: 'k' },
        schreibe: function (z) { aus.push(String(z)); }
    });
    return { text: aus.join('\n'), code: e.code };
}

var EINE = [{ name: 'geistertabelle', stufe: 'oeffentlich', was: 'Test' }];
var ZWEI = EINE.concat([{ name: 'orders', stufe: 'person', was: 'Bestellungen' }]);

(async function () {
    // a) Die App fragt eine Tabelle ab, die 404 liefert -> lauter Befund.
    var a = await lauf(ZWEI, { geistertabelle: 404, orders: 403 }, ['geistertabelle', 'orders']);
    t('eine abgefragte, fehlende Tabelle steht als TOTE ABFRAGE im Bericht',
      /TOTE ABFRAGE/.test(a.text) && /geistertabelle/.test(a.text), a.text);
    t('und der Bericht sagt, was zu tun ist',
      /Tabelle anlegen oder die Abfrage entfernen/.test(a.text), a.text);
    t('der Rueckgabewert ist 2 -- da ist etwas zu tun', a.code === 2, a.code);
    t('FEHLT steht in der Zeile der Tabelle', /FEHLT/.test(a.text), a.text);

    // b) 404, aber die App fragt sie gar nicht ab -> nur veraltete Liste.
    var b = await lauf(ZWEI, { geistertabelle: 404, orders: 403 }, ['orders']);
    t('eine fehlende, aber nicht abgefragte Tabelle ist nur eine veraltete Liste',
      /Veraltete Liste/.test(b.text) && !/TOTE ABFRAGE/.test(b.text), b.text);
    t('und kostet keinen Fehlercode', b.code === 0, b.code);

    // c) Umgekehrt: die App fragt etwas ab, das nicht geprueft wird.
    var c = await lauf(EINE, { geistertabelle: 403 }, ['geistertabelle', 'heimlich']);
    t('eine abgefragte, aber ungepruefte Tabelle faellt auf',
      /Nicht geprueft, obwohl die App sie abfragt: heimlich/.test(c.text), c.text);

    // d) Nichts kaputt gemacht: eine offene Personentabelle bleibt der
    //    schwerste Befund.
    var d = await lauf(ZWEI, { geistertabelle: 403, orders: 200 }, ['orders']);
    t('eine offene Personentabelle ist weiter eine Datenpanne',
      /Art\. 33 DSGVO/.test(d.text) && /orders/.test(d.text), d.text);
    t('und ergibt 2', d.code === 2, d.code);

    // e) Kommt keine Antwort von Supabase, bleibt das Urteil aus -- die
    //    Sperre im Testnetz darf nicht als "alles dicht" durchgehen.
    var e = await lauf(ZWEI, {}, ['orders']);
    var proxy = await (async function () {
        var aus = [];
        var r = await R.lauf({
            // Eine Proxy-Sperre: HTML statt JSON und KEIN Content-Range.
            // Der Kopf muss genau so gestellt werden -- gab die Stelle
            // hier erst fuer jeden Kopf 'text/html' zurueck, galt das als
            // Content-Range und die Antwort damit als von Supabase.
            hole: function () {
                return Promise.resolve({
                    status: 403,
                    headers: { get: function (k) { return k === 'content-type' ? 'text/html' : ''; } },
                    text: function () { return Promise.resolve('<html>blocked</html>'); }
                });
            },
            tabellen: ZWEI, abgefragt: ['orders'],
            zugang: { url: 'https://test.supabase.co', key: 'k' },
            schreibe: function (z) { aus.push(String(z)); }
        });
        return { text: aus.join('\n'), code: r.code };
    })();
    t('eine Netzsperre ergibt "KEIN URTEIL MOEGLICH"',
      /KEIN URTEIL MOEGLICH/.test(proxy.text), proxy.text);
    t('und den eigenen Rueckgabewert 3', proxy.code === 3, proxy.code);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
