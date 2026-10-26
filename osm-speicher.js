/**
 * Kiek mol in - gespeicherte Betriebsliste fuer den Seitenbau
 *
 * WARUM (26.10.2026): Jeder Netlify-Bau holt die rund 1250 Betriebe frisch
 * bei OpenStreetMap. OSM ist ein kostenloser Gemeinschaftsdienst und war
 * am 23., 25. und 26.10. beim Bau nicht zu erreichen -- am 26. viermal
 * hintereinander. Seit dem 25.10. stoppt build-seo-pages.js einen Bau ohne
 * diese Betriebe (sonst verliert Google die Seiten); Ibo musste jedes Mal
 * "Retry" klicken, und keine Aenderung ging live.
 *
 * Darum: Nach jedem GELUNGENEN Import wird die Liste in Supabase abgelegt
 * (privater Speicher, nicht im oeffentlichen Repo -- es stehen
 * Telefonnummern drin). Liefert OSM beim naechsten Bau nichts, nimmt der
 * Import diese Liste. Die Betriebe aendern sich kaum; ein paar Tage alt
 * ist sie besser als gar keine Seite.
 *
 * Schluessel: SUPABASE_SERVICE_KEY aus der Netlify-Umgebung. Er wird nie
 * ausgegeben. Fehlt er, sagt das Protokoll es -- und der Bau verhaelt
 * sich wie vorher (kein stiller Erfolg).
 */

'use strict';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co').replace(/\/+$/, '');
const EIMER = 'bau-daten';
const DATEI = 'prospects.json';

function schluessel() { return process.env.SUPABASE_SERVICE_KEY || ''; }
function kopf(extra) {
  const k = schluessel();
  return Object.assign({ apikey: k, Authorization: 'Bearer ' + k }, extra || {});
}

// Liefert { betriebe: [...], stand: 'ISO' } oder { fehler: 'Grund' }.
async function holen() {
  if (!schluessel()) return { fehler: 'SUPABASE_SERVICE_KEY fehlt in der Bau-Umgebung' };
  try {
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/' + EIMER + '/' + DATEI, {
      headers: kopf(), signal: AbortSignal.timeout(30000)
    });
    if (res.status === 404 || res.status === 400) return { fehler: 'noch keine Liste gespeichert (HTTP ' + res.status + ')' };
    if (!res.ok) return { fehler: 'HTTP ' + res.status };
    const daten = JSON.parse(await res.text());
    const betriebe = Array.isArray(daten) ? daten : (daten && Array.isArray(daten.betriebe) ? daten.betriebe : null);
    if (!betriebe) return { fehler: 'Liste unlesbar' };
    return { betriebe: betriebe, stand: (daten && daten.stand) || null };
  } catch (e) {
    return { fehler: (e && e.message) || String(e) };
  }
}

// Legt die Liste ab. Gibt null (ok) oder den Grund zurueck.
async function ablegen(betriebe) {
  if (!schluessel()) return 'SUPABASE_SERVICE_KEY fehlt in der Bau-Umgebung';
  try {
    // Eimer anlegen, falls es ihn noch nicht gibt. "gibt es schon" ist kein Fehler.
    const e = await fetch(SUPABASE_URL + '/storage/v1/bucket', {
      method: 'POST', headers: kopf({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: EIMER, name: EIMER, public: false }), signal: AbortSignal.timeout(30000)
    });
    if (!e.ok && e.status !== 409 && e.status !== 400) return 'Speicher nicht anlegbar (HTTP ' + e.status + ')';
    const res = await fetch(SUPABASE_URL + '/storage/v1/object/' + EIMER + '/' + DATEI, {
      method: 'POST', headers: kopf({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
      body: JSON.stringify({ stand: new Date().toISOString(), betriebe: betriebe }), signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) return 'HTTP ' + res.status;
    return null;
  } catch (err) {
    return (err && err.message) || String(err);
  }
}

module.exports = { holen, ablegen, EIMER, DATEI };
