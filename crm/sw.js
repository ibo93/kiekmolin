/* ==========================================================
   Kurani CRM – Service Worker
   Sorgt dafür, dass die App auf dem Handy auch ohne Netz startet
   und sich wie eine richtige App anfühlt.

   Regel: nur die eigenen Programmdateien werden zwischengespeichert.
   Alles was zu Supabase oder zur Claude-API geht, läuft immer live –
   sonst würdest du alte Zahlen sehen.

   Bei jeder Änderung an den Dateien die VERSION hochzählen.
   ========================================================== */

const VERSION = 'kurani-crm-v11';

const SCHALE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './css/app.css',
  './css/print.css',
  './js/utils.js',
  './js/stammdaten.js',
  './js/store.js',
  './js/ui.js',
  './js/chart.js',
  './js/aussehen.js',
  './js/sperre.js',
  './js/sync.js',
  './js/customers.js',
  './js/projects.js',
  './js/documents.js',
  './js/finance.js',
  './js/analysis.js',
  './js/calendar.js',
  './js/trips.js',
  './js/inbox.js',
  './js/knowledge.js',
  './js/campaigns.js',
  './js/growth.js',
  './js/kiekmolin.js',
  './js/agentur.js',
  './js/calc.js',
  './js/bank.js',
  './js/lastschrift.js',
  './js/assistant.js',
  './js/app.js'
];

/* Beim Einrichten alles einsammeln. Fehlt eine Datei, bricht der
   Vorgang nicht ab – die holt der Browser dann eben live. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(SCHALE.map(d => c.add(d).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

/* Alte Fassungen wegräumen, sobald die neue übernimmt */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET') return;

  const ziel = new URL(anfrage.url);
  const eigen = ziel.origin === self.location.origin;

  /* Schnittstellen der Agentur-App laufen IMMER live und werden nie
     zwischengespeichert. Sonst faellt bei ausgeschalteter Agentur-App
     unten die gespeicherte index.html als Antwort zurueck – und die
     CRM-Seite bekommt HTML, wo sie Daten erwartet. Die Fehlermeldung
     waere dann voelliger Unsinn statt "Agentur laeuft gerade nicht". */
  if (eigen && ziel.pathname.indexOf('/api/') === 0) return;

  /* Fremde Adressen – Supabase, Claude, Schriften – nicht anfassen */
  if (!eigen){
    /* Schriften dürfen zwischengespeichert werden, damit die App
       offline nicht in Times New Roman umkippt. */
    if (/fonts\.(googleapis|gstatic)\.com$/.test(ziel.hostname)){
      e.respondWith(
        caches.match(anfrage).then(treffer => treffer || fetch(anfrage).then(a => {
          const kopie = a.clone();
          caches.open(VERSION).then(c => c.put(anfrage, kopie));
          return a;
        }).catch(() => treffer))
      );
    }
    return;
  }

  /* Eigene Dateien: erst das Netz versuchen, damit du nach einem
     neuen Stand nicht auf alten Dateien sitzen bleibst. Klappt das
     nicht, kommt die gespeicherte Fassung. */
  e.respondWith(
    fetch(anfrage)
      .then(antwort => {
        if (antwort && antwort.status === 200){
          const kopie = antwort.clone();
          caches.open(VERSION).then(c => c.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(anfrage).then(t => t || caches.match('./index.html')))
  );
});
