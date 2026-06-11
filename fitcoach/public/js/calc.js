// Ernährungs-Berechnungen: Grundumsatz (Mifflin-St Jeor), TDEE,
// Kalorienziel je nach Ziel und Makro-Verteilung.

export function berechneGrundumsatz({ gewicht, groesse, alter, geschlecht }) {
  const basis = 10 * gewicht + 6.25 * groesse - 5 * alter;
  return Math.round(geschlecht === 'm' ? basis + 5 : basis - 161);
}

export function berechneTDEE(grundumsatz, aktivitaetsfaktor) {
  return Math.round(grundumsatz * aktivitaetsfaktor);
}

// Makro-Verteilung für ein gegebenes Kalorienziel:
// Protein hoch (Sättigung + Muskelerhalt), Fett-Minimum, Rest Kohlenhydrate.
export function makros(kalorienziel, gewicht, ziel) {
  const proteinProKg = ziel === 'muskelaufbau' ? 2.0 : 2.2;
  const protein = Math.round(proteinProKg * gewicht);
  const fett = Math.round(0.9 * gewicht);
  const carbs = Math.max(0, Math.round((kalorienziel - protein * 4 - fett * 9) / 4));
  return { protein, carbs, fett };
}

export function berechneZiele({ gewicht, groesse, alter, geschlecht, aktivitaet, ziel }) {
  const grundumsatz = berechneGrundumsatz({ gewicht, groesse, alter, geschlecht });
  const tdee = berechneTDEE(grundumsatz, aktivitaet);

  let kalorienziel;
  if (ziel === 'abnehmen') {
    // moderates Defizit, aber nie unter ein gesundes Minimum
    kalorienziel = Math.max(tdee - 500, geschlecht === 'm' ? 1500 : 1200);
  } else if (ziel === 'muskelaufbau') {
    kalorienziel = tdee + 300;
  } else {
    kalorienziel = tdee; // Rekomposition: Erhaltung
  }

  return { grundumsatz, tdee, kalorienziel, ...makros(kalorienziel, gewicht, ziel) };
}

// Eigener Zeitraum: "X kg in Y Wochen" → nötige Tagesbilanz und Kalorienziel.
// Deckelt auf gesunde Grenzen und meldet, wenn der Wunsch zu schnell ist.
export function kalorienzielFuerZeitraum({ gewicht, zielgewicht, wochen, tdee, geschlecht }) {
  const diffKg = zielgewicht - gewicht;          // negativ = abnehmen
  if (!wochen || wochen < 1 || diffKg === 0) return null;

  const bilanz = (diffKg * 7700) / (wochen * 7); // kcal/Tag, negativ = Defizit
  const minKcal = geschlecht === 'm' ? 1500 : 1200;
  const rateProWoche = Math.abs(diffKg) / wochen;
  const maxRate = Math.max(0.4, gewicht * 0.01); // max ~1 % Körpergewicht/Woche

  let kalorienziel = Math.round(tdee + bilanz);
  let status = 'ok';
  let sichereWochen = null;

  if (diffKg < 0) {
    if (rateProWoche > maxRate || kalorienziel < minKcal) {
      status = 'zu_schnell';
      sichereWochen = Math.ceil(Math.abs(diffKg) / maxRate);
      kalorienziel = Math.max(kalorienziel, minKcal);
    } else if (rateProWoche > gewicht * 0.0075) {
      status = 'ambitioniert';
    }
  } else {
    // Aufbau: mehr als +500 kcal/Tag wird überwiegend Fett
    if (bilanz > 500) {
      status = 'zu_schnell';
      sichereWochen = Math.ceil((diffKg * 7700) / (500 * 7));
      kalorienziel = tdee + 500;
    }
  }

  return {
    kalorienziel,
    bilanz: Math.round(bilanz),
    rate: rateProWoche,
    status,
    sichereWochen,
    minKcal,
  };
}

// Realistisches Zeitfenster bis zum Zielgewicht (1 kg Fett ≈ 7700 kcal).
export function schaetzeZeitfenster({ gewicht, zielgewicht, ziel, tdee, kalorienziel }) {
  if (!zielgewicht || zielgewicht === gewicht) return null;
  const diffKg = zielgewicht - gewicht;
  const tagesbilanz = kalorienziel - tdee;
  if (diffKg * tagesbilanz <= 0) return null; // Ziel passt nicht zur Kalorienbilanz

  if (ziel === 'muskelaufbau') {
    // Muskelaufbau ist langsamer als die reine Kalorienrechnung: ~0.25 kg/Woche
    const wochen = Math.ceil(Math.abs(diffKg) / 0.25);
    return { wochen, rate: 0.25 };
  }
  const tage = Math.ceil(Math.abs(diffKg) * 7700 / Math.abs(tagesbilanz));
  const wochen = Math.ceil(tage / 7);
  return { wochen, rate: Math.abs(diffKg / wochen).toFixed(2) * 1 };
}

export function zieldatum(wochen) {
  const d = new Date();
  d.setDate(d.getDate() + wochen * 7);
  return d.toISOString().slice(0, 10);
}

// Verbleibende Wochen bis zum Zieldatum (nie negativ).
export function wochenBis(isoDatum) {
  if (!isoDatum) return null;
  const tage = (new Date(isoDatum) - new Date()) / 86400000;
  return Math.max(0, Math.ceil(tage / 7));
}

// Fortschritt 0..1 vom Start- zum Zielgewicht, anhand des aktuellen Gewichts.
export function zielFortschritt({ start, aktuell, ziel }) {
  if (start == null || ziel == null || start === ziel) return null;
  const gesamt = ziel - start;          // negativ beim Abnehmen
  const geschafft = aktuell - start;
  return Math.max(0, Math.min(1, geschafft / gesamt));
}
