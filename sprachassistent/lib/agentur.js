'use strict';

// DIE AGENTUR — der Teil, an dem Geld haengt.
//
// Die Agentur-App (agentur/) ist die Oberflaeche fuer Kunden, Reports und
// die Neukunden-Pipeline. Der Sprachassistent muss sie nicht ersetzen -
// aber er soll auf Zuruf sagen koennen, wie es steht:
//
//   "Wie geht's der Agentur?"  ·  "Wer ist rot?"  ·  "Welche Reports fehlen?"
//
// Alles hier ist LESEND und laeuft OHNE Netz: die Bewertung kommt aus den
// Report-Daten, die ohnehin auf der Platte liegen. Die Ampel-Logik wird
// aus agentur/lib/gesundheit wiederverwendet - zwei verschiedene Urteile
// ueber denselben Kunden waeren schlimmer als gar keins.

const fs = require('fs');
const path = require('path');

const SICHT = path.join(__dirname, '..', '..', 'sichtbarkeit');
const DATEN = path.join(SICHT, 'data');
const REPORTS = path.join(SICHT, 'reports');

function monatVon(datum) {
  const d = datum || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Aus einem Slug wieder einen sprechbaren Namen machen: der Assistent
// liest "greetsieler-boerse" sonst als Buchstabensalat vor.
function nameAus(slug) {
  return String(slug || '')
    .replace(/^demo-/, '')
    .split('-')
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ')
    .replace(/\bBoerse\b/, 'Börse');
}

// Report-Historie eines Kunden, neuester zuerst - gleiche Dateien wie in
// der Agentur-App.
function historieVon(slug) {
  const ordner = path.join(DATEN, slug);
  if (!fs.existsSync(ordner)) return [];
  const eintraege = [];
  for (const datei of fs.readdirSync(ordner).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().reverse()) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
      eintraege.push({ monat: d.monat, quote: d.quote, telefon: d.telefon || null, erstellt: d.erstellt });
    } catch (_e) { /* kaputte Datei ueberspringen */ }
  }
  return eintraege;
}

// Welche Kunden gibt es? Die Ordner unter sichtbarkeit/data sind die
// Wahrheit auf dieser Platte - dafuer braucht es keine Datenbank.
function kundenSlugs() {
  if (!fs.existsSync(DATEN)) return [];
  return fs.readdirSync(DATEN, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('demo-') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

// Der Stand der Agentur - ohne Netz, ohne Datenbank.
function stand(jetzt) {
  const monat = monatVon(jetzt);
  let bewerteKunde;
  try {
    ({ bewerteKunde } = require('../../agentur/lib/gesundheit'));
  } catch (_e) {
    bewerteKunde = null;                       // Agentur-Baustein fehlt
  }

  const kunden = kundenSlugs().map((slug) => {
    const historie = historieVon(slug);
    const ampel = bewerteKunde ? bewerteKunde({ historie: historie, aktuellerMonat: monat }) : { stufe: 'unbekannt', gruende: [] };
    return {
      slug: slug,
      name: nameAus(slug),
      stufe: ampel.stufe,
      gruende: ampel.gruende || [],
      reportDiesenMonat: historie.some((h) => h.monat === monat),
      letzterMonat: historie[0] ? historie[0].monat : null
    };
  });

  return {
    monat: monat,
    kunden: kunden,
    rot: kunden.filter((k) => k.stufe === 'rot'),
    gelb: kunden.filter((k) => k.stufe === 'gelb'),
    ohneReport: kunden.filter((k) => !k.reportDiesenMonat),
    pipeline: pipelineStand(),
    reportsGesamt: fs.existsSync(REPORTS) ? fs.readdirSync(REPORTS).filter((f) => f.endsWith('.pdf')).length : 0
  };
}

// Neukunden-Pipeline: wie viele Interessenten, wie viele Wiedervorlagen
// sind faellig? Der Stand liegt als eine Datei in sichtbarkeit/data.
function pipelineStand(heute) {
  const datei = path.join(DATEN, 'pipeline.json');
  if (!fs.existsSync(datei)) return null;

  let stand;
  try { stand = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (_e) { return null; }
  const eintraege = Object.values(stand || {}).filter((e) => e && typeof e === 'object');
  if (!eintraege.length) return null;

  const heutText = (heute || new Date()).toISOString().slice(0, 10);
  const offen = eintraege.filter((e) => e.stufe !== 'kunde' && e.stufe !== 'kein-interesse');
  const faellig = offen.filter((e) => e.wiedervorlage && String(e.wiedervorlage) <= heutText);
  const termine = offen.filter((e) => e.stufe === 'termin');

  return { gesamt: eintraege.length, offen: offen.length, faellig: faellig.length, termine: termine.length };
}

// ---------------------------------------------------- Fuer die Stimme -----

// "2026-04" vorgelesen klingt wie eine Artikelnummer. Also: "April".
const MONATE = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function monatWort(monat, jetzt) {
  const teile = String(monat || '').split('-');
  const jahr = parseInt(teile[0], 10);
  const nummer = parseInt(teile[1], 10);
  if (!jahr || !nummer || nummer < 1 || nummer > 12) return String(monat || '');
  const heuteJahr = (jetzt || new Date()).getFullYear();
  return MONATE[nummer - 1] + (jahr === heuteJahr ? '' : ' ' + jahr);
}

// Aus einem Ampel-Grund einen Satz machen, den man hoeren kann.
function grundWort(grund, jetzt) {
  return String(grund || '').replace(/\b(\d{4})-(\d{2})\b/g, (t) => monatWort(t, jetzt));
}

function mehrzahl(anzahl, einzahl, mehrere) {
  return anzahl + ' ' + (anzahl === 1 ? einzahl : mehrere);
}

function namenListe(kunden, max) {
  const grenze = max || 3;
  const namen = kunden.slice(0, grenze).map((k) => k.name);
  const rest = kunden.length - namen.length;
  return namen.join(', ') + (rest > 0 ? ' und ' + rest + ' weitere' : '');
}

// Zwei, drei Saetze - so, wie man es einem Kollegen sagen wuerde.
function agenturSatz(s) {
  if (!s || !s.kunden.length) {
    return 'Zur Agentur finde ich keine Kundendaten auf der Platte. Lief der erste Report schon?';
  }

  const teile = [s.kunden.length + ' Kunden mit Reports'];
  if (s.rot.length) teile.push(s.rot.length + ' im roten Bereich');
  else if (s.gelb.length) teile.push(s.gelb.length + ' auf Gelb');
  else teile.push('alle im gruenen Bereich');

  const saetze = ['Agentur: ' + teile.join(', ') + '.'];

  if (s.rot.length) {
    const grund = s.rot[0].gruende && s.rot[0].gruende[0] ? ' - ' + grundWort(s.rot[0].gruende[0]) : '';
    saetze.push('Rot ' + (s.rot.length === 1 ? 'ist' : 'sind') + ' ' + namenListe(s.rot) + grund + '.');
  }

  if (s.ohneReport.length) {
    saetze.push('Fuer ' + monatWort(s.monat) + ' ' + (s.ohneReport.length === 1 ? 'fehlt noch ein Report' : 'fehlen noch ' + s.ohneReport.length + ' Reports') +
      ': ' + namenListe(s.ohneReport) + '.');
  }

  if (s.pipeline && s.pipeline.offen) {
    const p = [mehrzahl(s.pipeline.offen, 'offener Interessent', 'offene Interessenten')];
    if (s.pipeline.faellig) p.push(mehrzahl(s.pipeline.faellig, 'Wiedervorlage faellig', 'Wiedervorlagen faellig'));
    if (s.pipeline.termine) p.push(mehrzahl(s.pipeline.termine, 'Termin vereinbart', 'Termine vereinbart'));
    saetze.push('In der Pipeline: ' + p.join(', ') + '.');
  }

  return saetze.join(' ');
}

// Die Kurzform fuer den Tagesbericht: nur, wenn es etwas zu tun gibt.
function tagesZeile(s) {
  if (!s || !s.kunden.length) return '';
  const teile = [];
  if (s.rot.length) teile.push(s.rot.length + ' Kunde' + (s.rot.length === 1 ? '' : 'n') + ' im roten Bereich (' + namenListe(s.rot, 2) + ')');
  if (s.ohneReport.length) teile.push(s.ohneReport.length + ' Reports fehlen diesen Monat');
  if (s.pipeline && s.pipeline.faellig) teile.push(mehrzahl(s.pipeline.faellig, 'Wiedervorlage faellig', 'Wiedervorlagen faellig'));
  if (!teile.length) return '';
  return 'Agentur: ' + teile.join(', ') + '.';
}

module.exports = { stand, agenturSatz, tagesZeile, monatWort, grundWort, historieVon, kundenSlugs, pipelineStand, nameAus, monatVon };
