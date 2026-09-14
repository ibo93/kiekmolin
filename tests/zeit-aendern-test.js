// DIE ZEIT EINER LAUFENDEN BESTELLUNG AENDERN.
//
// Ibo am 14.09.2026: "das aendert sich, wenn der Gastronom die Zeit
// aendert ... oder?" und "kann sein, dass er morgen 35 min hat -- da muss
// auch 35 min in der E-Mail stehen."
//
// WAS WIRKLICH DA WAR
// -------------------
// Fuer NEUE Bestellungen stimmte es schon: der Wert wird bei jeder
// Bestellung frisch aus den Einstellungen gelesen.
//
// Fuer eine LAUFENDE Bestellung gab es gar keinen Weg. Im Dashboard
// standen bei "angenommen" nur noch Storno und Zubereiten. War einmal
// 25 Minuten zugesagt, blieb es dabei -- auch wenn die Kueche voll war.
// Dem Wirt blieb nur stornieren oder den Gast warten lassen.
//
// Mit "sofort bestaetigen" wiegt das schwerer: der Wirt fasst die
// Bestellung gar nicht mehr an und hat nie den Moment, in dem er
// "heute dauert es laenger" sagen koennte.
//
// DIE STELLEN, AN DENEN DAS STILL SCHIEFGEHT
// ------------------------------------------
// 1. Status mitschreiben. Eine Bestellung in der Zubereitung spraenge auf
//    "angenommen" zurueck -- die Kueche faengt von vorne an.
// 2. Ein zweiter Kuechenbon bei jeder Korrektur. Dann kocht die Kueche
//    doppelt.
// 3. Die Annahme-Mail statt der Zeit-Mail. Der Gast liest zum zweiten Mal
//    "deine Bestellung wurde angenommen" und weiss nicht, was gilt.
// 4. Duplikatschutz auf der Zeit-Mail. Aendert der Wirt zweimal, MUSS der
//    Gast zweimal Bescheid bekommen.
// 5. Der Gast merkt nichts. Der Zuhoerer in der Gast-App reagierte nur auf
//    einen STATUSWECHSEL -- eine geaenderte Zeit ging spurlos vorbei.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var mail = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'order-email.js'), 'utf8');

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

// ---- 1. Der Knopf ist ueberhaupt da ------------------------------------
console.log('\n-- Der Knopf --');
var karten = schneide(h, "switch(order.status)");
t('bei angenommenen Bestellungen gibt es "Zeit ändern"',
  /case 'accepted':[\s\S]{0,900}zeitAendern/.test(h), 'kein Weg an die Zeit');
t('waehrend der Zubereitung auch -- da faellt es meistens erst auf',
  /case 'preparing':[\s\S]{0,900}zeitAendern/.test(h), 'fehlt');
t('bei eingegangenen NICHT -- die werden angenommen, nicht geaendert',
  !/case 'received':[\s\S]{0,600}zeitAendern/.test(h), 'zwei Wege fuer dasselbe');

// ---- 2. Derselbe Dialog, zwei Aufgaben ---------------------------------
console.log('\n-- Der Dialog --');
t('es gibt zeitAendern()', /function zeitAendern\(orderId\)/.test(h), 'fehlt');
t('er benutzt denselben Dialog wie das Annehmen -- kein zweiter, der ausschert',
  /function zeitAendern[\s\S]{0,600}acceptOrder\(orderId\);/.test(h), 'eigener Dialog');
t('und merkt sich, dass es NUR die Zeit ist',
  /currentAcceptModus = 'zeit';/.test(h), 'kein Unterschied zum Annehmen');
t('Annehmen setzt den Modus zurueck -- sonst bleibt der Dialog im Zeit-Modus haengen',
  /function acceptOrder\(orderId\) \{[\s\S]{0,200}currentAcceptModus = 'annehmen';/.test(h), 'bleibt haengen');

// Vorbelegt wird mit dem, was dem Gast schon zugesagt wurde.
var zq = schneide(h, 'function zeitAendern(orderId)');
t('vorbelegt mit der bereits zugesagten Zeit, nicht mit der Voreinstellung',
  /order\.estimated_minutes/.test(zq), 'zeigt die falsche Zahl');
t('eine krumme Zahl landet im Eigene-Zeit-Feld',
  /feld\.value = jetzige/.test(zq), 'geht verloren');

// ---- 3. Was wirklich geschrieben wird (ausgefuehrt) --------------------
console.log('\n-- Was in die Datenbank geht --');
var cq = schneide(h, 'async function confirmAcceptOrder()');
var vonF = cq.indexOf('var _nurZeit');
var bisF = cq.indexOf('try {', vonF);
var feldCode = cq.slice(vonF, bisF);
t('der Block wurde gefunden', feldCode.length > 80, feldCode.length);

function felder(modus) {
    var welt = { currentAcceptModus: modus, minutes: 45, Date: Date };
    vm.createContext(welt);
    vm.runInContext(feldCode + '; this._feld = _feld;', welt);
    return welt._feld;
}
var fZeit = felder('zeit'), fAnnehmen = felder('annehmen');
t('beim Aendern wird NUR die Zeit geschrieben',
  !!fZeit && fZeit.estimated_minutes === 45 && fZeit.status === undefined && fZeit.accepted_at === undefined,
  JSON.stringify(fZeit));
t('der Status bleibt unberuehrt -- sonst springt eine Bestellung aus der Zubereitung zurueck',
  !!fZeit && !('status' in fZeit), JSON.stringify(fZeit));
t('beim Annehmen dagegen schon', !!fAnnehmen && fAnnehmen.status === 'accepted', JSON.stringify(fAnnehmen));
t('und die Uhrzeit wird neu ausgerechnet',
  !!fZeit && typeof fZeit.estimated_time === 'string' && fZeit.estimated_time.length > 20, fZeit && fZeit.estimated_time);

// ---- 4. Ein 204 ist kein Beweis ---------------------------------------
console.log('\n-- Gespeichert oder nur behauptet --');
t('gespeichert wird mit return=representation, nicht minimal',
  /'Prefer': 'return=representation'/.test(cq), 'ein 204 gilt als Erfolg');
t('und eine leere Antwort gilt NICHT als gespeichert',
  /die Datenbank hat die Änderung ohne Fehlermeldung verworfen/.test(cq), 'meldet gruen bei RLS-Ablehnung');

// ---- 5. Die Kueche kocht nicht doppelt --------------------------------
console.log('\n-- Der Bon --');
t('beim blossen Aendern der Zeit laeuft KEIN zweiter Kuechenbon',
  /if \(autoPrintKitchenBon && !_nurZeit\)/.test(cq), 'Kueche kocht doppelt');

// Diese Zusicherung fehlte hier und ist beim Gegenproben aufgefallen:
// Gegenprobe 3 (wieder immer 'accepted' schicken) blieb in DIESER Datei
// gruen. Gefangen hat sie nur annahme-mail-test. Ein Test, der die
// Haelfte seines Themas nicht abdeckt, ist genau die Sorte, die
// Sicherheit behauptet, die es nicht gibt.
t('geschickt wird zeit_geaendert, nicht die Annahme-Mail',
  /event: _nurZeit \? 'zeit_geaendert' : 'accepted'/.test(cq), 'Gast liest zweimal "angenommen"');

// ---- 6. Die Mail ------------------------------------------------------
console.log('\n-- Die Mail --');
t('es gibt einen eigenen Zweig fuer die Zeitaenderung',
  /'zeit_geaendert'/.test(mail), 'fehlt');
t('er hat KEINEN Duplikatschutz -- zweimal geaendert heisst zweimal Bescheid',
  !/accepted_email_sent_at/.test(schneide(mail, "if (String(body.event || '').toLowerCase() === 'zeit_geaendert')")),
  'die zweite Aenderung erreicht den Gast nie');

var vonM = mail.indexOf('function buildZeitEmail('), bisM = mail.indexOf('function buildReservationEmail(');
t('buildZeitEmail laesst sich herausschneiden', vonM > 0 && bisM > vonM, vonM + '/' + bisM);
var welt = {}; vm.createContext(welt);
vm.runInContext('function esc(s){return String(s==null?"":s);}' + mail.slice(vonM, bisM) + '; this.bau = buildZeitEmail;', welt);

var mA = welt.bau({ order_number: 'B-7', order_type: 'pickup', customer_name: 'Ibo',
                    estimated_minutes: 45, estimated_time: '2026-09-14T17:45:00.000Z' },
                  { name: 'Pronto', phone: '04941 1234' });
t('die neue Uhrzeit steht drin', /19:45/.test(mA.html), mA.html.slice(0, 200));
t('und die neuen Minuten', /45 Minuten/.test(mA.html), 'fehlen');
t('im Betreff steht sie auch -- viele lesen nur den', /19:45/.test(mA.subject), mA.subject);
t('es steht NICHT noch einmal "angenommen" da', !/angenommen/.test(mA.html), 'verwirrt den Gast');
t('die Telefonnummer fuer den Fall, dass es nicht passt', /04941 1234/.test(mA.html), 'fehlt');

var mL = welt.bau({ order_number: 'B-8', order_type: 'delivery', estimated_minutes: 90,
                    estimated_time: '2026-09-14T18:30:00.000Z' }, { name: 'Pronto' });
t('bei Lieferung heisst es "bei dir", nicht "abholen"',
  /bei dir/.test(mL.html) && !/abholen/.test(mL.html), 'falscher Satz');

var mOhne = welt.bau({ order_number: 'B-9', order_type: 'pickup' }, { name: 'Pronto' });
t('ohne jede Zahl wird keine erfunden',
  !/Minuten<\/strong>/.test(mOhne.html) && /angepasst/.test(mOhne.html), 'erfindet eine Zeit');

// ---- 7. Der Gast merkt es ---------------------------------------------
console.log('\n-- Die Gast-App --');
t('eine reine Zeitaenderung wird bemerkt, nicht nur ein Statuswechsel',
  /updatedOrder\.status === customerActiveOrder\.status &&[\s\S]{0,200}estimated_time !== customerActiveOrder\.estimated_time/.test(h),
  'der Gast erfaehrt nichts');
t('und bekommt die neue Uhrzeit zu sehen',
  /Neue Zeit vom Restaurant/.test(h), 'still geaendert');

// ---- 8. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sie ist mindestens 36', !!cm && Number(cm[1]) >= 36, cm ? cm[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
