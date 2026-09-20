// DIE SEITE FUER GASTRONOMEN -- kiekmolin.de/gastro
//
// WARUM ES SIE GIBT (19./20.09.2026): kiekmolin.de ist die Gaeste-App. Die
// sichtbare Ueberschrift der Startseite lautet "Willkommen!". Ein Wirt, der
// den Namen hoerte und nachschaute, landete in einer Bestell-App und wusste
// danach nicht, was ihm angeboten wird. Fuer den Betrieb gab es KEINE Seite
// -- und der Knopf "Restaurant kostenlos eintragen" auf ~900 Betriebsseiten
// zeigte auf ein Kontaktfenster, das nichts erklaert.
//
// ZWEI SACHEN, DIE HIER STRENG GEPRUEFT WERDEN, weil sie teuer werden:
//
//   1. Der Preis. "59,90 statt 79,90" durchgestrichen waere ein Mondpreis
//      (Paragraf 5 UWG) -- 79,90 wurde nie verlangt. Erlaubt ist die Ansage
//      des KUENFTIGEN Preises. Also: kein "statt", sondern "danach".
//   2. Der Honigtopf. Ein sichtbares Bot-Feld fuellen echte Menschen aus --
//      und dann wirft die Function ihre Anfrage still weg.
//
// Geprueft wird durch AUSFUEHREN: die Seite wird wirklich gebaut und
// gelesen, und der Briefkasten laeuft mit gestellter Post.

var fs = require('fs');
var os = require('os');
var path = require('path');
var KMI = path.join(__dirname, '..');

var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-gastro-'));
process.env.SEO_OUT_DIR = AUS;
var B = require(path.join(KMI, 'build-seo-pages.js'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function gebaut(e) {
    if (!e || !e.filename) return '';
    try { return fs.readFileSync(path.join(AUS, e.filename), 'utf8'); }
    catch (err) { return ''; }
}

var ergebnis = B.generateGastroPage();
var H = gebaut(ergebnis);

// ====================================================================
console.log('\n-- 1. Die Seite existiert und sagt in einem Satz, was es ist --');
// ====================================================================

t('die Seite wird gebaut', H.length > 2000, H.length);
t('sie liegt unter /gastro', ergebnis.url === 'https://kiekmolin.de/gastro', ergebnis.url);
t('canonical zeigt auf sich selbst',
  /<link rel="canonical" href="https:\/\/kiekmolin\.de\/gastro">/.test(H), 'fehlt');

var h1 = (H.match(/<h1[^>]*>([^<]+)</) || ['', ''])[1];
t('die Ueberschrift sagt, was der Betrieb davon hat',
  /ohne Provision/.test(h1), h1);
t('und ist nicht "Willkommen!"', h1.indexOf('Willkommen') < 0, h1);
t('der Titel traegt dieselbe Aussage',
  /<title>[^<]*ohne Provision/.test(H), (H.match(/<title>[^<]*/) || [''])[0]);

// ====================================================================
console.log('\n-- 2. Der Preis, und warum kein Streichpreis --');
// ====================================================================

var satz = B.einstiegSatz();
t('der Einstiegssatz nennt die Zahl der Plaetze',
  satz.indexOf(String(B.EINSTEIGER_PLAETZE)) > -1, satz);
t('er nennt den heutigen Preis', satz.indexOf('59,90') > -1, satz);
t('und den kuenftigen', satz.indexOf(B.PREIS_MONAT_SPAETER) > -1, satz);
t('er sagt "danach", nicht "statt"',
  /[Dd]anach/.test(satz) && !/\bstatt\b/.test(satz),
  '"statt 79,90" waere ein Mondpreis: ' + satz);
t('Bestandsschutz ist zugesagt',
  /dauerhaft/.test(satz), satz);

t('der Preis steht auf der Seite', H.indexOf('59,90') > -1, 'fehlt');
t('der kuenftige Preis auch', H.indexOf('79,90') > -1, 'fehlt');
t('nirgends ein durchgestrichener Preis',
  !/<s>|<del>|text-decoration:\s*line-through/.test(H), 'da ist ein Streichpreis');
t('die Provision steht dabei', /0 % Provision/.test(H), 'fehlt');

// Ibo am 20.09.2026 beim Lesen: "es steht nur fuer bestellen, nicht fuer
// reservieren". Ein Gasthaus ohne Lieferung las daraus, der Preis betreffe
// es nicht.
t('der Preis gilt sichtbar auch fuer Reservierungen',
  /egal wie viel bestellt oder reserviert wird/.test(H),
  (H.match(/egal wie viel[^<.]{0,40}/) || [''])[0]);
t('die Reservierung steht auch in der Kurzbeschreibung fuer Google',
  /name="description"[^>]*Tischreservierung/.test(H),
  (H.match(/name="description" content="[^"]{0,120}/) || [''])[0]);

// Nichts erfinden: keine Kundenzahl, keine Sterne.
t('keine erfundene Kundenzahl',
  !/(über|mehr als)\s+\d+\s+(Betriebe|Restaurants|Kunden)/i.test(H), 'da steht eine Zahl');
t('keine Sterne oder Bewertungen', !/★|aggregateRating/.test(H), 'Bewertung ohne Deckung');

// ====================================================================
console.log('\n-- 3. Wo er sich anmelden kann --');
// ====================================================================

t('es gibt ein Formular', /<form[^>]*id="gastroForm"/.test(H), 'kein Formular');
['betrieb', 'ort', 'name', 'kontakt', 'anliegen'].forEach(function (feld) {
    t('Feld "' + feld + '" ist da', new RegExp('name="' + feld + '"').test(H), 'fehlt');
});
t('Betrieb ist Pflicht', /name="betrieb"[^>]*required|required[^>]*name="betrieb"/.test(H), 'nicht pflicht');
t('eine Rueckmeldung ist Pflicht', /name="kontakt"[^>]*required|required[^>]*name="kontakt"/.test(H), 'nicht pflicht');
t('es schickt an den vorhandenen Briefkasten',
  /\/\.netlify\/functions\/agentur-lead/.test(H), 'schickt nirgendwo hin');
// Nicht an der Anfuehrungszeichen-Sorte festmachen -- beim Umbau wurde
// aus "gastro" ein 'gastro' und die Zusicherung war rot, obwohl sich
// nichts Inhaltliches geaendert hatte.
t('und sagt dabei, woher es kommt',
  /quelle\s*:\s*['"]gastro['"]/.test(H), 'ohne Herkunft');
t('der Datenschutz ist verlinkt', /page=datenschutz/.test(H), 'kein Hinweis');

// Viele Wirte tippen kein Formular aus. Der Anruf muss ein echter Link
// sein -- auf dem Handy drueckt man drauf und es waehlt.
t('die Telefonnummer steht auf der Seite', /0152 04132343/.test(H), 'fehlt');
t('und zwar als anwaehlbarer Link',
  /href="tel:\+4915204132343"/.test(H), 'nur Text, das Handy waehlt nichts');
t('die Nummer im Link hat keine Leerzeichen und kein fuehrendes 0',
  !/href="tel:[^"]*\s/.test(H) && !/href="tel:0/.test(H),
  (H.match(/href="tel:[^"]*"/) || [''])[0]);
t('die E-Mail ist ebenfalls anklickbar',
  /href="mailto:info@kiekmolin\.de"/.test(H), 'fehlt');

// Der Honigtopf MUSS unsichtbar sein.
var umfeld = H.slice(Math.max(0, H.indexOf('firmen_webseite') - 260), H.indexOf('firmen_webseite'));
t('es gibt einen Honigtopf', H.indexOf('firmen_webseite') > -1, 'fehlt');
t('er ist vor Screenreadern verborgen', /aria-hidden="true"/.test(umfeld), umfeld.slice(-140));

// GEAENDERT 20.09.2026. Hier stand /left:-9999px/ gegen den umgebenden
// style="". Das prueft die UMSETZUNG, nicht die Eigenschaft: mit dem
// Umbau auf eine CSS-Klasse wurde der Test rot, obwohl das Feld genauso
// unsichtbar war. Jetzt wird die Regel gesucht, die es wirklich versteckt
// -- egal ob sie inline steht oder im Stylesheet.
function verstecktDas(quelle, huelle) {
    // Die LETZTE class= vor dem Feld ist die des umschliessenden Elements.
    // Ein $-Anker geht hier nicht: der Ausschnitt endet mitten im Tag.
    var alle = huelle.match(/class="([^"]*)"/g) || [];
    var letzte = alle.length ? alle[alle.length - 1] : '';
    var klasse = (letzte.match(/class="([^"]*)"/) || ['', ''])[1].split(/\s+/)[0];
    var regel = klasse
        ? (quelle.match(new RegExp('\\.' + klasse + '\\s*\\{[^}]*\\}')) || [''])[0]
        : '';
    var text = regel + ' ' + huelle;
    return /left:\s*-9999px/.test(text) || /display:\s*none/.test(text)
        || /visibility:\s*hidden/.test(text);
}
t('und fuer Menschen unsichtbar',
  verstecktDas(H, umfeld) === true,
  'ein sichtbares Bot-Feld fuellen echte Menschen aus: ' + umfeld.slice(-140));

// ====================================================================
console.log('\n-- 3a. Stil und Skript kommen VOLLSTAENDIG an --');
// ====================================================================
// Beim Umbau auf das neue Design sind mir CSS und Skript ZWEIMAL
// abgeschnitten im Dokument gelandet -- eine Kodier-Panne beim Einsetzen.
// Die Seite sah fast normal aus, aber das Formular warf beim Absenden
// einen SyntaxError, und die halbe Gestaltung fehlte. Kein einziger Test
// hat das gemerkt, weil alle nur nach Textstuecken gesucht haben.
// Gefunden habe ich es erst im echten Browser.
var skript = (H.match(/<script>([\s\S]*?)<\/script>/) || ['', ''])[1];
t('die Seite bringt ein eigenes Skript mit', skript.length > 200, skript.length);
var skriptOk = true, skriptFehler = '';
try { new (require('vm').Script)(skript); }
catch (e) { skriptOk = false; skriptFehler = e.message; }
t('und es laesst sich fehlerfrei einlesen', skriptOk, skriptFehler);
t('es haengt am Formular', /addEventListener\("submit"|addEventListener\('submit'/.test(skript), 'kein Absende-Haken');

var stil = (H.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
t('der Stil ist vollstaendig da', stil.length > 3000, stil.length);
t('die Klammern im Stil gehen auf und zu',
  (stil.match(/\{/g) || []).length === (stil.match(/\}/g) || []).length,
  (stil.match(/\{/g) || []).length + ' auf, ' + (stil.match(/\}/g) || []).length + ' zu');
t('auch die LETZTE Regel ist drin (nichts abgeschnitten)',
  /prefers-reduced-motion/.test(stil), 'der Stil hoert vorzeitig auf');
t('die Handy-Ansicht ist dabei', /max-width:640px/.test(stil), 'keine Medienabfrage');
t('der Dunkelmodus ist dabei', /prefers-color-scheme:dark/.test(stil), 'fehlt');

// ====================================================================
console.log('\n-- 3b. Was Google und die Assistenten lesen --');
// ====================================================================
// Beim Umbau auf das neue Design war das Schema WEG: die Helfer geben ein
// Objekt zurueck, und ohne script-Rahmen stand das JSON nackt im Kopf.
// Gemerkt habe ich es nur, weil ich es von Hand ausgegeben habe -- es gab
// dafuer keine Zusicherung. Jetzt gibt es eine.
function schemaBloecke(html) {
    var re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, m, raus = [];
    while ((m = re.exec(html)) !== null) {
        try { raus.push(JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'))); }
        catch (e) { raus.push({ kaputt: m[1].slice(0, 60) }); }
    }
    return raus;
}
var schemata = schemaBloecke(H);
t('es gibt Schema-Bloecke im Kopf', schemata.length >= 2, schemata.length);
t('jeder ist gueltiges JSON', schemata.every(function (x) { return !x.kaputt; }),
  JSON.stringify(schemata.filter(function (x) { return x.kaputt; })));

var faqLd = schemata.filter(function (x) { return x['@type'] === 'FAQPage'; })[0];
t('das FAQ-Schema ist da', !!faqLd, schemata.map(function (x) { return x['@type']; }).join(','));
t('und enthaelt alle Fragen der Seite',
  !!faqLd && faqLd.mainEntity.length === B.buildGastroFaqs().length,
  faqLd && faqLd.mainEntity.length);
t('darunter die Frage nach reinen Reservierungen',
  !!faqLd && faqLd.mainEntity.some(function (f) { return /nur Reservierungen/.test(f.name); }),
  'fehlt');

var krumen = schemata.filter(function (x) { return x['@type'] === 'BreadcrumbList'; })[0];
t('der Breadcrumb ist da', !!krumen, 'fehlt');
t('und zeigt auf die Startseite', !!krumen && krumen.itemListElement[0].item === 'https://kiekmolin.de/',
  krumen && krumen.itemListElement[0].item);

// ====================================================================
console.log('\n-- 3c. Was dazukommt und was extra kostet --');
// ====================================================================
// Der Sichtbarkeits-Bericht ist ohne Aufpreis dabei, der Telefonassistent
// kostet extra. Wenn das auf der Seite verschwimmt, wird aus "alles in
// einem Preis" eine Falle -- und der Wirt merkt es erst auf der Rechnung.
function block(html, klasse) {
    var i = html.indexOf('class="' + klasse + '"');
    if (i < 0) return '';
    return html.slice(i, html.indexOf('</section>', i));
}
var kasten = block(H, 'dazu');
var extra = block(H, 'extra');

t('der Sichtbarkeits-Bericht hat einen eigenen Block', kasten.length > 200, kasten.length);
t('er ist als OHNE AUFPREIS gekennzeichnet', /Ohne Aufpreis/.test(kasten), kasten.slice(0, 160));
t('und nennt die KI-Assistenten', /KI-Assistenten/.test(kasten), 'fehlt');
t('und das Google-Profil', /Google-Profil/.test(kasten), 'fehlt');
t('und den Vergleich zum Vormonat', /Vormonat/.test(kasten), 'fehlt');
t('im Bericht-Block steht kein Preis',
  !/\d+,\d\d\s*\u20ac/.test(kasten), 'da steht ein Betrag, obwohl er nichts kostet');

t('der Telefonassistent hat einen eigenen Block', extra.length > 200, extra.length);
t('er ist als KOSTET EXTRA gekennzeichnet', /Kostet extra/.test(extra), extra.slice(0, 160));
t('mit dem Hinweis, dass er sich als Assistent zu erkennen gibt',
  /digitaler Assistent/.test(extra), 'fehlt');
t('und OHNE erfundenen Preis',
  !/\d+,\d\d\s*\u20ac/.test(extra) && !/\d+\s*\u20ac/.test(extra),
  'da steht ein Betrag, den mir niemand gesagt hat');

t('die Leistungsliste behauptet nicht mehr, ALLES sei drin',
  /im Monatspreis drin/.test(H) && !/Was hier steht, ist drin/.test(H),
  'der Satz vertraegt sich nicht mit einem Zusatz, der extra kostet');

var f = B.buildGastroFaqs();
t('es gibt eine Frage zum Bericht',
  f.some(function (x) { return /Sichtbarkeits-Bericht/.test(x.q); }), 'fehlt');
t('und eine zum Preis des Telefonassistenten',
  f.some(function (x) { return /Telefonassistent/.test(x.q); }), 'fehlt');
t('die Antwort dazu sagt klar, dass er NICHT im Monatspreis ist',
  f.some(function (x) { return /Telefonassistent/.test(x.q) && /nicht im Monatspreis/.test(x.a); }),
  'die Antwort ist nicht eindeutig');

// ====================================================================
console.log('\n-- 4. Der Weg dorthin --');
// ====================================================================

t('der Inhaber-Knopf auf den Betriebsseiten zeigt auf /gastro',
  B.PROSPECT_OWNER_CTA_URL === '/gastro', B.PROSPECT_OWNER_CTA_URL);

// Und zwar wirklich, in einer gebauten Seite.
var pros = gebaut(B.generateProspectPage(
    { name: 'Testhaus', city: 'Greetsiel', street: 'Hafenstr. 1', phone: '+4949311' }, [], []));
t('eine gebaute Betriebsseite verlinkt die Gastro-Seite',
  pros.indexOf('href="/gastro"') > -1, pros ? 'Link fehlt' : 'Seite nicht gebaut');

// Und der Slug gilt als vorhanden -- sonst liefe ein Querverweis in den
// Catch-All und Google bekaeme einen Soft-404.
// Hier stand zuerst eine Zusicherung, die die Stelligkeit einer Funktion
// und eine Konstante verglich -- also nichts. slugExists() wird jetzt
// wirklich gefragt.
B.buildAvailableSlugs([], []);
t('/gastro gilt als vorhandene Seite, auch ganz ohne Betriebe',
  B.slugExists(B.GASTRO_SLUG) === true, 'ein Querverweis liefe in den Catch-All');
t('eine erfundene Seite gilt weiterhin NICHT als vorhanden',
  B.slugExists('gibt-es-nicht') === false, 'slugExists sagt zu allem ja');

// Sitemap
var sitemap = '';
try {
    B.writeSitemap([{ url: 'https://kiekmolin.de/gastro', gastro: true },
                    { url: 'https://kiekmolin.de/la-piazza', restaurant: true }]);
    sitemap = fs.readFileSync(path.join(AUS, 'sitemap.xml'), 'utf8');
} catch (e) { sitemap = ''; }
t('die Seite steht in der Sitemap', sitemap.indexOf('/gastro</loc>') > -1, 'fehlt');
t('mit hoher Gewichtung',
  /\/gastro<\/loc>[\s\S]{0,120}<priority>0\.9<\/priority>/.test(sitemap),
  (sitemap.match(/\/gastro[\s\S]{0,120}/) || [''])[0]);

// ====================================================================
console.log('\n-- 5. Der Briefkasten, mit gestellter Post --');
// ====================================================================

function briefkasten(nutzlast, ohne) {
    var gesendet = [];
    var altFetch = global.fetch;
    var alt = {};
    ['RESEND_API_KEY', 'EMAIL_FROM', 'AGENTUR_EMAIL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'].forEach(function (k) {
        alt[k] = process.env[k];
    });
    process.env.RESEND_API_KEY = 'k'; process.env.EMAIL_FROM = 'a@b.de';
    process.env.AGENTUR_EMAIL = 'ibo@example.de';
    process.env.SUPABASE_URL = 'https://test.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon';
    (ohne || []).forEach(function (k) { delete process.env[k]; });
    delete require.cache[require.resolve(path.join(KMI, 'netlify', 'functions', 'agentur-lead.js'))];

    global.fetch = function (url, opt) {
        gesendet.push({ url: String(url), body: JSON.parse((opt || {}).body || '{}') });
        return Promise.resolve({
            ok: true, status: 200,
            json: function () { return Promise.resolve({}); },
            text: function () { return Promise.resolve('{}'); }
        });
    };
    var modul = require(path.join(KMI, 'netlify', 'functions', 'agentur-lead.js'));
    return modul.handler({ httpMethod: 'POST', body: JSON.stringify(nutzlast) })
        .then(function (e) { return { antwort: e, gesendet: gesendet }; })
        .finally(function () {
            global.fetch = altFetch;
            Object.keys(alt).forEach(function (k) {
                if (alt[k] === undefined) delete process.env[k]; else process.env[k] = alt[k];
            });
        });
}

var BASIS = { betrieb: 'Testhaus', ort: 'Greetsiel', name: 'Ibo', kontakt: 'ibo@example.de' };

(async function () {
    // a) Anfrage von /gastro
    var a = await briefkasten(Object.assign({ quelle: 'gastro' }, BASIS));
    t('die Anfrage kommt durch', a.antwort.statusCode === 200, a.antwort.statusCode);
    var mail = a.gesendet.filter(function (r) { return /resend/.test(r.url); })[0];
    var db = a.gesendet.filter(function (r) { return /rest\/v1\/anfragen/.test(r.url); })[0];
    t('eine Mail geht raus', !!mail, 'keine Mail');
    t('und sie sagt, dass es von /gastro kam',
      !!mail && /kiekmolin\.de\/gastro/.test(JSON.stringify(mail.body)), 'Herkunft fehlt in der Mail');
    t('im CRM steht dieselbe Herkunft',
      !!db && db.body.herkunft === 'kiekmolin.de/gastro', db && db.body.herkunft);

    // b) Von /check bleibt alles, wie es war
    var b = await briefkasten(Object.assign({ quelle: 'check' }, BASIS));
    var dbB = b.gesendet.filter(function (r) { return /anfragen/.test(r.url); })[0];
    t('eine Anfrage von /check bleibt /check', dbB && dbB.body.herkunft === 'kiekmolin.de/check',
      dbB && dbB.body.herkunft);

    // c) Ohne Angabe: wie frueher
    var c = await briefkasten(BASIS);
    var dbC = c.gesendet.filter(function (r) { return /anfragen/.test(r.url); })[0];
    t('ohne Herkunft gilt /check', dbC && dbC.body.herkunft === 'kiekmolin.de/check',
      dbC && dbC.body.herkunft);

    // d) Erfundene Herkunft wird NICHT durchgereicht
    var d = await briefkasten(Object.assign({ quelle: 'https://boese.de/<script>' }, BASIS));
    var dbD = d.gesendet.filter(function (r) { return /anfragen/.test(r.url); })[0];
    t('eine erfundene Herkunft landet nicht in Mail und Datenbank',
      dbD && dbD.body.herkunft === 'kiekmolin.de/check', dbD && dbD.body.herkunft);

    // e) Honigtopf -- beide Namen
    for (const feld of ['firmen_webseite', 'webseite_bestaetigung']) {
        var e = await briefkasten(Object.assign({ quelle: 'gastro' }, BASIS,
            (function () { var o = {}; o[feld] = 'http://bot.example'; return o; })()));
        t('ein Bot ueber "' + feld + '" bekommt ok und es passiert nichts',
          e.antwort.statusCode === 200 && e.gesendet.length === 0,
          'gesendet: ' + e.gesendet.length);
    }

    // f) Der Mailweg klemmt -- die Anfrage darf trotzdem NICHT verloren gehen.
    //    Vorher stand an dieser Stelle ein return VOR dem Schreiben ins CRM:
    //    fehlte eine einzige Netlify-Variable, verschwand jede Anfrage
    //    spurlos, und gemerkt haette man es erst, wenn sich jemand
    //    beschwert, dass nie eine Antwort kam.
    var mailAus = await briefkasten(Object.assign({ quelle: 'gastro' }, BASIS), ['RESEND_API_KEY']);
    t('ohne Mail-Schluessel antwortet die Function trotzdem mit 200',
      mailAus.antwort.statusCode === 200, mailAus.antwort.statusCode);
    var kOhne = JSON.parse(mailAus.antwort.body);
    t('und sagt ehrlich, dass keine Mail rausging', kOhne.mailAus === true, kOhne);
    t('die Anfrage liegt aber im CRM', kOhne.imCrm === true, kOhne);
    t('es wurde wirklich geschrieben',
      mailAus.gesendet.filter(function (r) { return /anfragen/.test(r.url); }).length === 1,
      mailAus.gesendet.map(function (r) { return r.url; }).join(', '));
    t('und keine Mail versucht',
      mailAus.gesendet.filter(function (r) { return /resend/.test(r.url); }).length === 0, 'doch');

    // g) Ohne Betrieb geht nichts
    var f = await briefkasten({ quelle: 'gastro', kontakt: 'a@b.de' });
    t('ohne Betrieb: 400 und nichts verschickt',
      f.antwort.statusCode === 400 && f.gesendet.length === 0, f.antwort.statusCode);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
