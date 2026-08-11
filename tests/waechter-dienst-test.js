// DER WÄCHTER ALS HINTERGRUNDDIENST.
//
// GEWUENSCHT WURDE
// ----------------
// "das mit hintergrunddienst ist sehr wichtig er liest die fehler".
//
// Der Selbstcheck im Dashboard misst erst, wenn ihn jemand oeffnet. Nachts
// um halb elf, wenn eine Bestellung nicht ankommt, oeffnet ihn niemand.
//
// netlify/functions/waechter.js laeuft deshalb serverseitig alle 15 Minuten
// (netlify.toml) und liest genau die Ereignisse, die beim Bestellen
// auflaufen: order_save_failed, order_verify_failed,
// order_items_unvollstaendig. Die schreibt die App seit dem
// Bestellverlust-Fix ins Protokoll -- gelesen hat sie bisher niemand.
//
// WAS HIER GEPRUEFT WIRD
// ----------------------
// Vor allem die unangenehmen Faelle: fehlende Datenbankspalte, kein Geraet
// fuer Push angemeldet, mehrere Restaurants gleichzeitig betroffen. Ein
// Dienst, der bei der ersten Unregelmaessigkeit stillschweigend aufgibt,
// waere schlimmer als keiner -- man verliesse sich darauf.
'use strict';
var fs = require('fs');
var path = require('path');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// web-push ist eine Netlify-Abhaengigkeit und liegt hier nicht installiert
// vor. Statt den Test daran scheitern zu lassen, wird das Modul ersetzt --
// verschickt wird ohnehin nichts, gezaehlt wird nur, WAS verschickt wuerde.
var Module = require('module');
var _echtesLaden = Module._load;
var PUSH_ERSATZ = { setVapidDetails: function () {}, sendNotification: function () { return Promise.resolve(); } };
Module._load = function (anfrage, eltern, istHaupt) {
    if (anfrage === 'web-push') return PUSH_ERSATZ;
    return _echtesLaden.apply(this, arguments);
};

var DATEI = '/home/user/kiekmolin/netlify/functions/waechter.js';
var Q = fs.readFileSync(DATEI, 'utf8');
var TOML = fs.readFileSync('/home/user/kiekmolin/netlify.toml', 'utf8');

// ---- 1. Verdrahtung ----------------------------------------------------------
t('der Dienst ist als geplante Funktion eingetragen',
  /\[functions\."waechter"\]/.test(TOML));
t('und laeuft alle 15 Minuten',
  /\[functions\."waechter"\][\s\S]{0,200}schedule = "\*\/15 \* \* \* \*"/.test(TOML));
t('die Datei ist gueltiges JavaScript',
  (function () {
      try { require('child_process').execFileSync('node', ['--check', DATEI], { stdio: 'pipe' }); return true; }
      catch (e) { return String(e.stderr || e.message).slice(0, 200); }
  })() === true);

// ---- 2. Die Logik ohne Netz --------------------------------------------------
var W = require(DATEI);
var I = W._intern;

t('genau die drei Bestell-Fehler werden ueberwacht',
  Object.keys(I.ALARM).sort().join(',') === 'order_items_unvollstaendig,order_save_failed,order_verify_failed',
  Object.keys(I.ALARM).join(','));
t('verlorene Bestellungen gelten als dringend',
  I.ALARM.order_save_failed.dringend === true && I.ALARM.order_verify_failed.dringend === true);
t('fehlende Positionen dagegen nicht -- die Kueche sieht die Gerichte trotzdem',
  I.ALARM.order_items_unvollstaendig.dringend === false);
t('jeder Fehler hat einen Klartext, keinen technischen Schluessel',
  Object.keys(I.ALARM).every(function (k) { return /\s/.test(I.ALARM[k].klartext); }));

// ---- 3. Die Meldung ----------------------------------------------------------
function ev(typ, nr, zeit, rid) {
    return { id: 'e-' + nr, restaurant_id: rid || 'r-1', type: typ,
             message: 'egal', payload: { order_number: nr },
             created_at: zeit || '2026-08-11T18:22:00Z' };
}
var eine = I.meldungBauen('Greetsieler Börse', [ev('order_save_failed', 'KI-260811-004417')]);
t('eine verlorene Bestellung: die Ueberschrift sagt es im Klartext',
  eine.title === 'Eine Bestellung ist nicht angekommen', eine.title);
t('das Restaurant wird genannt', /Greetsieler Börse/.test(eine.body), eine.body);
t('die Bestellnummer steht drin', /KI-260811-004417/.test(eine.body), eine.body);
t('und die Uhrzeit', /\d{2}:\d{2}/.test(eine.body), eine.body);
t('sowie was passiert ist', /nicht gespeichert/.test(eine.body), eine.body);
t('dringende Meldungen bleiben stehen, bis jemand hinsieht',
  eine.requireInteraction === true);
t('und vibrieren spuerbar', Array.isArray(eine.vibrate) && eine.vibrate.length > 1);
t('der Klick fuehrt zu den Bestellungen', eine.data.url === '/?adminTab=orders');

var drei = I.meldungBauen('Al Porto', [
    ev('order_save_failed', 'A-1'), ev('order_verify_failed', 'A-2'), ev('order_save_failed', 'A-3')]);
t('mehrere Bestellungen ergeben EINE Meldung, nicht drei Pushes',
  /3 Bestellungen sind nicht angekommen/.test(drei.title), drei.title);
t('mit allen drei Nummern', /A-1/.test(drei.body) && /A-2/.test(drei.body) && /A-3/.test(drei.body), drei.body);
t('die beiden Fehlerarten werden unterschiedlich benannt',
  /nicht gespeichert/.test(drei.body) && /nicht auffindbar/.test(drei.body), drei.body);

var viele = I.meldungBauen('Al Porto', ['a','b','c','d','e'].map(function (x, i) { return ev('order_save_failed', 'N-' + i); }));
t('bei vielen wird gekuerzt, aber die Zahl genannt',
  /\(\+2 weitere\)/.test(viele.body), viele.body);

var sanft = I.meldungBauen('Al Porto', [ev('order_items_unvollstaendig', 'B-1')]);
t('ein nicht dringender Fall bekommt eine ruhigere Ueberschrift',
  sanft.title === 'Hinweis zu Bestellungen', sanft.title);
t('und bleibt nicht aufdringlich stehen', sanft.requireInteraction === false);

t('ohne Bestellnummer wird keine erfunden',
  (function () {
      var m = I.meldungBauen('X', [{ id: 'e', restaurant_id: 'r', type: 'order_save_failed',
                                     created_at: '2026-08-11T18:22:00Z', payload: null }]);
      return !/undefined|null/.test(m.body);
  })(), I.meldungBauen('X', [{ id: 'e', restaurant_id: 'r', type: 'order_save_failed', created_at: '2026-08-11T18:22:00Z', payload: null }]).body);

// ---- 4. Der ganze Durchlauf, mit nachgebautem Supabase -----------------------
// Ohne das waere nur die Textbauerei geprueft, nicht der Dienst.
function lauf(welt) {
    delete require.cache[require.resolve(DATEI)];
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'dienst-schluessel';
    process.env.VAPID_PUBLIC = welt.ohneVapid ? '' : 'pub';
    process.env.VAPID_PRIVATE = welt.ohneVapid ? '' : 'priv';

    var gerufen = { get: [], patch: [], delete: [], push: [] };
    global.fetch = function (url, opt) {
        var pfad = String(url).split('/rest/v1/')[1] || '';
        var methode = (opt && opt.method) || 'GET';
        if (methode === 'PATCH') { gerufen.patch.push(pfad); return Promise.resolve({ ok: true, json: function () { return Promise.resolve([]); } }); }
        if (methode === 'DELETE') { gerufen.delete.push(pfad); return Promise.resolve({ ok: true }); }
        gerufen.get.push(pfad);
        if (/^restaurant_events/.test(pfad)) {
            if (welt.spalteFehlt && /notified_at=is\.null/.test(pfad)) {
                return Promise.resolve({ ok: false, status: 400,
                    text: function () { return Promise.resolve('{"code":"42703","message":"column restaurant_events.notified_at does not exist"}'); } });
            }
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve(welt.ereignisse || []); } });
        }
        if (/^restaurants/.test(pfad)) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(welt.namen || []); } });
        if (/^push_subscriptions/.test(pfad)) return Promise.resolve({ ok: true, json: function () { return Promise.resolve(welt.geraete || []); } });
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve([]); } });
    };
    var wp = PUSH_ERSATZ;
    wp.setVapidDetails = function () {};
    wp.sendNotification = function (sub, nutzlast) {
        gerufen.push.push({ endpoint: sub.endpoint, nutzlast: JSON.parse(nutzlast) });
        if (welt.pushFehler) { var e = new Error('weg'); e.statusCode = welt.pushFehler; return Promise.reject(e); }
        return Promise.resolve();
    };
    var warnungen = [], fehler = [];
    var altW = console.warn, altL = console.log, altE = console.error;
    console.warn = function (m) { warnungen.push(String(m)); };
    console.log = function () {};
    console.error = function (m) { fehler.push(String(m)); };
    var mod = require(DATEI);
    return mod.handler().then(function (r) {
        console.warn = altW; console.log = altL; console.error = altE;
        return { antwort: r, gerufen: gerufen, warnungen: warnungen, fehler: fehler };
    }, function (e) {
        console.warn = altW; console.log = altL; console.error = altE;
        return { fehlerObjekt: e, gerufen: gerufen, warnungen: warnungen, fehler: fehler };
    });
}

var GERAET = [{ id: 's1', endpoint: 'https://push/1', p256dh_key: 'k', auth_key: 'a' }];

(async function () {
    // Normalfall
    var A = await lauf({ ereignisse: [ev('order_save_failed', 'KI-1')],
                         namen: [{ id: 'r-1', name: 'Greetsieler Börse' }], geraete: GERAET });
    t('der Dienst laeuft durch und meldet Erfolg', A.antwort.statusCode === 200, JSON.stringify(A.antwort));
    t('er sucht nur nach den drei Fehlerarten',
      A.gerufen.get.some(function (p) { return /type=in\.\(order_save_failed,order_verify_failed,order_items_unvollstaendig\)/.test(p); }),
      A.gerufen.get[0]);
    t('und nur nach noch nicht gemeldeten', /notified_at=is\.null/.test(A.gerufen.get[0]), A.gerufen.get[0]);
    t('ein Push geht raus', A.gerufen.push.length === 1, A.gerufen.push.length);
    t('mit der Bestellnummer darin', /KI-1/.test(A.gerufen.push[0].nutzlast.body), A.gerufen.push[0].nutzlast.body);
    t('danach wird als gemeldet markiert -- sonst kaeme es alle 15 Min wieder',
      A.gerufen.patch.some(function (p) { return /restaurant_events\?id=in\./.test(p); }), A.gerufen.patch);

    // Nichts zu tun
    var B = await lauf({ ereignisse: [], geraete: GERAET });
    t('ohne Ereignisse wird kein Push verschickt', B.gerufen.push.length === 0);
    t('und nichts markiert', B.gerufen.patch.length === 0);

    // Fehlende Spalte: der Dienst muss weiterlaufen
    var C = await lauf({ spalteFehlt: true, ereignisse: [ev('order_save_failed', 'KI-2')],
                         namen: [{ id: 'r-1', name: 'Al Porto' }], geraete: GERAET });
    t('fehlt die Spalte notified_at, gibt der Dienst NICHT auf',
      C.antwort.statusCode === 200, JSON.stringify(C.antwort));
    t('er weicht auf ein Zeitfenster aus', /"weg":"fenster"/.test(C.antwort.body), C.antwort.body);
    t('und meldet trotzdem', C.gerufen.push.length === 1);
    t('der Log sagt, welches SQL fehlt',
      C.warnungen.some(function (w) { return /ALTER TABLE restaurant_events/.test(w); }), C.warnungen);
    t('ohne Spalte wird auch nicht markiert (ginge ja nicht)', C.gerufen.patch.length === 0);

    // Kein Geraet angemeldet
    var D = await lauf({ ereignisse: [ev('order_save_failed', 'KI-3')], geraete: [] });
    t('ohne angemeldetes Geraet stuerzt nichts ab', D.antwort.statusCode === 200);
    t('das wird in der Antwort ausgewiesen', /"ohneGeraet":1/.test(D.antwort.body), D.antwort.body);
    t('und der Befund trotzdem als gemeldet markiert -- sonst laeuft es endlos',
      D.gerufen.patch.length === 1, D.gerufen.patch);

    // Mehrere Restaurants
    var E = await lauf({
        ereignisse: [ev('order_save_failed', 'X-1', null, 'r-1'), ev('order_save_failed', 'Y-1', null, 'r-2')],
        namen: [{ id: 'r-1', name: 'Börse' }, { id: 'r-2', name: 'Al Porto' }], geraete: GERAET });
    t('zwei betroffene Haeuser bekommen zwei getrennte Meldungen',
      E.gerufen.push.length === 2, E.gerufen.push.length);
    t('jedes nur mit der eigenen Bestellung',
      /X-1/.test(E.gerufen.push[0].nutzlast.body) && !/Y-1/.test(E.gerufen.push[0].nutzlast.body),
      E.gerufen.push[0].nutzlast.body);
    t('und mit dem eigenen Namen',
      /Börse/.test(E.gerufen.push[0].nutzlast.body) && /Al Porto/.test(E.gerufen.push[1].nutzlast.body));

    // Abgelaufenes Geraet
    var F = await lauf({ ereignisse: [ev('order_save_failed', 'KI-4')], geraete: GERAET, pushFehler: 410 });
    t('ein abgemeldetes Geraet wird aufgeraeumt',
      F.gerufen.delete.some(function (p) { return /push_subscriptions/.test(p); }), F.gerufen.delete);
    t('der Durchlauf bleibt trotzdem erfolgreich', F.antwort.statusCode === 200);

    // Ohne VAPID
    var G = await lauf({ ereignisse: [ev('order_save_failed', 'KI-5')], geraete: GERAET, ohneVapid: true });
    t('ohne Push-Schluessel wird kein Push versucht', G.gerufen.push.length === 0);
    t('aber der Dienst laeuft und sagt es im Log',
      G.antwort.statusCode === 200 && G.warnungen.some(function (w) { return /VAPID/.test(w); }), G.warnungen);

    // ---- 5. Der Grund steht im Quelltext ------------------------------------
    t('warum es den Dienst gibt, steht in der Datei',
      /gelesen hat sie bisher niemand|Bisher hat sie niemand gelesen/.test(Q));
    t('und wo seine Grenze liegt',
      /Er beantwortet keine Reservierung/.test(Q));
    t('das noetige SQL steht dabei',
      /ADD COLUMN IF NOT EXISTS notified_at/.test(Q));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
