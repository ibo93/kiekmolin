// Gemeinsamer App-Zustand, Supabase-Client und kleine UI-Helfer.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const state = {
  user: null,
  profile: null,
  date: todayISO(),      // aktuell angezeigter Tag im Tracker
};

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

// Profil lokal vorhalten, damit die App auch offline startklar ist.
const PROFILE_KEY = 'fc_profile';
export function cacheProfil(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* voll/gesperrt */ }
}
export function gecachtesProfil() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}

export function formatDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Heute';
  if (iso === todayISO(-1)) return 'Gestern';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

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

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---------- Offline-Warteschlange ----------
// Einfache Einträge (Essen, Wasser) funktionieren auch offline:
// sie landen in localStorage und werden gesendet, sobald wieder online.

const QUEUE_KEY = 'fc_offline_queue';

export function queueInsert(table, row) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  q.push({ table, row });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function getQueued(table, datum) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  return q.filter((e) => e.table === table && e.row.datum === datum).map((e) => e.row);
}

export async function flushQueue() {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!q.length || !navigator.onLine) return 0;
  const rest = [];
  let sent = 0;
  for (const item of q) {
    const { error } = await sb.from(item.table).insert(item.row);
    if (error) rest.push(item); else sent++;
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(rest));
  return sent;
}
