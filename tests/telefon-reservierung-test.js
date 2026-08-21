// DER EINGANG FUER DEN TELEFON-ASSISTENTEN.
//
// WORUM ES GEHT
// -------------
// Der KI-Telefonassistent von Kurani nimmt Anrufe an, die im Restaurant
// niemand abheben konnte, und traegt daraus eine Reservierung ein. Er braucht
// dafuer einen Eingang -- und zwar NICHT den oeffentlichen Schluessel, mit
// dem die App schreibt:
//
//   1. Der steht im Quelltext der Seite. Wer ihn benutzt, gibt sich als Gast
//      aus, und niemand kann unterscheiden, woher eine Reservierung kam.
//   2. Sobald RLS auf der Tabelle aktiv ist -- das steht an --, kann er nicht
//      mehr schreiben. Der Assistent waere ueber Nacht tot, ohne dass jemand
//      etwas geaendert haette.
//
// FAIL CLOSED, ANDERS ALS BEI DEN PREISEN
// ----------------------------------------
// In order-save.js gilt: geht die Preispruefung nicht, kommt die Bestellung
// trotzdem durch -- eine Stoerung darf keine echten Bestellungen kosten.
//
// Hier ist es umgekehrt. Ohne Token nimmt die Function GAR NICHTS an. Der
// Unterschied: bei der Bestellung steht ein Gast davor, der zahlen will;
// hier steht ein Dienst davor, der es in einer Minute nochmal versuchen kann.
// Und ein offener Eingang, der ohne Anmeldung Reservierungen anlegt, ist eine
// Einladung -- ein Skript, das hundert Tische auf morgen Abend bucht, legt
// den Laden lahm.
//
// WAS AM TELEFON SCHIEFGEHT
// -------------------------
// Die Spracherkennung versteht "am Einundzwanzigsten" falsch, erfindet ein
// Jahr, oder der Anrufer nennt gar kein Datum. Deshalb pruefen statt
// durchwinken: eine klare Absage kann der Assistent mit einer Rueckfrage
// beantworten, eine unbrauchbare Zeile im Dashboard kann niemand mehr
// reparieren.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var PFAD = path.join(WURZEL, 'netlify', 'functions', 'reservation-save.js');
var QUELLE = fs.readFileSync(PFAD, 'utf8');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');

// Die Function frisch laden, mit gesetzten Umgebungsvariablen.
function ladeMit(umgebung) {
    Object.keys(umgebung).forEach(function (k) {
        if (umgebung[k] === null) delete process.env[k]; else process.env[k] = umgebung[k];
    });
    delete require.cache[require.resolve(PFAD)];
    return require(PFAD);
}

var TOKEN = 'geheim-fuer-den-test-0123456789';
// Das Datum muss knapp in der Zukunft liegen, nicht im Jahr 2099: der echte
// Handler rechnet gegen die Uhr und weist alles ab, was mehr als ein Jahr
// voraus liegt. Genau darueber ist dieser Test beim ersten Lauf gestolpert --
// die Einzelpruefungen kannten die Uhr nicht und waren gruen.
var IN_30_TAGEN = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
var GUT = {
    restaurant_id: 'r-1',
    guest_name: 'Anke Janssen',
    guest_phone: '+49 176 1234567',
    party_size: 4,
    reservation_date: IN_30_TAGEN,
    reservation_time: '19:30',
    notes: 'Fensterplatz wenn möglich'
};

function ruf(F, koerper, kopfzeile) {
    return F.handler({
        httpMethod: 'POST',
        headers: kopfzeile === undefined ? { authorization: 'Bearer ' + TOKEN } : kopfzeile,
        body: typeof koerper === 'string' ? koerper : JSON.stringify({ reservation: koerper })
    });
}

// ---- 1. Die Pruefungen einzeln ---------------------------------------------
(function () {
    var F = ladeMit({ TELEFON_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: 'dienst' });

    var sauber = F.saubereReservierung(GUT);
    t('status und source setzt der Server, nicht der Aufrufer',
      sauber.status === 'pending' && sauber.source === 'telefon',
      JSON.stringify({ s: sauber.status, q: sauber.source }));
    // Sonst koennte der Assistent (oder wer sein Token hat) eine Reservierung
    // gleich als bestaetigt eintragen -- und der Wirt sieht nie hin.
    var geschummelt = F.saubereReservierung(
        Object.assign({}, GUT, { status: 'confirmed', source: 'app', id: 'fremd' }));
    t('mitgeschickter status wird ignoriert', geschummelt.status === 'pending', geschummelt.status);
    t('mitgeschickte source wird ignoriert', geschummelt.source === 'telefon', geschummelt.source);
    t('unbekannte Felder kommen gar nicht erst in die Datenbank',
      geschummelt.id === undefined, JSON.stringify(Object.keys(geschummelt)));

    t('eine vollstaendige Reservierung hat keine Fehler',
      F.pruefe(sauber).length === 0, JSON.stringify(F.pruefe(sauber)));

    [['restaurant_id', ''], ['guest_name', ''], ['guest_phone', '']].forEach(function (f) {
        var kaputt = F.saubereReservierung(Object.assign({}, GUT, (function () { var o = {}; o[f[0]] = f[1]; return o; })()));
        t('ohne ' + f[0] + ' wird abgelehnt', F.pruefe(kaputt).length > 0);
    });
    // Ohne Rueckrufnummer kann der Wirt bei Unklarheiten nichts tun -- und
    // Unklarheiten sind bei einem Telefonat die Regel.
    t('die Rueckrufnummer ist Pflicht, nicht Kuer',
      /guest_phone fehlt \(Rueckrufnummer\)/.test(QUELLE));

    t('null Personen sind keine Reservierung',
      F.pruefe(F.saubereReservierung(Object.assign({}, GUT, { party_size: 0 }))).length > 0);
    t('achtzig Personen auch nicht -- da hat sich jemand verhoert',
      F.pruefe(F.saubereReservierung(Object.assign({}, GUT, { party_size: 80 }))).length > 0);
    t('vier Personen schon',
      F.pruefe(F.saubereReservierung(Object.assign({}, GUT, { party_size: 4 }))).length === 0);

    t('"morgen abend" statt eines Datums wird abgelehnt',
      F.pruefe(F.saubereReservierung(Object.assign({}, GUT, { reservation_date: 'morgen' }))).length > 0);
    t('"halb acht" statt einer Uhrzeit ebenfalls',
      F.pruefe(F.saubereReservierung(Object.assign({}, GUT, { reservation_time: 'halb acht' }))).length > 0);
})();

// ---- 2. Zeitpunkte, die am Telefon entstehen -------------------------------
(function () {
    var F = ladeMit({ TELEFON_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: 'dienst' });
    // Fester Bezugspunkt statt "jetzt" -- ein Test, der um Mitternacht anders
    // ausgeht als um Mittag, ist keiner.
    var jetzt = Date.parse('2026-08-18T19:05:00Z');
    function z(datum, zeit) {
        return F.zeitFehler(F.saubereReservierung(
            Object.assign({}, GUT, { reservation_date: datum, reservation_time: zeit })), jetzt);
    }
    t('uebermorgen um sieben geht durch', z('2026-08-20', '19:00') === '', z('2026-08-20', '19:00'));
    // Ein Anruf um 19:05 fuer "heute 19 Uhr" ist gemeint, nicht vertippt.
    t('heute 19 Uhr, angerufen um 19:05 -- gemeint, nicht vertippt',
      z('2026-08-18', '19:00') === '', z('2026-08-18', '19:00'));
    t('gestern wird abgelehnt', /Vergangenheit/.test(z('2026-08-17', '19:00')), z('2026-08-17', '19:00'));
    // Der klassische Fehler der Spracherkennung: ein Jahr dazuerfunden.
    t('in drei Jahren wird abgelehnt', /voraus/.test(z('2029-08-20', '19:00')), z('2029-08-20', '19:00'));
    t('der 30. Februar ergibt keinen Zeitpunkt',
      z('2026-02-30', '19:00') !== '', z('2026-02-30', '19:00'));
})();

// ---- 3. Die Tuer ist zu, wenn sie zu sein soll -----------------------------
async function abschnitt3() {
    {
        // Ohne eingerichtetes Token: gar nichts.
        var ohne = ladeMit({ TELEFON_TOKEN: null, SUPABASE_SERVICE_KEY: 'dienst' });
        var a = await ruf(ohne, GUT);
        t('ohne eingerichtetes Token nimmt der Eingang nichts an',
          a.statusCode === 503, a.statusCode + ' ' + a.body);

        var F = ladeMit({ TELEFON_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: 'dienst' });
        var b = await ruf(F, GUT, {});
        t('ohne Anmeldung: abgewiesen', b.statusCode === 401, b.statusCode + '');
        var c = await ruf(F, GUT, { authorization: 'Bearer falsch' });
        t('mit falschem Token: abgewiesen', c.statusCode === 401, c.statusCode + '');
        // Ein normales === verraet ueber die Antwortzeit, wie viele Zeichen
        // schon stimmen. Kostet nichts, es richtig zu machen.
        t('der Tokenvergleich laeuft ohne Zeitunterschied',
          /unterschied \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/.test(QUELLE));
        t('und er faellt nicht auf die Laenge herein',
          F.gleich('abc', 'abc') === true && F.gleich('abc', 'abcd') === false && F.gleich('', '') === true);

        var d = await ruf(ladeMit({ TELEFON_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: null }), GUT);
        t('ohne Service-Key wird nicht geschrieben', d.statusCode === 503, d.statusCode + '');

        var e = await ruf(F, 'kein json{');
        t('Unsinn im Koerper kippt die Function nicht', e.statusCode === 400, e.statusCode + '');

        var f = await F.handler({ httpMethod: 'GET', headers: {} });
        t('GET geht nicht', f.statusCode === 405);

    }
}

// ---- 4. Der ganze Weg, mit vorgetaeuschter Datenbank -----------------------
async function abschnitt4() {
    {
        var F = ladeMit({ TELEFON_TOKEN: TOKEN, SUPABASE_SERVICE_KEY: 'dienst-schluessel' });
        var gesehen = null;
        var echtesFetch = global.fetch;
        global.fetch = async function (url, opt) {
            gesehen = { url: String(url), kopf: opt.headers, koerper: JSON.parse(opt.body) };
            return { ok: true, status: 201, json: async function () { return [{ id: 'res-neu-1' }]; },
                     text: async function () { return '[]'; } };
        };

        var a = await ruf(F, GUT);
        t('eine saubere Reservierung wird angelegt',
          a.statusCode === 200 && JSON.parse(a.body).ok === true, a.statusCode + ' ' + a.body);
        t('und die neue Kennung kommt zurueck -- der Assistent kann sie nennen',
          JSON.parse(a.body).id === 'res-neu-1', a.body);
        t('geschrieben wird in die reservations-Tabelle',
          /\/rest\/v1\/reservations$/.test(gesehen.url), gesehen.url);
        t('mit dem Dienst-Schluessel, nicht mit dem oeffentlichen',
          gesehen.kopf.apikey === 'dienst-schluessel', String(gesehen.kopf.apikey).slice(0, 20));
        t('als unbestaetigt und mit der Kennung "telefon"',
          gesehen.koerper.status === 'pending' && gesehen.koerper.source === 'telefon',
          JSON.stringify({ s: gesehen.koerper.status, q: gesehen.koerper.source }));
        t('die Rueckrufnummer steht drin',
          gesehen.koerper.guest_phone === '+49 176 1234567', gesehen.koerper.guest_phone);

        // ---- Der Assistent kostet extra: nicht jedes Restaurant hat ihn ----
        // Ein Token oeffnet die ganze Datenbank. Ohne diese Pruefung koennte
        // ein Konfigurationsfehler auf der Assistenten-Seite Reservierungen
        // bei einem Restaurant eintragen, das gar nicht Kunde ist.
        var gefragt = [];
        function datenbank(antworten) {
            global.fetch = async function (url, opt) {
                var u = String(url);
                gefragt.push(u);
                if (u.indexOf('/restaurants?') >= 0) return antworten.restaurant;
                gesehen = { url: u, kopf: opt.headers, koerper: JSON.parse(opt.body) };
                return antworten.insert;
            };
        }
        function antwort(daten, status) {
            return { ok: (status || 200) < 400, status: status || 200,
                     json: async function () { return daten; },
                     text: async function () { return JSON.stringify(daten); } };
        }
        var einfuegen = antwort([{ id: 'res-neu-2' }], 201);

        gesehen = null;
        datenbank({ restaurant: antwort([{ id: 'r-1', telefon_assistent: true }]), insert: einfuegen });
        var g1 = await ruf(F, GUT);
        t('gebuchtes Restaurant: Reservierung wird angelegt',
          g1.statusCode === 200 && gesehen !== null, g1.statusCode + ' ' + g1.body);

        gesehen = null;
        datenbank({ restaurant: antwort([{ id: 'r-1', telefon_assistent: false }]), insert: einfuegen });
        var g2 = await ruf(F, GUT);
        t('nicht gebucht: abgelehnt, und nichts geschrieben',
          g2.statusCode === 403 && gesehen === null, g2.statusCode + ' ' + g2.body);

        gesehen = null;
        datenbank({ restaurant: antwort([]), insert: einfuegen });
        var g3 = await ruf(F, GUT);
        t('unbekanntes Restaurant: abgelehnt, und nichts geschrieben',
          g3.statusCode === 404 && gesehen === null, g3.statusCode + ' ' + g3.body);

        // Solange die Spalte fehlt, darf der Betrieb nicht stillstehen.
        gesehen = null;
        datenbank({ restaurant: antwort({ message: 'column telefon_assistent does not exist' }, 400), insert: einfuegen });
        var g4 = await ruf(F, GUT);
        t('fehlt die Spalte noch, laeuft es weiter (und wird protokolliert)',
          g4.statusCode === 200 && gesehen !== null, g4.statusCode + ' ' + g4.body);

        // Zurueck auf die einfache Attrappe fuer die restlichen Pruefungen.
        global.fetch = async function (url, opt) {
            gesehen = { url: String(url), kopf: opt.headers, koerper: JSON.parse(opt.body) };
            if (String(url).indexOf('/restaurants?') >= 0) {
                return antwort([{ id: 'r-1', telefon_assistent: true }]);
            }
            return antwort([{ id: 'res-neu-1' }], 201);
        };

        // Die Zeitpruefung muss vom HANDLER aufgerufen werden, nicht nur
        // existieren. Beim Gegenpruefen liess sich der Aufruf entfernen, ohne
        // dass ein Test rot wurde -- die Funktion war ja noch da und wurde in
        // Abschnitt 2 einzeln geprueft. Eine Pruefung, die niemand aufruft,
        // ist keine.
        gesehen = null;
        var gestern = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        var v = await ruf(F, Object.assign({}, GUT, { reservation_date: gestern }));
        t('ein Termin in der Vergangenheit wird vom Handler abgewiesen',
          v.statusCode === 400 && /Vergangenheit/.test(JSON.parse(v.body).error) && gesehen === null,
          v.statusCode + ' ' + v.body);

        // Eine kaputte Angabe darf gar nicht erst bis zur Datenbank kommen.
        gesehen = null;
        var b = await ruf(F, Object.assign({}, GUT, { reservation_date: 'morgen' }));
        t('eine kaputte Angabe wird abgelehnt, bevor sie die Datenbank sieht',
          b.statusCode === 400 && gesehen === null, b.statusCode + ' / ' + (gesehen ? 'geschrieben!' : 'nichts geschrieben'));
        t('und die Absage sagt, was fehlt -- der Assistent kann nachfragen',
          /reservation_date/.test(JSON.parse(b.body).error), b.body);

        // Antwortet die Datenbank mit einem Fehler, darf die Function nicht
        // "ok" melden -- sonst legt der Assistent auf und die Reservierung
        // ist weg.
        global.fetch = async function () {
            return { ok: false, status: 400, text: async function () { return 'column x does not exist'; } };
        };
        var c = await ruf(F, GUT);
        t('ein Datenbankfehler wird als Fehler zurueckgemeldet, nicht als ok',
          c.statusCode === 502 && JSON.parse(c.body).ok === false, c.statusCode + ' ' + c.body);

        global.fetch = echtesFetch;
    }
}

// ---- 5. Was der Wirt im Dashboard sieht ------------------------------------
// Alles, was nicht "app" war, galt bisher als "vom Dashboard" -- also als
// haette der Wirt es selbst getippt. Eine Telefon-Reservierung haette sich
// darunter versteckt, und niemand haette gewusst, dass da noch jemand
// zurueckrufen muss.
(function () {
    t('es gibt eine eigene Plakette fuer den Telefon-Assistenten',
      /res\.source === 'telefon'/.test(H) && /Telefon-Assistent<\/span>/.test(H));
    t('die Zaehlung trennt Telefon von "hat der Wirt selbst getippt"',
      /r\.source !== 'app' && r\.source !== 'telefon'/.test(H));
    t('und die Statuszeile nennt die Telefon-Reservierungen mit',
      /telefonCount > 0 \? ', ' \+ telefonCount \+ ' per Telefon'/.test(H));

    // Der Assistent nimmt auf, er sagt nicht zu. Bestaetigen bleibt beim
    // Menschen -- deshalb "pending" und deshalb der vorhandene Knopf.
    t('bestaetigt wird weiterhin von Hand',
      /updateReservation\('\$\{r\.id\}', 'confirmed'\)/.test(H));
})();

// ---- 6. Die Einrichtung steht dabei ----------------------------------------
(function () {
    t('die noetigen Umgebungsvariablen sind benannt',
      /TELEFON_TOKEN/.test(QUELLE) && /SUPABASE_SERVICE_KEY/.test(QUELLE));
    t('ein Beispielaufruf steht im Kopf der Datei',
      /Authorization: Bearer <TELEFON_TOKEN>/.test(QUELLE) && /reservation-save/.test(QUELLE));
    t('und warum hier zugesperrt statt durchgewunken wird',
      /FAIL CLOSED/.test(QUELLE) && /nochmal versuchen kann/.test(QUELLE));
})();

// Nacheinander, nicht nebeneinander: Abschnitt 3 laedt die Function mit
// anderen Umgebungsvariablen neu. Liefen beide gleichzeitig, zoege einer dem
// anderen den Boden weg -- beim ersten Lauf genau passiert.
(async function () {
    await abschnitt3();
    await abschnitt4();
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
