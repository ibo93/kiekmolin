'use strict';

// DEIN CM — die Kundenverwaltung, die bei dir auf dem Rechner laeuft.
//
// Ibo hat sich selbst eine Kundenverwaltung gebaut. Die ist die Wahrheit
// darueber, WER Kunde ist, was vereinbart wurde und wer als Naechstes dran
// waere. Der Assistent soll da hineinschauen koennen:
//
//   "Was ist mit La Piazza?"  ·  "Wer ist faellig?"  ·  "Wie viele Kunden?"
//
// Das Problem: dieses Repository weiss nicht, wie das CM innen aussieht.
// Also wird hier nichts vorausgesetzt. Der Baustein sucht die Daten, liest
// JSON, JSONL und CSV, und ordnet die Spalten selbst zu - egal ob die
// Felder "telefon", "Telefonnummer" oder "phone" heissen. Was er nicht
// sicher erkennt, laesst er leer, statt zu raten.
//
// Alles hier ist LESEND. Geaendert wird im CM von Hand - eine Stimme, die
// sich verhoert, soll keine Kundenakte umschreiben.

const fs = require('fs');
const os = require('os');
const path = require('path');

// ------------------------------------------------------ Felder erkennen ---

// "Letzter Kontakt", "letzter_kontakt", "LetzterKontakt" - fuer den
// Vergleich wird alles auf Kleinbuchstaben ohne Sonderzeichen gebracht.
function flach(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

// Welche Spaltennamen bedeuten was? Die Reihenfolge ist die Rangfolge:
// gibt es "kundenname" UND "name", gewinnt der erste Treffer in der Liste.
const FELDER = {
  name: ['name', 'kundenname', 'kunde', 'firma', 'firmenname', 'betrieb', 'unternehmen',
    'company', 'bezeichnung', 'titel', 'title'],
  telefon: ['telefon', 'telefonnummer', 'tel', 'phone', 'mobil', 'handy', 'mobile', 'nummer'],
  email: ['email', 'emailadresse', 'mail', 'mailadresse'],
  ort: ['ort', 'stadt', 'city', 'plzort', 'adresse'],
  status: ['status', 'stufe', 'phase', 'zustand', 'pipeline', 'stage', 'kategorie'],
  letzterKontakt: ['letzterkontakt', 'zuletztkontakt', 'letztertermin', 'zuletzt',
    'kontaktam', 'lastcontact', 'letzterkontaktam'],
  wiedervorlage: ['wiedervorlage', 'wiedervorlageam', 'folgetermin', 'naechsterkontakt',
    'nachsterkontakt', 'followup', 'faelligam', 'falligam', 'faellig', 'fallig', 'termin'],
  notiz: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar', 'note', 'notes', 'info'],
  wert: ['umsatz', 'monatlich', 'monatspreis', 'mrr', 'wert', 'betrag', 'honorar', 'preis'],
  produkt: ['produkt', 'produkte', 'leistung', 'leistungen', 'paket', 'tarif', 'vertrag', 'abo']
};

// Ein Datum in verschiedenen Schreibweisen -> "2026-08-15". Was kein Datum
// ist, kommt als null zurueck - so landet ein Ansprechpartner nicht
// versehentlich im Feld "letzter Kontakt".
function alsDatum(wert) {
  const t = String(wert === undefined || wert === null ? '' : wert).trim();
  if (!t) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(t);
  if (m) {
    const jahr = m[3].length === 2 ? '20' + m[3] : m[3];
    return jahr + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }

  // Zeitstempel in Millisekunden (so speichern viele selbstgebaute Sachen).
  if (/^\d{12,14}$/.test(t)) return new Date(Number(t)).toISOString().slice(0, 10);

  return null;
}

// "1.250,00 EUR" -> 1250. Keine Zahl erkennbar -> null.
function alsZahl(wert) {
  if (typeof wert === 'number') return isFinite(wert) ? wert : null;
  const t = String(wert === undefined || wert === null ? '' : wert).trim();
  if (!t) return null;
  const roh = t.replace(/[^0-9,.\-]/g, '');
  if (!roh || !/[0-9]/.test(roh)) return null;
  // Deutsche Schreibweise: Punkt trennt Tausender, Komma die Nachkommastellen.
  const zahl = parseFloat(roh.replace(/\./g, '').replace(',', '.'));
  return isFinite(zahl) ? zahl : null;
}

// Aus einem beliebigen Datensatz das herausholen, was wir brauchen.
// Gesucht wird zuerst oben, dann eine Ebene tiefer (viele Verwaltungen
// legen Kontaktdaten in ein Unterobjekt).
function feld(satz, kandidaten, pruefer) {
  const ebenen = [satz];
  for (const wert of Object.values(satz || {})) {
    if (wert && typeof wert === 'object' && !Array.isArray(wert)) ebenen.push(wert);
  }

  for (const wunsch of kandidaten) {
    for (const ebene of ebenen) {
      for (const [schluessel, wert] of Object.entries(ebene || {})) {
        if (flach(schluessel) !== wunsch) continue;
        if (wert === null || wert === undefined || wert === '') continue;
        if (pruefer) {
          const geprueft = pruefer(wert);
          if (geprueft !== null && geprueft !== undefined) return geprueft;
          continue;
        }
        if (Array.isArray(wert)) return wert.filter(Boolean).join(', ');
        if (typeof wert === 'object') continue;
        return String(wert).trim();
      }
    }
  }
  return null;
}

// Ein Datensatz aus dem CM -> die Form, mit der hier weitergearbeitet wird.
// `schluessel` ist der Objekt-Schluessel, falls die Kunden als
// { "la-piazza": {...} } abgelegt sind - dann ist das der Name.
function normalisiere(satz, schluessel) {
  if (!satz || typeof satz !== 'object') return null;

  const name = feld(satz, FELDER.name) || (schluessel ? lesbar(schluessel) : null);
  if (!name) return null;

  return {
    name: name,
    telefon: feld(satz, FELDER.telefon),
    email: feld(satz, FELDER.email),
    ort: feld(satz, FELDER.ort),
    status: feld(satz, FELDER.status),
    letzterKontakt: feld(satz, FELDER.letzterKontakt, alsDatum),
    wiedervorlage: feld(satz, FELDER.wiedervorlage, alsDatum),
    notiz: feld(satz, FELDER.notiz),
    wert: feld(satz, FELDER.wert, alsZahl),
    produkt: feld(satz, FELDER.produkt)
  };
}

// "la-piazza" -> "La Piazza"
function lesbar(schluessel) {
  return String(schluessel || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

// ---------------------------------------------------------- Dateien lesen -

// JSON kommt in drei Bauformen vor: eine Liste, ein Objekt mit einer Liste
// darin, oder ein Objekt, dessen Werte die Kunden sind.
function ausJson(inhalt) {
  let daten;
  try { daten = JSON.parse(inhalt); } catch (_e) { return []; }
  return ausDaten(daten);
}

function ausDaten(daten) {
  if (Array.isArray(daten)) {
    return daten.map((e) => normalisiere(e)).filter(Boolean);
  }
  if (!daten || typeof daten !== 'object') return [];

  for (const feldname of ['kunden', 'kundschaft', 'customers', 'clients', 'contacts',
    'kontakte', 'eintraege', 'daten', 'data', 'records', 'items', 'liste']) {
    if (Array.isArray(daten[feldname])) {
      return daten[feldname].map((e) => normalisiere(e)).filter(Boolean);
    }
    if (daten[feldname] && typeof daten[feldname] === 'object') {
      return ausObjekt(daten[feldname]);
    }
  }
  return ausObjekt(daten);
}

function ausObjekt(daten) {
  const kunden = [];
  for (const [schluessel, wert] of Object.entries(daten || {})) {
    if (schluessel.startsWith('_')) continue;          // Hinweise, Metadaten
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) continue;
    const k = normalisiere(wert, schluessel);
    if (k) kunden.push(k);
  }
  return kunden;
}

// Eine Zeile je Kunde - so schreiben Protokolle und einfache Datenbanken.
function ausJsonl(inhalt) {
  const kunden = [];
  for (const zeile of String(inhalt).split('\n')) {
    const t = zeile.trim();
    if (!t || t.startsWith('#')) continue;
    let satz;
    try { satz = JSON.parse(t); } catch (_e) { continue; }
    const k = normalisiere(satz);
    if (k) kunden.push(k);
  }
  return kunden;
}

// CSV aus Excel oder Numbers: Semikolon oder Komma, Anfuehrungszeichen
// moeglich. Kein Fremdpaket - so viel Regeln braucht es nicht.
function ausCsv(inhalt) {
  const zeilen = String(inhalt).split(/\r?\n/).filter((z) => z.trim());
  if (zeilen.length < 2) return [];

  const trenner = (zeilen[0].split(';').length > zeilen[0].split(',').length) ? ';' : ',';
  const kopf = csvZeile(zeilen[0], trenner);

  const kunden = [];
  for (const zeile of zeilen.slice(1)) {
    const werte = csvZeile(zeile, trenner);
    const satz = {};
    kopf.forEach((spalte, i) => { if (spalte) satz[spalte] = werte[i]; });
    const k = normalisiere(satz);
    if (k) kunden.push(k);
  }
  return kunden;
}

function csvZeile(zeile, trenner) {
  const felder = [];
  let aktuell = '';
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i];
    if (z === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') { aktuell += '"'; i++; }
      else inAnfuehrung = !inAnfuehrung;
    } else if (z === trenner && !inAnfuehrung) {
      felder.push(aktuell.trim());
      aktuell = '';
    } else {
      aktuell += z;
    }
  }
  felder.push(aktuell.trim());
  return felder;
}

// Eine Datei -> Kunden. Endung entscheidet, wie gelesen wird.
function ausDatei(pfad) {
  let inhalt;
  try { inhalt = fs.readFileSync(pfad, 'utf8'); } catch (_e) { return []; }
  if (/\.(jsonl|ndjson)$/i.test(pfad)) return ausJsonl(inhalt);
  if (/\.csv$/i.test(pfad)) return ausCsv(inhalt);
  return ausJson(inhalt);
}

// ------------------------------------------------------- Quellen finden ---

// Dateinamen, die nach Kundenverwaltung aussehen.
const NAME_PASST = /(crm|kunden|kundschaft|kundendaten|customers|clients|contacts|kontakte)/i;
// Ordner, in denen jede Datenbank-Datei zaehlt - da ist der Ordner schon
// die Ansage.
const ORDNER_PASST = /^(crm|cm|kundenverwaltung|kunden)$/i;
const LESBARE_ENDUNG = /\.(json|jsonl|ndjson|csv)$/i;
const DATENBANK_ENDUNG = /\.(db|sqlite|sqlite3)$/i;

// Ordner, in denen ueberhaupt gesucht wird. Kein Durchpfluegen der ganzen
// Platte: das dauert und findet am Ende doch das Falsche.
function suchOrte(heim) {
  const h = heim || os.homedir();
  const orte = [
    path.join(h, 'CRM'), path.join(h, 'CM'), path.join(h, 'Kundenverwaltung'),
    path.join(h, 'Documents', 'CRM'), path.join(h, 'Dokumente', 'CRM'),
    path.join(h, 'Desktop', 'CRM'), path.join(h, 'Projekte'), path.join(h, 'Projects')
  ];
  // Die Kurani-Unterlagen kennen wir schon - da liegt so etwas am ehesten.
  try {
    for (const ort of require('./kurani').ordner(h)) orte.push(ort);
  } catch (_e) { /* ohne Kurani-Baustein eben ohne */ }
  return orte;
}

// Kandidaten einsammeln. Gesucht wird flach (drei Ebenen), Bibliotheken
// und versteckte Ordner bleiben aussen vor.
function kandidaten(startOrte, tiefe) {
  const grenze = tiefe === undefined ? 3 : tiefe;
  const gefunden = [];
  let besucht = 0;

  const suche = (ort, ebene) => {
    if (ebene > grenze || besucht > 4000) return;
    let eintraege;
    try { eintraege = fs.readdirSync(ort, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of eintraege) {
      besucht++;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const voll = path.join(ort, e.name);
      if (e.isDirectory()) {
        if (ebene < grenze) suche(voll, ebene + 1);
        continue;
      }
      const imCmOrdner = ORDNER_PASST.test(path.basename(ort));
      if (LESBARE_ENDUNG.test(e.name) && (NAME_PASST.test(e.name) || imCmOrdner)) {
        gefunden.push({ art: 'datei', pfad: voll });
      } else if (DATENBANK_ENDUNG.test(e.name) && (NAME_PASST.test(e.name) || imCmOrdner)) {
        gefunden.push({ art: 'datenbank', pfad: voll });
      }
    }
  };

  for (const start of (startOrte || []).filter(Boolean)) {
    try { if (fs.statSync(start).isDirectory()) suche(start, 0); } catch (_e) { /* gibt es nicht */ }
  }
  return gefunden;
}

// Was in SPRACH_CRM steht, gewinnt: Pfade, Ordner oder eine Adresse eines
// laufenden CM. Mehrere durch Komma getrennt.
function ausEinstellung(wert) {
  const quellen = [];
  for (const roh of String(wert || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/^https?:\/\//i.test(roh)) { quellen.push({ art: 'adresse', pfad: roh }); continue; }
    let p = roh;
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
    p = path.resolve(p);
    let stat;
    try { stat = fs.statSync(p); } catch (_e) { quellen.push({ art: 'fehlt', pfad: p }); continue; }
    if (stat.isDirectory()) {
      for (const k of kandidaten([p], 2)) quellen.push(k);
    } else if (DATENBANK_ENDUNG.test(p)) {
      quellen.push({ art: 'datenbank', pfad: p });
    } else {
      quellen.push({ art: 'datei', pfad: p });
    }
  }
  return quellen;
}

// Alle Quellen, die es wirklich gibt - und aus denen auch Kunden purzeln.
// Eine JSON-Datei, die zufaellig "kunden" heisst, aber keine Kunden
// enthaelt, faellt hier raus.
function quellen(opts) {
  const o = opts || {};
  const eingestellt = o.einstellung !== undefined ? o.einstellung : process.env.SPRACH_CRM;
  const roh = eingestellt
    ? ausEinstellung(eingestellt)
    : kandidaten(suchOrte(o.heim));

  const gueltig = [];
  const gesehen = new Set();
  for (const q of roh) {
    if (gesehen.has(q.pfad)) continue;
    gesehen.add(q.pfad);
    if (q.art !== 'datei') { gueltig.push(q); continue; }
    const kunden = ausDatei(q.pfad);
    if (kunden.length) gueltig.push({ art: 'datei', pfad: q.pfad, anzahl: kunden.length });
  }
  return gueltig;
}

// ------------------------------------------------------------- Auswerten --

// Alle Kunden aus allen Dateien, Doppelte zusammengefuehrt. Zwei Dateien
// koennen denselben Kunden kennen - dann gewinnt der Datensatz mit mehr
// ausgefuellten Feldern.
function alleKunden(qList) {
  const liste = qList || quellen();
  const nachName = new Map();

  for (const q of liste) {
    if (q.art !== 'datei') continue;
    for (const kunde of ausDatei(q.pfad)) {
      kunde.quelle = q.pfad;
      const schluessel = flach(kunde.name);
      const vorhanden = nachName.get(schluessel);
      if (!vorhanden || gefuellt(kunde) > gefuellt(vorhanden)) nachName.set(schluessel, kunde);
    }
  }
  return Array.from(nachName.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function gefuellt(kunde) {
  return Object.values(kunde).filter((w) => w !== null && w !== undefined && w !== '').length;
}

// Laeuft das CM als Programm mit einer Adresse (SPRACH_CRM=http://...),
// wird sie hier abgefragt. Kurzer Zeitlimit: der Tagesbericht darf nicht
// haengen, weil das CM gerade nicht laeuft.
async function holeAdresse(url) {
  try {
    const antwort = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500)
    });
    if (!antwort.ok) return [];
    return ausDaten(await antwort.json());
  } catch (_e) {
    return [];                                  // CM aus, falsche Adresse, kein JSON
  }
}

// Wie alleKunden, aber ein laufendes CM wird mitgefragt.
async function alleKundenAsync(qList) {
  const liste = qList || quellen();
  const kunden = alleKunden(liste);
  const namen = new Set(kunden.map((k) => flach(k.name)));

  for (const q of liste) {
    if (q.art !== 'adresse') continue;
    for (const kunde of await holeAdresse(q.pfad)) {
      if (namen.has(flach(kunde.name))) continue;
      kunde.quelle = q.pfad;
      namen.add(flach(kunde.name));
      kunden.push(kunde);
    }
  }
  return kunden.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function heuteText(jetzt) {
  const d = jetzt || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function tageSeit(datum, jetzt) {
  if (!datum) return null;
  const dann = Date.parse(datum + 'T00:00:00');
  if (!isFinite(dann)) return null;
  const heute = Date.parse(heuteText(jetzt) + 'T00:00:00');
  return Math.round((heute - dann) / 86400000);
}

// Nach wie vielen Tagen ohne Kontakt wird ein Kunde still? 60 Tage sind
// zwei Monatsrechnungen - wer sich so lange nicht meldet, kuendigt bald.
const STILL_AB_TAGEN = 60;

function stand(jetzt, qList) {
  return standAus(alleKunden(qList), jetzt);
}

// Dasselbe, aber ein laufendes CM (Adresse) wird mitgefragt.
async function standAsync(jetzt, qList) {
  return standAus(await alleKundenAsync(qList), jetzt);
}

function standAus(kunden, jetzt) {
  const heute = heuteText(jetzt);

  const faellig = kunden.filter((k) => k.wiedervorlage && k.wiedervorlage <= heute);
  const still = kunden.filter((k) => {
    const tage = tageSeit(k.letzterKontakt, jetzt);
    return tage !== null && tage >= STILL_AB_TAGEN;
  });

  const nachStatus = new Map();
  for (const k of kunden) {
    if (!k.status) continue;
    const s = k.status.trim();
    nachStatus.set(s, (nachStatus.get(s) || 0) + 1);
  }

  const werte = kunden.map((k) => k.wert).filter((w) => typeof w === 'number' && w > 0);

  return {
    kunden: kunden,
    gesamt: kunden.length,
    faellig: faellig.sort((a, b) => a.wiedervorlage.localeCompare(b.wiedervorlage)),
    still: still.sort((a, b) => String(a.letzterKontakt).localeCompare(String(b.letzterKontakt))),
    nachStatus: Array.from(nachStatus.entries()).map(([status, anzahl]) => ({ status, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    wertSumme: werte.reduce((s, w) => s + w, 0),
    mitWert: werte.length
  };
}

// Kunden suchen: "piazza" findet "La Piazza Emden". Gesprochene Namen
// stimmen nie ganz - also nur der Kern muss passen.
function suche(name, kunden) {
  const gesucht = flach(name);
  if (!gesucht) return [];
  const liste = kunden || alleKunden();
  const genau = liste.filter((k) => flach(k.name) === gesucht);
  if (genau.length) return genau;
  return liste.filter((k) => {
    const n = flach(k.name);
    return n.indexOf(gesucht) > -1 || (gesucht.length >= 4 && gesucht.indexOf(n) > -1);
  });
}

// ---------------------------------------------------------- Fuer die Stimme

function euro(betrag) {
  return Math.round(Number(betrag) || 0).toLocaleString('de-DE') + ' Euro';
}

function datumWort(datum, jetzt) {
  const tage = tageSeit(datum, jetzt);
  if (tage === null) return String(datum || '');
  if (tage === 0) return 'heute';
  if (tage === 1) return 'gestern';
  if (tage === -1) return 'morgen';
  if (tage < 0) return 'in ' + (-tage) + ' Tagen';
  if (tage < 14) return 'vor ' + tage + ' Tagen';
  if (tage < 60) return 'vor ' + Math.round(tage / 7) + ' Wochen';
  return 'vor ' + Math.round(tage / 30) + ' Monaten';
}

// Wer heute ohnehin auf der Wiedervorlage steht, muss nicht zweimal
// vorkommen ("faellig: La Piazza. Lange nichts gehoert: La Piazza.").
function ohneDoppelte(still, faellig) {
  const genannt = new Set((faellig || []).map((k) => flach(k.name)));
  return (still || []).filter((k) => !genannt.has(flach(k.name)));
}

function namenListe(kunden, max) {
  const grenze = max || 3;
  const namen = kunden.slice(0, grenze).map((k) => k.name);
  const rest = kunden.length - namen.length;
  return namen.join(', ') + (rest > 0 ? ' und ' + rest + ' weitere' : '');
}

// Zwei, drei Saetze zum Stand - so, wie man es einem Kollegen sagt.
function crmSatz(s) {
  if (!s || !s.gesamt) {
    return 'In deinem CM finde ich keine Kundendaten. Steht der Pfad in der Punkt-E-N-V unter SPRACH_CRM?';
  }

  const saetze = ['Im CM stehen ' + s.gesamt + ' Kunden' +
    (s.wertSumme > 0 ? ', zusammen ' + euro(s.wertSumme) : '') + '.'];

  if (s.faellig.length) {
    saetze.push((s.faellig.length === 1 ? 'Eine Wiedervorlage ist faellig' : s.faellig.length + ' Wiedervorlagen sind faellig') +
      ': ' + namenListe(s.faellig) + '.');
  }

  const still = ohneDoppelte(s.still, s.faellig);
  if (still.length) {
    const erster = still[0];
    saetze.push((still.length === 1 ? 'Ein Kunde meldet sich lange nicht' : still.length + ' Kunden melden sich lange nicht') +
      ': ' + namenListe(still, 2) +
      (erster.letzterKontakt ? ' - zuletzt ' + datumWort(erster.letzterKontakt) : '') + '.');
  }

  if (!s.faellig.length && !still.length) saetze.push('Nichts faellig, nichts liegen geblieben.');

  return saetze.join(' ');
}

// Was weiss das CM ueber EINEN Kunden?
function kundeSatz(kunde, jetzt) {
  if (!kunde) return '';
  const teile = [kunde.name];
  if (kunde.ort) teile.push('aus ' + kunde.ort);
  if (kunde.status) teile.push('Status ' + kunde.status);

  const saetze = [teile.join(', ') + '.'];

  if (kunde.produkt) saetze.push('Er hat ' + kunde.produkt + (kunde.wert ? ' fuer ' + euro(kunde.wert) : '') + '.');
  else if (kunde.wert) saetze.push('Wert: ' + euro(kunde.wert) + '.');

  if (kunde.letzterKontakt) saetze.push('Letzter Kontakt ' + datumWort(kunde.letzterKontakt, jetzt) + '.');
  if (kunde.wiedervorlage) {
    const tage = tageSeit(kunde.wiedervorlage, jetzt);
    saetze.push(tage !== null && tage >= 0
      ? 'Wiedervorlage war ' + datumWort(kunde.wiedervorlage, jetzt) + ' - also ueberfaellig.'
      : 'Wiedervorlage ' + datumWort(kunde.wiedervorlage, jetzt) + '.');
  }
  if (kunde.notiz) saetze.push('Notiz: ' + kunde.notiz.replace(/\s+/g, ' ').slice(0, 160) + '.');

  return saetze.join(' ');
}

// Die Zeile fuer den Tagesbericht: nur, wenn es etwas zu tun gibt.
function tagesZeile(s) {
  if (!s || !s.gesamt) return '';
  const teile = [];
  if (s.faellig.length) {
    teile.push(s.faellig.length + ' Wiedervorlage' + (s.faellig.length === 1 ? '' : 'n') +
      ' faellig (' + namenListe(s.faellig, 2) + ')');
  }
  const still = ohneDoppelte(s.still, s.faellig);
  if (still.length) teile.push(still.length + ' Kunden ohne Kontakt seit ueber zwei Monaten');
  if (!teile.length) return '';
  return 'CM: ' + teile.join(', ') + '.';
}

// Was der Assistent ueber das CM wissen muss - kommt in den System-Prompt.
function systemHinweis(qList) {
  const liste = qList || [];
  if (!liste.length) return '';

  const dateien = liste.filter((q) => q.art === 'datei');
  const datenbanken = liste.filter((q) => q.art === 'datenbank');
  const adressen = liste.filter((q) => q.art === 'adresse');

  const teile = ['Ibo fuehrt seine Kunden in einem eigenen CM auf diesem Rechner.'];

  if (dateien.length) {
    teile.push('Die Daten liegen in ' + dateien.slice(0, 4).map((q) => q.pfad).join(', ') +
      (dateien.length > 4 ? ' und weiteren' : '') + '. Frag NICHT nach Kundendaten, die dort ' +
      'schon stehen - lies nach. Aendern tust du dort nichts; das macht Ibo im CM selbst.');
  }
  if (datenbanken.length) {
    teile.push('Ausserdem gibt es die Datenbank ' + datenbanken[0].pfad +
      ' - lesen kannst du sie mit sqlite3 auf der Kommandozeile (nur SELECT).');
  }
  if (adressen.length) {
    teile.push('Das CM laeuft unter ' + adressen[0].pfad + ' - von dort kannst du die Kundenliste holen.');
  }

  return teile.join(' ');
}

// Alles auf einmal - fuer Server und Selbstpruefung.
function finde(opts) {
  const q = quellen(opts);
  return { quellen: q, hinweis: systemHinweis(q) };
}

module.exports = {
  finde, quellen, alleKunden, alleKundenAsync, stand, standAsync, standAus, suche,
  crmSatz, kundeSatz, tagesZeile, systemHinweis,
  normalisiere, ausDaten, ausCsv, ausJsonl, ausDatei,
  alsDatum, alsZahl, flach, datumWort, tageSeit, lesbar,
  STILL_AB_TAGEN
};
