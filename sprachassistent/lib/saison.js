'use strict';

// DIE SAISON — was JETZT verkauft werden muss, damit es rechtzeitig fertig ist.
//
// Das teuerste Missverstaendnis im Gastro-Geschaeft ist der Vorlauf:
// Der Gruenkohl laeuft von November bis Februar - vergeben werden die
// Karten, Plakate und Gruppen-Aktionen aber im SEPTEMBER. Wer im November
// anruft, kommt zu spaet und hoert "haben wir schon".
//
// Deshalb rechnet dieses Modul rueckwaerts: nicht "wann ist es soweit",
// sondern "ab wann muss ich darueber reden". Der Assistent sagt im
// Tagesbericht Bescheid, sobald ein Vorlauf beginnt.
//
// Alle Daten sind auf Ostfriesland gemuenzt - Kueste, Tourismus,
// Gruenkohl. Anpassen: einfach die Liste unten aendern.

// Bewegliche Feiertage: Ostern nach der Gauss-Formel, der Rest haengt
// dran. Ohne das waeren Ostern und Pfingsten jedes Jahr von Hand zu
// pflegen - und genau das vergisst man.
function ostern(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jahr, monat - 1, tag);
}

function tageSpaeter(datum, tage) {
  const d = new Date(datum.getTime());
  d.setDate(d.getDate() + tage);
  return d;
}

// Der n-te Wochentag eines Monats (fuer Muttertag: 2. Sonntag im Mai).
function nterWochentag(jahr, monat, wochentag, n) {
  const d = new Date(jahr, monat, 1);
  let gefunden = 0;
  while (d.getMonth() === monat) {
    if (d.getDay() === wochentag) {
      gefunden++;
      if (gefunden === n) return new Date(d.getTime());
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

// Die Anlaesse. vorlaufWochen = so lange VORHER muss man dran sein.
const ANLAESSE = [
  {
    name: 'Gruenkohl- und Kohlfahrt-Saison',
    datum: (j) => new Date(j, 10, 1),          // ab November
    vorlaufWochen: 12,        // Wirte entscheiden im September - also im August reden
    was: 'Kohlkarten, Gruppen-Plakate und die Anmeldung fuer Kohlfahrten. Das Wintergeschaeft in Ostfriesland - wer im September nicht dran ist, kommt zu spaet.'
  },
  {
    name: 'Weihnachtsfeiern',
    datum: (j) => new Date(j, 11, 1),
    vorlaufWochen: 12,       // Firmen buchen im Oktober
    was: 'Feier-Menuekarten und Flyer. Firmen buchen im Oktober, nicht im Dezember.'
  },
  {
    name: 'Silvester',
    datum: (j) => new Date(j, 11, 31),
    vorlaufWochen: 9,
    was: 'Silvestermenue, Plakat, Reservierungsseite.'
  },
  {
    name: 'Valentinstag',
    datum: (j) => new Date(j, 1, 14),
    vorlaufWochen: 4,
    was: 'Menue-Aktion und ein Reel. Klein, aber jedes Jahr sicher.'
  },
  {
    name: 'Saisonstart an der Kueste',
    datum: (j) => tageSpaeter(ostern(j), -14),
    vorlaufWochen: 12,      // der groesste Block: im Januar/Februar vergeben
    was: 'Neue Speisekarten, Aussenschilder, Fensterfolie, Terrassen-Fotos. Der groesste Auftragsblock im Jahr - er wird im Februar vergeben.'
  },
  {
    name: 'Ostern',
    datum: (j) => ostern(j),
    vorlaufWochen: 6,
    was: 'Oster-Aktion, Brunch-Karte, Social-Posts.'
  },
  {
    name: 'Muttertag',
    datum: (j) => nterWochentag(j, 4, 0, 2),
    vorlaufWochen: 5,
    was: 'Der umsatzstaerkste einzelne Sonntag im Jahr fuer viele Betriebe.'
  },
  {
    name: 'Pfingsten',
    datum: (j) => tageSpaeter(ostern(j), 49),
    vorlaufWochen: 5,
    was: 'Erstes langes Wochenende mit vollen Haeusern.'
  },
  {
    name: 'Sommerferien Niedersachsen',
    datum: (j) => new Date(j, 6, 1),
    vorlaufWochen: 10,
    was: 'Hauptsaison. Alles, was drucken muss, muss im Mai fertig sein.'
  },
  {
    name: 'Saisonende und Winterpause',
    datum: (j) => new Date(j, 9, 15),
    vorlaufWochen: 6,
    was: 'Das Gespraech ueber Winterpreise fuehren, BEVOR der Wirt von sich aus kuendigt. Und: Winter ist die Zeit, in der Content fuer die naechste Saison entsteht.'
  }
];

const MONATSNAMEN = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function datumWort(d) {
  return d.getDate() + '. ' + MONATSNAMEN[d.getMonth()];
}

// Was steht an? Ein Anlass zaehlt, sobald sein Vorlauf begonnen hat -
// und faellt raus, sobald er vorbei ist.
function anstehend(jetzt) {
  const heute = jetzt || new Date();
  const treffer = [];

  // Auch das naechste Jahr ansehen: im November ist Ostern schon relevant.
  for (const jahr of [heute.getFullYear(), heute.getFullYear() + 1]) {
    for (const a of ANLAESSE) {
      const datum = a.datum(jahr);
      if (!datum) continue;
      const vorlaufStart = tageSpaeter(datum, -a.vorlaufWochen * 7);
      if (heute < vorlaufStart || heute > datum) continue;

      const tage = Math.ceil((datum - heute) / 86400000);
      treffer.push({
        name: a.name,
        datum: datum,
        tage: tage,
        wochen: Math.round(tage / 7),
        was: a.was,
        knappWird: tage <= a.vorlaufWochen * 7 * 0.4      // letztes Drittel des Vorlaufs
      });
    }
  }

  return treffer.sort((x, y) => x.tage - y.tage);
}

// Ein Satz zum Vorlesen - nur das Naechste, nicht der ganze Kalender.
function saisonSatz(liste) {
  if (!liste || !liste.length) return '';
  const a = liste[0];
  const wann = a.wochen <= 1 ? 'in wenigen Tagen' : 'in ' + a.wochen + ' Wochen';
  return (a.knappWird ? 'Wird knapp: ' : '') + a.name + ' ist ' + wann +
    ' (' + datumWort(a.datum) + '). ' + a.was;
}

// Die Kurzform fuer den Tagesbericht.
function tagesZeile(liste) {
  if (!liste || !liste.length) return '';
  const a = liste[0];
  return 'Saison: ' + a.name + ' in ' + (a.wochen <= 1 ? 'wenigen Tagen' : a.wochen + ' Wochen') +
    (a.knappWird ? ' - wird knapp' : '') + '.';
}

module.exports = { anstehend, saisonSatz, tagesZeile, ostern, nterWochentag, datumWort, ANLAESSE };
