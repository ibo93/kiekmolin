'use strict';

// Betriebs-Check fuer die Neukunden-Pipeline.
//
// Bisher stand in der Pipeline nur, was ohnehin schon im Verzeichnis stand:
// Name, Ort, Telefon, "keine Website". Damit geht man nicht ins Gespraech.
// Dieser Check geht raus und SCHAUT NACH: er holt die Website des Betriebs,
// liest sie, prueft sie gegen die Punkte, an denen Gastronomen real Gaeste
// verlieren - und sagt danach in einem Satz, womit man das Telefonat eroeffnet.
//
// Ehrlichkeits-Prinzip (wie im ganzen Projekt):
//   - Es wird nur behauptet, was auf der Seite nachweisbar steht oder fehlt.
//   - Was nicht geprueft werden konnte, heisst "ungeprueft" - nie geraten.
//   - Kein Punkt wird dramatisiert: fehlende Online-Reservierung ist eine
//     Luecke, kein Weltuntergang. Wer uebertreibt, fliegt im Gespraech auf.

// ---------------------------------------------------------------- Muster ---
// Bewusst grosszuegig gefasst: lieber einmal zu viel "hat er" als dem Wirt
// im Gespraech etwas vorwerfen, das doch auf seiner Seite steht.
const MUSTER = {
  speisekarte: /speisekarte|speisenkarte|men(ü|ue)karte|unsere karte|men(ü|u)\b|gerichte/i,
  oeffnungszeiten: /(ö|oe)ffnungszeiten|ge(ö|oe)ffnet|ruhetag|mo\s*[-–]\s*(fr|so)|montag\s*[-–:]/i,
  reservierung: /reservier|tisch\s*(buchen|reservieren)|opentable|quandoo|resmio|bookatable|formitable/i,
  bestellung: /online\s*bestellen|jetzt\s*bestellen|lieferando|wolt|uber\s*eats|takeaway|warenkorb|lieferservice/i,
  social: /instagram\.com|facebook\.com|tiktok\.com/i,
  telefonKlickbar: /href\s*=\s*["']tel:/i,
  schema: /application\/ld\+json|schema\.org/i,
  viewport: /<meta[^>]+name\s*=\s*["']viewport["']/i,
  karteAlsPdf: /href\s*=\s*["'][^"']*\.pdf/i
};

// Ein einzelner Befund. "art" entscheidet ueber die Farbe in der App:
//   luecke  - hier verliert der Betrieb etwas (rot)
//   gut     - das hat er schon (gruen, wichtig fuers Gespraech: nicht alles
//             schlechtreden, sonst macht der Wirt zu)
//   offen   - konnte nicht geprueft werden (grau)
function punkt(id, art, titel, folge) {
  return { id, art, titel, folge };
}

// ------------------------------------------------------ Website beurteilen --
// Reine Funktion: HTML rein, Befunde raus. Genau deshalb laesst sie sich
// ohne Netz testen.
function pruefeHtml(html, optionen) {
  const o = optionen || {};
  const roh = String(html || '');
  const url = String(o.url || '');
  const punkte = [];

  // Der sichtbare Text - Skripte und Stile wuerden sonst falsche Treffer geben.
  const text = roh
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const alles = text + ' ' + roh; // Links und Attribute mitpruefen

  // 1. Speisekarte - der wichtigste Punkt ueberhaupt. Wer seine Karte nicht
  //    lesbar im Netz hat, kommt in KI-Empfehlungen praktisch nicht vor.
  const hatKarte = MUSTER.speisekarte.test(alles);
  const nurPdf = hatKarte && MUSTER.karteAlsPdf.test(roh) && !/€|EUR|\d+,\d{2}/.test(text);
  if (!hatKarte) {
    punkte.push(punkt('karte-fehlt', 'luecke', 'Keine Speisekarte auf der Website',
      'Wer wissen will, was es gibt, muss anrufen oder woanders schauen. Google und KI-Assistenten finden nichts, was sie empfehlen könnten.'));
  } else if (nurPdf) {
    punkte.push(punkt('karte-pdf', 'luecke', 'Speisekarte nur als PDF',
      'Ein PDF ist für Gäste am Handy unbequem und für Google und ChatGPT kaum lesbar. Die Gerichte tauchen in Suchergebnissen nicht auf.'));
  } else {
    punkte.push(punkt('karte-da', 'gut', 'Speisekarte steht auf der Website',
      'Gute Grundlage – die Frage ist, ob die Gerichte auch einzeln auffindbar sind.'));
  }

  // 2. Oeffnungszeiten - die meistgesuchte Information ueberhaupt.
  if (MUSTER.oeffnungszeiten.test(alles)) {
    punkte.push(punkt('zeiten-da', 'gut', 'Öffnungszeiten stehen auf der Seite', ''));
  } else {
    punkte.push(punkt('zeiten-fehlt', 'luecke', 'Keine Öffnungszeiten auf der Website',
      '„Hat der heute offen?" ist die häufigste Frage überhaupt. Wer die Antwort nicht findet, fährt woanders hin.'));
  }

  // 3. Reservierung und Bestellung - hier haengt direkt Umsatz dran.
  if (!MUSTER.reservierung.test(alles)) {
    punkte.push(punkt('reservierung-fehlt', 'luecke', 'Keine Online-Reservierung',
      'Abends um halb elf reserviert niemand mehr telefonisch. Wer nicht durchkommt, bucht beim Nächsten.'));
  } else {
    punkte.push(punkt('reservierung-da', 'gut', 'Reservierung ist online möglich', ''));
  }
  if (!MUSTER.bestellung.test(alles)) {
    punkte.push(punkt('bestellung-fehlt', 'luecke', 'Keine Online-Bestellung',
      'Bestellungen laufen dann über Portale mit hoher Provision – oder gar nicht.'));
  }

  // 4. Telefonnummer zum Antippen - eine Zeile Code, riesige Wirkung am Handy.
  if (!MUSTER.telefonKlickbar.test(roh)) {
    punkte.push(punkt('tel-nicht-klickbar', 'luecke', 'Telefonnummer ist am Handy nicht antippbar',
      'Die Nummer muss abgetippt werden. Jeder zusätzliche Handgriff kostet Anrufe.'));
  }

  // 5. Maschinenlesbarkeit - genau das, was die Agentur liefert.
  if (!MUSTER.schema.test(roh)) {
    punkte.push(punkt('kein-schema', 'luecke', 'Keine maschinenlesbaren Daten (Schema.org)',
      'Google und KI-Assistenten müssen raten, was der Betrieb ist, wann er offen hat und was er kocht. Empfohlen wird, wer lesbar ist.'));
  } else {
    punkte.push(punkt('schema-da', 'gut', 'Website hat maschinenlesbare Daten', ''));
  }

  // 6. Handy-Tauglichkeit - drei Viertel der Gaeste kommen vom Handy.
  if (!MUSTER.viewport.test(roh)) {
    punkte.push(punkt('nicht-mobil', 'luecke', 'Seite ist nicht fürs Handy gebaut',
      'Ohne Handy-Ansicht muss der Gast zoomen und schieben. Die meisten brechen ab.'));
  }

  // 7. Gepflegt? Eine alte Jahreszahl als einziges Datum ist ein starkes
  //    Indiz - aber eben nur ein Indiz, deshalb vorsichtig formuliert.
  const jahre = (text.match(/\b(20[0-2]\d)\b/g) || []).map(Number);
  const neuestes = jahre.length ? Math.max.apply(null, jahre) : null;
  const jetzt = o.jahr || new Date().getFullYear();
  if (neuestes && jetzt - neuestes >= 2) {
    punkte.push(punkt('veraltet', 'luecke', 'Seite wirkt ungepflegt (jüngste Jahreszahl: ' + neuestes + ')',
      'Wer eine offensichtlich alte Seite sieht, zweifelt auch an den Preisen und Öffnungszeiten.'));
  }

  // 8. Social Media - kein Muss, aber ein guter Aufhaenger fuers Gespraech.
  if (!MUSTER.social.test(roh)) {
    punkte.push(punkt('kein-social', 'luecke', 'Kein Instagram oder Facebook verlinkt',
      'Junge Gäste suchen zuerst auf Instagram. Wer dort nicht auftaucht, existiert für sie nicht.'));
  }

  // 9. Unverschluesselt - der Browser warnt den Gast persoenlich.
  if (url && url.startsWith('http://')) {
    punkte.push(punkt('kein-https', 'luecke', 'Website läuft ohne Verschlüsselung (kein https)',
      'Der Browser zeigt „Nicht sicher" an. Das schreckt ab und Google stuft die Seite ab.'));
  }

  return punkte;
}

// --------------------------------------------------------- Website holen ----
// Netz-Teil, absichtlich duenn: alles Beurteilende steckt in pruefeHtml.
async function holeWebsite(website, optionen) {
  const o = optionen || {};
  const hole = o.fetchFn || (typeof fetch === 'function' ? fetch : null);
  const roh = String(website || '').trim();
  if (!roh) return { status: 'keine', punkte: [] };
  if (!hole) return { status: 'fehler', fehler: 'Kein fetch verfuegbar', punkte: [] };
  const url = /^https?:\/\//i.test(roh) ? roh : 'https://' + roh;
  try {
    const antwort = await hole(url, { redirect: 'follow', signal: AbortSignal.timeout(o.zeitLimit || 15000) });
    if (!antwort.ok) {
      return {
        status: 'fehler', url, fehler: 'HTTP ' + antwort.status,
        punkte: [punkt('seite-kaputt', 'luecke', 'Website antwortet nicht (HTTP ' + antwort.status + ')',
          'Wer den Betrieb googelt und auf einen Fehler stößt, sucht sich einen anderen.')]
      };
    }
    const html = await antwort.text();
    const endUrl = antwort.url || url;
    return { status: 'gelesen', url: endUrl, punkte: pruefeHtml(html, { url: endUrl, jahr: o.jahr }) };
  } catch (e) {
    return {
      status: 'fehler', url, fehler: e.message,
      punkte: [punkt('seite-nicht-erreichbar', 'luecke', 'Website war nicht erreichbar',
        'Beim Test kam keine Antwort (' + e.message + '). Für Gäste sieht das genauso aus.')]
    };
  }
}

// ------------------------------------------------ Befund zusammensetzen -----
// Fuehrt Website-Pruefung, Google-Platzierung und KI-Sichtbarkeit zu EINEM
// Bild zusammen: was fehlt, was ist schon da, womit faengt man das Telefonat an.
function baueBefund(prospect, teile, optionen) {
  const p = prospect || {};
  const t = teile || {};
  const o = optionen || {};
  const punkte = [];

  if (!p.website) {
    punkte.push(punkt('keine-website', 'luecke', 'Gar keine eigene Website',
      'Google und KI-Assistenten haben nichts zu lesen. Das ist die größte Lücke – und der leichteste Einstieg.'));
  } else if (t.webseite) {
    punkte.push.apply(punkte, t.webseite.punkte || []);
  }

  // Google: taucht der Betrieb bei der wichtigsten Suche seiner Stadt auf?
  const g = t.google;
  if (g && g.status === 'gefunden') {
    punkte.push(punkt('google-platz', g.platz <= 3 ? 'gut' : 'luecke',
      'Bei „' + (o.frage || 'der Standardsuche') + '" auf Platz ' + g.platz,
      g.platz <= 3 ? '' : 'Über Platz 3 schaut kaum noch jemand. Davor liegen: ' + ((g.vor_dir || []).slice(0, 3).join(', ') || 'andere Betriebe') + '.'));
  } else if (g && g.status === 'nicht-gefunden') {
    punkte.push(punkt('google-weg', 'luecke', 'Bei „' + (o.frage || 'der Standardsuche') + '" nicht in den Top 10',
      'Wer in seiner eigenen Stadt nicht gefunden wird, verliert die Gäste an die, die gefunden werden' +
      ((g.vor_dir || []).length ? ': ' + g.vor_dir.slice(0, 3).join(', ') : '') + '.'));
  } else if (g) {
    punkte.push(punkt('google-offen', 'offen', 'Google-Platzierung nicht geprüft', g.detail || ''));
  }

  // KI-Empfehlung: der Punkt, den sonst niemand in der Region anspricht.
  const k = t.ki;
  if (k && k.status === 'gefunden') {
    punkte.push(punkt('ki-gefunden', 'gut', 'Wird von KI-Assistenten empfohlen', ''));
  } else if (k && k.status === 'nicht-gefunden') {
    const andere = (k.empfohlen || []).slice(0, 3);
    punkte.push(punkt('ki-weg', 'luecke', 'Wird von KI-Assistenten nicht empfohlen',
      andere.length
        ? 'Auf die Frage nach einer Empfehlung nennt die KI: ' + andere.join(', ') + ' – den Betrieb nicht.'
        : 'Auf die Frage nach einer Empfehlung taucht der Betrieb nicht auf.'));
  } else if (k) {
    punkte.push(punkt('ki-offen', 'offen', 'KI-Sichtbarkeit nicht geprüft', k.detail || ''));
  }

  const luecken = punkte.filter((x) => x.art === 'luecke');
  const gutes = punkte.filter((x) => x.art === 'gut');
  // Nicht nur zaehlen: gar keine Website oder eine tote Seite ist EINE Luecke,
  // aber die groesste von allen. Sonst stuende bei genau diesen Betrieben
  // "kleine Luecke" - und man wuerde die besten Leads liegen lassen.
  const schwer = ['keine-website', 'seite-nicht-erreichbar', 'seite-kaputt', 'karte-fehlt'];
  const hatSchweren = luecken.some((l) => schwer.indexOf(l.id) !== -1);
  const ampel = (hatSchweren || luecken.length >= 6) ? 'gross' : luecken.length >= 3 ? 'mittel' : 'klein';

  return {
    gepruefteAm: (o.jetzt instanceof Date ? o.jetzt : new Date()).toISOString(),
    punkte, anzahlLuecken: luecken.length, anzahlGut: gutes.length, ampel,
    aufhaenger: gespraechsaufhaenger(luecken, p),
    websiteStatus: t.webseite ? t.webseite.status : (p.website ? 'ungeprueft' : 'keine')
  };
}

// Der Satz, mit dem man das Telefonat eroeffnet. Genau EIN Punkt - der
// groesste - und der als Beobachtung formuliert, nicht als Vorwurf.
// Reihenfolge = was im Gespraech am besten zieht.
const AUFHAENGER = [
  ['keine-website', 'Ich habe eben nach Ihnen gesucht – eine eigene Website habe ich nicht gefunden. Wissen Sie, dass Gäste, die abends nach einem Lokal suchen, Sie damit gar nicht erst sehen?'],
  ['seite-nicht-erreichbar', 'Ich wollte eben auf Ihre Website – die war nicht erreichbar. Wussten Sie das?'],
  ['seite-kaputt', 'Ich wollte eben auf Ihre Website – da kommt eine Fehlermeldung. Wussten Sie das?'],
  ['karte-fehlt', 'Ich war eben auf Ihrer Seite und habe Ihre Speisekarte gesucht – die konnte ich nicht finden. Wie machen Sie das, wenn jemand wissen will, was es bei Ihnen gibt?'],
  ['karte-pdf', 'Ihre Speisekarte liegt als PDF auf der Seite. Am Handy muss man da ziemlich zoomen – und Google und ChatGPT können ein PDF praktisch nicht lesen. Ihre Gerichte tauchen in Suchergebnissen also gar nicht auf.'],
  ['ki-weg', 'Ich habe ChatGPT gefragt, welches Lokal es in {stadt} empfiehlt. Ihr Haus war nicht dabei – dafür {andere}. Das ist inzwischen der Weg, wie viele Gäste suchen.'],
  ['google-weg', 'Wenn man bei Google „{frage}" eingibt, stehen Sie nicht auf der ersten Seite. Ist Ihnen das aufgefallen?'],
  ['zeiten-fehlt', 'Auf Ihrer Website habe ich keine Öffnungszeiten gefunden. „Hat der heute offen?" ist die Frage, die Gäste am häufigsten stellen.'],
  ['reservierung-fehlt', 'Bei Ihnen kann man online keinen Tisch reservieren. Was passiert bei Ihnen abends um halb elf, wenn jemand für morgen einen Tisch will?'],
  ['nicht-mobil', 'Ihre Website ist nicht fürs Handy gebaut – und da kommen heute drei von vier Gästen her.'],
  ['veraltet', 'Ihre Website sieht so aus, als wäre sie länger nicht angefasst worden. Gäste schließen daraus leider auch auf den Betrieb.'],
  ['tel-nicht-klickbar', 'Auf Ihrer Seite kann man die Telefonnummer am Handy nicht antippen – man muss sie abtippen. Das kostet Anrufe.'],
  ['kein-schema', 'Ihre Website hat keine maschinenlesbaren Daten. Google und KI-Assistenten müssen raten, was Sie anbieten – und empfehlen dann lieber jemand anderen.'],
  ['bestellung-fehlt', 'Bei Ihnen kann man online nichts bestellen. Läuft das bei Ihnen über ein Portal – und wissen Sie, was die an Provision nehmen?'],
  ['kein-social', 'Auf Ihrer Website ist kein Instagram verlinkt. Junge Gäste suchen zuerst dort.'],
  ['kein-https', 'Ihre Website läuft ohne Verschlüsselung – der Browser zeigt Gästen „Nicht sicher" an.']
];

function gespraechsaufhaenger(luecken, prospect) {
  const vorhanden = new Set((luecken || []).map((l) => l.id));
  for (const [id, satz] of AUFHAENGER) {
    if (!vorhanden.has(id)) continue;
    const luecke = luecken.find((l) => l.id === id);
    // Die Platzhalter aus dem echten Befund fuellen - steht dort nichts,
    // faellt der Satzteil weg, statt eine Behauptung zu erfinden.
    const andere = (String(luecke && luecke.folge || '').match(/nennt die KI: ([^–]+)/) || [])[1];
    return satz
      .replace('{stadt}', (prospect && prospect.city) || (prospect && prospect.stadt) || 'der Stadt')
      .replace('{frage}', ((prospect && prospect.frage) || 'Ihre Kategorie und Ihr Ort'))
      .replace(' – dafür {andere}', andere ? ' – dafür ' + andere.trim().replace(/\.$/, '') : '')
      .replace('{andere}', andere ? andere.trim() : 'andere Betriebe');
  }
  return 'Keine offensichtliche Lücke gefunden – hier lohnt das Gespräch über den Telefon-Retter: Auch ein gut aufgestellter Betrieb verliert Anrufe in der Stoßzeit.';
}

// Kurzfassung fuer die Tabellenzeile: zwei, drei Woerter statt einer Wand.
function kurzfassung(befund) {
  if (!befund || !befund.punkte) return '';
  const luecken = befund.punkte.filter((p) => p.art === 'luecke');
  if (!luecken.length) return 'Keine Lücken gefunden';
  return luecken.slice(0, 3).map((l) => l.titel).join(' · ') +
    (luecken.length > 3 ? ' · +' + (luecken.length - 3) + ' weitere' : '');
}

module.exports = { pruefeHtml, holeWebsite, baueBefund, gespraechsaufhaenger, kurzfassung, MUSTER };
