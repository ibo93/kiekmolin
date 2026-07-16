'use strict';

// Der Umsatz-Nachweis des Telefon-Retters: Was hat der KI-Assistent dem
// Betrieb in einem Monat gebracht? Reservierungen, Gaeste, Bestellwert -
// gelesen aus DENSELBEN Tabellen, in die der Telefon-Retter schreibt
// (Quelle 'telefon'). Diese Zahlen sind das Herzstueck des Monats-Reports:
// sie zeigen dem Wirt in Euro, warum sich das Abo lohnt.
//
// Ehrlichkeit: Der Bestellwert ist ECHT (Summe der Telefon-Bestellungen).
// Der Reservierungs-Umsatz ist eine transparente SCHAETZUNG
// (Gaeste x Durchschnittsbon, BON_PRO_GAST in .env, Standard 25 Euro) -
// und wird im Report auch genau so beschriftet.

const supabase = require('./supabase');

const BON_STANDARD = 25; // Euro pro Gast - bewusst konservativ geschaetzt

function bonProGast() {
  const wert = Number(process.env.BON_PRO_GAST);
  return Number.isFinite(wert) && wert > 0 ? wert : BON_STANDARD;
}

// Monat 'JJJJ-MM' -> [von, bis) als Datums-Strings
function monatsGrenzen(monat) {
  const [jahr, m] = String(monat).split('-').map(Number);
  const von = monat + '-01';
  const bis = (m === 12 ? (jahr + 1) + '-01' : jahr + '-' + String(m + 1).padStart(2, '0')) + '-01';
  return { von, bis };
}

// Reine Auswertung (ohne Netz) - so bleibt die Rechnung testbar.
// Rueckruf-Wuensche, die als Fallback in reservations gelandet sind
// (Markierung 'RUECKRUF'), zaehlen NICHT als Reservierung.
function werteAus(reservierungen, bestellungen, bon) {
  const alleResis = Array.isArray(reservierungen) ? reservierungen : [];
  const alleBestellungen = Array.isArray(bestellungen) ? bestellungen : [];
  const istRueckruf = (r) => /RUECKRUF/.test(r.guest_name || '') || /\[RUECKRUF/.test(r.notes || '');
  const echte = alleResis.filter((r) => !istRueckruf(r));
  const gaeste = echte.reduce((s, r) => s + (parseInt(r.party_size, 10) || 0), 0);
  const gueltige = alleBestellungen.filter((b) => b.status !== 'cancelled');
  const bestellwert = Math.round(gueltige.reduce((s, b) => s + (Number(b.total) || 0), 0) * 100) / 100;
  const reservierungsUmsatz = gaeste * bon;

  // Verkaufsschlager am Telefon: welche Gerichte werden telefonisch am
  // haeufigsten bestellt? Echte Insights fuer den Wirt (Top 3 nach Menge).
  const mengen = new Map();
  for (const b of gueltige) {
    for (const artikel of Array.isArray(b.items) ? b.items : []) {
      const name = artikel && artikel.name;
      if (!name) continue;
      mengen.set(name, (mengen.get(name) || 0) + (parseInt(artikel.quantity, 10) || 1));
    }
  }
  const topGerichte = [...mengen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, menge]) => ({ name, menge }));

  return {
    reservierungen: echte.length,
    gaeste,
    rueckrufe: alleResis.length - echte.length,
    bestellungen: gueltige.length,
    bestellwert,
    bonProGast: bon,
    reservierungsUmsatz,
    gesamtGeschaetzt: Math.round((bestellwert + reservierungsUmsatz) * 100) / 100,
    topGerichte
  };
}

// Zahlen eines Monats aus der Datenbank holen. Liefert null, wenn die
// Tabellen nicht lesbar sind (dann laesst der Report die Sektion weg).
async function telefonZahlen(restaurantId, monat) {
  const { von, bis } = monatsGrenzen(monat);
  try {
    const [reservierungen, bestellungen] = await Promise.all([
      supabase.telefonReservierungen(restaurantId, von, bis),
      supabase.telefonBestellungen(restaurantId, von, bis)
    ]);
    return Object.assign({ monat }, werteAus(reservierungen, bestellungen, bonProGast()));
  } catch (_e) {
    return null;
  }
}

module.exports = { telefonZahlen, werteAus, monatsGrenzen, bonProGast };
