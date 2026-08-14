'use strict';

// WACHE — laeuft die Plattform noch?
//
// An kiekmolin.de haengen rund 25 Betriebe. Faellt die Seite aus oder ist
// die Datenbank nicht erreichbar, merkt es sonst der Wirt zuerst - und
// ruft an. Der Assistent guckt selbst nach und sagt Bescheid.
//
// Bewusst sparsam: eine Anfrage an die Seite, eine an die Datenbank, mehr
// nicht. Und gemeldet wird nur die AENDERUNG (lief - laeuft nicht mehr),
// nicht alle zehn Minuten dieselbe gute Nachricht.

const STANDARD_SEITE = 'https://kiekmolin.de';

async function pruefeSeite(url) {
  const ziel = url || process.env.SPRACH_WACHE_URL || STANDARD_SEITE;
  const start = Date.now();
  try {
    const antwort = await fetch(ziel, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Kurani-Sprachassistent/1.0' }
    });
    const dauer = Date.now() - start;
    return {
      name: 'Seite',
      ok: antwort.ok,
      ms: dauer,
      status: antwort.status,
      hinweis: antwort.ok ? '' : 'Antwort ' + antwort.status
    };
  } catch (e) {
    return { name: 'Seite', ok: false, ms: Date.now() - start, status: 0, hinweis: kurz(e.message) };
  }
}

async function pruefeDatenbank() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;      // ohne Zugang keine Aussage - besser als raten

  const start = Date.now();
  try {
    const antwort = await fetch(url + '/rest/v1/restaurants?select=id&limit=1', {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(12000)
    });
    return {
      name: 'Datenbank',
      ok: antwort.ok,
      ms: Date.now() - start,
      status: antwort.status,
      hinweis: antwort.ok ? '' : 'Antwort ' + antwort.status
    };
  } catch (e) {
    return { name: 'Datenbank', ok: false, ms: Date.now() - start, status: 0, hinweis: kurz(e.message) };
  }
}

function kurz(text) {
  const t = String(text || '').split('\n')[0];
  return t.length > 80 ? t.slice(0, 77) + '...' : t;
}

async function pruefe() {
  const teile = await Promise.all([pruefeSeite(), pruefeDatenbank()]);
  const geprueft = teile.filter(Boolean);
  return {
    ok: geprueft.every((t) => t.ok),
    teile: geprueft,
    zeit: new Date().toISOString()
  };
}

// Ein Satz zum Vorlesen. Bei "alles gut" bewusst kurz - da will niemand
// eine Liste hoeren.
function wacheSatz(ergebnis) {
  if (!ergebnis || !ergebnis.teile.length) return '';
  if (ergebnis.ok) {
    const seite = ergebnis.teile.find((t) => t.name === 'Seite');
    const sekunden = seite ? (seite.ms / 1000).toFixed(1).replace('.', ',') : '';
    return 'Kiek mol in laeuft' + (sekunden ? ' (' + sekunden + ' Sekunden Antwortzeit)' : '') + '.';
  }
  const kaputt = ergebnis.teile.filter((t) => !t.ok);
  return 'Achtung: ' + kaputt.map((t) => t.name + ' antwortet nicht' + (t.hinweis ? ' - ' + t.hinweis : '')).join('; ') + '.';
}

// Nur Aenderungen melden. vorher/jetzt sind die ok-Werte.
// Rueckgabe: der Satz, der gesagt werden soll - oder '' fuer Ruhe.
function meldungBeiAenderung(vorher, jetzt) {
  if (vorher === null || vorher === undefined) return '';   // erster Blick: nichts sagen
  if (vorher === jetzt.ok) return '';
  if (!jetzt.ok) return wacheSatz(jetzt);
  return 'Entwarnung: Kiek mol in ist wieder erreichbar.';
}

module.exports = { pruefe, pruefeSeite, pruefeDatenbank, wacheSatz, meldungBeiAenderung };
