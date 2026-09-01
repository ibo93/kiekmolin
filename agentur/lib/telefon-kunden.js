'use strict';

// Telefon-Kunden aus der Agentur-App heraus verwalten.
//
// Bisher musste man dafuer zwei JSON-Dateien im Texteditor bearbeiten -
// telefon-retter/nummern.json und telefon-retter/kunden/<name>.json.
// Ein fehlendes Komma, und der Telefon-Retter startet nicht mehr. Das ist
// keine Arbeit fuer den Alltag, sondern eine Fehlerquelle.
//
// Hier passiert dasselbe, nur geprueft: Die App schreibt beide Dateien
// zusammen, haelt sie gueltig und meldet im Klartext, was fehlt.
//
// Kommentar-Felder (_hinweis usw.) in nummern.json bleiben erhalten -
// wer die Datei doch mal von Hand aufmacht, findet seine Notizen wieder.

const fs = require('fs');
const path = require('path');

function pfade(basisOrdner) {
  const basis = basisOrdner || path.join(__dirname, '..', '..', 'telefon-retter');
  return {
    basis,
    nummernDatei: path.join(basis, 'nummern.json'),
    kundenOrdner: path.join(basis, 'kunden')
  };
}

// Nummern einheitlich ablegen: "+49 4926 123" und "+494926123" sind dasselbe
function normalisiereNummer(nummer) {
  const roh = String(nummer || '').replace(/[^0-9+]/g, '');
  if (!roh) return '';
  if (roh.startsWith('+')) return roh;
  if (roh.startsWith('00')) return '+' + roh.slice(2);
  if (roh.startsWith('0')) return '+49' + roh.slice(1); // deutsche Schreibweise
  return '+' + roh;
}

function dateinameAus(name) {
  return String(name || 'kunde').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kunde';
}

function liesNummern(basisOrdner) {
  const { nummernDatei } = pfade(basisOrdner);
  if (!fs.existsSync(nummernDatei)) return {};
  try {
    const d = JSON.parse(fs.readFileSync(nummernDatei, 'utf8'));
    return d && typeof d === 'object' ? d : {};
  } catch (e) {
    throw new Error('nummern.json ist beschaedigt (' + e.message + '). Bitte einmal von Hand ansehen.');
  }
}

function schreibeNummern(basisOrdner, inhalt) {
  const { basis, nummernDatei } = pfade(basisOrdner);
  fs.mkdirSync(basis, { recursive: true });
  fs.writeFileSync(nummernDatei, JSON.stringify(inhalt, null, 2) + '\n');
}

// Alle eingerichteten Telefon-Nummern mit dem, was dahinter haengt
function listeKunden(basisOrdner) {
  const { kundenOrdner } = pfade(basisOrdner);
  const nummern = liesNummern(basisOrdner);
  const liste = [];

  for (const [nummer, wert] of Object.entries(nummern)) {
    if (String(nummer).startsWith('_')) continue; // Kommentar-Feld
    const istObjekt = wert && typeof wert === 'object' && !Array.isArray(wert);
    const eintrag = {
      nummer,
      art: istObjekt && wert.datei ? 'eigen' : 'kiekmolin',
      restaurant: istObjekt ? (wert.restaurant || null) : String(wert),
      datei: istObjekt ? (wert.datei || null) : null,
      stimme: istObjekt ? (wert.stimme || null) : null,
      stufe: istObjekt ? (wert.stufe || null) : null,
      kann: istObjekt && wert.kann ? [].concat(wert.kann) : null,
      name: null, stadt: null, gerichte: 0, melden: null, problem: null,
      /* Der Slug steckt im Dateinamen. Ohne ihn hat die Uebersicht im CRM
         keinen Griff fuer Demo und Testanruf. */
      slug: null
    };
    if (eintrag.datei) {
      eintrag.slug = path.basename(eintrag.datei).replace(/\.json$/i, '');
    }

    if (eintrag.datei) {
      const voll = path.isAbsolute(eintrag.datei)
        ? eintrag.datei
        : path.join(pfade(basisOrdner).basis, eintrag.datei);
      try {
        const k = JSON.parse(fs.readFileSync(voll, 'utf8'));
        eintrag.name = k.name || null;
        eintrag.stadt = k.stadt || k.city || null;
        eintrag.gerichte = Array.isArray(k.speisekarte) ? k.speisekarte.length : 0;
        eintrag.melden = k.melden || null;
        // Ohne Meldeweg erfaehrt der Wirt nichts von seinen Anrufen -
        // das ist der schlimmste stille Fehler, also hier deutlich machen.
        if (!k.melden || (!k.melden.sms && !k.melden.email)) {
          eintrag.problem = 'Kein Meldeweg hinterlegt – der Wirt erfährt nichts von seinen Anrufen!';
        }
      } catch (e) {
        eintrag.problem = 'Kundendatei fehlt oder ist beschädigt: ' + eintrag.datei;
      }
    }
    liste.push(eintrag);
  }
  return liste;
}

// Ein Betrieb OHNE Kiek mol in: Kundendatei schreiben und Nummer zuordnen.
// daten: { nummer, name, stadt, adresse, plz, telefon, webseite, beschreibung,
//          oeffnet, schliesst, tische, liefergebuehr, sms, email, kann,
//          begruessung, wissen[], weiterleitung, weiterWann,
//          stimme, stufe, speisekarte: [{name, preis, kategorie, beschreibung}] }
function speichereEigenenKunden(daten, basisOrdner) {
  const d = daten || {};
  const name = String(d.name || '').trim();
  const nummer = normalisiereNummer(d.nummer);

  if (!name) throw new Error('Name des Betriebs fehlt.');
  if (!nummer) throw new Error('Twilio-Nummer fehlt – die Nummer, auf die der Wirt umleitet.');
  if (!/^\+\d{6,}$/.test(nummer)) throw new Error('Die Nummer sieht nicht richtig aus: ' + nummer);

  const kann = [].concat(d.kann || []).map((k) => String(k).toLowerCase().trim())
    .filter((k) => /^(reservierung|bestellung)$/.test(k));
  if (!kann.length) throw new Error('Bitte wählen: Reservierungen, Bestellungen oder beides.');

  const zahl = (w) => {
    const n = Number(String(w == null ? '' : w).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const zeit = (w) => {
    const t = String(w || '').trim();
    return /^\d{1,2}:\d{2}$/.test(t) ? (t.length === 4 ? '0' + t : t) : undefined;
  };

  const speisekarte = (Array.isArray(d.speisekarte) ? d.speisekarte : [])
    .map((g) => {
      const gName = String((g && g.name) || '').trim();
      if (!gName) return null;
      const eintrag = { name: gName, preis: zahl(g.preis) };
      if (g.kategorie) eintrag.kategorie = String(g.kategorie).trim();
      if (g.beschreibung) eintrag.beschreibung = String(g.beschreibung).trim();
      return eintrag;
    })
    .filter(Boolean);

  const sms = String(d.sms || '').trim();
  const email = String(d.email || '').trim();

  const kunde = {
    name,
    stadt: String(d.stadt || '').trim() || undefined,
    adresse: String(d.adresse || '').trim() || undefined,
    plz: String(d.plz || '').trim() || undefined,
    telefon: String(d.telefon || '').trim() || undefined,
    webseite: String(d.webseite || '').trim() || undefined,
    beschreibung: String(d.beschreibung || '').trim() || undefined,
    oeffnet: zeit(d.oeffnet),
    schliesst: zeit(d.schliesst),
    tische: zahl(d.tische) || 8,

    /* Vom CRM einstellbar – der Assistent liest das beim Anruf:
       begruessung   eigener erster Satz statt der Standardformel
       wissen        Frage/Antwort-Paare, damit er nicht "weiss ich nicht" sagt
       weiterleitung an wen durchgestellt wird, wenn er nicht weiterkommt */
    begruessung: String(d.begruessung || '').trim() || undefined,
    wissen: (Array.isArray(d.wissen) ? d.wissen : [])
      .map((w) => ({
        frage: String((w && w.frage) || '').trim(),
        antwort: String((w && w.antwort) || '').trim()
      }))
      .filter((w) => w.frage && w.antwort)
      .slice(0, 40),
    weiterleitung: normalisiereNummer(d.weiterleitung) || undefined,
    weiterWann: /^(bitte|unklar)$/.test(String(d.weiterWann || '')) ? d.weiterWann : undefined,
    /* Anrede: nur 'du' weicht ab, alles andere bleibt beim hoeflichen Sie. */
    anrede: String(d.anrede || '') === 'du' ? 'du' : undefined,
    /* Ruhetage als Kuerzel (Mo, Di, ...). Ohne die reserviert der Assistent
       fuer einen Tag, an dem geschlossen ist - der Gast steht vor der Tuer. */
    ruhetage: (Array.isArray(d.ruhetage) ? d.ruhetage : String(d.ruhetage || '').split(/[,;\s]+/))
      .map((x) => String(x || '').trim().slice(0, 2))
      .filter((x) => /^(Mo|Di|Mi|Do|Fr|Sa|So)$/i.test(x))
      .map((x) => x[0].toUpperCase() + x[1].toLowerCase()),

    /* Betriebsferien und Feiertage. Nur vollstaendige Datumsangaben
       uebernehmen - ein halb eingetipptes Datum wuerde entweder gar nicht
       greifen oder den falschen Zeitraum sperren. */
    geschlossen: (Array.isArray(d.geschlossen) ? d.geschlossen : [])
      .map((z) => ({
        von: String((z && z.von) || '').slice(0, 10),
        bis: String((z && z.bis) || (z && z.von) || '').slice(0, 10),
        grund: String((z && z.grund) || '').trim().slice(0, 60) || undefined
      }))
      .filter((z) => /^\d{4}-\d{2}-\d{2}$/.test(z.von) && /^\d{4}-\d{2}-\d{2}$/.test(z.bis)
                  && z.bis >= z.von)
      .slice(0, 12),
    liefergebuehr: zahl(d.liefergebuehr) || undefined,
    melden: {
      sms: sms ? normalisiereNummer(sms) : undefined,
      email: email.includes('@') ? email : undefined
    },
    speisekarte
  };

  // Probeanruf-Demos: befristete Kunden, die auf der Demo-Nummer liegen.
  // Die Felder muessen mitgeschrieben werden, sonst kann die App eine
  // abgelaufene Demo spaeter nicht mehr als solche erkennen.
  if (d.demo) {
    kunde.demo = true;
    if (d.demoBis) kunde.demoBis = String(d.demoBis);
    if (d.demoFuer) kunde.demoFuer = String(d.demoFuer);
  }

  const slug = dateinameAus(d.slug || name);
  const { kundenOrdner } = pfade(basisOrdner);
  fs.mkdirSync(kundenOrdner, { recursive: true });
  fs.writeFileSync(path.join(kundenOrdner, slug + '.json'), JSON.stringify(kunde, null, 2) + '\n');

  // Zuordnung ergaenzen, vorhandene Eintraege und Kommentare behalten
  const nummern = liesNummern(basisOrdner);
  // Zeigte diese Nummer vorher woanders hin, wird sie hier sauber ersetzt
  const eintrag = { datei: 'kunden/' + slug + '.json', kann };
  if (d.stimme) eintrag.stimme = String(d.stimme).trim();
  const stufe = parseInt(d.stufe, 10);
  if (stufe >= 1 && stufe <= 3) eintrag.stufe = stufe;
  nummern[nummer] = eintrag;
  schreibeNummern(basisOrdner, nummern);

  return {
    slug,
    nummer,
    datei: 'kunden/' + slug + '.json',
    gerichte: speisekarte.length,
    // Bei einer Demo ist "keine Meldung" gewollt: wir haben keine Einwilligung,
    // dem Wirt SMS zu schicken, und eine Test-Reservierung ist keine echte.
    warnung: (!d.demo && !kunde.melden.sms && !kunde.melden.email)
      ? 'Ohne SMS-Nummer oder E-Mail erfährt der Wirt nichts von seinen Anrufen. Bitte nachtragen, bevor die Nummer scharf geschaltet wird.'
      : null
  };
}

// Eine Nummer wieder aus dem Betrieb nehmen. Die Kundendatei bleibt liegen -
// sie enthaelt Arbeit, und Loeschen kann man immer noch von Hand.
function entferneNummer(nummer, basisOrdner) {
  const nummern = liesNummern(basisOrdner);
  const schluessel = normalisiereNummer(nummer);
  if (!Object.prototype.hasOwnProperty.call(nummern, schluessel)) {
    throw new Error('Diese Nummer ist nicht eingetragen: ' + schluessel);
  }
  delete nummern[schluessel];
  schreibeNummern(basisOrdner, nummern);
  return { nummer: schluessel };
}

module.exports = {
  pfade, normalisiereNummer, dateinameAus,
  liesNummern, schreibeNummern, listeKunden, speichereEigenenKunden, entferneNummer
};
