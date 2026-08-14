'use strict';

// TAGESBERICHT — die harten Zahlen fuer "was steht heute an".
//
// Was Claude selbst weiss (Roadmap, offene Rechnungen, Kundenakten), holt
// er sich ueber seine Skills. Was er NICHT wissen kann - das Wetter von
// heute und der aktuelle Stand in der Datenbank - steht hier.
//
// Jede Quelle wird einzeln abgefragt und einzeln aufgefangen: faellt eine
// aus (kein Netz, keine Supabase-Schluessel), fehlt nur diese Zeile.
// Ein Tagesbericht, der wegen des Wetterdienstes ganz ausfaellt, waere
// schlechter als einer ohne Wetter.

const fs = require('fs');
const path = require('path');
const wetter = require('./wetter');
const protokoll = require('./protokoll');
const notizen = require('./notizen');
const wache = require('./wache');

function heuteISO(jetzt) {
  const d = jetzt || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function tagesAnrede(jetzt) {
  const d = jetzt || new Date();
  const stunde = d.getHours();
  const gruss = stunde < 11 ? 'Moin' : (stunde < 18 ? 'Hallo' : 'Nabend');
  return gruss + ', ' + WOCHENTAGE[d.getDay()] + ' der ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
}

// --- Kiek mol in: was heute in der Datenbank steht --------------------------
async function plattformZahlen(datum) {
  const supabase = require('../../telefon-retter/lib/supabase');
  const tag = datum || heuteISO();

  const reservierungen = await supabase.supabaseGet(
    'reservations?reservation_date=eq.' + encodeURIComponent(tag) +
    '&status=in.(confirmed,pending)&select=id,party_size,status,restaurant_id'
  );

  const gaeste = reservierungen.reduce((summe, r) => summe + (Number(r.party_size) || 0), 0);
  const offen = reservierungen.filter((r) => r.status === 'pending').length;

  // Bestellungen von heute (created_at ist ein Zeitstempel).
  let bestellungen = [];
  try {
    bestellungen = await supabase.supabaseGet(
      'orders?created_at=gte.' + tag + 'T00:00:00&select=id,total_amount,status'
    );
  } catch (_e) { /* Tabelle/Spalte anders benannt - dann eben ohne */ }

  let rueckrufe = [];
  try { rueckrufe = await supabase.offeneRueckrufe(); } catch (_e) { /* egal */ }

  return {
    reservierungen: reservierungen.length,
    gaeste: gaeste,
    unbestaetigt: offen,
    bestellungen: bestellungen.length,
    umsatz: Math.round(bestellungen.reduce((s, b) => s + (Number(b.total_amount) || 0), 0) * 100) / 100,
    rueckrufe: rueckrufe.length
  };
}

// Ein Satz aus den Zahlen - oder leer, wenn heute nichts los ist.
function plattformSatz(z) {
  if (!z) return '';
  const teile = [];
  if (z.reservierungen) {
    teile.push(z.reservierungen + ' Reservierung' + (z.reservierungen === 1 ? '' : 'en') +
      (z.gaeste ? ' fuer ' + z.gaeste + ' Gaeste' : ''));
  }
  if (z.unbestaetigt) teile.push(z.unbestaetigt + ' davon noch unbestaetigt');
  if (z.bestellungen) teile.push(z.bestellungen + ' Bestellungen' + (z.umsatz ? ' ueber ' + z.umsatz.toFixed(2).replace('.', ',') + ' Euro' : ''));
  if (z.rueckrufe) teile.push(z.rueckrufe + ' offene Rueckrufe');
  if (!teile.length) return 'Bei Kiek mol in ist heute noch nichts eingetragen.';
  return 'Bei Kiek mol in: ' + teile.join(', ') + '.';
}

// --- Telefon-Retter: was gestern und heute am Telefon passiert ist ---------
// Der Anruf-Server schreibt eine Zeile JSON pro Anruf. Die lesen wir
// direkt - kein zweiter Dienst noetig.
function telefonZahlen(datum) {
  const ordner = path.join(__dirname, '..', '..', 'telefon-retter', 'logs');
  if (!fs.existsSync(ordner)) return null;

  const tag = datum || heuteISO();
  let heute = 0, reservierungen = 0, bestellungen = 0, rueckrufe = 0;

  for (const datei of fs.readdirSync(ordner).filter((f) => f.endsWith('.jsonl'))) {
    for (const zeile of fs.readFileSync(path.join(ordner, datei), 'utf8').split('\n')) {
      if (!zeile.trim()) continue;
      let a;
      try { a = JSON.parse(zeile); } catch (_e) { continue; }
      if (String(a.zeit || '').slice(0, 10) !== tag) continue;
      heute++;
      reservierungen += Number(a.reservierungen) || 0;
      bestellungen += Number(a.bestellungen) || 0;
      rueckrufe += Number(a.rueckrufe) || 0;
    }
  }
  if (!heute) return null;
  return { anrufe: heute, reservierungen: reservierungen, bestellungen: bestellungen, rueckrufe: rueckrufe };
}

function telefonSatz(t) {
  if (!t) return '';
  const teile = [];
  if (t.reservierungen) teile.push(t.reservierungen + ' Reservierung' + (t.reservierungen === 1 ? '' : 'en'));
  if (t.bestellungen) teile.push(t.bestellungen + ' Bestellungen');
  if (t.rueckrufe) teile.push(t.rueckrufe + ' Rueckrufwuensche');
  return 'Der Telefon-Retter hat heute ' + t.anrufe + ' Anruf' + (t.anrufe === 1 ? '' : 'e') +
    ' angenommen' + (teile.length ? ' und daraus ' + teile.join(', ') + ' gemacht' : '') + '.';
}

// --- Alles zusammen ---------------------------------------------------------

// Sammelt, was zu holen ist. Liefert immer ein Ergebnis - fehlende Quellen
// stehen unter 'fehlt', damit der Assistent sagen kann, was er nicht weiss.
async function sammle(optionen) {
  const o = optionen || {};
  const jetzt = o.jetzt || new Date();
  const bericht = { anrede: tagesAnrede(jetzt), datum: heuteISO(jetzt), fehlt: [] };

  const aufgaben = [
    wetter.hole().then((d) => {
      bericht.wetter = wetter.wetterSatz(d);
      bericht.arbeitsHinweis = wetter.arbeitsHinweis(d);
    }).catch((e) => { bericht.fehlt.push('Wetter (' + e.message + ')'); }),

    plattformZahlen(bericht.datum).then((z) => {
      bericht.zahlen = z;
      bericht.plattform = plattformSatz(z);
    }).catch((e) => { bericht.fehlt.push('Kiek mol in (' + e.message + ')'); }),

    wache.pruefe().then((w) => {
      bericht.wache = w;
      // Laeuft alles, reicht der Halbsatz - nur Stoerungen brauchen Worte.
      bericht.wacheSatz = w.ok ? '' : wache.wacheSatz(w);
    }).catch(() => { /* keine Aussage ist besser als eine falsche */ })
  ];

  await Promise.all(aufgaben);

  // Das Gedaechtnis: was heute faellig ist und was sonst noch offen liegt.
  try {
    const faellig = notizen.faelligBis(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 23, 59));
    const offen = notizen.offene();
    if (faellig.length) bericht.notizenHeute = notizen.formuliere(faellig, jetzt);
    const ohneTermin = offen.length - faellig.length;
    if (ohneTermin > 0) bericht.notizenOffen = ohneTermin;
  } catch (_e) { /* ohne Notizen geht es auch */ }

  try {
    const t = telefonZahlen(bericht.datum);
    if (t) bericht.telefon = telefonSatz(t);
  } catch (_e) { /* Logs nicht lesbar - dann eben ohne */ }

  try {
    const kosten = protokoll.tagesKosten(bericht.datum);
    if (kosten) bericht.assistentKosten = kosten;
  } catch (_e) { /* egal */ }

  return bericht;
}

// Der Text, den das Werkzeug ausgibt - kurz, sprechbar, ohne Zeichensalat.
function alsText(bericht) {
  const zeilen = [bericht.anrede];
  if (bericht.wetter) zeilen.push(bericht.wetter);
  if (bericht.arbeitsHinweis) zeilen.push(bericht.arbeitsHinweis);
  if (bericht.wacheSatz) zeilen.push(bericht.wacheSatz);   // nur bei Stoerung
  if (bericht.plattform) zeilen.push(bericht.plattform);
  if (bericht.telefon) zeilen.push(bericht.telefon);
  if (bericht.notizenHeute) zeilen.push('Auf deiner Liste steht fuer heute: ' + bericht.notizenHeute);
  if (bericht.notizenOffen) zeilen.push('Dazu ' + bericht.notizenOffen + ' Notizen ohne Termin.');
  if (bericht.assistentKosten) {
    zeilen.push('Der Assistent hat heute ' + bericht.assistentKosten.toFixed(2).replace('.', ',') + ' Dollar gekostet.');
  }
  if (bericht.fehlt.length) zeilen.push('Nicht erreichbar: ' + bericht.fehlt.join('; ') + '.');
  return zeilen.join('\n');
}

// --- Feierabend: was war heute? --------------------------------------------
// Fuer die Frage, die jeder Selbststaendige abends hat und morgen frueh
// nicht mehr beantworten kann: "was hab ich heute eigentlich gemacht?"
// Grundlage fuer Stundenzettel und Rechnungen.
function abendBericht(datum, jetzt) {
  const tag = datum || heuteISO(jetzt);
  const ergebnis = { datum: tag, auftraege: [], erledigt: [], diktate: [], kosten: 0 };

  try {
    ergebnis.auftraege = protokoll.letzte(200)
      .filter((e) => String(e.zeit || '').slice(0, 10) === tag && e.frage && !e.demo)
      .map((e) => ({ frage: e.frage, ordner: e.ordner, minuten: Math.round((e.sekunden || 0) / 60) }));
  } catch (_e) { /* ohne Protokoll */ }

  try {
    ergebnis.erledigt = notizen.alle()
      .filter((n) => n.erledigt && String(n.erledigt).slice(0, 10) === tag)
      .map((n) => n.text);
  } catch (_e) { /* ohne Notizen */ }

  try {
    const ordner = path.join(__dirname, '..', 'diktate');
    if (fs.existsSync(ordner)) {
      ergebnis.diktate = fs.readdirSync(ordner).filter((f) => f.indexOf(tag) === 0);
    }
  } catch (_e) { /* ohne Diktate */ }

  try { ergebnis.kosten = protokoll.tagesKosten(tag); } catch (_e) { /* egal */ }
  return ergebnis;
}

function abendText(b) {
  const zeilen = ['Was heute war (' + b.datum + '):'];
  if (b.auftraege.length) {
    zeilen.push(b.auftraege.length + ' Aufgaben ueber den Assistenten:');
    b.auftraege.slice(0, 15).forEach((a) => zeilen.push('- ' + a.frage + (a.ordner && a.ordner !== '-' ? ' [' + a.ordner + ']' : '')));
  }
  if (b.erledigt.length) {
    zeilen.push('Abgehakt: ' + b.erledigt.join('; ') + '.');
  }
  if (b.diktate.length) zeilen.push('Diktate: ' + b.diktate.join(', ') + '.');
  if (!b.auftraege.length && !b.erledigt.length && !b.diktate.length) {
    zeilen.push('Ueber den Assistenten lief heute nichts.');
  }
  return zeilen.join('\n');
}

module.exports = {
  sammle, alsText, plattformSatz, plattformZahlen, tagesAnrede, heuteISO,
  telefonZahlen, telefonSatz, abendBericht, abendText
};
