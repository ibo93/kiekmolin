'use strict';

// Bruecke zwischen der Agentur-App und dem Kurani-CRM (crm/).
//
// Warum es die braucht: bis jetzt sind das zwei Welten, die voneinander
// nichts wissen. In der Agentur steht die Neukunden-Pipeline (wer wurde
// angerufen, wo steht das Gespraech, was ist an seiner Website kaputt).
// Im CRM stehen die zahlenden Kunden mit Projekten, Rechnungen und
// Lastschriften. Dazwischen klafft genau die Luecke, in der Geld liegen
// bleibt:
//
//   - Ein Betrieb sagt zu. In der Pipeline steht "Kunde". Im CRM steht er
//     nicht - also gibt es keine Rechnung, kein Projekt, keinen Abo-Einzug.
//   - Umgekehrt: ein langjaehriger CRM-Kunde taucht als "Neu" in der
//     Pipeline auf und wird kalt angerufen wie ein Fremder.
//
// Beide Faelle faellt niemandem auf, solange sich die Systeme nicht kennen.
//
// ---- Wie die Verbindung laeuft -------------------------------------------
// Das CRM ist eine reine Browser-App: seine Daten liegen im localStorage
// des Browsers, kein Server kommt da heran. Die Agentur kann also nicht
// einfach "ins CRM schauen". Deshalb geht die Richtung anders herum: das
// CRM MELDET seine Kundenliste an die Agentur, sobald man die Agentur-Seite
// im CRM oeffnet.
//
// Und es meldet bewusst das Minimum: Nummer, Name, Ort. Keine Adresse,
// keine Bankverbindung, keine Umsaetze. Die Agentur muss nur wissen, WER
// Kunde ist - nicht, was er zahlt. Was nicht uebertragen wird, kann auch
// nicht aus Versehen in einem Report landen.

const { normalisiereName } = require('./pitch');

// Was von einem CRM-Kunden zur Agentur darf. Bewusst kurz gehalten.
const FELDER = ['id', 'nr', 'name', 'ort'];

// ------------------------------------------------------------ Eingang ------
// Aus der rohen Meldung des CRM eine saubere, sparsame Liste machen.
// Fremde Felder (Strasse, IBAN, Notizen) fallen hier weg - und zwar bevor
// irgendetwas auf die Platte geschrieben wird.
function baueCrmKunden(rohe) {
  const gesehen = new Set();
  const kunden = [];
  for (const r of Array.isArray(rohe) ? rohe : []) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name || r.firma || '').trim().slice(0, 120);
    if (!name) continue;
    const id = String(r.id || '').trim().slice(0, 60);
    // Derselbe Kunde zweimal gemeldet: die erste Meldung gewinnt.
    const schluessel = id || normalisiereName(name);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    kunden.push({
      id,
      nr: String(r.nr || '').trim().slice(0, 20),
      name,
      ort: String(r.ort || r.city || '').trim().slice(0, 80)
    });
  }
  return kunden;
}

// Die gespeicherte Datei lesen. Kaputt oder fehlend = leere Liste,
// niemals ein Absturz: das CRM ist Zubehoer, die Agentur laeuft auch ohne.
function leseCrmKunden(text) {
  let daten;
  try { daten = JSON.parse(String(text || '')); } catch (_e) { return leer(); }
  if (!daten || typeof daten !== 'object') return leer();
  // Zwei Formen erlaubt: die volle Datei {stand, kunden} oder blank ein Array.
  const rohe = Array.isArray(daten) ? daten : daten.kunden;
  return {
    stand: Array.isArray(daten) ? '' : String(daten.stand || ''),
    geraet: Array.isArray(daten) ? '' : String(daten.geraet || '').slice(0, 60),
    kunden: baueCrmKunden(rohe)
  };
}

function leer() {
  return { stand: '', geraet: '', kunden: [] };
}

// ------------------------------------------------------------ Abgleich -----
// Findet zu einem Pipeline-Eintrag den passenden CRM-Kunden.
//
// Der Namensvergleich ist absichtlich derselbe wie bei den Telefon-Kunden
// (normalisiereName + Teilstring), damit "Pizzeria La Piazza" und
// "La Piazza" derselbe Betrieb sind. Steht bei beiden ein Ort und die Orte
// widersprechen sich, gilt der Treffer NICHT - "Zur Muehle" gibt es in
// Ostfriesland mehrfach, und einen falschen Kunden zu verheiraten waere
// schlimmer als gar keinen zu finden.
function passtZu(eintrag, kunde) {
  const a = normalisiereName(eintrag && eintrag.name);
  const b = normalisiereName(kunde && kunde.name);
  if (!a || !b) return false;
  const namePasst = a === b ||
    (a.length >= 4 && b.includes(a)) ||
    (b.length >= 4 && a.includes(b));
  if (!namePasst) return false;
  const ortA = normalisiereName(eintrag && eintrag.stadt);
  const ortB = normalisiereName(kunde && kunde.ort);
  if (ortA && ortB && ortA !== ortB) return false;
  return true;
}

function findeKunden(eintrag, crmKunden) {
  return (crmKunden || []).find((k) => passtZu(eintrag, k)) || null;
}

// Haengt an jeden Eintrag der Pipeline seinen CRM-Kunden (oder null).
// Das Original wird nicht veraendert.
function verknuepfe(liste, crmKunden) {
  return (liste || []).map((e) => {
    const k = findeKunden(e, crmKunden);
    return Object.assign({}, e, {
      crm: k ? { id: k.id, nr: k.nr, name: k.name } : null
    });
  });
}

// ------------------------------------------------------------- Luecken -----
// Die zwei Faelle aus dem Kopf dieser Datei, als Liste:
//
//   fehltImCrm   - in der Agentur gewonnen, im CRM nicht angelegt.
//                  Solange das so ist, kann er keine Rechnung bekommen.
//   nurImCrm     - CRM-Kunde, der in der Pipeline noch als offener
//                  Interessent steht. Den bitte nicht kalt anrufen.
function luecken(liste, crmKunden) {
  const verbunden = verknuepfe(liste, crmKunden);
  const fehltImCrm = verbunden
    .filter((e) => (e.stufe === 'kunde' || e.istKunde) && !e.crm)
    .map((e) => ({ name: e.name, stadt: e.stadt, schluessel: e.schluessel }));
  const nurImCrm = verbunden
    .filter((e) => e.crm && !e.erledigt)
    .map((e) => ({
      name: e.name, stadt: e.stadt, schluessel: e.schluessel,
      stufe: e.stufe, kundennr: e.crm.nr
    }));
  return { fehltImCrm, nurImCrm };
}

// Ein Satz fuer den Tagesplan und den Wochen-Digest. Nur wenn es wirklich
// etwas zu tun gibt - eine Meldung "alles in Ordnung" liest nach der
// dritten Woche niemand mehr.
function satzFuerLuecken(l) {
  const a = (l && l.fehltImCrm || []).length;
  const b = (l && l.nurImCrm || []).length;
  const teile = [];
  if (a) {
    teile.push(a === 1
      ? '1 gewonnener Betrieb steht noch nicht im CRM - ohne ihn dort gibt es keine Rechnung'
      : a + ' gewonnene Betriebe stehen noch nicht im CRM - ohne sie dort gibt es keine Rechnung');
  }
  if (b) {
    teile.push(b === 1
      ? '1 CRM-Kunde haengt noch als offener Interessent in der Pipeline'
      : b + ' CRM-Kunden haengen noch als offene Interessenten in der Pipeline');
  }
  return teile.join('. ') + (teile.length ? '.' : '');
}

module.exports = {
  FELDER, baueCrmKunden, leseCrmKunden, passtZu, findeKunden,
  verknuepfe, luecken, satzFuerLuecken
};
