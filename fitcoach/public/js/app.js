// Einstiegspunkt: Auth, Navigation, Offline-Sync, Service Worker.
import { sb, state, showView, toast, flushQueue, onViewShow } from './state.js';
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
    toast(`${sent} Offline-Einträge synchronisiert ✓`);
    refreshTracker();
  }
});
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ---------- Auth-Formular ----------
let authMode = 'login';
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authSubmit = document.getElementById('auth-submit');
const authMessage = document.getElementById('auth-message');

function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle('active', mode === 'login');
  tabRegister.classList.toggle('active', mode === 'register');
  authSubmit.textContent = mode === 'login' ? 'Anmelden' : 'Konto erstellen';
  authMessage.hidden = true;
}
tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  authSubmit.disabled = true;

  const { error } = authMode === 'login'
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });

  authSubmit.disabled = false;
  if (error) {
    authMessage.textContent = übersetzeAuthFehler(error.message);
    authMessage.hidden = false;
    return;
  }
  if (authMode === 'register') {
    authMessage.textContent = 'Konto erstellt! Falls E-Mail-Bestätigung aktiv ist, prüfe dein Postfach.';
    authMessage.hidden = false;
  }
});

function übersetzeAuthFehler(msg) {
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort falsch.';
  if (/already registered/i.test(msg)) return 'Diese E-Mail ist bereits registriert.';
  if (/email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail.';
  if (/at least 6/i.test(msg)) return 'Passwort braucht mindestens 6 Zeichen.';
  return 'Fehler: ' + msg;
}

document.getElementById('logout').addEventListener('click', async () => {
  await sb.auth.signOut();
});

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
  return data;
}

async function handleSession(session) {
  if (!session) {
    state.user = null;
    state.profile = null;
    showView('auth');
    return;
  }
  state.user = session.user;
  const profile = await loadProfile();
  if (!profile) {
    showView('onboarding');
  } else {
    showView('tracker');
  }
}

// Module initialisieren (Event-Handler einmalig verdrahten)
initOnboarding();
initTracker();
initScan();
initProgress();
initWorkout();

sb.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

const { data: { session } } = await sb.auth.getSession();
await handleSession(session);
