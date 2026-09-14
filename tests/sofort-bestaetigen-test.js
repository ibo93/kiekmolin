// DIE WARTEZEIT MUSS IN DIE MAIL -- UND DER WIRT SOLL NICHTS MEHR DRUECKEN.
//
// Ibo am 13.09.2026: "Die Restaurants mit Wartezeit-Einstellung: da muss der
// Gast so eine E-Mail bekommen. Beispiel bei Abholung steht 25 min, muss auf
// der Mail 25 min stehen. Und bei Lieferung auch so. So haben sie eine
// direkte Bestaetigung, dann muessen die es nicht bestaetigen."
//
// WAS WIRKLICH DA WAR
// -------------------
// 1. Die Eingangsmail nannte keine einzige Zahl. Sie sagte "Sobald sie
//    bestaetigt wird, siehst du den Live-Status" -- im Dashboard stand
//    derweil "Abholung 25 Min".
// 2. Die Wartezeit kam nur in die zweite Mail, und die ging erst raus, wenn
//    jemand die Bestellung annahm.
// 3. Automatisch angenommen wurde ausschliesslich nach einem Kassen-Push --
//    und zwar in index.html, also im Browser des Wirts. Wer kein Dashboard
//    offen hatte, dessen Gast bekam gar nichts.
//
// DIE GEFAEHRLICHE STELLE
// -----------------------
// Jedes Restaurant HAT eine Wartezeit (25/45 als Vorgabe). Waere das schon
// die Bedingung fuers Sofort-Bestaetigen, fiele ueber Nacht auf der ganzen
// Plattform die Annahme weg -- und kein Wirt koennte eine Bestellung mehr
// ablehnen, weil die Kueche voll ist oder etwas aus ist. Darum ein eigener
// Schalter, der FEHLEN darf und dann AUS bedeutet.
//
// Und: bei einer Vorbestellung mit Wunschzeit waere "in 25 Minuten" gelogen.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var W = require(path.join(KMI, 'netlify', 'functions', 'lib', 'wartezeit.js'));
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var save = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'order-save.js'), 'utf8');
var mail = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'order-email.js'), 'utf8');
var pp = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'paypal-zahlung.js'), 'utf8');

// ---- 1. Die Regeln, wirklich ausgefuehrt ------------------------------
console.log('\n-- Die Minuten --');
t('Abholung 25 aus features', W.minuten(['prep_pickup:25'], 'pickup') === 25, W.minuten(['prep_pickup:25'], 'pickup'));
t('Lieferung 60 aus features', W.minuten(['prep_delivery:60'], 'delivery') === 60, W.minuten(['prep_delivery:60'], 'delivery'));
t('ohne Eintrag: Abholung 25', W.minuten([], 'pickup') === 25);
t('ohne Eintrag: Lieferung 45', W.minuten([], 'delivery') === 45);
t('vor Ort zaehlt als Abholung', W.minuten(['prep_pickup:30'], 'dine_in') === 30);
t('3 Minuten sind keine ehrliche Zusage -> Vorgabe', W.minuten(['prep_pickup:3'], 'pickup') === 25);
t('999 Minuten auch nicht -> Vorgabe', W.minuten(['prep_pickup:999'], 'pickup') === 25);
t('Unsinn in features stuerzt nicht ab', W.minuten(['prep_pickup:abc', null, 7], 'pickup') === 25);
t('features gar kein Array', W.minuten('kaputt', 'pickup') === 25);
t('features fehlt ganz', W.minuten(undefined, 'delivery') === 45);
t('die Lieferzeit gilt NICHT fuer Abholer',
  W.minuten(['prep_pickup:20', 'prep_delivery:70'], 'pickup') === 20
  && W.minuten(['prep_pickup:20', 'prep_delivery:70'], 'delivery') === 70, 'Werte vertauscht');

console.log('\n-- Der Server rechnet wie der Browser --');
// Zwei Stellen mit zwei Regeln laufen auseinander. Dann steht in der Mail
// eine andere Zahl als im Dashboard -- und der Gast bekommt ein Versprechen,
// das der Wirt nie gegeben hat. Also beide gegeneinander rechnen.
var vonB = h.indexOf('function vorbereitungsMinuten(');
var bisB = h.indexOf('window.vorbereitungsMinuten = vorbereitungsMinuten;');
t('vorbereitungsMinuten steht in index.html', vonB > 0 && bisB > vonB, vonB + '/' + bisB);
var welt = { window: {} };
vm.createContext(welt);
vm.runInContext(h.slice(vonB, bisB), welt);
var browser = welt.vorbereitungsMinuten;

var faelle = [
    [[], 'pickup'], [[], 'delivery'], [['prep_pickup:25'], 'pickup'],
    [['prep_delivery:60'], 'delivery'], [['prep_pickup:5'], 'pickup'],
    [['prep_pickup:180'], 'pickup'], [['prep_pickup:4'], 'pickup'],
    [['prep_pickup:181'], 'pickup'], [['prep_off', 'prep_delivery:90'], 'delivery'],
    [['quatsch'], 'pickup']
];
var abweichung = faelle.filter(function (f) {
    return browser({ features: f[0] }, f[1]) !== W.minuten(f[0], f[1]);
});
t('alle ' + faelle.length + ' Faelle ergeben dieselbe Zahl wie im Browser',
  abweichung.length === 0, JSON.stringify(abweichung));

console.log('\n-- An oder aus --');
t('ohne Eintrag ist die Zusage AN', W.an([]) === true);
t('prep_off schaltet sie aus', W.an(['prep_off']) === false);

console.log('\n-- Sofort bestaetigen: muss eingeschaltet WERDEN --');
t('ohne Eintrag: AUS', W.sofort([]) === false);
t('nur eine Wartezeit reicht NICHT -- sonst faellt plattformweit die Annahme weg',
  W.sofort(['prep_pickup:25', 'prep_delivery:60']) === false, 'jeder Betrieb waere dabei');
t('prep_auto schaltet es an', W.sofort(['prep_auto']) === true);
t('features kaputt: AUS', W.sofort('nein') === false);

console.log('\n-- Was in die Bestellung geschrieben wird --');
var jetzt = Date.parse('2026-09-13T17:00:00.000Z');
t('ohne prep_auto: gar nichts', W.zusage(['prep_pickup:25'], 'pickup', false, jetzt) === null);
var z = W.zusage(['prep_auto', 'prep_pickup:25'], 'pickup', false, jetzt);
t('mit prep_auto: angenommen', z && z.status === 'accepted', JSON.stringify(z));
t('mit der eingestellten Zahl', z && z.estimated_minutes === 25, JSON.stringify(z));
t('und der passenden Uhrzeit -- 25 Minuten spaeter',
  z && z.estimated_time === '2026-09-13T17:25:00.000Z', z && z.estimated_time);
t('Lieferung nimmt die Lieferzeit',
  (W.zusage(['prep_auto', 'prep_delivery:70'], 'delivery', false, jetzt) || {}).estimated_minutes === 70);

var zOff = W.zusage(['prep_auto', 'prep_off', 'prep_pickup:25'], 'pickup', false, jetzt);
t('Zusage aus: angenommen ja, Zahl nein',
  zOff && zOff.status === 'accepted' && zOff.estimated_minutes === undefined, JSON.stringify(zOff));
t('dann steht auch keine Uhrzeit drin', zOff && zOff.estimated_time === undefined);

t('Vorbestellung mit Wunschzeit: NICHT sofort bestaetigen -- "in 25 Minuten" waere gelogen',
  W.zusage(['prep_auto', 'prep_pickup:25'], 'pickup', true, jetzt) === null, 'falsche Zusage');

// ---- 2. Der Server schreibt es wirklich hin ----------------------------
console.log('\n-- order-save --');
t('benutzt dieselbe Bibliothek', /require\('\.\/lib\/wartezeit'\)/.test(save), 'eigene Regeln');
t('holt die features des Betriebs', /select=features&limit=1/.test(save), 'raet');
t('entscheidet VOR dem Insert -- sonst klingelt es beim Wirt und steht eine Sekunde falsch da',
  save.indexOf('WARTEZEIT.zusage(') < save.indexOf('var r = await resilientInsert(order);'), 'zu spaet');
// Eine Vorbestellung steht in scheduled_at (Restaurant zu, Gast bestellt
// fuer spaeter) ODER in requested_time (Wunschzeit). BEIDE muessen die
// Sofort-Bestaetigung sperren -- sonst verspricht die Mail "in 25 Minuten"
// fuer ein Essen von morgen.
t('Vorbestellungen gehen den normalen Weg',
  /!!\(order\.requested_time \|\| order\.scheduled_at\)/.test(save), 'auch Vorbestellungen');
t('das gilt auch fuer PayPal',
  /!!\(order\.requested_time \|\| order\.scheduled_at\)/.test(pp), 'PayPal verspricht 25 Minuten');
t('und die Bibliothek sperrt wirklich',
  W.zusage(['prep_auto', 'prep_pickup:25'], 'pickup', true, Date.now()) === null, 'sagt trotzdem zu');
['accepted_at', 'estimated_minutes', 'estimated_time'].forEach(function (sp) {
    t('ALLOWED laesst ' + sp + ' durch', new RegExp("'" + sp + "'").test(save.slice(save.indexOf('var ALLOWED'), save.indexOf('];', save.indexOf('var ALLOWED')))), 'wird verworfen');
});
t('faellt die Abfrage aus, wird NICHT bestaetigt',
  /return null;\s*\n\s*\}\s*\n\}/.test(save.slice(save.indexOf('async function hausFeatures')))
  && /\(feats === null\) \? null/.test(save), 'raet bei Stoerung eine Zusage');
t('und das bleibt nicht still', /console\.warn\('\[order-save\] features nicht ladbar/.test(save), 'stiller Ausfall');
t('der Browser erfaehrt es', /sofort_bestaetigt: !!zusage/.test(save), 'Gast sieht etwas anderes als die Mail');

console.log('\n-- PayPal geht denselben Weg --');
t('auch dort dieselbe Bibliothek', /require\('\.\/lib\/wartezeit'\)/.test(pp), 'PayPal-Gaeste ohne Zusage');
t('und dieselbe Entscheidung', /WARTEZEIT\.zusage\(/.test(pp), 'fehlt');
t('vor dem Schreiben der Bestellung',
  pp.indexOf('WARTEZEIT.zusage(') < pp.indexOf('var ins = await bestellungSchreiben(nutz);'), 'zu spaet');

// ---- 3. Die Mail ------------------------------------------------------
console.log('\n-- Die Mail --');
t('order-email kennt die Bibliothek', /require\('\.\/lib\/wartezeit'\)/.test(mail), 'eigene Regeln');
t('fehlt die Zahl in der Bestellung, gilt die Einstellung des Wirts',
  /min = WARTEZEIT\.minuten\(rest\.features, o\.order_type\)/.test(mail), 'Mail bleibt ohne Zahl');
t('aber nur, wenn er ueberhaupt eine Zusage machen will',
  /WARTEZEIT\.an\(rest\.features\)/.test(mail), 'erfindet eine Zeit');
t('dafuer werden die features auch geladen',
  /select=name,street,city,phone,features/.test(mail), 'features fehlen im select');
t('schon bestaetigt -> Bestaetigungsmail statt "warte auf Bestaetigung"',
  /var sofort = String\(order\.status \|\| ''\)\.toLowerCase\(\) === 'accepted';/.test(mail)
  && /buildAcceptedEmail\(order, restOrder\)/.test(mail), 'Gast liest, er solle warten');
t('und der Stempel wird beansprucht, damit die Mail nicht zweimal kommt',
  /accepted_email_sent_at=is\.null/.test(mail.slice(mail.indexOf('var sofort = String(order.status'))), 'zwei Mails');

// Der Text muss die Minuten wirklich nennen -- die Funktion ausfuehren.
var vonM = mail.indexOf('function buildAcceptedEmail(');
var bisM = mail.indexOf('function buildReservationEmail(');
t('buildAcceptedEmail laesst sich herausschneiden', vonM > 0 && bisM > vonM, vonM + '/' + bisM);
var mWelt = {};
vm.createContext(mWelt);
vm.runInContext(
    'var WARTEZEIT = ' + JSON.stringify(null) + ';' +
    'function esc(s){return String(s==null?"":s);}' +
    mail.slice(vonM, bisM) + '; this.bau = buildAcceptedEmail;', mWelt);
// WARTEZEIT echt einsetzen statt null
mWelt.WARTEZEIT = W;
var m1 = mWelt.bau({ order_number: '7', order_type: 'pickup', customer_name: 'Ibo' },
                   { name: 'Pronto', features: ['prep_pickup:25'] });
t('Abholung ohne gespeicherte Zahl: 25 Minuten stehen in der Mail',
  /<strong>25 Minuten<\/strong>/.test(m1.html), m1.html.slice(m1.html.indexOf('Moin'), m1.html.indexOf('Moin') + 200));
var m2 = mWelt.bau({ order_number: '8', order_type: 'delivery' },
                   { name: 'Pronto', features: ['prep_delivery:60'] });
t('Lieferung: 60 Minuten stehen in der Mail', /<strong>60 Minuten<\/strong>/.test(m2.html), 'fehlt');
t('und es steht "bei dir", nicht "abholen"', /bei dir/.test(m2.html) && !/abholen/.test(m2.html), 'falscher Satz');
var m3 = mWelt.bau({ order_number: '9', order_type: 'pickup' },
                   { name: 'Pronto', features: ['prep_off', 'prep_pickup:25'] });
t('Zusage ausgeschaltet: KEINE erfundene Zahl in der Mail',
  !/Minuten<\/strong>/.test(m3.html) && /bereitet deine Bestellung jetzt zu/.test(m3.html), 'erfindet 25 Minuten');
var m4 = mWelt.bau({ order_number: '10', order_type: 'pickup', estimated_minutes: 40 },
                   { name: 'Pronto', features: ['prep_pickup:25'] });
t('steht eine Zahl in der Bestellung, gewinnt DIE -- der Wirt hat sie so zugesagt',
  /<strong>40 Minuten<\/strong>/.test(m4.html), 'Einstellung ueberschreibt die Zusage');

// ---- 4. Der Schalter im Dashboard -------------------------------------
console.log('\n-- Der Schalter --');
t('es gibt ihn', /id="settingPrepAuto"/.test(h), 'fehlt');
t('er ist NICHT vorangekreuzt', !/id="settingPrepAuto"[^>]*\schecked/.test(h), 'jeder Betrieb waere sofort dabei');
t('daneben steht, was das bedeutet',
  /nicht mehr ablehnen/.test(h) && /Vorbestellungen/.test(h), 'Wirt weiss nicht, was er abgibt');
t('gespeichert wird prep_auto', /features\.push\('prep_auto'\)/.test(h), 'wird nie gespeichert');
t('fehlt das Kaestchen, gilt AUS',
  /getElementById\('settingPrepAuto'\)\?\.checked === true/.test(h), 'ein unsichtbarer Schalter winkt durch');
t('alte Eintraege werden vorher entfernt -- sonst sammeln sich Karteileichen',
  /String\(f\) !== 'prep_auto'/.test(h), 'prep_auto doppelt sich');
t('beim Oeffnen wird der Stand geladen',
  /autoEl\.checked = sofortBestaetigen\(restaurant\)/.test(h), 'steht immer auf aus');
t('sofortBestaetigen liest dasselbe Merkmal wie der Server',
  /feats\.indexOf\('prep_auto'\) >= 0/.test(h), 'zwei Regeln');

// ---- 5. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!cm, 'keine gefunden');
t('sie ist mindestens 34', !!cm && Number(cm[1]) >= 34, cm ? cm[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
