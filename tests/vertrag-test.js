// VERTRAEGE -- Nutzungsvertrag, AVV und die Unterschrift auf dem Bildschirm.
//
// WARUM ES DAS GIBT
// Am 17.09.2026 nachgesehen: fuer die Wirte, die 59,90 EUR im Monat zahlen,
// gab es KEINEN Vertrag. Und "Auftragsverarbeitung" kam im ganzen Projekt
// nicht vor -- obwohl wir Gastdaten im Auftrag der Betriebe verarbeiten und
// Art. 28 DSGVO dafuer einen schriftlichen Vertrag verlangt.
//
// WOGEGEN DIESER TEST SCHUETZT
// Der schlimmste Fall ist nicht "die Seite sieht kaputt aus". Der schlimmste
// Fall ist: man sitzt beim Wirt, es ist eng, und er unterschreibt einen
// ungeprueften Entwurf mit "[[GERICHTSSTAND: Ort]]" darin. Oder eine leere
// Unterschrift geht als gueltig durch.
//
// Der Test FUEHRT die Funktionen aus, mit nachgebautem DOM und crypto.

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var crypto = require('crypto');

var QUELLE = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var SQL    = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '32-vertrag.sql'), 'utf8');

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

function schneide(name) {
    // ERST nach "async function" suchen, dann nach "function".
    //
    // Andersherum findet indexOf das "function" MITTEN IN "async function"
    // und schneidet das async weg -- dann stirbt der Test an
    // "await is only valid in async functions" statt zu pruefen.
    var i = QUELLE.indexOf('async function ' + name + '(');
    if (i < 0) i = QUELLE.indexOf('function ' + name + '(');
    if (i < 0) throw new Error(name + ' nicht gefunden');
    var tiefe = 0;
    for (var k = QUELLE.indexOf('{', i); k < QUELLE.length; k++) {
        if (QUELLE[k] === '{') tiefe++;
        else if (QUELLE[k] === '}') { tiefe--; if (tiefe === 0) return QUELLE.slice(i, k + 1); }
    }
    throw new Error(name + ' nicht geschlossen');
}
function ohneKommentare(code) {
    return String(code).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

// ---- Die Logik in einen eigenen Raum holen ---------------------------
var ctx = {
    TextEncoder: TextEncoder,
    Uint8Array: Uint8Array,
    Array: Array,
    // DIE ATTRAPPE MUSS DEN ALGORITHMUS WIRKLICH BENUTZEN.
    //
    // Erst rechnete sie stur SHA-256 und ignorierte alg. Die Gegenprobe
    // "Code nimmt SHA-1 statt SHA-256" blieb deshalb GRUEN -- die Attrappe
    // hat den Fehler stillschweigend repariert. Eine Attrappe, die klueger
    // ist als der Code, prueft nichts.
    crypto: { subtle: { digest: async function (alg, daten) {
        var name = String(alg && alg.name ? alg.name : alg).toLowerCase().replace('-', '');
        return crypto.createHash(name).update(Buffer.from(daten)).digest().buffer;
    } } },
    console: console
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext([
    schneide('vertragPlatzhalter'),
    schneide('vertragFreigabeGrund'),
    schneide('vertragAbdruck'),
    schneide('vertragEingabeGrund')
].join('\n'), ctx);

function fassung(zusatz) {
    var f = { id:'f1', art:'dienstleistung', fassung:'2026-09-1',
              inhalt:'NUTZUNGSVERTRAG\n\n§ 1 Gegenstand …', status:'aktiv' };
    Object.keys(zusatz || {}).forEach(function (k) { f[k] = zusatz[k]; });
    return f;
}

console.log('\n-- 1. EIN ENTWURF DARF NICHT UNTERSCHRIEBEN WERDEN --');

t('eine freigeschaltete, saubere Fassung geht',
  ctx.vertragFreigabeGrund(fassung()) === null, ctx.vertragFreigabeGrund(fassung()));

t('status "entwurf" wird abgelehnt',
  /Entwurf/.test(ctx.vertragFreigabeGrund(fassung({ status:'entwurf' })) || ''),
  ctx.vertragFreigabeGrund(fassung({ status:'entwurf' })));

t('status "abgeloest" wird ebenfalls abgelehnt',
  ctx.vertragFreigabeGrund(fassung({ status:'abgeloest' })) !== null);

t('eine Fassung, die es nicht gibt, wird abgelehnt',
  ctx.vertragFreigabeGrund(null) !== null);

t('ein leerer Vertragstext wird abgelehnt',
  /leer/.test(ctx.vertragFreigabeGrund(fassung({ inhalt:'   ' })) || ''),
  ctx.vertragFreigabeGrund(fassung({ inhalt:'   ' })));

console.log('\n-- 2. PLATZHALTER SIND EIN HARTES NEIN --');
//
// Das ist der Fall, der wehtut: Status steht auf aktiv, aber im Text steht
// noch "[[GERICHTSSTAND: Ort]]". Ohne diese Sperre unterschreibt ein Wirt
// ein Papier mit eckigen Klammern drin.
var mitLuecke = fassung({ inhalt: 'Gerichtsstand ist [[GERICHTSSTAND: Ort]].' });
t('aktiv, aber mit Platzhalter -> trotzdem nein',
  ctx.vertragFreigabeGrund(mitLuecke) !== null, ctx.vertragFreigabeGrund(mitLuecke));
t('und der Grund nennt den Platzhalter beim Namen',
  /GERICHTSSTAND/.test(ctx.vertragFreigabeGrund(mitLuecke) || ''),
  ctx.vertragFreigabeGrund(mitLuecke));

t('mehrere Platzhalter werden alle gefunden',
  ctx.vertragPlatzhalter('[[A]] Text [[B]] mehr [[C]]').length === 3,
  ctx.vertragPlatzhalter('[[A]] Text [[B]] mehr [[C]]').length);
t('ein sauberer Text hat keine', ctx.vertragPlatzhalter('Ganz normaler Text.').length === 0);
t('einzelne eckige Klammern sind kein Platzhalter',
  ctx.vertragPlatzhalter('siehe Anlage [1] und Ziffer [2]').length === 0);

console.log('\n-- 3. DER ABDRUCK BELEGT, WAS DASTAND --');
//
// SHA-256 ueber den angezeigten Text. Ohne ihn liesse sich spaeter nur
// sagen "Fassung 1" -- und wenn jemand den Text dieser Fassung aendert,
// faellt das niemandem auf.
(async function () {
    var a = await ctx.vertragAbdruck('Vertragstext');
    var b = await ctx.vertragAbdruck('Vertragstext');
    var c = await ctx.vertragAbdruck('Vertragstext.');
    t('derselbe Text ergibt denselben Abdruck', a === b);
    t('ein Punkt mehr ergibt einen anderen', a !== c);
    t('der Abdruck ist ein SHA-256 in hex', /^[0-9a-f]{64}$/.test(a), a);
    t('er stimmt mit einem unabhaengig gerechneten ueberein',
      a === crypto.createHash('sha256').update('Vertragstext', 'utf8').digest('hex'), a);

    console.log('\n-- 4. KEINE LEERE UNTERSCHRIFT --');
    t('ohne Strich im Feld geht nichts',
      /unterschreiben/.test(ctx.vertragEingabeGrund('Klaas Jansen', false) || ''),
      ctx.vertragEingabeGrund('Klaas Jansen', false));
    t('ohne Namen geht nichts',
      /Namen/.test(ctx.vertragEingabeGrund('', true) || ''), ctx.vertragEingabeGrund('', true));
    t('nur Leerzeichen sind kein Name',
      ctx.vertragEingabeGrund('   ', true) !== null);
    t('ein zu kurzer Name wird abgelehnt', ctx.vertragEingabeGrund('Ja', true) !== null);
    t('Name und Strich zusammen gehen durch',
      ctx.vertragEingabeGrund('Klaas Jansen', true) === null,
      ctx.vertragEingabeGrund('Klaas Jansen', true));

    console.log('\n-- 5. DAS UNTERSCHRIFTENFELD --');
    //
    // Nachgebaute Leinwand. Wichtig ist nur eins: solange niemand gezogen
    // hat, muss gemalt() false sein -- sonst geht ein leeres weisses Bild
    // als Unterschrift durch.
    var gezeichnet = [];
    var horcher = {};
    var leinwand = {
        width: 0, height: 0,
        getBoundingClientRect: function () { return { width: 400, height: 170, left: 0, top: 0 }; },
        getContext: function () {
            return { setTransform: function(){}, fillRect: function(){}, beginPath: function(){},
                     moveTo: function(){}, lineTo: function(){}, stroke: function(){ gezeichnet.push(1); },
                     fillStyle:'', lineWidth:0, lineCap:'', lineJoin:'', strokeStyle:'' };
        },
        addEventListener: function (art, fn) { horcher[art] = fn; },
        setPointerCapture: function () {},
        toDataURL: function () { return 'data:image/png;base64,AAAA'; }
    };
    var uctx = { window: { devicePixelRatio: 2 }, console: console };
    uctx.window.window = uctx.window;
    vm.createContext(uctx);
    vm.runInContext(schneide('unterschriftFeld'), uctx);
    var feld = uctx.unterschriftFeld(leinwand);

    t('frisch geoeffnet ist nichts gemalt', feld.gemalt() === false);

    horcher.pointerdown({ pointerId:1, clientX:10, clientY:10, preventDefault:function(){} });
    horcher.pointermove({ pointerId:1, clientX:40, clientY:30, preventDefault:function(){} });
    t('nach einem Strich ist es gemalt', feld.gemalt() === true);
    t('und es wurde wirklich gezeichnet', gezeichnet.length > 0);

    horcher.pointerup({});
    feld.leeren();
    t('nach "Neu zeichnen" ist es wieder leer', feld.gemalt() === false);

    t('ein Tippen ohne Ziehen zaehlt nicht als Unterschrift', (function () {
        var f2 = uctx.unterschriftFeld(leinwand);
        horcher.pointerdown({ pointerId:2, clientX:5, clientY:5, preventDefault:function(){} });
        return f2.gemalt() === false;
    })());

    console.log('\n-- 6. DIE DATENBANK-REGELN --');
    t('beide Tabellen haben RLS an',
      (SQL.match(/enable row level security/gi) || []).length === 2,
      (SQL.match(/enable row level security/gi) || []).length);
    t('KEIN anon irgendwo -- ein Gast hat mit Vertraegen nichts zu tun',
      !/to anon/i.test(SQL));
    t('unterschreiben nur auf einer aktiven Fassung -- in der DATENBANK',
      /with check[\s\S]{0,260}status = 'aktiv'/.test(SQL));
    t('keine update-Regel auf vertraege', !/on public\.vertraege for update/i.test(SQL));
    t('keine delete-Regel auf vertraege', !/on public\.vertraege for delete/i.test(SQL));
    t('eine Unterschrift je Betrieb und Fassung',
      /unique index[\s\S]{0,140}\(restaurant_id, fassung_id\)/.test(SQL));
    t('der Abdruck ist Pflicht', /text_abdruck\s+text\s+not null/.test(SQL));

    console.log('\n-- 7. DIE TEXTE --');
    t('beide Fassungen kommen als Entwurf in die Datenbank',
      (SQL.match(/'entwurf'\)/g) || []).length === 2,
      (SQL.match(/'entwurf'\)/g) || []).length);

    var nv = (SQL.match(/NUTZUNGSVERTRAG[\s\S]*?\$text\$/) || [''])[0];
    t('der Nutzungsvertrag nennt die 59,90', /59,90 EUR/.test(nv));
    t('und sagt ausdruecklich: keine Provision',
      /KEINE Provision/.test(nv), (nv.match(/.{0,40}Provision.{0,40}/) || [''])[0]);
    t('und grenzt ab, dass der Essensvertrag zwischen Gast und Betrieb entsteht',
      /zwischen dem Gast und dem Betrieb zustande/.test(nv));
    t('und verspricht KEINE Bestellmengen',
      /KEINE bestimmte Anzahl von Bestellungen/.test(nv));
    // Am 25.09.2026 bekam der Vertragstext echte Umlaute. Die
    // Eigenschaft ist dieselbe geblieben -- monatlich kuendbar --,
    // nur das gesuchte Wort heisst jetzt richtig.
    t('und laesst monatlich kuendigen', /Kalendermonats kündigen/.test(nv));

    var avv = SQL.slice(SQL.indexOf('VERTRAG ZUR AUFTRAGSVERARBEITUNG'));
    t('der AVV nennt Art. 28 DSGVO', /Art\. 28 DSGVO/.test(avv));
    [['Gegenstand und Dauer',/1\. Gegenstand und Dauer/],
     ['Art und Zweck',      /2\. Art und Zweck/],
     ['Datenarten',         /3\. Art der personenbezogenen Daten/],
     ['Betroffene',         /4\. Kategorien betroffener Personen/],
     ['Weisungen',          /5\. Weisungen/],
     ['Vertraulichkeit',    /6\. Vertraulichkeit/],
     ['TOM nach Art. 32',   /7\. Technische und organisatorische/],
     ['Unterauftragsverarbeiter', /8\. Unterauftragsverarbeiter/],
     ['Betroffenenrechte',  /9\. Unterstützung/],
     ['Loeschung',          /10\. Löschung/],
     ['Nachweise',          /11\. Nachweise/]].forEach(function (pflicht) {
        t('AVV hat: ' + pflicht[0], pflicht[1].test(avv));
    });

    // Die Unterauftragsverarbeiter stehen im Code -- sie muessen auch im
    // AVV stehen, sonst ist die Liste unvollstaendig und der Vertrag falsch.
    ['Supabase','Netlify','Resend','Stripe','PayPal'].forEach(function (dienst) {
        t('AVV nennt ' + dienst, new RegExp(dienst).test(avv));
    });
    t('AVV regelt die Uebermittlung ausserhalb der EU',
      /Kapitel V DSGVO|Standardvertragsklauseln/.test(avv));

    console.log('\n-- 8. DER ADMIN-BEREICH --');
    var oeffnen = ohneKommentare(schneide('vertragOeffnen'));
    t('der Bereich ist der Verwaltung vorbehalten',
      /selbstcheckErlaubt\(\)/.test(ohneKommentare(schneide('openVertraege'))));
    t('beim Oeffnen wird die Freigabe geprueft',
      /vertragFreigabeGrund\(fassung\)/.test(oeffnen));
    t('ohne Freigabe erscheint gar kein Unterschriftenfeld',
      /if \(!grund\)[\s\S]{0,400}vertragUnterschrift/.test(oeffnen), 'Feld nur ohne Grund');

    var unter = ohneKommentare(schneide('vertragUnterschreiben'));
    t('und beim Tippen NOCHMAL -- zwischen Oeffnen und Tippen kann sich etwas aendern',
      /vertragFreigabeGrund\(fassung\)/.test(unter));
    t('Name und Strich werden geprueft', /vertragEingabeGrund\(name/.test(unter));
    t('der Abdruck kommt aus dem ANGEZEIGTEN Text, nicht aus einem frisch geholten',
      /getElementById\('vertragText'\)[\s\S]{0,120}vertragAbdruck\(gezeigt\)/.test(unter),
      (unter.match(/vertragAbdruck\([a-z]+\)/) || [''])[0]);
    t('gespeichert wird mit return=representation', /return=representation/.test(unter));
    t('und es wird geprueft, ob wirklich eine Zeile kam',
      /!Array\.isArray\(zeilen\) \|\| !zeilen\.length/.test(unter));

    var liste = ohneKommentare(schneide('vertragListeZeigen'));
    t('ein Ladefehler wird angezeigt, nicht als "keine Vertraege" verschluckt',
      /catch[\s\S]{0,200}nicht geladen werden/.test(liste));

    console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
    process.exit(fail === 0 ? 0 : 1);
})();
