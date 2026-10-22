// Service Worker anmelden – und neue Fassungen WIRKLICH ausliefern.
//
// Die Lehre vom 25.08.2026 (Kiek mol in): Server repariert, Browser lädt
// noch die alte App. Hier übernimmt eine neue Fassung sofort (skipWaiting
// im SW) und die Seite lädt einmal neu – außer mitten im Scan, dann erst
// beim nächsten Seitenwechsel, damit keine Kamera-Aufnahme verloren geht.

export function swRegistrieren() {
  // Vorschau als claude.ai-Artifact: dort sind Service Worker nicht erlaubt.
  if (!('serviceWorker' in navigator) || import.meta.env.DEV || import.meta.env.VITE_ARTIFACT) return;
  // Als iPhone-App (Capacitor) liegen alle Dateien schon im App-Paket – kein Service Worker nötig.
  if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
  let neuGeladen = false;
  // Beim allerersten Besuch gibt es noch keinen Controller: dann ist der
  // Wechsel die Erstinstallation, KEINE neue Fassung – nicht neu laden
  // (sonst bricht die Start-Animation beim ersten Öffnen ab).
  const hatteFassung = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen || !hatteFassung) return;
    const jetzt = () => { neuGeladen = true; location.reload(); };
    if (location.hash.startsWith('#/scan')) {
      const f = () => { if (!location.hash.startsWith('#/scan')) { removeEventListener('hashchange', f); jetzt(); } };
      addEventListener('hashchange', f);
    } else jetzt();
  });
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Beim Zurückkehren in die App nach Updates schauen (PWA bleibt oft tagelang offen)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  }).catch((e) => console.error('Service Worker nicht registriert', e));
}
