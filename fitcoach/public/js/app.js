// Einstiegspunkt: automatische Anmeldung, Navigation, Offline-Sync, Service Worker.
import { sb, state, showView, toast, flushQueue, onViewShow } from './state.js';
import { initTheme, applyAccent } from './theme.js';
import { initSpeech } from './speech.js';
import { initOnboarding } from './onboarding.js';
import { initTracker, refreshTracker } from './tracker.js';
import { initScan } from './scan.js';
import { initProgress } from './progress.js';
import { initWorkout } from './workout.js';

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ---------- Offline-Anzeige + Sync ----------
const offlineBanner = document.getElementById('offline-banner');
function updateOnlineStatus() {
  offlineBanner.hidden = navigator.onLine;
}
window.addEventListener('online', async () => {
  updateOnlineStatus();
  const sent = await flushQueue();
  if (sent > 0) {
    toast(`${sent} Offline-Einträge synchronisiert`);
    refreshTracker();
  }
});
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ---------- Start-Bildschirm (kein Login, nur Status/Fehler) ----------
const authMessage = document.getElementById('auth-message');
const authLoader = document.getElementById('auth-loader');
const authRetry = document.getElementById('auth-retry');

authRetry.addEventListener('click', () => {
  zeigeStartStatus('Wird gestartet …');
  autoLogin();
});

function zeigeStartStatus(text, fehler = false) {
  showView('auth');
  authMessage.textContent = text;
  authLoader.hidden = fehler;
  authRetry.hidden = !fehler;
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

// ---------- Start: Session prüfen, Profil laden ----------
async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  state.profile = data;
  if (data?.akzentfarbe) applyAccent(data.akzentfarbe);
  return data;
}

async function handleSession(session) {
  if (!session) {
    state.user = null;
    state.profile = null;
    await autoLogin(); // kein Login-Screen – einfach automatisch anmelden
    return;
  }
  state.user = session.user;
  const profile = await loadProfile();
  showView(profile ? 'tracker' : 'onboarding');
}

// Anonyme Anmeldung – ganz ohne E-Mail/Passwort. Die Session bleibt im
// Browser erhalten, sodass deine Daten beim nächsten Öffnen wieder da sind.
let autoLoginLaeuft = false;
async function autoLogin() {
  if (autoLoginLaeuft) return;
  autoLoginLaeuft = true;
  try {
    if (!navigator.onLine) {
      zeigeStartStatus('Beim ersten Start brauchst du einmal Internet. Tippe zum Erneut-Versuchen.', true);
      return;
    }
    const { error } = await sb.auth.signInAnonymously();
    if (error) {
      if (/anonymous/i.test(error.message) || /disabled/i.test(error.message)) {
        zeigeStartStatus(
          'Aktiviere in Supabase: Authentication → Sign In / Providers → „Anonymous sign-ins" einschalten, dann erneut versuchen.',
          true
        );
      } else {
        zeigeStartStatus('Start fehlgeschlagen: ' + error.message, true);
      }
      return;
    }
    // Erfolg → onAuthStateChange übernimmt das Weiterleiten
  } finally {
    autoLoginLaeuft = false;
  }
}

// Module initialisieren (Event-Handler einmalig verdrahten)
initTheme();
initSpeech();
initOnboarding();
initTracker();
initScan();
initProgress();
initWorkout();

sb.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

zeigeStartStatus('Wird gestartet …');
const { data: { session } } = await sb.auth.getSession();
await handleSession(session);

