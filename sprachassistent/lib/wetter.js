'use strict';

// WETTER — ohne Schluessel, ohne Konto.
//
// Open-Meteo ist frei nutzbar und braucht keine Anmeldung. Damit kann der
// Assistent morgens sagen, was draussen los ist, ohne dass Ibo noch ein
// Konto anlegen muss.
//
// Standard ist Emden; anderer Ort ueber SPRACH_ORT (Name) und
// SPRACH_KOORDINATEN (Breite,Laenge) in der .env.

const STANDARD_ORT = 'Emden';
const STANDARD_KOORDINATEN = { breite: 53.3671, laenge: 7.2061 };

// Die Wetter-Codes des Deutschen Wetterdienstes in Klartext.
const WETTERLAGE = {
  0: 'klar', 1: 'meist klar', 2: 'teils bewoelkt', 3: 'bedeckt',
  45: 'neblig', 48: 'neblig mit Raureif',
  51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'starker Nieselregen',
  56: 'gefrierender Niesel', 57: 'gefrierender Niesel',
  61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen',
  66: 'gefrierender Regen', 67: 'gefrierender Regen',
  71: 'leichter Schnee', 73: 'Schnee', 75: 'starker Schnee', 77: 'Schneegriesel',
  80: 'einzelne Schauer', 81: 'Schauer', 82: 'kraeftige Schauer',
  85: 'Schneeschauer', 86: 'starke Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter mit Hagel'
};

function ort() {
  return process.env.SPRACH_ORT || STANDARD_ORT;
}

function koordinaten() {
  const roh = String(process.env.SPRACH_KOORDINATEN || '').split(',');
  const breite = parseFloat(roh[0]);
  const laenge = parseFloat(roh[1]);
  if (isFinite(breite) && isFinite(laenge)) return { breite: breite, laenge: laenge };
  return STANDARD_KOORDINATEN;
}

async function hole() {
  const k = koordinaten();
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: k.breite,
    longitude: k.laenge,
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunset',
    timezone: 'Europe/Berlin',
    forecast_days: '1',
    wind_speed_unit: 'kmh'
  }).toString();

  const antwort = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!antwort.ok) throw new Error('Wetterdienst antwortet nicht (' + antwort.status + ')');
  return antwort.json();
}

// --------------------------------------------------- Fuer die Stimme ------

function lage(code) {
  return WETTERLAGE[code] !== undefined ? WETTERLAGE[code] : 'wechselhaft';
}

function grad(wert) {
  return Math.round(Number(wert) || 0) + ' Grad';
}

// Ein bis zwei Saetze, die man vorlesen kann.
function wetterSatz(daten, ortsname) {
  const jetzt = (daten && daten.current) || {};
  const heute = (daten && daten.daily) || {};
  const nimm = (feld) => (Array.isArray(heute[feld]) ? heute[feld][0] : undefined);

  const teile = [];
  teile.push('In ' + (ortsname || ort()) + ' sind es gerade ' + grad(jetzt.temperature_2m) +
    ' bei ' + lage(jetzt.weather_code) + '.');

  const hoch = nimm('temperature_2m_max');
  const tief = nimm('temperature_2m_min');
  const regen = nimm('precipitation_probability_max');
  const zweiter = [];
  if (hoch !== undefined) zweiter.push('Heute bis ' + grad(hoch) + (tief !== undefined ? ', nachts ' + grad(tief) : ''));
  if (regen !== undefined) zweiter.push(regen >= 30 ? 'Regenrisiko ' + Math.round(regen) + ' Prozent' : 'kaum Regen');
  const wind = Math.round(Number(jetzt.wind_speed_10m) || 0);
  if (wind >= 30) zweiter.push('Wind mit ' + wind + ' Stundenkilometern - ostfriesisch frisch');
  if (zweiter.length) teile.push(zweiter.join(', ') + '.');

  return teile.join(' ');
}

// Der praktische Teil: kann man heute draussen drehen oder Folie kleben?
// Folie will trocken und nicht zu kalt, Dreharbeiten wollen kein Gewitter.
function arbeitsHinweis(daten) {
  const jetzt = (daten && daten.current) || {};
  const heute = (daten && daten.daily) || {};
  const nimm = (feld) => (Array.isArray(heute[feld]) ? heute[feld][0] : undefined);

  const regen = Number(nimm('precipitation_probability_max'));
  const code = Number(nimm('weather_code'));
  const wind = Number(jetzt.wind_speed_10m) || 0;
  const temperatur = Number(nimm('temperature_2m_max'));

  if (code >= 95) return 'Gewitter angesagt - draussen heute nichts planen.';
  if (regen >= 60) return 'Zu nass fuer Dreh und Folie - heute drinnen arbeiten.';
  if (wind >= 40) return 'Zu windig fuer Folie und Aussenaufnahmen.';
  if (temperatur < 8) return 'Zu kalt zum Folienkleben - die haftet unter acht Grad schlecht.';
  if (regen < 20 && code <= 3) return 'Gutes Wetter zum Drehen und fuer Aussenmontage.';
  return '';
}

module.exports = { hole, wetterSatz, arbeitsHinweis, lage, ort, koordinaten, WETTERLAGE };
