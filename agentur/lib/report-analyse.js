'use strict';

// Sammelt alles, was die Analyse im Monats-Report braucht, und uebergibt es
// an sichtbarkeit/lib/analyse.js.
//
// Warum hier und nicht im Sichtbarkeit-Baustein: Die Agentur-App kennt alle
// Auswertungen (Speisekarten-Doktor, Gaeste-Ursprung, Rueckgewinnung,
// Fruehwarnung), der Sichtbarkeit-Baustein soll die nicht kennen muessen -
// er bleibt der schlanke Teil, der auch allein per Kommandozeile laeuft.
//
// Alles hier ist LESEN. Faellt eine Quelle aus, fehlt im Report der
// entsprechende Punkt - der Report kommt trotzdem. Ein Monats-Report darf
// nie an einer Zusatz-Auswertung scheitern.

const supabase = require('../../sichtbarkeit/lib/supabase');
const report = require('../../sichtbarkeit/lib/report');
const { baueAnalyse } = require('../../sichtbarkeit/lib/analyse');
const { monatsGrenzen, bonProGast } = require('../../sichtbarkeit/lib/telefonzahlen');
const herkunftLib = require('./herkunft');
const doktorLib = require('./speisekarte-doktor');
const rueckLib = require('./rueckgewinnung');
const fruehLib = require('./fruehwarnung');

const TAG_MS = 864e5;

async function still(versprechen, ersatz) {
  try {
    return await versprechen;
  } catch (_e) {
    return ersatz;
  }
}

// restaurant: der Kunde (id, name, slug)
// daten: { monat, ergebnis, vormonat, telefon, demoDaten }
async function sammle(restaurant, daten) {
  const d = daten || {};
  const monat = d.monat;
  const quoteJetzt = d.ergebnis ? report.quote(d.ergebnis) : null;
  const vormonatQuote = d.vormonat && d.vormonat.quote ? d.vormonat.quote.prozent : null;
  const radarZeilen = d.ergebnis ? report.wettbewerbsRadar(d.ergebnis, d.vormonat) : [];

  const grund = {
    monatLabel: report.monatsLabel(monat),
    quote: quoteJetzt,
    vormonatQuote,
    telefon: d.telefon || null,
    ergebnis: d.ergebnis,
    vormonat: d.vormonat,
    radarZeilen
  };

  // Im Demo-Modus keine Datenbank anfassen - Beispielwerte reichen, damit
  // die Analyse-Sektion vorfuehrbar ist.
  if (d.demoDaten) {
    return baueAnalyse(Object.assign(grund, {
      herkunft: { vorgaengeGesamt: 57, vorgaengeUnser: 38, anteilProzent: 67, umsatzUnser: 1769.1, gaesteUnser: 51 },
      doktor: {
        potenzial: 100,
        befunde: [{
          typ: 'unterpreis', gericht: 'Pizza Margherita', prio: 'hoch', aufwand: '5 Minuten', potenzial: 100,
          text: 'Pizza Margherita läuft stark (40×), kostet aber 8,50 € – der Schnitt liegt bei 11,00 €.',
          empfehlung: 'Preis behutsam auf 11,00 € anheben.'
        }]
      },
      rueckgewinnung: { anzahl: 3, stammgaeste: 1, potenzial: 175 },
      fruehwarnung: null
    }));
  }

  const { von, bis } = monatsGrenzen(monat);
  const ab90 = new Date(Date.now() - 90 * TAG_MS).toISOString().slice(0, 10);
  const ab365 = new Date(Date.now() - 365 * TAG_MS).toISOString().slice(0, 10);
  const ab36 = new Date(Date.now() - 36 * TAG_MS).toISOString().slice(0, 10);

  const [hResi, hBest, karte, artikel, gResi, gBest, fResi, fBest] = await Promise.all([
    still(supabase.herkunftReservierungen(restaurant.id, von, bis), []),
    still(supabase.herkunftBestellungen(restaurant.id, von, bis), []),
    still(supabase.speisekarte(restaurant.id), []),
    still(supabase.bestellArtikel(restaurant.id, ab90), []),
    still(supabase.gaesteReservierungen(restaurant.id, ab365), []),
    still(supabase.gaesteBestellungen(restaurant.id, ab365), []),
    still(supabase.gaesteReservierungen(restaurant.id, ab36), []),
    still(supabase.gaesteBestellungen(restaurant.id, ab36), [])
  ]);

  const herkunft = herkunftLib.bilanz(
    herkunftLib.nachKanaelen({ reservierungen: hResi, bestellungen: hBest }, { bonProGast: bonProGast() })
  );
  const doktor = doktorLib.analysiere(karte, artikel);
  const rueckgewinnung = rueckLib.bilanz(
    rueckLib.findeInaktive(
      rueckLib.fasseGaesteZusammen({ reservierungen: gResi, bestellungen: gBest }),
      { schwelleTage: 90, bonProGast: bonProGast() }
    )
  );
  const fruehwarnung = fruehLib.pruefeKunde({
    reservierungsDaten: fResi.map((r) => r.reservation_date),
    bestellDaten: fBest.map((b) => b.created_at)
  });

  return baueAnalyse(Object.assign(grund, { herkunft, doktor, rueckgewinnung, fruehwarnung }));
}

module.exports = { sammle };
