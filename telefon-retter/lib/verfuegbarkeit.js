'use strict';

// Verfuegbarkeitspruefung fuer Telefon-Reservierungen.
//
// WICHTIG: Das ist eine 1:1-Portierung der Logik aus der App
// (index.html: generateReservationSlots + getTableAvailabilityByTime).
// Telefon-Reservierungen laufen damit durch DIESELBE Pruefung wie online -
// kein Doppel-Booking. Wenn die App-Logik sich aendert, hier nachziehen.

// Lokales Datum (JJJJ-MM-TT) - bewusst NICHT toISOString(), das waere UTC
// und wuerde nachts zwischen 0 und 2 Uhr deutscher Zeit den Vortag liefern.
function lokalesDatum(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// "9:00", "19.30", "19" -> "09:00", "19:30", "19:00"
function normalisiereUhrzeit(uhrzeit) {
  const s = String(uhrzeit || '').trim();
  let m = s.match(/^(\d{1,2})[:.](\d{2})/);
  if (m) return m[1].padStart(2, '0') + ':' + m[2];
  m = s.match(/^(\d{1,2})$/);
  if (m) return m[1].padStart(2, '0') + ':00';
  return s.slice(0, 5);
}

function minutenAbziehen(zeit, minuten) {
  const [h, m] = zeit.split(':').map(Number);
  let gesamt = h * 60 + m - minuten;
  if (gesamt < 0) gesamt = 0;
  return String(Math.floor(gesamt / 60)).padStart(2, '0') + ':' + String(gesamt % 60).padStart(2, '0');
}

// Alle buchbaren Zeitslots eines Restaurants (wie generateReservationSlots)
function slotsFuer(restaurant) {
  let start = restaurant.opening_time || '11:00';
  let ende = restaurant.closing_time ? minutenAbziehen(restaurant.closing_time, 30) : '21:30';
  const intervall = restaurant.slot_interval_minutes || 30;
  let pauseStart = '14:00';
  let pauseEnde = '17:00';
  let pauseAktiv = true;
  let deaktivierteSlots = [];

  const oz = restaurant.opening_hours;
  if (oz) {
    if (oz.pause_start) pauseStart = oz.pause_start;
    if (oz.pause_end) pauseEnde = oz.pause_end;
    if (oz.pause_enabled === false) pauseAktiv = false;
    if (oz.disabled_slots) deaktivierteSlots = oz.disabled_slots;
  }

  const zuMin = (z) => parseInt(z.split(':')[0], 10) * 60 + parseInt(z.split(':')[1], 10);
  const startMin = zuMin(start.slice(0, 5));
  const endeMin = zuMin(ende.slice(0, 5));
  const pauseStartMin = pauseAktiv ? zuMin(pauseStart) : -1;
  const pauseEndeMin = pauseAktiv ? zuMin(pauseEnde) : -1;

  const slots = [];
  for (let m = startMin; m <= endeMin; m += intervall) {
    if (pauseAktiv && m >= pauseStartMin && m < pauseEndeMin) continue;
    const zeit = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    if (deaktivierteSlots.indexOf(zeit) > -1) continue;
    slots.push(zeit);
  }
  return slots;
}

// Prueft einen konkreten Wunsch (Datum + Uhrzeit) gegen die bestehenden
// Reservierungen. Rueckgabe: { frei, grund, alternativen }.
//   reservierungen: Zeilen aus reservations (status in confirmed/pending/blocked)
//   tischanzahl:    aktive Tische (0 => Fallback 13, wie in der App)
/* Ruhetage. Ohne die reserviert der Assistent fuer den Montag, an dem
   geschlossen ist - der Gast steht vor der Tuer und ruft nie wieder an.

   Erwartet wird eine Liste von Wochentagen, wie sie im CRM eingetragen wird:
   ['Mo'] oder ['Mo','Di']. Auch ausgeschriebene Namen und Zahlen (0 = Sonntag)
   werden verstanden, weil niemand ein Format auswendig lernen will. */
const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const LANG = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3,
  donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6
};

function istRuhetag(restaurant, datum) {
  const roh = (restaurant && (restaurant.ruhetage || restaurant.rest_days)) || [];
  const liste = Array.isArray(roh) ? roh : String(roh).split(/[,;\s]+/);
  if (!liste.length) return false;

  const d = new Date(datum + 'T12:00:00');
  if (isNaN(d)) return false;
  const tag = d.getDay();

  return liste.some((e) => {
    const s = String(e || '').trim().toLowerCase();
    if (!s) return false;
    if (/^[0-6]$/.test(s)) return Number(s) === tag;
    if (LANG[s] != null) return LANG[s] === tag;
    return WOCHENTAGE[tag].toLowerCase() === s.slice(0, 2);
  });
}

function ruhetagName(restaurant, datum) {
  const d = new Date(datum + 'T12:00:00');
  const lang = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  return isNaN(d) ? '' : lang[d.getDay()];
}

function pruefeSlot(restaurant, reservierungen, tischanzahl, datum, uhrzeit, jetzt) {
  /* Vor allem anderen: Hat der Betrieb an diesem Tag ueberhaupt auf? Eine
     freie Tischkapazitaet an einem Ruhetag ist keine gute Nachricht. */
  if (istRuhetag(restaurant, datum)) {
    return {
      frei: false,
      grund: 'An diesem Tag (' + ruhetagName(restaurant, datum) + ') ist Ruhetag - der Betrieb hat geschlossen.',
      alternativen: []
    };
  }

  const alleSlots = slotsFuer(restaurant);
  const slotZeit = normalisiereUhrzeit(uhrzeit);
  const gesamtTische = tischanzahl > 0 ? tischanzahl : 13;
  jetzt = jetzt || new Date();

  const existierend = Array.isArray(reservierungen) ? reservierungen : [];

  // Ganztags-Sperre? (blocked, kein Tisch, 00:00 - wie in der App)
  const ganztagsGesperrt = existierend.some((r) =>
    r.status === 'blocked' && !r.table_id && r.reservation_time && r.reservation_time.slice(0, 5) === '00:00');
  if (ganztagsGesperrt) {
    return { frei: false, grund: 'An diesem Tag ist keine Online-Reservierung moeglich (Tag gesperrt).', alternativen: [] };
  }

  const gesperrteSlots = existierend
    .filter((r) => r.status === 'blocked' && !r.table_id && r.reservation_time && r.reservation_time.slice(0, 5) !== '00:00')
    .map((r) => r.reservation_time.slice(0, 5));

  const gesperrteTischeProSlot = {};
  existierend.filter((r) => r.status === 'blocked' && r.table_id).forEach((r) => {
    const t = r.reservation_time ? r.reservation_time.slice(0, 5) : '00:00';
    if (t === '00:00') {
      alleSlots.forEach((s) => { gesperrteTischeProSlot[s] = (gesperrteTischeProSlot[s] || 0) + 1; });
    } else {
      gesperrteTischeProSlot[t] = (gesperrteTischeProSlot[t] || 0) + 1;
    }
  });

  const buchungen = existierend
    .filter((r) => r.status !== 'blocked')
    .map((r) => (r.reservation_time ? r.reservation_time.slice(0, 5) : ''));

  const heute = lokalesDatum(jetzt);
  const istHeute = datum === heute;

  const freiUm = (zeit) => {
    if (gesperrteSlots.indexOf(zeit) !== -1) return 0;
    if (istHeute) {
      const [h, m] = zeit.split(':').map(Number);
      if (h < jetzt.getHours() || (h === jetzt.getHours() && m <= jetzt.getMinutes())) return 0;
    }
    let maxTische = gesamtTische - (gesperrteTischeProSlot[zeit] || 0);
    if (maxTische < 1) maxTische = 1;
    const belegt = buchungen.filter((b) => b === zeit).length;
    return Math.max(0, maxTische - belegt);
  };

  if (alleSlots.indexOf(slotZeit) === -1) {
    return {
      frei: false,
      grund: 'Um ' + slotZeit + ' Uhr ist keine Reservierung moeglich (ausserhalb der buchbaren Zeiten).',
      alternativen: alleSlots.filter((s) => freiUm(s) > 0).slice(0, 6)
    };
  }

  if (freiUm(slotZeit) > 0) {
    return { frei: true, grund: null, alternativen: [] };
  }

  // Nahegelegene freie Slots als Alternative anbieten
  const idx = alleSlots.indexOf(slotZeit);
  const alternativen = alleSlots
    .map((s, i) => ({ s, abstand: Math.abs(i - idx) }))
    .filter((e) => e.abstand > 0 && freiUm(e.s) > 0)
    .sort((a, b) => a.abstand - b.abstand)
    .slice(0, 4)
    .map((e) => e.s);

  return { frei: false, grund: 'Um ' + slotZeit + ' Uhr ist leider alles belegt.', alternativen };
}

module.exports = { slotsFuer, pruefeSlot, minutenAbziehen, lokalesDatum, normalisiereUhrzeit, istRuhetag, ruhetagName };
