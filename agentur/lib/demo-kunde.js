'use strict';

// Der Probeanruf - das beste Verkaufsgespraech ist keins.
//
// Statt einem Wirt zu ERKLAEREN, was ein KI-Telefonassistent kann, laesst
// man ihn seinen eigenen Laden anrufen: seine Gerichte, sein Ort, seine
// Oeffnungszeiten. Nach zwanzig Sekunden hat er verstanden, wofuer sonst
// zwanzig Minuten Ueberzeugungsarbeit noetig waeren.
//
// Wichtig: DER WIRT ruft AN. Wir rufen ihn nicht mit einer KI an - das
// waere Kaltakquise per Maschine und in Deutschland rechtlich heikel
// (§7 UWG). Der Probeanruf dreht die Richtung genau um.
//
// Sicherheits-Grundsatz dieses Moduls: eine Demo darf NIEMALS die Nummer
// eines zahlenden Kunden ueberschreiben. Lieber bricht der Demo-Aufbau ab.

// Wie lange eine Demo auf der Nummer liegen bleibt. Danach ist sie
// abgelaufen - sonst nimmt eine vergessene Demo im naechsten Monat noch
// Anrufe entgegen und der Interessent glaubt, er sei schon Kunde.
const DEMO_STUNDEN = 48;

function slugAus(name) {
  return 'demo-' + String(name || 'betrieb').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'demo-betrieb';
}

// Die Kundendatei fuer den Telefon-Retter. Gleiche Form wie bei einem
// echten eigenen Kunden (externe-kunden.js), nur eben als Demo markiert.
function baueDemoKunde(interessent, karte, optionen) {
  const o = optionen || {};
  const jetzt = o.jetzt instanceof Date ? o.jetzt : new Date();
  const i = interessent || {};
  if (!i.name) throw new Error('Ohne Betriebsnamen laesst sich keine Demo bauen.');

  const gerichte = (karte || [])
    .filter((g) => g && g.name)
    .slice(0, 60)
    .map((g) => ({
      name: String(g.name).slice(0, 120),
      preis: typeof g.preis === 'number' ? g.preis : null,
      kategorie: g.kategorie ? String(g.kategorie).slice(0, 60) : '',
      beschreibung: g.beschreibung ? String(g.beschreibung).slice(0, 300) : ''
    }));

  // Ohne Speisekarte kann der Agent keine Bestellung annehmen - dann macht
  // er nur Reservierungen. Etwas anderes zu behaupten faellt im Probeanruf
  // sofort auf, und zwar vor dem Kunden.
  const kann = gerichte.length ? ['reservierung', 'bestellung'] : ['reservierung'];

  return {
    kunde: {
      name: i.name,
      stadt: i.stadt || '',
      tische: 12,
      speisekarte: gerichte,
      // Eine Demo meldet NICHTS an den Wirt: wir haben keine Einwilligung,
      // ihm SMS zu schicken, und eine Test-Reservierung ist keine echte.
      melden: {},
      demo: true,
      demoBis: new Date(jetzt.getTime() + (o.stunden || DEMO_STUNDEN) * 3600 * 1000).toISOString(),
      demoFuer: i.schluessel || ''
    },
    kann,
    slug: slugAus(i.name),
    gerichte: gerichte.length
  };
}

// Darf diese Nummer fuer eine Demo benutzt werden?
// Erlaubt ist: frei, oder es liegt bereits eine Demo darauf.
// Verboten ist: ein echter Kunde - der verliert sonst seine Anrufe.
function nummerFrei(nummer, nummernObjekt, istDemoSlug) {
  const eintrag = (nummernObjekt || {})[nummer];
  if (eintrag === undefined) return { ok: true, grund: 'frei' };
  const kennung = typeof eintrag === 'object' && eintrag
    ? String(eintrag.datei || eintrag.restaurant || '')
    : String(eintrag || '');
  const pruefe = istDemoSlug || ((k) => /(^|\/)demo-/.test(k));
  if (pruefe(kennung)) return { ok: true, grund: 'alte-demo' };
  return {
    ok: false,
    grund: 'kunde',
    text: 'Auf ' + nummer + ' liegt ein echter Kunde. Für Demos bitte eine eigene Nummer ' +
      'in TELEFON_DEMO_NUMMER eintragen - sonst gehen dem Kunden Anrufe verloren.'
  };
}

function istAbgelaufen(kunde, jetzt) {
  if (!kunde || !kunde.demoBis) return false;
  const bis = Date.parse(kunde.demoBis);
  return Number.isFinite(bis) && bis < (jetzt instanceof Date ? jetzt : new Date()).getTime();
}

// Was Ibo im Telefonat sagt. Bewusst als fertiger Satz - im Gespraech hat
// man keine Zeit, sich das selbst zurechtzulegen.
function ansageFuerIbo(kunde, nummer, gerichte) {
  const name = (kunde && kunde.name) || 'Ihr Betrieb';
  const kern = 'Wissen Sie was, probieren Sie es einfach aus. Rufen Sie mal die ' +
    lesbareNummer(nummer) + ' an und fragen Sie nach einem Tisch für vier Personen heute Abend.';
  const zusatz = gerichte
    ? ' Fragen Sie ruhig auch, was es bei Ihnen zu essen gibt - der Assistent kennt Ihre Karte.'
    : ' Der Assistent nimmt in dieser Demo Reservierungen an; die Speisekarte spielen wir für einen echten Kunden zusätzlich ein.';
  const schluss = ' Das ist Ihr Haus, ' + name + ' - nicht irgendein Beispiel.';
  return kern + zusatz + schluss;
}

// +4949311234567 -> 04931... So spricht man eine deutsche Nummer aus.
// Bewusst OHNE Leerzeichen-Gruppierung: deutsche Vorwahlen sind zwei bis
// fuenf Stellen lang, das laesst sich aus der Nummer allein nicht ablesen.
// Lieber ungruppiert richtig als huebsch falsch getrennt.
function lesbareNummer(nummer) {
  const s = String(nummer || '').trim();
  return /^\+49\d+$/.test(s) ? '0' + s.slice(3) : s;
}

module.exports = {
  DEMO_STUNDEN, slugAus, baueDemoKunde, nummerFrei, istAbgelaufen,
  ansageFuerIbo, lesbareNummer
};
