// DER GAST ERFUHR NIE, DASS SEINE BESTELLUNG ANGENOMMEN WURDE.
//
// GEMELDET WURDE
// --------------
// "Mit den Leuten die Kasse haben lass ein die Gäste direkt eine Nachricht
//  bekommen" -- und auf die Rueckfrage nach dem Weg: "Per Mail reicht".
//
// WAS DAHINTERSTECKTE
// -------------------
// Es ging genau EINE Mail raus: beim Bestelleingang ("ist eingegangen, wird
// gleich bestaetigt"). Die Bestaetigung selbst -- und vor allem die
// Wartezeit -- sah der Gast nur, wenn er die App offen liess.
//
// Fuer Betriebe, die aus ihrer Kasse arbeiten, ist das der entscheidende
// Punkt: dort nimmt kiekmolin automatisch an (kasseControls), der Wirt
// oeffnet das Dashboard nie. Ohne diese Mail sitzt der Gast vor einer
// Bestellung und weiss nicht, ob sie ueberhaupt jemand gesehen hat.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var MAIL = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'order-email.js'), 'utf8');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '');

function schneide(src, name) {
    var i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = src.indexOf('{', i), d = 0;
    for (var k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return '';
}

// Die Vorlage wirklich bauen.
var bau = new Function('esc',
    schneide(MAIL, 'buildAcceptedEmail') + '; return buildAcceptedEmail;'
)(function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); });

// ---- 1. Abholung mit Wartezeit ---------------------------------------------
(function () {
    var m = bau({
        order_number: 'KI-260813-677719', order_type: 'pickup', customer_name: 'Ibo',
        estimated_minutes: 25, estimated_time: '2026-08-13T17:20:00.000Z',
        restaurant_name: 'Pizzeria Al Porto'
    }, { name: 'Pizzeria Al Porto', street: 'Zum alten Maar 7', city: '26802 Oldersum', phone: '04942 123' });

    t('der Betreff sagt, dass bestaetigt wurde', /^Bestellung bestätigt #KI-260813-677719/.test(m.subject), m.subject);
    t('und nennt die Wartezeit schon dort -- viele lesen nur den Betreff',
      /ca\. 25 Min/.test(m.subject), m.subject);
    t('die Ueberschrift ist eindeutig', /Bestellung bestätigt/.test(m.html));
    t('es steht "abholen", nicht "bei dir"', /Du kannst sie in etwa <strong>25 Minuten<\/strong> abholen/.test(m.html), m.html.slice(0, 900));

    // Die Uhrzeit dazu: "in 25 Minuten" muss der Gast umrechnen, und wer die
    // Mail zwanzig Minuten spaeter liest, rechnet falsch.
    t('die Uhrzeit steht dabei', /gegen <strong>19:20 Uhr<\/strong>/.test(m.html), m.html.slice(400, 900));
    t('die Abholadresse steht drin', /Abholadresse/.test(m.html) && /Zum alten Maar 7/.test(m.html));
    t('die Telefonnummer fuer Rueckfragen ebenso', /04942 123/.test(m.html));
    t('der Link zum Bestellstatus fehlt nicht', /kiekmolin\.de\/order\/KI-260813-677719/.test(m.html));
})();

// ---- 2. Lieferung -- anderer Satz ------------------------------------------
(function () {
    var m = bau({
        order_number: 'KI-1', order_type: 'delivery', estimated_minutes: 60,
        estimated_time: '2026-08-13T18:00:00.000Z', restaurant_name: 'La Piazza'
    }, { name: 'La Piazza', street: 'Am Markt 10', city: 'Greetsiel' });

    t('bei Lieferung heisst es "bei dir"', /in etwa <strong>60 Minuten<\/strong> bei dir/.test(m.html), m.html.slice(0, 900));
    t('und NICHT "abholen"', m.html.indexOf('abholen') < 0);
    t('die Abholadresse steht bei Lieferung NICHT drin', m.html.indexOf('Abholadresse') < 0);
    t('die Bestellart steht im Kopf', /· Lieferung/.test(m.html));
})();

// ---- 3. Ohne Wartezeit trotzdem eine brauchbare Mail -----------------------
// Der haeufige Fall, wenn estimated_minutes fehlt: lieber ein ehrlicher Satz
// als "in null Minuten".
(function () {
    var m = bau({ order_number: 'KI-2', order_type: 'pickup', restaurant_name: 'X' }, null);
    t('ohne Minuten steht kein "0 Minuten" da', m.html.indexOf('0 Minuten') < 0, m.html.slice(0, 700));
    t('sondern ein sinnvoller Satz', /bereitet deine Bestellung jetzt zu/.test(m.html));
    t('und der Betreff bleibt ohne Zeitangabe sauber',
      m.subject === 'Bestellung bestätigt #KI-2 – X', m.subject);
})();

// ---- 4. Eigener Duplikatschutz ---------------------------------------------
// Wichtig: Die Annahme-Mail darf NICHT den Stempel der Eingangs-Mail
// benutzen, sonst haelt sie sich sofort fuer schon versendet.
t('der Annahme-Zweig hat einen eigenen Stempel',
  /accepted_email_sent_at=is\.null/.test(MAIL));
t('und benutzt NICHT den der Eingangsmail',
  !/event[\s\S]{0,600}confirmation_email_sent_at=is\.null[\s\S]{0,200}accepted/.test(MAIL));
t('schon versendet: es wird nicht nochmal geschickt',
  /schon versendet/.test(MAIL));
t('fehlt die Spalte, wird trotzdem gesendet statt zu schweigen',
  /Lieber eine Mail doppelt als gar keine/.test(MAIL));
t('ohne Gast-E-Mail wird sauber uebersprungen',
  /keine Kunden-E-Mail/.test(MAIL));

// ---- 5. Der Zweig wird ueberhaupt erreicht ---------------------------------
(function () {
    var i = MAIL.indexOf("String(body.event || '').toLowerCase() === 'accepted'");
    t('der Handler kennt event: accepted', i > 0, i);
    // Er muss VOR dem Eingangs-Zweig stehen -- sonst laeuft die Annahme in
    // die Eingangs-Mail und der Gast bekaeme zweimal dasselbe.
    //
    // lastIndexOf, NICHT indexOf: confirmation_email_sent_at kommt zweimal
    // vor, einmal im Reservierungs-Zweig weiter oben. Mit indexOf haette der
    // Test den falschen erwischt und waere zu Unrecht rot gewesen.
    var j = MAIL.lastIndexOf("confirmation_email_sent_at=is.null");
    t('und steht vor dem Bestell-Eingangs-Zweig', i > 0 && j > i, i + ' / ' + j);
    t('er kommt aber NACH dem Reservierungs-Zweig -- der hat seinen eigenen Weg',
      i > MAIL.indexOf('function handleReservation'));
})();

// ---- 6. Beide Wege loesen die Mail aus -------------------------------------
// Der Kassen-Weg ist der wichtigere: dort oeffnet niemand das Dashboard.
(function () {
    var ausloeser = (CODE.match(/event: 'accepted'/g) || []).length;
    t('es gibt zwei Ausloeser', ausloeser === 2, ausloeser);

    var manuell = schneide(CODE, 'confirmAcceptOrder');
    t('die manuelle Annahme schickt die Mail', /event: 'accepted'/.test(manuell), manuell.length);
    t('mit der ID der angenommenen Bestellung',
      /order_id: currentAcceptOrderId, event: 'accepted'/.test(manuell));

    var kasse = schneide(CODE, '_autoAcceptAfterPosPush');
    t('die Kassen-Annahme ebenfalls', /event: 'accepted'/.test(kasse), kasse.length);
    t('und zwar erst NACH dem erfolgreichen Speichern',
      kasse.indexOf("status: 'accepted'") < kasse.indexOf("event: 'accepted'"),
      kasse.indexOf("status: 'accepted'") + ' / ' + kasse.indexOf("event: 'accepted'"));

    // Fire-and-forget: eine Mail darf die Annahme nie aufhalten.
    t('die Mail haelt die Annahme nicht auf',
      (manuell.match(/\.catch\(function \(\) \{\}\)/g) || []).length >= 1
      && (kasse.match(/\.catch\(function \(\) \{\}\)/g) || []).length >= 1);
    t('und ein Fehler beim Senden wirft die Annahme nicht um',
      /try \{\s*\n\s*fetch\('\/\.netlify\/functions\/order-email'/.test(kasse));
})();

// ---- 7. Der Grund steht im Quelltext ---------------------------------------
t('warum es die zweite Mail gibt, ist festgehalten',
  /oeffnet der Wirt/.test(H) && /das Dashboard nie/.test(H));
t('und die noetige Spalte steht im Kopf der Function',
  /ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_email_sent_at/.test(MAIL));
t('samt Begruendung, warum es eine eigene sein muss',
  /braucht eine EIGENE/.test(MAIL));
t('und warum die Uhrzeit zusaetzlich zur Minutenzahl dasteht',
  /muss der Gast\s*\n?\s*\/\/ umrechnen|rechnet sonst falsch/.test(MAIL));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
