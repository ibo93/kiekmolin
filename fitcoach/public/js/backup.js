// Backup & Wiederherstellen: alle lokalen Daten als eine Datei sichern
// (Einträge, Gewicht, Workouts, Favoriten, Fotos, Profil, Einstellungen).
import { db, state, toast, setProfil, todayISO, haptik } from './state.js';
import { APP_VERSION } from './config.js';

const TABELLEN = [
  'food_entries', 'water_entries', 'favorites',
  'weight_entries', 'progress_photos', 'workouts', 'workout_sets',
];

function erstelleBackup() {
  const daten = {
    app: 'fitcoach',
    version: APP_VERSION,
    erstellt: new Date().toISOString(),
    profil: state.profile,
    akzent: localStorage.getItem('fc_accent'),
    tabellen: {},
  };
  for (const t of TABELLEN) daten.tabellen[t] = db.alle(t);
  return daten;
}

async function sichern() {
  const daten = erstelleBackup();
  const json = JSON.stringify(daten);
  const dateiname = `fitcoach-backup-${todayISO()}.json`;
  const blob = new Blob([json], { type: 'application/json' });

  // iPhone: Teilen-Dialog (ab in „Dateien"/iCloud) – sonst klassischer Download
  const file = new File([blob], dateiname, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'FitCoach Backup' });
      haptik();
      return;
    } catch { /* abgebrochen → Fallback unten */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  haptik();
  toast('Backup erstellt ✓');
}

function wiederherstellen(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let daten;
    try {
      daten = JSON.parse(reader.result);
    } catch {
      toast('Datei kann nicht gelesen werden');
      return;
    }
    if (daten?.app !== 'fitcoach' || !daten.tabellen) {
      toast('Das ist keine FitCoach-Backup-Datei');
      return;
    }
    if (!confirm('Backup einspielen? Die aktuellen Daten auf diesem Gerät werden ersetzt.')) return;

    for (const t of TABELLEN) {
      localStorage.setItem('fcdb_' + t, JSON.stringify(daten.tabellen[t] || []));
    }
    if (daten.profil) setProfil(daten.profil);
    if (daten.akzent) localStorage.setItem('fc_accent', daten.akzent);

    toast('Backup wiederhergestellt ✓');
    setTimeout(() => location.reload(), 900);
  };
  reader.readAsText(file);
}

export function initBackup() {
  document.getElementById('backup-save').addEventListener('click', sichern);
  document.getElementById('backup-restore-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) wiederherstellen(file);
    e.target.value = '';
  });
}
