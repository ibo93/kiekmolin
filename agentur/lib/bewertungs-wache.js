'use strict';

// ============================================================
//  Bewertungs-Wache
//
//  Holt die Google-Bewertungen der betreuten Betriebe und meldet,
//  was seit dem letzten Blick dazugekommen ist.
//
//  Das ist der Unterschied zwischen einem Werkzeug und einer
//  Agentur: Ohne Wache erfaehrt man von einer schlechten Bewertung,
//  wenn der Wirt anruft - also Tage spaeter, wenn sie schon gelesen
//  wurde. Mit Wache weiss man es zuerst und ruft selbst an.
//
//  Braucht GOOGLE_PLACES_KEY in der .env. Ohne den Schluessel
//  meldet jede Funktion sauber, was fehlt - sie tut nicht so, als
//  haette sie nachgesehen.
// ============================================================

const fs = require('fs');
const path = require('path');

const BASIS = 'https://places.googleapis.com/v1';

function schluessel() {
  return process.env.GOOGLE_PLACES_KEY || '';
}

/* Die Ablage liegt neben den uebrigen Kundendaten. Eine Datei je Betrieb:
   der letzte gesehene Stand, damit "neu seit dem letzten Blick" ueberhaupt
   beantwortbar ist. */
function wachePfad(datenOrdner, slug) {
  return path.join(datenOrdner, slug, 'bewertungs-stand.json');
}

function liesStand(datenOrdner, slug) {
  try {
    return JSON.parse(fs.readFileSync(wachePfad(datenOrdner, slug), 'utf8'));
  } catch (_e) {
    return null;
  }
}

function schreibStand(datenOrdner, slug, stand) {
  const p = wachePfad(datenOrdner, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(stand, null, 2));
}

/* Die Place-ID einmalig ueber Name und Ort finden. Danach steht sie in der
   Kundendatei und wird nicht wieder gesucht - jede Suche kostet Geld. */
async function findePlaceId(name, ort) {
  const key = schluessel();
  if (!key) throw new Error('GOOGLE_PLACES_KEY fehlt in der .env');

  const antwort = await fetch(BASIS + '/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      textQuery: [name, ort].filter(Boolean).join(', '),
      languageCode: 'de',
      regionCode: 'DE',
      maxResultCount: 3
    })
  });

  if (!antwort.ok) {
    throw new Error('Places-Suche ' + antwort.status + ': ' + (await antwort.text()).slice(0, 180));
  }
  const d = await antwort.json();
  const treffer = (d.places || []).map((p) => ({
    id: p.id,
    name: (p.displayName && p.displayName.text) || '',
    adresse: p.formattedAddress || ''
  }));

  /* Bewusst KEINE automatische Auswahl bei mehreren Treffern. Der falsche
     Betrieb waere schlimmer als gar keiner: Man wuerde fremde Bewertungen
     ueberwachen und dem Wirt Zahlen zeigen, die nicht seine sind. */
  return treffer;
}

/* Bewertungen abrufen. Die Places-API liefert hoechstens fuenf Rezensionen -
   das reicht fuer die Frage "ist etwas Neues da?", nicht fuer ein Archiv. */
async function holeBewertungen(placeId) {
  const key = schluessel();
  if (!key) throw new Error('GOOGLE_PLACES_KEY fehlt in der .env');

  const antwort = await fetch(
    BASIS + '/places/' + encodeURIComponent(placeId) +
    '?languageCode=de&regionCode=DE',
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,reviews'
      },
      signal: AbortSignal.timeout(15000)
    }
  );

  if (!antwort.ok) {
    throw new Error('Places-Details ' + antwort.status + ': ' + (await antwort.text()).slice(0, 180));
  }
  const d = await antwort.json();

  return {
    name: (d.displayName && d.displayName.text) || '',
    schnitt: typeof d.rating === 'number' ? d.rating : null,
    anzahl: typeof d.userRatingCount === 'number' ? d.userRatingCount : null,
    bewertungen: (d.reviews || []).map((r) => ({
      /* Der Name ist die einzige stabile Kennung, die die API mitliefert;
         die Rezensions-ID aendert sich. Zusammen mit der Zeit reicht das,
         um dieselbe Bewertung wiederzuerkennen. */
      kennung: (r.name || '').split('/').pop() || '',
      sterne: r.rating || 0,
      text: (r.originalText && r.originalText.text) || (r.text && r.text.text) || '',
      autor: (r.authorAttribution && r.authorAttribution.displayName) || '',
      zeit: r.publishTime || ''
    }))
  };
}

/* Ein Durchgang fuer einen Betrieb: abrufen, mit dem letzten Stand
   vergleichen, den neuen Stand schreiben.

   Google rechnet jede Abfrage ab - mit reviews rund 4 Cent. Zweimal auf den
   Knopf geklickt kostet zweimal, und eine Bewertung aendert sich nicht im
   Minutentakt. Darum ein Mindestabstand: Wer frueher nachsieht, bekommt den
   gespeicherten Stand statt einer neuen Rechnung. */
const MINDESTABSTAND_MINUTEN = 60;

async function pruefe(datenOrdner, slug, placeId, erzwingen) {
  const vorher = liesStand(datenOrdner, slug);

  if (!erzwingen && vorher && vorher.zuletzt) {
    const alter = (Date.now() - new Date(vorher.zuletzt).getTime()) / 60000;
    if (alter < MINDESTABSTAND_MINUTEN) {
      return {
        name: vorher.name || '',
        schnitt: vorher.schnitt,
        anzahl: vorher.anzahl,
        ersterLauf: false,
        neu: [], schlecht: [], veraenderung: null,
        ausDemSpeicher: true,
        zuletzt: vorher.zuletzt
      };
    }
  }

  const jetzt = await holeBewertungen(placeId);

  const bekannt = new Set((vorher && vorher.gesehen) || []);
  const neu = jetzt.bewertungen.filter((b) => b.kennung && !bekannt.has(b.kennung));

  /* Beim ersten Durchgang ist alles "neu" - das waere ein Fehlalarm mit fuenf
     Meldungen. Der erste Lauf merkt sich nur den Stand. */
  const ersterLauf = !vorher;

  const stand = {
    placeId,
    name: jetzt.name,
    zuletzt: new Date().toISOString(),
    schnitt: jetzt.schnitt,
    anzahl: jetzt.anzahl,
    gesehen: jetzt.bewertungen.map((b) => b.kennung).filter(Boolean),
    /* Fuer die Entwicklung ueber die Zeit: je Durchgang eine Zeile. Der Wirt
       will im Bericht sehen, ob sich sein Schnitt bewegt. */
    verlauf: [
      ...((vorher && vorher.verlauf) || []).slice(-23),
      { zeit: new Date().toISOString(), schnitt: jetzt.schnitt, anzahl: jetzt.anzahl }
    ]
  };
  schreibStand(datenOrdner, slug, stand);

  return {
    name: jetzt.name,
    schnitt: jetzt.schnitt,
    anzahl: jetzt.anzahl,
    ersterLauf,
    neu: ersterLauf ? [] : neu,
    /* Was davon braucht Aufmerksamkeit? Alles unter vier Sternen. */
    schlecht: ersterLauf ? [] : neu.filter((b) => b.sterne && b.sterne <= 3),
    veraenderung: (vorher && typeof vorher.schnitt === 'number' && typeof jetzt.schnitt === 'number')
      ? Math.round((jetzt.schnitt - vorher.schnitt) * 100) / 100
      : null
  };
}

module.exports = { findePlaceId, holeBewertungen, pruefe, liesStand, schluessel };
