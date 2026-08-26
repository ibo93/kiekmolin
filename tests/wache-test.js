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
t('sie prueft den Reservierungs-Weg',
  /alsGast\('reservation-guest'/.test(w), 'prueft ihn nicht');
t('sie prueft den Bestell-Weg',
  /alsGast\('order-save'/.test(w), 'prueft ihn nicht');
// alsGast() ist die einzige Stelle, die nach draussen ruft -- dort und
// nur dort entscheidet sich, ob wirklich wie ein Gast geprueft wird.
var versuch = w.slice(w.indexOf('async function alsGast'));
versuch = versuch.slice(0, versuch.indexOf('\n}'));
t('ohne apikey', versuch.indexOf('apikey') === -1, 'schickt einen Schluessel mit');
t('ohne Authorization', versuch.indexOf('Authorization') === -1, 'meldet sich an');
t('und prueft die Antwort wirklich',
  /a\.daten\.ok && a\.daten\.id && a\.daten\.track_token/.test(w), 'glaubt der Antwort blind');
// Wenn die erste Pruefung klemmt, muessen die anderen trotzdem laufen --
// sonst repariert man einen Weg und der naechste ist noch immer zu.
t('alle drei laufen, auch wenn die erste klemmt',
  /for \(var i = 0; i < pruefungen\.length; i\+\+\)/.test(w) && /maengel\.push/.test(w),
  'bricht nach der ersten ab');
t('und eine abgestuerzte Pruefung reisst die anderen nicht mit',
  /Pruefung ' \+ \(i \+ 1\) \+ ' ist selbst abgestuerzt/.test(w), 'kein try/catch je Pruefung');

console.log('\n-- 2a. Und ob die ausgelieferte Seite ueberhaupt die neue ist --');
// DER BLINDE FLECK, DER EINEN GANZEN TAG GEKOSTET HAT.
// Die Wache rief bis zum 26.08. nur die Server-Funktionen auf -- und die
// waren heil. Sie meldete gruen, waehrend im Browser nichts ging: die
// Reparatur lag auf dem Server, die ausgelieferte SEITE war noch die
// alte. Eine Wache, die nur den Server prueft, kann das nicht sehen.
t('sie holt, was der Gast holt',
  /fetch\(SEITE \+ '\/index\.html'/.test(w), 'holt die Seite nicht');
t('und prueft, ob die Seite den neuen Gastweg benutzt',
  /seite\.indexOf\('\/\.netlify\/functions\/reservation-guest'\)/.test(w), 'prueft es nicht');
t('sie holt auch den Service Worker',
  /fetch\(SEITE \+ '\/sw\.js'/.test(w), 'holt ihn nicht');
t('und prueft den Namen des Zwischenspeichers',
  /kmi-shell-v\(\\d\+\)/.test(w) && /Number\(v\) < 4/.test(w), 'prueft ihn nicht');
t('diese Pruefung laeuft als erste',
  /pruefeAusgelieferteSeite, pruefeReservierung/.test(w), 'laeuft spaeter');

console.log('\n-- 2b. Und sie prueft, ob der Preis-Schutz noch lebt --');
// Am 25.08. kam heraus: der Preis-Check war bei JEDER Bestellung aus.
// Eine Abfrage fragte nach einer Spalte, die es nicht gibt, die
// Pruefung fiel in den catch-Zweig und liess alles durch. Absichtlich
// faellt sie offen aus -- genau deshalb hat es monatelang niemand
// gemerkt.
t('sie schickt ein echtes Gericht fuer 0 Euro',
  /function pruefePreisSchutz/.test(w) && /price: 0/.test(w), 'prueft den Schutz nicht');
t('und erwartet, dass es ABGELEHNT wird',
  /a\.status === 422 && a\.daten && a\.daten\.preis_abgelehnt/.test(w), 'erwartet Annahme');
t('kommt es durch, ist das der Alarm',
  /Preis-Schutz IST AUS/.test(w), 'meldet es nicht');
// Ohne Karte laesst sich der Schutz nicht pruefen -- das ist kein
// Fehler und darf keinen Alarm ausloesen.
t('ohne Speisekarte kein falscher Alarm',
  /if \(!gericht\) return null;/.test(w), 'alarmiert ohne Karte');

console.log('\n-- 2c. Und ob der Mindestbestellwert wirklich haelt --');
// Gefragt am 26.08.2026 zu einer Lieferbestellung ueber 12,00 Euro bei
// hinterlegten 15 Euro: "warum konnte er mit 12,00 liefern lassen".
// Der Grund: die Regel stand nur im Browser.
t('sie schickt eine Lieferung unter dem Mindestwert',
  /function pruefeMindestbestellwert/.test(w) && /order_type: *'delivery'/.test(w), 'prueft ihn nicht');
t('und erwartet, dass sie ABGELEHNT wird',
  /a\.status === 422 && a\.daten && a\.daten\.preis_abgelehnt/.test(
      w.slice(w.indexOf('function pruefeMindestbestellwert'))), 'erwartet Annahme');
t('geht sie durch, ist das der Alarm',
  /Mindestbestellwert GILT NICHT/.test(w), 'meldet es nicht');
// Kein Wert hinterlegt, keine Karte, oder das Gericht ist teurer als der
// Mindestwert -- alles drei ist kein Fehler und darf nicht alarmieren.
t('ohne hinterlegten Wert kein falscher Alarm', /if \(mindest <= 0\) return null;/.test(w), 'alarmiert');
t('und auch nicht, wenn das Gericht teurer ist als der Mindestwert',
  /if \(warenwert >= mindest\) return null;/.test(w), 'alarmiert');

console.log('\n-- 3. Sie hinterlaesst nichts --');
// Nicht ueber ein Textfenster pruefen -- dazwischen steht noch das
// Suchen des Hauses, und beim ersten Anlauf war dieser Test deshalb rot,
// obwohl die Reihenfolge stimmte. Ueber die Reihenfolge der Stellen ist
// es genau das, was gemeint ist: aufraeumen, versuchen, aufraeumen.
var ersteS = w.indexOf('await aufraeumen();');
// Angelpunkt ist die Schleife, die die Pruefungen laufen laesst -- vor
// ihr wird geraeumt, nach ihr wieder.
var versuchS = w.indexOf('for (var i = 0; i < pruefungen.length; i++)');
var zweiteS = w.indexOf('await aufraeumen();', versuchS);
t('sie raeumt vor dem Versuch auf', ersteS > 0 && ersteS < versuchS, ersteS + '/' + versuchS);
t('und danach auch', zweiteS > versuchS, zweiteS);
t('das sind genau zwei Male, nicht eins',
  (w.match(/await aufraeumen\(\);/g) || []).length === 2,
  (w.match(/await aufraeumen\(\);/g) || []).length);
t('die Probe traegt einen eindeutigen Namen',
  /var PROBE_NAME = '\[Probe\] Gastweg-Wache';/.test(w), 'kein Kennzeichen');
// Aufraeumen, das nur den eigenen Pfad kennt, laesst irgendwann etwas
// liegen -- deshalb immer beide Tabellen, auch wenn nur eine Pruefung lief.
t('und aufgeraeumt werden BEIDE Tabellen',
  /reservations\?guest_name=eq\./.test(w) && /orders\?customer_name=eq\./.test(w),
  'nur eine Tabelle');
t('und liegt weit in der Zukunft',
  /300 \* 24 \* 60 \* 60 \* 1000/.test(w), 'koennte jemandem im Weg liegen');

console.log('\n-- 4. Kein Wirt bekommt eine Meldung ueber die Probe --');
// Zwischen Anlegen und Loeschen liegen Millisekunden. Laeuft der Melder
// ausgerechnet dazwischen, meldet er einen Gast, den es nie gab. Ein
// Waechter, der falschen Alarm ausloest, wird nach der dritten Nacht
// abgeschaltet -- und dann ueberwacht gar nichts mehr.
var melder = lies(path.join(F, 'pending-reminder.js'));
t('der Melder ueberspringt Proben',
  /probeName\.indexOf\('\[Probe\]'\) === 0\) return;/.test(melder), 'meldet sie mit');
// Reservierungen heissen guest_name, Bestellungen customer_name. Zuerst
// stand dort nur guest_name -- die Bestell-Probe waere durchgerutscht.
t('und zwar bei Reservierungen UND Bestellungen',
  /item\.guest_name \|\| item\.customer_name/.test(melder), 'nur eine Spalte');

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
// GEMESSEN AM 26.08.2026 UM 13:11:45:
//   push_subscriptions?customer_email=in.("ibo.kuran93@gmail.com")
//   -> 200, Inhalt 2 Bytes = []
// Kein Geraet eingetragen. Die Wache lief gruen, aber ein Alarm haette
// NIEMANDEN erreicht -- er waere in ein Protokoll gegangen, das keiner
// liest. Genau die Stille, die diese Woche einen Tag gekostet hat.
//
// Ein Push braucht ein Geraet, das sich einmal angemeldet hat. Darauf
// darf sich ein Waechter nie verlassen -- das ist ein Schritt, den ein
// Mensch vergessen kann. E-Mail braucht nichts ausser der Adresse.
t('ohne Geraet geht der Alarm per E-Mail raus',
  /kein Geraet angemeldet -- weiche auf E-Mail aus/.test(a) && /function mailAlarm/.test(a),
  'schweigt ohne Geraet');
t('und auch, wenn zwar Geraete da sind, aber keines erreicht wurde',
  /if \(erfolge === 0\)[\s\S]{0,200}mailAlarm/.test(a), 'schweigt dann');
t('die E-Mail sagt auch, wie man es aufs Handy bekommt',
  /einmal im Admin-Dashboard anmelden/.test(a), 'laesst ihn im Unklaren');
t('ohne Resend-Schluessel bleibt wenigstens die Protokollzeile',
  /RESEND_API_KEY fehlt -- Alarm bleibt im Protokoll/.test(a), 'stuerzt ab oder schweigt');
t('tote Geraete werden aufgeraeumt',
  /statusCode === 404 \|\| err\.statusCode === 410/.test(a), 'Karteileichen bleiben');
t('gleiche Kennung ersetzt die alte Meldung',
  /tag: kennung/.test(a), 'zwanzig gleiche Meldungen uebereinander');


console.log('\n-- 7. Die Wache WIRKLICH laufen lassen --');
// Alles darueber liest Quelltext -- und genau das hat am 25.08. nicht
// gereicht. Hier laeuft die Wache echt, gegen nachgebaute Tueren. Wenn
// sie die Faelle von damals nicht rot meldet, ist sie wertlos.
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
var geloescht = 0, angelegt = 0;

// welt: was die nachgebauten Tueren antworten sollen.
//   res    -> Antwort von reservation-guest
//   ord    -> Antwort von order-save auf die normale Probe
//   billig -> Antwort von order-save auf die Null-Euro-Probe
//   karte  -> gibt es ein Gericht mit Preis?
function tuerenBauen(welt) {
    global.fetch = async function (url, opt) {
        var m = opt && opt.method;
        if (m === 'DELETE') { geloescht++; return { ok: true }; }
        if (url.indexOf('/index.html') > -1) {
            if (welt.seite === null) throw new Error('ECONNREFUSED');
            return { ok: welt.seite !== 'weg', status: 200,
                     text: async function () {
                         return welt.seite === 'alt' ? '<html>fetch(SUPABASE_URL + "/rest/v1/reservations")</html>'
                                                     : '<html>/.netlify/functions/reservation-guest</html>'; } };
        }
        if (url.indexOf('/sw.js') > -1) {
            return { ok: true, text: async function () {
                return "var CACHE = 'kmi-shell-v" + (welt.sw || 4) + "';"; } };
        }
        if (url.indexOf('/menu_items') > -1) {
            return { ok: true, json: async function () { return welt.karte === false ? [] : [{ id: 'g1', base_price: 12.5 }]; } };
        }
        if (url.indexOf('/restaurants') > -1) {
            return { ok: true, json: async function () {
                return [{ id: 'haus-1', min_order_value: welt.mindest === undefined ? 15 : welt.mindest }]; } };
        }
        if (url.indexOf('/functions/reservation-guest') > -1) {
            if (welt.res === null) throw new Error('ECONNREFUSED');
            return { status: welt.res.status, json: async function () { return welt.res.body; } };
        }
        if (url.indexOf('/functions/order-save') > -1) {
            angelegt++;
            var rumpf = JSON.parse(opt.body);
            var nr = String(rumpf.order.order_number || '');
            var f;
            if (nr.indexOf('PROBE-MINDEST') === 0) f = welt.mindestAntwort || GUT_MINDEST;
            else if ((rumpf.order.items || []).length > 0) f = welt.billig;
            else f = welt.ord;
            if (f === null) throw new Error('ECONNREFUSED');
            return { status: f.status, json: async function () { return f.body; } };
        }
        return { ok: true, json: async function () { return []; } };
    };
}

var GUT_RES    = { status: 200, body: { ok: true, id: 'r1', track_token: 'a'.repeat(32), status: 'pending' } };
var GUT_ORD    = { status: 200, body: { ok: true, id: 'b1', via: 'service' } };
var GUT_BILLIG = { status: 422, body: { ok: false, preis_abgelehnt: true, gruende: ['Gesamt 0.00 unter dem Mindestpreis 12.50'] } };
var GUT_MINDEST = { status: 422, body: { ok: false, preis_abgelehnt: true,
    gruende: ['Warenwert 12.50 unter dem Mindestbestellwert 15.00 fuer Lieferung'] } };

var wachePfad = path.join(F, 'gastweg-wache.js');
async function laufen(welt) {
    alarme.length = 0; geloescht = 0; angelegt = 0;
    tuerenBauen(welt);
    delete require.cache[require.resolve(wachePfad)];
    var erg = await require(wachePfad).handler();
    return { code: erg.statusCode, alarme: alarme.slice(), geloescht: geloescht };
}

(async function () {
    // a) Alles heil -- die Wache muss still sein. Eine Wache, die immer
    //    schreit, wird abgeschaltet, und dann ueberwacht gar nichts mehr.
    var heil = await laufen({ res: GUT_RES, ord: GUT_ORD, billig: GUT_BILLIG });
    t('alles heil -> die Wache ist still', heil.code === 200 && heil.alarme.length === 0,
      heil.code + ' / ' + JSON.stringify(heil.alarme));
    t('und raeumt trotzdem beide Tabellen weg', heil.geloescht === 4, heil.geloescht);

    // a2) DER FALL VOM 26.08.: Server heil, ausgelieferte Seite alt.
    //     Genau hier war die Wache blind und meldete gruen.
    var seiteAlt = await laufen({ res: GUT_RES, ord: GUT_ORD, billig: GUT_BILLIG, seite: 'alt' });
    t('Seite noch die alte -> Alarm', seiteAlt.code === 500 && seiteAlt.alarme.length === 1,
      seiteAlt.code + ' / ' + JSON.stringify(seiteAlt.alarme));
    t('und der Alarm sagt, dass die SEITE alt ist, nicht der Server',
      /ausgelieferte Seite ist ALT/.test(seiteAlt.alarme[0] || ''), seiteAlt.alarme[0]);

    // a3) Seite neu, aber der Zwischenspeicher wurde nicht hochgezaehlt --
    //     dann behalten die Geraete die alte App. Genau mein Fehler vom 25.
    var swAlt = await laufen({ res: GUT_RES, ord: GUT_ORD, billig: GUT_BILLIG, sw: 3 });
    t('Zwischenspeicher nicht hochgezaehlt -> Alarm',
      swAlt.code === 500 && /Zwischenspeicher steht auf v3/.test(swAlt.alarme[0] || ''), swAlt.alarme[0]);

    // b) Genau der Fehler vom 25.08.2026: die Datenbank weist den Gast ab.
    var resKaputt = await laufen({
        res: { status: 401, body: { ok: false, error: 'Speichern fehlgeschlagen', status: 401 } },
        ord: GUT_ORD, billig: GUT_BILLIG });
    t('Reservieren kaputt -> die Wache meldet rot', resKaputt.code === 500, resKaputt.code);
    t('Reservieren kaputt -> Alarm nennt den Weg und den Grund',
      /Reservieren:/.test(resKaputt.alarme[0] || '') && /401/.test(resKaputt.alarme[0] || ''),
      resKaputt.alarme[0]);

    // c) "auch nicht bei Bestellungen" -- derselbe Ausfall beim Bestellen.
    var ordKaputt = await laufen({
        res: GUT_RES,
        ord: { status: 500, body: { ok: false, error: 'Speichern fehlgeschlagen' } },
        billig: GUT_BILLIG });
    t('Bestellen kaputt -> Alarm', ordKaputt.code === 500 && ordKaputt.alarme.length === 1, ordKaputt.code);
    t('Bestellen kaputt -> Alarm nennt den Weg',
      /Bestellen:/.test(ordKaputt.alarme[0] || ''), ordKaputt.alarme[0]);

    // d) Der Preis-Schutz ist aus -- der monatelange stille Ausfall.
    //    Die Null-Euro-Bestellung geht durch statt abgelehnt zu werden.
    var schutzAus = await laufen({
        res: GUT_RES, ord: GUT_ORD,
        billig: { status: 200, body: { ok: true, id: 'b2' } } });
    t('Preis-Schutz aus -> Alarm', schutzAus.code === 500 && schutzAus.alarme.length === 1, schutzAus.code);
    t('Preis-Schutz aus -> und es steht deutlich da',
      /Preis-Schutz IST AUS/.test(schutzAus.alarme[0] || ''), schutzAus.alarme[0]);

    // d2) DER FALL VOM 26.08.: eine Lieferung unter dem Mindestwert geht
    //     durch, obwohl der Wirt 15 Euro hinterlegt hat.
    var mindestAus = await laufen({ res: GUT_RES, ord: GUT_ORD, billig: GUT_BILLIG,
        mindestAntwort: { status: 200, body: { ok: true, id: 'b3' } } });
    t('Mindestbestellwert gilt nicht -> Alarm',
      mindestAus.code === 500 && mindestAus.alarme.length === 1, mindestAus.code);
    t('und es steht deutlich da, mit beiden Zahlen',
      /Mindestbestellwert GILT NICHT/.test(mindestAus.alarme[0] || '')
      && /12\.50/.test(mindestAus.alarme[0] || '') && /15\.00/.test(mindestAus.alarme[0] || ''),
      mindestAus.alarme[0]);

    // d3) Kein Mindestwert hinterlegt -- kein Fehler, kein Alarm.
    var ohneMindest = await laufen({ res: GUT_RES, ord: GUT_ORD, billig: GUT_BILLIG, mindest: 0 });
    t('kein Mindestwert hinterlegt -> kein falscher Alarm',
      ohneMindest.code === 200 && ohneMindest.alarme.length === 0, JSON.stringify(ohneMindest.alarme));

    // e) Halbe Antwort: ok, aber ohne track_token. Sieht nach Erfolg aus,
    //    waere aber ein Gast ohne Verfolgen-Banner.
    var halb = await laufen({
        res: { status: 200, body: { ok: true, id: 'r1' } }, ord: GUT_ORD, billig: GUT_BILLIG });
    t('halbe Antwort zaehlt nicht als Erfolg', halb.code === 500 && halb.alarme.length === 1,
      halb.code + ' / ' + halb.alarme.length);

    // f) Alles zu -- ein kaputter Deploy sieht so aus. Es muessen ALLE
    //    Maengel in der Meldung stehen, nicht nur der erste.
    var alles = await laufen({ res: null, ord: null, billig: null });
    t('alles zu -> Alarm', alles.code === 500 && alles.alarme.length === 1, alles.code);
    t('und alle drei Wege stehen in der Meldung',
      /Reservieren:/.test(alles.alarme[0]) && /Bestellen:/.test(alles.alarme[0])
      && /Preis-Schutz:/.test(alles.alarme[0]), alles.alarme[0]);
    t('die Meldung sagt, wie viele Wege klemmen',
      /^3 Gastwege klemmen/.test(alles.alarme[0]), alles.alarme[0]);

    // g) Haus ohne Speisekarte: der Preis-Schutz ist nicht pruefbar.
    //    Das ist kein Fehler und darf keinen Alarm ausloesen.
    var ohneKarte = await laufen({ res: GUT_RES, ord: GUT_ORD, billig: GUT_BILLIG, karte: false });
    t('Haus ohne Speisekarte -> kein falscher Alarm',
      ohneKarte.code === 200 && ohneKarte.alarme.length === 0, JSON.stringify(ohneKarte.alarme));

    global.fetch = echtesFetch;
    Module.prototype.require = echtesRequire;

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();