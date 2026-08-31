// WAS AUS EINER E-MAIL WIRD -- UND OB WIR ES ERFAHREN.
//
// Gefragt am 31.08.2026 zu zwei Zeilen im Resend-Fenster:
// "bei den e-mail kommt nicht bei den kunden an? warum?" und
// "ich meine die gesendeten muessen geliefert sein".
//
// "Gesendet" heisst: Resend hat die Mail an den Mailserver des Gastes
// uebergeben. "Geliefert" heisst: der Server hat sie ANGENOMMEN.
// Dazwischen liegen drei Enden -- geliefert, verzoegert, abgeprallt --
// und keines davon war bei uns sichtbar.
//
// Prallt eine Mail ab, sperrt Resend die Adresse. Ab dann gehen Mails
// an diesen Gast still ins Leere: kein Fehler, keine Meldung, keine
// Zeile im Protokoll. Der Gast wartet auf eine Bestaetigung, die es nie
// geben wird. Regel 6, wieder einmal.
//
// Diese Datei laesst den Webhook WIRKLICH laufen -- mit echt gerechneter
// Unterschrift, mit falscher, mit abgelaufener. Ein Alarm-Eingang, den
// jeder Fremde aufrufen kann, waere schlimmer als keiner.

var path = require('path');
var crypto = require('crypto');
var Module = require('module');
var KMI = path.join(__dirname, '..');
var F = path.join(KMI, 'netlify', 'functions');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- Der Alarm wird abgefangen, nicht wirklich verschickt ----------
var alarme = [];
var echtesRequire = Module.prototype.require;
Module.prototype.require = function (name) {
    if (name === './lib/alarm') {
        return { alarm: async function (titel, text, kennung) {
            alarme.push({ titel: titel, text: text, kennung: kennung }); return { ok: true }; } };
    }
    if (name === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    return echtesRequire.apply(this, arguments);
};

var GEHEIMNIS = 'whsec_' + Buffer.from('probe-geheimnis-fuer-den-test').toString('base64');
process.env.RESEND_WEBHOOK_SECRET = GEHEIMNIS;

var pfad = path.join(F, 'resend-ereignis.js');
function frisch() { delete require.cache[require.resolve(pfad)]; return require(pfad); }

// Genau so, wie Svix es rechnet: <id>.<zeit>.<rumpf>
function unterschreiben(id, zeit, rumpf, geheimnis) {
    var k = Buffer.from(String(geheimnis || GEHEIMNIS).replace(/^whsec_/, ''), 'base64');
    return 'v1,' + crypto.createHmac('sha256', k).update(id + '.' + zeit + '.' + rumpf).digest('base64');
}

async function rufen(nutzlast, opt) {
    opt = opt || {};
    alarme.length = 0;
    var rumpf = typeof nutzlast === 'string' ? nutzlast : JSON.stringify(nutzlast);
    var id   = opt.id || 'msg_probe';
    var zeit = String(opt.zeit || Math.floor(Date.now() / 1000));
    var sig  = opt.signatur !== undefined ? opt.signatur : unterschreiben(id, zeit, rumpf, opt.geheimnis);
    var erg = await frisch().handler({
        httpMethod: opt.methode || 'POST',
        headers: { 'svix-id': id, 'svix-timestamp': zeit, 'svix-signature': sig },
        body: rumpf
    });
    return { code: erg.statusCode, rumpf: JSON.parse(erg.body || '{}'), alarme: alarme.slice() };
}

function ereignis(art, extra) {
    var d = { to: ['hsvforever671@web.de'], subject: 'Reservierung bestaetigt - Rhodos, 19:30 Uhr' };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    return { type: art, data: d };
}

(async function () {
    console.log('\n-- 1. Ein Abpraller klingelt --');
    // Der Fall, der wirklich wehtut: der Gast bekommt nichts, und die
    // Adresse ist danach gesperrt.
    var ab = await rufen(ereignis('email.bounced',
        { bounce: { type: 'Permanent', subType: 'General', message: 'Mailbox does not exist' } }));
    t('Abpraller -> genau eine Meldung', ab.alarme.length === 1, ab.alarme.length);
    t('und die nennt den Empfaenger', /hsvforever671@web\.de/.test(ab.alarme[0] ? ab.alarme[0].text : ''),
      ab.alarme[0] && ab.alarme[0].text);
    t('und den Grund vom Mailserver',
      /Mailbox does not exist/.test(ab.alarme[0] ? ab.alarme[0].text : ''), ab.alarme[0] && ab.alarme[0].text);
    // Ohne diesen Satz sucht er beim naechsten Mal wieder in der App
    // statt bei Resend -- und findet nichts, weil dort alles stimmt.
    t('und sagt, dass die Adresse jetzt gesperrt ist',
      /Unterdrueckungen|gesperrt/.test(ab.alarme[0] ? ab.alarme[0].text : ''), ab.alarme[0] && ab.alarme[0].text);

    console.log('\n-- 2. Aber nicht bei jedem Ereignis --');
    // "Geliefert" ist die gute Nachricht. Wer dafuer alarmiert, ist
    // wieder bei den 96 Mails pro Nacht vom 27.08.
    var gut = await rufen(ereignis('email.delivered'));
    t('geliefert -> still', gut.alarme.length === 0, JSON.stringify(gut.alarme));
    // Verzoegert ist KEIN Fehler: web.de und GMX drosseln, das loest
    // sich meist von selbst. Genau dieser Zustand stand im Bildschirm-
    // foto -- "Gesendet", zwei Minuten alt.
    var spaet = await rufen(ereignis('email.delivery_delayed'));
    t('verzoegert -> still', spaet.alarme.length === 0, JSON.stringify(spaet.alarme));
    var spam = await rufen(ereignis('email.complained'));
    t('als Spam gemeldet -> Meldung', spam.alarme.length === 1, spam.alarme.length);

    console.log('\n-- 3. Getrennte Kennungen --');
    // Sonst verschluckt eine bekannte Sache die naechste unbekannte --
    // dieselbe Lehre wie bei der Wache.
    t('Abpraller und Spam haben eigene Kennungen',
      ab.alarme[0].kennung === 'mail-abgeprallt' && spam.alarme[0].kennung === 'mail-spam',
      ab.alarme[0].kennung + ' / ' + spam.alarme[0].kennung);

    console.log('\n-- 4. Niemand Fremdes darf hier Alarm ausloesen --');
    // Ein offener Alarm-Eingang waere ein Werkzeug fuer den naechsten
    // Spassvogel: er koennte beliebig viele Abpraller vortaeuschen und
    // damit genau den Laerm erzeugen, den wir gerade abgestellt haben.
    var falsch = await rufen(ereignis('email.bounced'), { signatur: 'v1,AAAABBBBCCCC' });
    t('falsche Unterschrift -> kein Alarm', falsch.alarme.length === 0, JSON.stringify(falsch.alarme));
    t('und es steht als Grund da', falsch.rumpf.grund === 'Unterschrift', JSON.stringify(falsch.rumpf));

    var fremd = await rufen(ereignis('email.bounced'), { geheimnis: 'whsec_' + Buffer.from('anderes').toString('base64') });
    t('fremdes Geheimnis -> kein Alarm', fremd.alarme.length === 0, JSON.stringify(fremd.alarme));

    // Ein einmal mitgelesener Aufruf darf sich nicht beliebig oft
    // wiederholen lassen.
    var alt = await rufen(ereignis('email.bounced'), { zeit: Math.floor(Date.now() / 1000) - 3600 });
    t('eine Stunde alter Aufruf -> abgewiesen', alt.alarme.length === 0, JSON.stringify(alt.alarme));

    var ohneKopf = await frisch().handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    t('ganz ohne Unterschrift -> abgewiesen', JSON.parse(ohneKopf.body).ok === false, ohneKopf.body);

    console.log('\n-- 5. Und immer 200 --');
    // Dieselbe Lehre wie bei der Wache: wer einem Absender einen Fehler
    // zurueckgibt, bekommt denselben Aufruf gleich noch einmal -- und
    // jeder Versuch wuerde eine weitere Meldung ausloesen.
    t('Abpraller: 200', ab.code === 200, ab.code);
    t('falsche Unterschrift: auch 200', falsch.code === 200, falsch.code);
    t('kein JSON: auch 200', (await rufen('kein json')).code === 200, 'anders');
    t('falsche Methode: auch 200',
      (await rufen(ereignis('email.bounced'), { methode: 'GET' })).code === 200, 'anders');

    console.log('\n-- 6. Ohne Geheimnis tut er nichts, sagt es aber laut --');
    delete process.env.RESEND_WEBHOOK_SECRET;
    var stumm = await rufen(ereignis('email.bounced'));
    t('ohne Geheimnis kein Alarm', stumm.alarme.length === 0, JSON.stringify(stumm.alarme));
    t('und der Grund steht in der Antwort', stumm.rumpf.grund === 'nicht eingerichtet', JSON.stringify(stumm.rumpf));
    var quelle = require('fs').readFileSync(pfad, 'utf8');
    t('und im Protokoll steht, was zu tun ist',
      /RESEND_WEBHOOK_SECRET fehlt[\s\S]{0,200}Netlify hinterlegen/.test(quelle), 'kein Hinweis');
    process.env.RESEND_WEBHOOK_SECRET = GEHEIMNIS;

    console.log('\n-- 7. Jede Gaeste-Mail hat eine Textfassung --');
    // Eine Ursache fuer schlechte Zustellung, die wir selbst gesetzt
    // haben: reines HTML. Spamfilter bei web.de und GMX werten das
    // schlechter.
    var fs = require('fs');
    ['order-email.js', 'reservation-reminder.js'].forEach(function (datei) {
        var q = fs.readFileSync(path.join(F, datei), 'utf8');
        t(datei + ' schickt auch Text', /text: nurText\(/.test(q), 'nur HTML');
    });
    var nurText = echtesRequire.call(module, path.join(F, 'lib', 'nur-text.js')).nurText;
    var txt = nurText('<div><style>a{}</style><h1>Reservierung bestätigt</h1>'
        + '<p>Rhodos, 19:30&nbsp;Uhr</p><p>2 Personen &amp; 1 Hund</p>'
        + '<a href="https://kiekmolin.de/x">Verfolgen</a></div>');
    t('die Textfassung enthaelt den Inhalt', /Reservierung bestätigt/.test(txt) && /19:30 Uhr/.test(txt), txt);
    t('kein HTML mehr drin', txt.indexOf('<') === -1, txt);
    // Ohne die Adresse waere der Link im Text wertlos.
    t('und der Link behaelt seine Adresse', /Verfolgen \(https:\/\/kiekmolin\.de\/x\)/.test(txt), txt);
    t('das & ist wieder ein &', /2 Personen & 1 Hund/.test(txt), txt);
    t('und die Formatvorlage ist raus', txt.indexOf('a{}') === -1, txt);

    Module.prototype.require = echtesRequire;
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
