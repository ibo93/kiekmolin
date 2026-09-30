// Einstiegspunkt: Navigation, Start, Service Worker.
// Keine Anmeldung, keine Cloud-Einrichtung – die App startet sofort.
import { state, showView, toast, onViewShow, geladenesProfil } from './state.js';
import { APP_VERSION } from './config.js';
import { initTheme, applyAccent } from './theme.js';
import { initSpeech } from './speech.js';
import { initOnboarding } from './onboarding.js';
import { initTracker } from './tracker.js';
import { initScan } from './scan.js';
import { initProgress } from './progress.js';
import { initWorkout } from './workout.js';
import { initBackup } from './backup.js';

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Auto-Update: Übernimmt ein neuer Service Worker die Seite, einmal neu
  // laden – damit nie eine alte Version "festklebt".
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen) return; // Schleifen-Schutz
    neuGeladen = true;
    location.reload();
  });
}

// ---------- Navigation ----------
document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (btn) showView(btn.dataset.view);
});

// ---------- Profil-Ansicht ----------
onViewShow('profile', () => {
  const p = state.profile;
  if (!p) return;
  document.getElementById('profile-kcal').textContent = p.kalorienziel;
  document.getElementById('profile-tdee').textContent = p.tdee;
  document.getElementById('profile-bmr').textContent = p.grundumsatz;
  document.getElementById('profile-zielgewicht').textContent = p.zielgewicht_kg ?? '–';
});
document.getElementById('profile-edit').addEventListener('click', () => showView('onboarding'));

// ---------- Module initialisieren ----------
// Schutzwand: Wenn ein Modul beim Start crasht, blockiert es nicht die
// anderen – und der Fehler wird sichtbar gemacht statt verschluckt.
for (const init of [initTheme, initSpeech, initOnboarding, initTracker, initScan, initProgress, initWorkout, initBackup]) {
  try {
    init();
  } catch (err) {
    console.error('Init-Fehler:', init.name, err);
    toast(`Fehler in ${init.name}: ${err.message}`);
  }
}

// Unerwartete Fehler auf dem Bildschirm zeigen (zum Abfotografieren),
// statt Buttons stumm sterben zu lassen.
window.addEventListener('error', (e) => {
  toast(`Fehler: ${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  toast('Fehler: ' + (e.reason?.message || e.reason));
});

// Versionsnummer zentral eintragen (eine Quelle statt verstreuter Labels)
document.querySelectorAll('[data-version]').forEach((el) => {
  el.textContent = 'Version ' + APP_VERSION;
});

// ---------- Start: Profil da? Dann direkt los ----------
state.profile = geladenesProfil();
if (state.profile?.akzentfarbe) applyAccent(state.profile.akzentfarbe);

// App-Shortcut (Homescreen) kann eine Ziel-Ansicht mitgeben, z. B. /?view=scan
const wunsch = new URLSearchParams(location.search).get('view');
const zielView = state.profile && ['scan', 'tracker', 'progress', 'workout'].includes(wunsch)
  ? wunsch
  : (state.profile ? 'tracker' : 'onboarding');
showView(zielView);
