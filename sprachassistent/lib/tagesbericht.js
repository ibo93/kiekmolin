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

const wetter = require('./wetter');
const protokoll = require('./protokoll');

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
    }).catch((e) => { bericht.fehlt.push('Kiek mol in (' + e.message + ')'); })
  ];

  await Promise.all(aufgaben);

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
  if (bericht.plattform) zeilen.push(bericht.plattform);
  if (bericht.assistentKosten) {
    zeilen.push('Der Assistent hat heute ' + bericht.assistentKosten.toFixed(2).replace('.', ',') + ' Dollar gekostet.');
  }
  if (bericht.fehlt.length) zeilen.push('Nicht erreichbar: ' + bericht.fehlt.join('; ') + '.');
  return zeilen.join('\n');
}

module.exports = { sammle, alsText, plattformSatz, plattformZahlen, tagesAnrede, heuteISO };
