// "Bedienung rufen" -- die Function wird WIRKLICH aufgerufen, mit
// gefälschter Datenbank und gefälschtem Push.
//
// Der Fehler, den diese Datei festhält: der Ruf ging ausschliesslich per
// Web-Push raus. Hat im Restaurant niemand die Benachrichtigungen erlaubt --
// und das muss jedes Gerät einmal von Hand tun -- bekam der Gast
// "Gerade ist kein Gerät im Restaurant erreichbar", und im Restaurant erfuhr
// niemand, dass überhaupt jemand gerufen hatte. Der Knopf war also nicht
// kaputt im Sinne von "Code falsch", er war nutzlos im Normalfall.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';

var Module = require('module');
var fs = require('fs');
var PFAD = KMI + '/netlify/functions/waiter-call.js';

// web-push ist in dieser Umgebung nicht installiert (liegt nur bei Netlify).
// Attrappe einhängen, damit die echte Datei geladen werden kann.
var pushFehler = null, pushGesendet = 0;
var echtesLaden = Module._load;
Module._load = function (anfrage, eltern, haupt) {
    if (anfrage === 'web-push') {
        return {
            setVapidDetails: function () {},
            sendNotification: async function () {
                pushGesendet++;
                if (pushFehler) throw pushFehler;
            }
        };
    }
    return echtesLaden.apply(this, arguments);
};

var n = 0, ok = 0;
function t(label, bedingung, extra) {
    n++;
    var gut = bedingung === true;
    if (gut) ok++;
    console.log((gut ? 'OK  ' : 'FAIL') + ' | ' + label + (gut ? '' : '  -> ' + extra));
}

var RID = '11111111-2222-3333-4444-555555555555';

// Gefälschte Datenbank. `welt` steuert, was sie kann.
function machFetch(welt) {
    var log = { logZeilen: [], logStatus: 0 };
    global.fetch = async function (url, opts) {
        var u = String(url);
        if (u.indexOf('/rest/v1/restaurants') >= 0) {
            return { ok: true, json: async function () { return [{ name: 'Pronto Pronto' }]; } };
        }
        if (u.indexOf('/rest/v1/activity_log') >= 0) {
            log.logZeilen.push(JSON.parse(opts.body));
            log.logStatus = welt.logOk === false ? 500 : 201;
            return { ok: welt.logOk !== false, status: log.logStatus,
                     text: async function () { return ''; } };
        }
        if (u.indexOf('/rest/v1/push_subscriptions') >= 0) {
            if (opts && opts.method === 'DELETE') return { ok: true };
            if (welt.subsFehler) return { ok: false, status: 500, json: async function () { return []; } };
            return { ok: true, json: async function () {
                return (welt.subs || []).map(function (i) {
                    return { id: 's' + i, endpoint: 'https://push.example/' + i, p256dh_key: 'p', auth_key: 'a' };
                });
            } };
        }
        throw new Error('unerwarteter Aufruf: ' + u);
    };
    return log;
}

async function ruf(welt, body) {
    ['SUPABASE_SERVICE_KEY', 'VAPID_PUBLIC', 'VAPID_PRIVATE'].forEach(function (k) { delete process.env[k]; });
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    if (welt.vapid !== false) { process.env.VAPID_PUBLIC = 'oeff'; process.env.VAPID_PRIVATE = 'geheim'; }
    delete require.cache[require.resolve(PFAD)];
    pushGesendet = 0; pushFehler = welt.pushFehler || null;
    var log = machFetch(welt);
    var h = require(PFAD).handler;
    var r = await h({ httpMethod: 'POST', body: JSON.stringify(body || { restaurant_id: RID, table: 7, reason: 'service' }) });
    return { code: r.statusCode, antwort: JSON.parse(r.body), log: log, push: pushGesendet };
}

(async function () {
    // ---- DER EIGENTLICHE FEHLER ----
    var r = await ruf({ subs: [] });
    t('kein Geraet mit Push -> Ruf gilt TROTZDEM als angekommen',
      r.antwort.ok === true, JSON.stringify(r.antwort));
    t('kein Geraet mit Push -> Ruf steht in der Datenbank',
      r.log.logZeilen.length === 1, r.log.logZeilen.length + ' Zeilen');

    r = await ruf({ vapid: false, subs: [] });
    t('ganz ohne Push-Schluessel funktioniert der Knopf weiter',
      r.antwort.ok === true, JSON.stringify(r.antwort));
    t('ohne Push-Schluessel wird gar nicht erst gepusht',
      r.push === 0, r.push + ' Push-Versuche');

    // ---- Inhalt der Zeile ----
    r = await ruf({ subs: [1] });
    var z = r.log.logZeilen[0] || {};
    t('Zeile traegt activity_type waiter_call', z.activity_type === 'waiter_call', z.activity_type);
    t('Zeile haengt am richtigen Restaurant', z.target_id === RID, z.target_id);
    t('Tischnummer steht in metadata', z.metadata && z.metadata.table === 7, JSON.stringify(z.metadata));
    t('Grund steht in metadata', z.metadata && z.metadata.reason === 'service', JSON.stringify(z.metadata));
    t('Datenbank kommt VOR dem Push (Push darf sie nie verhindern)',
      r.log.logZeilen.length === 1 && r.push === 1, 'log=' + r.log.logZeilen.length + ' push=' + r.push);

    r = await ruf({ subs: [1] }, { restaurant_id: RID, table: 3, reason: 'pay' });
    t('Grund "pay" wird uebernommen',
      (r.log.logZeilen[0].metadata || {}).reason === 'pay', JSON.stringify(r.log.logZeilen[0].metadata));

    // ---- Kein Freitext von aussen ----
    r = await ruf({ subs: [1] }, { restaurant_id: RID, table: 3, reason: '<script>boese</script>' });
    t('erfundener Grund faellt auf "service" zurueck (kein Freitext ans Personal)',
      (r.log.logZeilen[0].metadata || {}).reason === 'service', JSON.stringify(r.log.logZeilen[0].metadata));

    // ---- Push allein reicht auch ----
    r = await ruf({ subs: [1, 2], logOk: false });
    t('Datenbank kaputt, aber Push kam an -> trotzdem ok',
      r.antwort.ok === true && r.push === 2, JSON.stringify(r.antwort) + ' push=' + r.push);

    // ---- Beides kaputt: ehrlich sein ----
    r = await ruf({ subs: [], logOk: false });
    t('beides kaputt -> ehrliche Absage statt falschem "kommt gleich"',
      r.antwort.ok === false && /winken/.test(r.antwort.error || ''), JSON.stringify(r.antwort));

    // ---- Eingaben ----
    r = await ruf({ subs: [1] }, { restaurant_id: RID, table: 999 });
    t('unmoegliche Tischnummer wird abgelehnt',
      r.antwort.ok === false && r.code === 400, r.code + ' ' + JSON.stringify(r.antwort));
    r = await ruf({ subs: [1] }, { restaurant_id: 'nein', table: 5 });
    t('fehlende Restaurant-ID wird abgelehnt',
      r.antwort.ok === false && r.code === 400, r.code + ' ' + JSON.stringify(r.antwort));

    // ---- Abgemeldete Geräte werden aufgeräumt, brechen aber nichts ----
    var weg = new Error('gone'); weg.statusCode = 410;
    r = await ruf({ subs: [1], pushFehler: weg });
    t('totes Geraet bricht den Ruf nicht ab (Datenbank traegt ihn)',
      r.antwort.ok === true, JSON.stringify(r.antwort));

    // ---- Dashboard-Seite ----
    var h = fs.readFileSync(KMI + '/index.html', 'utf8');
    t('Dashboard hoert ueberhaupt auf waiter_call',
      /activity_type === 'waiter_call'/.test(h));
    t('Dashboard fragt zusaetzlich nach (falls Echtzeit die Tabelle nicht liefert)',
      /functions\/waiter-pending\?restaurant=/.test(h) && /setInterval\(_tischRufeNachfragen, 15000\)/.test(h));
    t('Alarm nur fuer angemeldetes Personal, nie fuer den Gast',
      /function _tischRufFuerMich/.test(h) && /if \(!angemeldet\) return false;/.test(h));
    t('Gastronom sieht nur sein eigenes Restaurant',
      /if \(meins && act\.target_id && act\.target_id !== meins\) return false;/.test(h));
    t('derselbe Ruf loest nur EINEN Alarm aus',
      /_tischRufGesehen\[act\.id\]/.test(h));

    // ---- Menüscanner: kein "KI liest" wenn keine KI läuft ----
    // Die Zusage hängt nicht mehr an der Reihenfolge im Quelltext, sondern
    // am Ablauf: der PDF-Weg kehrt zurück, bevor leseKarteKI überhaupt
    // erwähnt wird. tests/scanner-neu-test.js fährt das wirklich durch.
    var sm = h.slice(h.indexOf('async function startMenuScan()'));
    sm = sm.slice(0, sm.indexOf('\n}\n') + 3);
    var iPdf = sm.indexOf('showScannedResults();\n                return;');
    var iKi = sm.indexOf('leseKarteKI(');
    t('Ohne-KI-Weg kehrt zurueck, BEVOR die KI ueberhaupt gefragt wird',
      iPdf > 0 && iKi > iPdf, 'pdfReturn@' + iPdf + ' ki@' + iKi);
    t('Scan startet neutral, nicht mit "KI liest die Speisekarte"',
      !/🤖 KI liest die Speisekarte/.test(h));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
