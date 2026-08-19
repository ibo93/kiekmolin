// Prueft, was der oeffentliche Schluessel (anon key) in der Datenbank darf.
//
// Warum es dieses Werkzeug gibt: Der anon key steht im Quelltext von
// index.html -- das ist so vorgesehen und kein Fehler. Er ist aber nur so
// wenig wert, wie die Datenbank ihm erlaubt. Ohne Row Level Security (RLS)
// ist er ein Generalschluessel: jeder, der "Seitenquelltext anzeigen"
// drueckt, kann damit alles lesen, was die Tabelle hergibt -- Namen,
// Telefonnummern, E-Mail-Adressen, Lieferadressen.
//
// Dieses Werkzeug beantwortet die Frage, die man sonst nur raten kann:
// WELCHE Tabelle steht wirklich offen?
//
//   node tools/rls-pruefen.js
//
// Es liest nichts Persoenliches aus. Die Lese-Probe holt bewusst
// "limit=0" -- also keine einzige Zeile, nur die Anzahl aus dem
// Content-Range-Kopf. Damit steht fest, DASS gelesen werden koennte,
// ohne dass Gaestedaten durch die Leitung gehen.
//
// Die Schreib-Proben aendern nichts. Sie schicken ein UPDATE und ein
// DELETE mit einem Filter auf eine ausgedachte ID, die es garantiert
// nicht gibt. Trifft der Filter keine Zeile, passiert nichts -- die
// Antwort verraet trotzdem, ob die Datenbank es erlaubt haette.
//
// Nicht geprueft wird INSERT. Dafuer gibt es keine ungefaehrliche Probe:
// jedes Einfuegen, das die Datenbank durchlaesst, hinterlaesst eine
// Zeile. Auf einer Produktivdatenbank ist das den Erkenntnisgewinn nicht
// wert -- zumal anonymes INSERT bei orders ohnehin gewollt ist, sonst
// koennte kein Gast bestellen.

var fs = require('fs');
var path = require('path');

// ---------------------------------------------------------------------
// Welche Tabellen es gibt und wie schlimm es waere
// ---------------------------------------------------------------------
// "person" = da stehen Daten von echten Menschen drin. Ein offener
// Lesezugriff darauf ist eine meldepflichtige Datenpanne nach Art. 33
// DSGVO, nicht blosses Aergernis.
// "betrieb" = Geschaeftsdaten des Wirts. Aergerlich, aber aus dem
// Backup wiederherstellbar.
// "oeffentlich" = steht ohnehin fuer jeden Gast auf der Seite. Lesen
// ist hier kein Problem, Schreiben sehr wohl.

var TABELLEN = [
  { name: 'customers',          stufe: 'person',      was: 'Inhaber und Gaeste: Name, E-Mail, Telefon' },
  { name: 'orders',             stufe: 'person',      was: 'Bestellungen mit Name, Telefon, Lieferadresse' },
  { name: 'order_items',        stufe: 'person',      was: 'Was genau bestellt wurde' },
  { name: 'reservations',       stufe: 'person',      was: 'Name, Telefon, und wann jemand nicht zu Hause ist' },
  { name: 'loyalty_stamps',     stufe: 'person',      was: 'Treuepunkte je Gast' },
  { name: 'reward_redemptions', stufe: 'person',      was: 'Eingeloeste Praemien je Gast' },
  { name: 'push_subscriptions', stufe: 'person',      was: 'Push-Kanaele der Geraete' },
  { name: 'coupons',            stufe: 'person',      was: 'Gutscheine, teils personengebunden' },
  { name: 'activity_log',       stufe: 'person',      was: 'Wer wann was getan hat' },
  { name: 'presence',           stufe: 'person',      was: 'Wer gerade online ist' },
  { name: 'reviews',            stufe: 'person',      was: 'Bewertungen mit Verfasser' },
  { name: 'review_photos',      stufe: 'person',      was: 'Fotos zu Bewertungen' },
  { name: 'helpful_votes',      stufe: 'person',      was: 'Wer welche Bewertung hilfreich fand' },

  { name: 'restaurants',        stufe: 'betrieb',     was: 'Stammdaten der Betriebe' },
  { name: 'menu_items',         stufe: 'betrieb',     was: 'Gerichte und Preise' },
  { name: 'menu_categories',    stufe: 'betrieb',     was: 'Kategorien der Karte' },
  { name: 'menu_options',       stufe: 'betrieb',     was: 'Extras' },
  { name: 'menu_option_groups', stufe: 'betrieb',     was: 'Extra-Gruppen' },
  { name: 'menu_cross_sells',   stufe: 'betrieb',     was: 'Passt-dazu-Vorschlaege' },
  { name: 'daily_specials',     stufe: 'betrieb',     was: 'Tagesangebote' },
  { name: 'offers',             stufe: 'betrieb',     was: 'Angebote' },
  { name: 'rewards',            stufe: 'betrieb',     was: 'Praemien-Katalog' },
  { name: 'restaurant_tables',  stufe: 'betrieb',     was: 'Tischplan' },
  { name: 'tables',             stufe: 'betrieb',     was: 'Tischplan (alt)' },
  { name: 'restaurant_events',  stufe: 'betrieb',     was: 'Ereignisse des Betriebs' },
  { name: 'events',             stufe: 'betrieb',     was: 'Veranstaltungen' },
  { name: 'settings',           stufe: 'betrieb',     was: 'Einstellungen' },
  { name: 'target_stats',       stufe: 'betrieb',     was: 'Zielwerte' },
  { name: 'jobs',               stufe: 'betrieb',     was: 'Stellenanzeigen' },

  { name: 'google_reviews',     stufe: 'oeffentlich', was: 'Google-Bewertungen' },
  { name: 'attractions',        stufe: 'oeffentlich', was: 'Ausflugsziele' },
  { name: 'accommodations',     stufe: 'oeffentlich', was: 'Unterkuenfte' },
  { name: 'tourist_routes',     stufe: 'oeffentlich', was: 'Routen' }
];

// Eine ID, die es garantiert nicht gibt. Damit trifft jeder Schreib-Filter
// null Zeilen -- und aendert folglich nichts.
var GEISTER_UUID = '00000000-0000-0000-0000-000000000000';
var GEISTER_ZAHL = '-1';

// ---------------------------------------------------------------------
// Zugangsdaten aus index.html lesen
// ---------------------------------------------------------------------
// Absichtlich aus dem Quelltext und nicht aus einer .env: geprueft werden
// soll genau der Schluessel, den auch jeder Besucher der Seite sieht.

function schluesselLesen(htmlPfad) {
  var html = fs.readFileSync(htmlPfad, 'utf8');
  var url = html.match(/var SUPABASE_URL\s*=\s*'([^']+)'/);
  var key = html.match(/var SUPABASE_KEY\s*=\s*'([^']+)'/);
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_KEY nicht in ' + htmlPfad + ' gefunden.');
  }
  return { url: url[1], key: key[1] };
}

// ---------------------------------------------------------------------
// Die Antwort der Datenbank in ein Urteil uebersetzen
// ---------------------------------------------------------------------
// PostgREST antwortet auf eine von RLS abgelehnte Abfrage mit 401 oder
// 403 und dem Postgres-Code 42501. Kommt dagegen 200/204 zurueck, hat die
// Datenbank es erlaubt.
//
// Der haeufigste Irrtum bei so einer Pruefung: ein 403 fuer bare Muenze
// nehmen, obwohl es von einem Proxy und nicht von Supabase kam. Deshalb
// gilt eine Antwort nur dann als echt, wenn sie wie PostgREST aussieht --
// also JSON ist oder einen PostgREST-Kopf traegt.

function urteil(antwort) {
  var s = antwort.status;

  if (!antwort.vonPostgrest) {
    return { wert: 'unklar', grund: 'Antwort kam nicht von Supabase (HTTP ' + s + ') -- Netzsperre oder Proxy dazwischen' };
  }
  if (s === 200 || s === 204 || s === 206) {
    return { wert: 'offen', grund: 'HTTP ' + s };
  }
  if (s === 401 || s === 403) {
    return { wert: 'zu', grund: 'HTTP ' + s + (antwort.code ? ' (' + antwort.code + ')' : '') };
  }
  if (s === 400 || s === 404) {
    // 400 kommt z.B. wenn die Spalte id einen anderen Typ hat, 404 wenn
    // es die Tabelle nicht gibt. Beides sagt nichts ueber RLS aus.
    return { wert: 'unklar', grund: 'HTTP ' + s + (antwort.nachricht ? ': ' + antwort.nachricht : '') };
  }
  return { wert: 'unklar', grund: 'HTTP ' + s };
}

// Aus dem Content-Range-Kopf ("0-0/1234") die Gesamtzahl herausholen.
function anzahlAus(contentRange) {
  if (!contentRange) return null;
  var teil = String(contentRange).split('/')[1];
  if (!teil || teil === '*') return null;
  var z = parseInt(teil, 10);
  return isNaN(z) ? null : z;
}

// ---------------------------------------------------------------------
// Die einzelnen Proben
// ---------------------------------------------------------------------

async function anfrage(hole, url, optionen) {
  var res = await hole(url, optionen);
  var text = '';
  try { text = await res.text(); } catch (e) { text = ''; }

  var typ = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  var range = (res.headers && res.headers.get && res.headers.get('content-range')) || '';
  // PostgREST antwortet mit JSON oder liefert bei 204 einen Content-Range.
  var vonPostgrest = /json/i.test(typ) || !!range || res.status === 204;

  var code = null, nachricht = null;
  if (/json/i.test(typ) && text) {
    try {
      var j = JSON.parse(text);
      code = j.code || null;
      nachricht = j.message || null;
    } catch (e) { /* kein JSON -- dann bleibt es dabei */ }
  }

  return { status: res.status, vonPostgrest: vonPostgrest, range: range, code: code, nachricht: nachricht };
}

async function tabellePruefen(hole, zugang, tabelle) {
  var kopf = { 'apikey': zugang.key, 'Authorization': 'Bearer ' + zugang.key };
  var basis = zugang.url + '/rest/v1/' + tabelle.name;

  // 1. Lesen -- limit=0 holt keine Zeile, nur die Anzahl.
  var lese = await anfrage(hole, basis + '?select=*&limit=0', {
    method: 'GET',
    headers: Object.assign({ 'Prefer': 'count=exact' }, kopf)
  });

  // 2. Aendern -- Filter auf eine ID, die es nicht gibt.
  var aendern = await anfrage(hole, basis + '?id=eq.' + GEISTER_UUID, {
    method: 'PATCH',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, kopf),
    body: JSON.stringify({ id: GEISTER_UUID })
  });
  // Hat die Tabelle eine Zahlen-ID, scheitert der UUID-Filter am Typ.
  // Dann zaehlt der zweite Versuch.
  if (aendern.status === 400 && /invalid input syntax|uuid/i.test(aendern.nachricht || '')) {
    aendern = await anfrage(hole, basis + '?id=eq.' + GEISTER_ZAHL, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, kopf),
      body: JSON.stringify({ id: GEISTER_ZAHL })
    });
  }

  // 3. Loeschen -- ebenfalls ins Leere.
  var loeschen = await anfrage(hole, basis + '?id=eq.' + GEISTER_UUID, {
    method: 'DELETE',
    headers: Object.assign({ 'Prefer': 'return=minimal' }, kopf)
  });
  if (loeschen.status === 400 && /invalid input syntax|uuid/i.test(loeschen.nachricht || '')) {
    loeschen = await anfrage(hole, basis + '?id=eq.' + GEISTER_ZAHL, {
      method: 'DELETE',
      headers: Object.assign({ 'Prefer': 'return=minimal' }, kopf)
    });
  }

  return {
    tabelle: tabelle,
    lesen:   urteil(lese),
    anzahl:  anzahlAus(lese.range),
    aendern: urteil(aendern),
    loeschen: urteil(loeschen)
  };
}

// ---------------------------------------------------------------------
// Bewertung: was davon ist wirklich schlimm
// ---------------------------------------------------------------------

function istDatenpanne(zeile) {
  return zeile.tabelle.stufe === 'person' && zeile.lesen.wert === 'offen';
}

function istFremdgesteuert(zeile) {
  // Offenes Schreiben ist auf JEDER Stufe schlimm -- auch bei einer
  // Speisekarte. Wer Preise aendern kann, kann Schaden anrichten.
  return zeile.aendern.wert === 'offen' || zeile.loeschen.wert === 'offen';
}

function bericht(zeilen) {
  var pannen = zeilen.filter(istDatenpanne);
  var schreib = zeilen.filter(istFremdgesteuert);
  var unklar = zeilen.filter(function (z) {
    return z.lesen.wert === 'unklar' && z.aendern.wert === 'unklar';
  });
  return { pannen: pannen, schreib: schreib, unklar: unklar };
}

// ---------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------

var ZEICHEN = { offen: 'OFFEN', zu: 'zu', unklar: '?' };

function ausgeben(zeilen, schreibe) {
  var stufen = [
    ['person', 'PERSONENDATEN -- hier waere ein offener Zugriff eine meldepflichtige Datenpanne'],
    ['betrieb', 'BETRIEBSDATEN -- aergerlich und aus dem Backup zu heilen'],
    ['oeffentlich', 'OEFFENTLICHES -- Lesen ist hier gewollt, Schreiben nicht']
  ];

  stufen.forEach(function (s) {
    var teil = zeilen.filter(function (z) { return z.tabelle.stufe === s[0]; });
    if (!teil.length) return;
    schreibe('');
    schreibe(s[1]);
    schreibe('-'.repeat(s[1].length));
    teil.forEach(function (z) {
      var zahl = z.anzahl === null ? '' : ' (' + z.anzahl + ' Zeilen)';
      schreibe(
        '  ' + z.tabelle.name.padEnd(20) +
        ' lesen: ' + ZEICHEN[z.lesen.wert].padEnd(6) +
        ' aendern: ' + ZEICHEN[z.aendern.wert].padEnd(6) +
        ' loeschen: ' + ZEICHEN[z.loeschen.wert].padEnd(6) +
        zahl
      );
      if (z.lesen.wert === 'unklar') schreibe('      ' + z.lesen.grund);
    });
  });

  var b = bericht(zeilen);

  schreibe('');
  schreibe('='.repeat(70));

  if (b.unklar.length === zeilen.length) {
    schreibe('KEIN URTEIL MOEGLICH.');
    schreibe('');
    schreibe('Keine einzige Antwort kam von Supabase. Das heisst NICHT, dass alles');
    schreibe('dicht ist -- es heisst, dass diese Umgebung gar nicht erst zur');
    schreibe('Datenbank durchkommt. Fuehr die Pruefung von einem Rechner mit');
    schreibe('freiem Netzzugang aus.');
    return 3;
  }

  if (b.pannen.length) {
    schreibe('BEFUND: ' + b.pannen.length + ' Tabelle(n) mit Personendaten sind fuer jeden lesbar.');
    schreibe('');
    b.pannen.forEach(function (z) {
      schreibe('  - ' + z.tabelle.name + ': ' + z.tabelle.was +
        (z.anzahl !== null ? ' -- ' + z.anzahl + ' Datensaetze' : ''));
    });
    schreibe('');
    schreibe('Dafuer braucht es keinen Angreifer. Der Schluessel steht in index.html,');
    schreibe('die Abfrage ist eine Zeile im Browser. Wird das ausgenutzt, ist es eine');
    schreibe('Datenpanne nach Art. 33 DSGVO: 72 Stunden Meldefrist an die');
    schreibe('Landesbeauftragte fuer Datenschutz in Niedersachsen.');
  } else {
    schreibe('BEFUND: Keine Tabelle mit Personendaten ist offen lesbar.');
  }

  if (b.schreib.length) {
    schreibe('');
    schreibe('AUSSERDEM: ' + b.schreib.length + ' Tabelle(n) lassen sich von aussen aendern oder loeschen:');
    b.schreib.forEach(function (z) {
      schreibe('  - ' + z.tabelle.name + ' (' + z.tabelle.was + ')');
    });
  }

  if (b.unklar.length) {
    schreibe('');
    schreibe('Ohne Urteil geblieben: ' + b.unklar.map(function (z) { return z.tabelle.name; }).join(', '));
  }

  return (b.pannen.length || b.schreib.length) ? 2 : 0;
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------

async function lauf(optionen) {
  var o = optionen || {};
  var hole = o.hole || globalThis.fetch;
  var htmlPfad = o.html || path.join(__dirname, '..', 'index.html');
  var schreibe = o.schreibe || console.log;
  var tabellen = o.tabellen || TABELLEN;

  var zugang = o.zugang || schluesselLesen(htmlPfad);

  schreibe('Pruefe ' + tabellen.length + ' Tabellen auf ' + zugang.url);
  schreibe('mit dem oeffentlichen Schluessel aus index.html.');
  schreibe('Es wird nichts geaendert und keine einzige Gastzeile gelesen.');

  var zeilen = [];
  for (var i = 0; i < tabellen.length; i++) {
    zeilen.push(await tabellePruefen(hole, zugang, tabellen[i]));
  }

  var code = ausgeben(zeilen, schreibe);
  return { zeilen: zeilen, code: code };
}

module.exports = {
  TABELLEN: TABELLEN,
  schluesselLesen: schluesselLesen,
  urteil: urteil,
  anzahlAus: anzahlAus,
  istDatenpanne: istDatenpanne,
  istFremdgesteuert: istFremdgesteuert,
  bericht: bericht,
  tabellePruefen: tabellePruefen,
  lauf: lauf
};

if (require.main === module) {
  lauf({}).then(function (e) { process.exit(e.code); })
    .catch(function (e) { console.error('Fehler: ' + e.message); process.exit(1); });
}
