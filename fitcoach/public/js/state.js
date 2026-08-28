// Gemeinsamer App-Zustand, lokale Datenbank und kleine UI-Helfer.
// Alle Daten leben auf dem Gerät (localStorage) – keine Einrichtung,
// keine Anmeldung, funktioniert komplett offline.
import { APP_KEY } from './config.js';

export const state = {
  profile: null,
  date: todayISO(),      // aktuell angezeigter Tag im Tracker
};

// ---------- Lokale Datenbank ----------
// Einfacher Dokument-Speicher pro "Tabelle" (Array von Zeilen mit id).

function lade(tabelle) {
  try { return JSON.parse(localStorage.getItem('fcdb_' + tabelle)) || []; }
  catch { return []; }
}
function speichere(tabelle, zeilen) {
  localStorage.setItem('fcdb_' + tabelle, JSON.stringify(zeilen));
}
function neueId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
}

export const db = {
  alle(tabelle, filter) {
    const zeilen = lade(tabelle);
    return filter ? zeilen.filter(filter) : zeilen;
  },
  insert(tabelle, zeile) {
    const zeilen = lade(tabelle);
    const neu = { id: neueId(), created_at: new Date().toISOString(), ...zeile };
    zeilen.push(neu);
    speichere(tabelle, zeilen);
    return neu;
  },
  // Aktualisiert die Zeile, bei der alle keys übereinstimmen – sonst neu anlegen
  upsert(tabelle, zeile, keys) {
    const zeilen = lade(tabelle);
    const i = zeilen.findIndex((z) => keys.every((k) => z[k] === zeile[k]));
    if (i >= 0) {
      zeilen[i] = { ...zeilen[i], ...zeile };
      speichere(tabelle, zeilen);
      return zeilen[i];
    }
    return db.insert(tabelle, zeile);
  },
  update(tabelle, id, patch) {
    const zeilen = lade(tabelle);
    const i = zeilen.findIndex((z) => z.id === id);
    if (i >= 0) {
      zeilen[i] = { ...zeilen[i], ...patch };
      speichere(tabelle, zeilen);
    }
  },
  delete(tabelle, id) {
    speichere(tabelle, lade(tabelle).filter((z) => z.id !== id));
  },
  deleteWo(tabelle, filter) {
    speichere(tabelle, lade(tabelle).filter((z) => !filter(z)));
  },
};

// ---------- Profil ----------
const PROFILE_KEY = 'fc_profile';
export function setProfil(p) {
  state.profile = p;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* voll */ }
}
export function geladenesProfil() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}

// ---------- KI-Aufrufe ----------
export function authHeaders() {
  return { 'x-app-key': APP_KEY };
}

// Fetch mit hartem Timeout – wirft verständliche Fehler statt ewig zu hängen.
export async function fetchMitTimeout(url, options = {}, ms = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError'
      ? 'Zeitüberschreitung – Server antwortet nicht'
      : 'Keine Verbindung zum Server');
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Datum ----------
// Datum in lokaler Zeitzone (UTC würde abends auf den falschen Tag kippen)
export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function verschiebeDatum(iso, tage) {
  const d = new Date(iso);
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Heute';
  if (iso === todayISO(-1)) return 'Gestern';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ---------- Views ----------
const VIEWS = ['auth', 'onboarding', 'tracker', 'scan', 'progress', 'workout', 'profile'];
const viewListeners = {};

export function onViewShow(view, fn) {
  (viewListeners[view] ||= []).push(fn);
}

export function showView(name) {
  for (const v of VIEWS) {
    document.getElementById(`view-${v}`).hidden = v !== name;
  }
  const nav = document.getElementById('bottom-nav');
  nav.hidden = name === 'auth' || name === 'onboarding';
  nav.querySelectorAll('.nav-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name)
  );
  window.scrollTo(0, 0);
  for (const fn of viewListeners[name] || []) fn();
}

// ---------- UI-Helfer ----------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

// Dezentes haptisches Feedback, wo der Browser es unterstützt (Android).
export function haptik(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* nicht unterstützt */ }
}

const reduzierteBewegung = window.matchMedia('(prefers-reduced-motion: reduce)');

// Zahl weich hochzählen lassen (Micro-Interaction für den Kalorien-Ring).
export function animiereZahl(el, ziel) {
  const start = parseInt(el.textContent, 10) || 0;
  if (start === ziel || reduzierteBewegung.matches) {
    el.textContent = ziel;
    return;
  }
  const dauer = 550;
  const t0 = performance.now();
  function tick(t) {
    const f = Math.min(1, (t - t0) / dauer);
    const eased = 1 - Math.pow(1 - f, 3); // ease-out
    el.textContent = Math.round(start + (ziel - start) * eased);
    if (f < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
