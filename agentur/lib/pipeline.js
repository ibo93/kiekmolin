'use strict';

// Neukunden-Pipeline: aus einer reinen Leseliste wird ein Vertriebs-Werkzeug.
//
// Das Problem der alten Fassung: prospects.json wurde bei jedem Laden neu
// angezeigt, immer gleich sortiert, ohne jedes Gedaechtnis. Wer gestern
// zwanzig Betriebe angerufen hat, sah heute wieder dieselben zwanzig - und
// die Anfragen von der Check-Seite lagen in einem ganz anderen Kasten.
//
// Diese Fassung haelt drei Dinge fest, die ein Vertrieb wirklich braucht:
//   1. WO STEHE ICH? - eine Stufe pro Betrieb (neu ... Kunde / kein Interesse)
//   2. WAS WAR? - eine Notiz und ein kleiner Verlauf
//   3. WANN WIEDER? - ein Wiedervorlage-Datum, das faellig nach oben rutscht
//
// Dazu laufen Verzeichnis-Betriebe (OSM) und Inbound-Anfragen (Check-Seite)
// in EINER Liste zusammen. Wer selbst anfragt, ist der heisseste Lead ueberhaupt
// und darf nicht in einem zweiten Kasten untergehen.

const { leadScore, istSchonPartner, normalisiereName } = require('./pitch');

// Die Stufen des Trichters. Reihenfolge = Reihenfolge im Trichter.
// "erledigt" heisst: taucht in der Arbeitsliste nicht mehr auf.
const STUFEN = [
  { id: 'neu', text: 'Neu', erledigt: false },
  { id: 'kontaktiert', text: 'Angerufen', erledigt: false },
  { id: 'termin', text: 'Termin', erledigt: false },
  { id: 'angebot', text: 'Angebot raus', erledigt: false },
  { id: 'kunde', text: 'Kunde', erledigt: true },
  { id: 'kein-interesse', text: 'Kein Interesse', erledigt: true }
];

const STUFEN_IDS = STUFEN.map((s) => s.id);

function stufeGueltig(id) {
  return STUFEN_IDS.indexOf(String(id || '')) !== -1;
}

function istErledigt(id) {
  const s = STUFEN.find((x) => x.id === id);
  return !!(s && s.erledigt);
}

// Stabiler Schluessel aus Name + Ort. Muss auch dann gleich bleiben, wenn der
// OSM-Import den Betrieb spaeter mit leicht anderer Schreibweise neu einliest -
// sonst waere der Gespraechsstand nach jedem Import weg.
function schluesselFuer(name, ort) {
  const teile = [normalisiereName(name), normalisiereName(ort)].filter(Boolean);
  return teile.join('--').replace(/\s+/g, '-');
}

// ------------------------------------------------------------ Stand lesen ---
// Der Stand ist bewusst ein einfaches Objekt { schluessel: eintrag }.
// Kaputte oder fehlende Datei = leerer Stand, niemals ein Absturz.
function leseStand(text) {
  let daten;
  try { daten = JSON.parse(String(text || '')); } catch (_e) { return {}; }
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return {};
  const sauber = {};
  for (const k of Object.keys(daten)) {
    const e = daten[k];
    if (!e || typeof e !== 'object') continue;
    sauber[k] = {
      stufe: stufeGueltig(e.stufe) ? e.stufe : 'neu',
      notiz: String(e.notiz || '').slice(0, 2000),
      wiedervorlage: datumOderLeer(e.wiedervorlage),
      zuletzt: String(e.zuletzt || ''),
      verlauf: Array.isArray(e.verlauf) ? e.verlauf.slice(-20) : [],
      // Der Betriebs-Check (lead-check.js). Bleibt gespeichert, damit man
      // ihn nicht vor jedem Anruf neu laufen lassen muss.
      befund: e.befund && typeof e.befund === 'object' ? e.befund : null
    };
  }
  return sauber;
}

// Nur ein sauberes Tagesdatum (JJJJ-MM-TT) wird uebernommen. Alles andere
// waere ein Datum, das man spaeter nicht vergleichen kann.
function datumOderLeer(wert) {
  const s = String(wert || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// ---------------------------------------------------------- Stand aendern ---
// Aendert genau einen Eintrag und gibt den NEUEN Stand zurueck (das Original
// bleibt unangetastet - so kann der Aufrufer im Fehlerfall einfach verwerfen).
function setzeStand(stand, schluessel, aenderung, optionen) {
  const o = optionen || {};
  const jetzt = o.jetzt instanceof Date ? o.jetzt : new Date();
  const key = String(schluessel || '').trim();
  if (!key) throw new Error('Kein Schluessel angegeben.');
  const a = aenderung || {};
  if (a.stufe !== undefined && !stufeGueltig(a.stufe)) {
    throw new Error('Unbekannte Stufe: ' + a.stufe);
  }

  const neu = Object.assign({}, stand);
  const alt = neu[key] || { stufe: 'neu', notiz: '', wiedervorlage: '', zuletzt: '', verlauf: [] };
  const eintrag = {
    stufe: a.stufe !== undefined ? a.stufe : alt.stufe,
    notiz: a.notiz !== undefined ? String(a.notiz).slice(0, 2000) : alt.notiz,
    wiedervorlage: a.wiedervorlage !== undefined ? datumOderLeer(a.wiedervorlage) : alt.wiedervorlage,
    zuletzt: jetzt.toISOString(),
    verlauf: (alt.verlauf || []).slice(-19),
    befund: a.befund !== undefined ? a.befund : (alt.befund || null)
  };
  // Nur echte Stufenwechsel kommen in den Verlauf - sonst waere er nach
  // drei Notiz-Korrekturen unlesbar.
  if (a.stufe !== undefined && a.stufe !== alt.stufe) {
    eintrag.verlauf.push({ stufe: a.stufe, zeit: eintrag.zuletzt });
  }
  neu[key] = eintrag;
  return neu;
}

// ------------------------------------------------------- Liste aufbauen -----
// Bringt Verzeichnis-Betriebe und Inbound-Anfragen auf eine gemeinsame Form.
function ausProspect(p) {
  return {
    name: String(p.name || ''), stadt: String(p.city || ''),
    kategorie: String(p.category || 'restaurant'),
    telefon: String(p.phone || ''), website: String(p.website || ''),
    quelle: 'verzeichnis', kontakt: '', anfrage: '', zeit: ''
  };
}

function ausLead(l) {
  return {
    name: String(l.restaurant || ''), stadt: String(l.ort || ''),
    kategorie: 'anfrage', telefon: telefonAus(l.kontakt),
    website: '', quelle: 'anfrage',
    kontakt: String(l.kontakt || ''), anfrage: String(l.nachricht || ''),
    ansprechpartner: String(l.name || ''), zeit: String(l.zeit || '')
  };
}

// Aus dem freien Kontaktfeld der Check-Seite eine Nummer ziehen, damit der
// Anruf-Link in der Liste funktioniert. Steht dort eine E-Mail, bleibt es leer.
function telefonAus(kontakt) {
  const s = String(kontakt || '');
  if (s.indexOf('@') !== -1) return '';
  const ziffern = s.replace(/[^0-9+ /-]/g, '').trim();
  return ziffern.replace(/[0-9]/g, '').length > 6 ? '' : ziffern;
}

function tagesDatum(d) {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return j + '-' + m + '-' + t;
}

// Die eigentliche Arbeitsliste. Sortierung ist die halbe Miete:
//   1. faellige Wiedervorlagen  - was ich versprochen habe, kommt zuerst
//   2. neue Anfragen            - wer selbst fragt, will jetzt reden
//   3. heisseste Verzeichnis-Leads
// Erledigte (Kunde / kein Interesse) rutschen ans Ende und sind zaehlbar,
// verschwinden aber nicht - sonst faellt ein Fehlklick nie mehr auf.
function baueListe(quellen, optionen) {
  const q = quellen || {};
  const o = optionen || {};
  const heute = o.heute instanceof Date ? o.heute : new Date();
  const heuteText = tagesDatum(heute);
  const stand = q.stand || {};
  const kundenNamen = q.kundenNamen || [];

  const roh = []
    .concat((q.prospects || []).map(ausProspect))
    .concat((q.leads || []).map(ausLead))
    .filter((e) => e.name);

  // Doppelte zusammenfuehren: derselbe Betrieb kann im Verzeichnis stehen UND
  // selbst angefragt haben. Dann gewinnt die Anfrage - sie ist die heissere
  // Spur -, aber Telefon und Website aus dem Verzeichnis bleiben erhalten.
  const nachSchluessel = new Map();
  for (const e of roh) {
    const key = schluesselFuer(e.name, e.stadt);
    if (!key) continue;
    const da = nachSchluessel.get(key);
    if (!da) { nachSchluessel.set(key, Object.assign({ schluessel: key }, e)); continue; }
    if (e.quelle === 'anfrage') {
      nachSchluessel.set(key, Object.assign({}, da, e, {
        schluessel: key,
        telefon: e.telefon || da.telefon,
        website: e.website || da.website,
        kategorie: da.kategorie !== 'anfrage' ? da.kategorie : e.kategorie
      }));
    } else {
      da.telefon = da.telefon || e.telefon;
      da.website = da.website || e.website;
    }
  }

  const liste = [];
  for (const e of nachSchluessel.values()) {
    if (istSchonPartner({ name: e.name }, kundenNamen)) continue;
    const bewertung = leadScore({
      name: e.name, city: e.stadt, phone: e.telefon,
      website: e.website, category: e.kategorie, street: e.quelle === 'verzeichnis' ? 'ja' : ''
    });
    const s = stand[e.schluessel] || { stufe: 'neu', notiz: '', wiedervorlage: '', zuletzt: '', befund: null };
    const faellig = !!(s.wiedervorlage && s.wiedervorlage <= heuteText && !istErledigt(s.stufe));
    liste.push(Object.assign({}, e, {
      heat: bewertung.heat, score: bewertung.score, gruende: bewertung.gruende,
      stufe: s.stufe, notiz: s.notiz, wiedervorlage: s.wiedervorlage,
      zuletzt: s.zuletzt, faellig, erledigt: istErledigt(s.stufe),
      befund: s.befund || null
    }));
  }

  liste.sort((a, b) => {
    if (a.erledigt !== b.erledigt) return a.erledigt ? 1 : -1;
    if (a.faellig !== b.faellig) return a.faellig ? -1 : 1;
    const anfrageA = a.quelle === 'anfrage' && a.stufe === 'neu';
    const anfrageB = b.quelle === 'anfrage' && b.stufe === 'neu';
    if (anfrageA !== anfrageB) return anfrageA ? -1 : 1;
    if (anfrageA && anfrageB) return String(b.zeit).localeCompare(String(a.zeit));
    return b.score - a.score || a.name.localeCompare(b.name);
  });

  return liste;
}

// Trichter-Zaehler fuer die Kopfzeile: wie viele stecken wo?
function zaehleStufen(liste) {
  const zaehler = {};
  for (const s of STUFEN) zaehler[s.id] = 0;
  let faellig = 0;
  for (const e of liste || []) {
    if (zaehler[e.stufe] === undefined) zaehler[e.stufe] = 0;
    zaehler[e.stufe]++;
    if (e.faellig) faellig++;
  }
  return { zaehler, faellig, gesamt: (liste || []).length };
}

// Ein Satz fuer den Wochen-Digest - ohne Zahlenfriedhof.
function satzFuerDigest(liste) {
  const z = zaehleStufen(liste);
  const offen = z.gesamt - z.zaehler['kunde'] - z.zaehler['kein-interesse'];
  if (!z.gesamt) return 'Pipeline ist leer - Region importieren oder Betriebe eintragen.';
  const teile = [offen + ' offene Interessenten'];
  if (z.faellig) teile.push(z.faellig + ' Wiedervorlage' + (z.faellig === 1 ? '' : 'n') + ' faellig');
  if (z.zaehler['termin']) teile.push(z.zaehler['termin'] + ' Termin(e) vereinbart');
  return teile.join(' - ') + '.';
}

module.exports = {
  STUFEN, STUFEN_IDS, stufeGueltig, istErledigt, schluesselFuer,
  leseStand, setzeStand, datumOderLeer, baueListe, zaehleStufen, satzFuerDigest
};
