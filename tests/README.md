# Tests

Alle Tests laufen ohne Netz und ohne Browser: sie schneiden die echten
Funktionen aus `index.html`, `sw.js` und den Netlify-Functions heraus und
fuehren sie gegen nachgebaute API-Antworten aus. Kein Test faelscht das
Verhalten -- gepruefte Logik ist immer die ausgelieferte Logik.

    node tests/run-all.js

Was sie NICHT abdecken: alles, was erst im Browser oder beim Deploy
entsteht -- Canvas-Bildbearbeitung, Service-Worker-Lebenszyklus, echte
Antworten der KI-Anbieter. Diese Dinge muessen auf der Seite geprueft werden.
