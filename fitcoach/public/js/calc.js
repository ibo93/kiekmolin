// Ernährungs-Berechnungen: Grundumsatz (Mifflin-St Jeor), TDEE,
// Kalorienziel je nach Ziel und Makro-Verteilung.

export function berechneGrundumsatz({ gewicht, groesse, alter, geschlecht }) {
  const basis = 10 * gewicht + 6.25 * groesse - 5 * alter;
  return Math.round(geschlecht === 'm' ? basis + 5 : basis - 161);
}

export function berechneTDEE(grundumsatz, aktivitaetsfaktor) {
  return Math.round(grundumsatz * aktivitaetsfaktor);
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

  // Protein hoch halten (Sättigung + Muskelerhalt), Fett-Minimum sichern,
  // Rest mit Kohlenhydraten auffüllen.
  const proteinProKg = ziel === 'muskelaufbau' ? 2.0 : 2.2;
  const protein = Math.round(proteinProKg * gewicht);
  const fett = Math.round(0.9 * gewicht);
  const carbs = Math.max(0, Math.round((kalorienziel - protein * 4 - fett * 9) / 4));

  return { grundumsatz, tdee, kalorienziel, protein, carbs, fett };
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
