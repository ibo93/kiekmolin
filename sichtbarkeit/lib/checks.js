'use strict';

// Die eigentlichen Sichtbarkeits-Pruefungen.
//
// Ehrlichkeits-Prinzip: Jede Pruefung liefert einen von vier Zustaenden:
//   'gefunden'        - Betrieb taucht nachweisbar auf
//   'nicht-gefunden'  - Test lief, Betrieb tauchte nicht auf
//   'manuell'         - Test braucht einen API-Key, der nicht gesetzt ist
//                       -> im Report als "manuell pruefen" ausgewiesen, nie geraten
//   'fehler'          - technischer Fehler (Netz, API) -> transparent im Report
//
// Der KI-Test ist bewusst wiederholbar dokumentiert: gleiche Frage, gleiches
// Modell, Web-Suche an, und die Roh-Antwort wird in der Historie gespeichert.

const SEITE_BASIS = process.env.KIEKMOLIN_URL || 'https://kiekmolin.de';

function enthaeltNamen(text, restaurantName) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ');
  return norm(text).includes(norm(restaurantName));
}

async function holeText(url) {
  const antwort = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
  return antwort.text();
}

// --- Basis-Check: Ist der Betrieb auf kiekmolin.de maschinenlesbar? ---------
async function checkKiekmolinSeite(restaurant) {
  const slug = restaurant.slug || '';
  const kandidaten = slug ? [SEITE_BASIS + '/' + slug, SEITE_BASIS + '/'] : [SEITE_BASIS + '/'];
  for (const url of kandidaten) {
    try {
      const html = await holeText(url);
      if (enthaeltNamen(html, restaurant.name)) {
        const hatJsonLd = html.includes('application/ld+json');
        return {
          status: 'gefunden',
          detail: hatJsonLd
            ? 'Seite erreichbar, Betrieb gelistet, Schema.org-Markup vorhanden (' + url + ')'
            : 'Betrieb gelistet, aber KEIN Schema.org-Markup auf ' + url,
          jsonLd: hatJsonLd
        };
      }
    } catch (_e) { /* naechsten Kandidaten versuchen */ }
  }
  return { status: 'nicht-gefunden', detail: 'Betrieb auf ' + SEITE_BASIS + ' nicht auffindbar' };
}

// --- Eigene Website des Betriebs (falls hinterlegt) -------------------------
async function checkEigeneWebsite(restaurant) {
  const url = restaurant.website || restaurant.website_url || null;
  if (!url) return { status: 'manuell', detail: 'Keine eigene Website in der Datenbank hinterlegt' };
  try {
    const html = await holeText(url.startsWith('http') ? url : 'https://' + url);
    const hatJsonLd = html.includes('application/ld+json') || html.includes('schema.org');
    return {
      status: 'gefunden',
      detail: hatJsonLd ? 'Website erreichbar, Schema.org vorhanden' : 'Website erreichbar, aber OHNE Schema.org-Markup',
      jsonLd: hatJsonLd
    };
  } catch (e) {
    return { status: 'fehler', detail: 'Website nicht erreichbar: ' + e.message };
  }
}

// --- Google-Sichtbarkeit ueber die offizielle Custom-Search-API --------------
// Braucht GOOGLE_API_KEY + GOOGLE_CSE_ID in .env (siehe README).
// Kein Scraping: das waere unzuverlaessig und verstoesst gegen Google-Regeln.

// Wettbewerbs-Radar: Wer steht VOR dem Betrieb? (max. 3, nur Domain + Titel).
// platzIndex = 0-basierter Treffer-Index des Betriebs, -1 = nicht gefunden.
function wettbewerberVorDir(treffer, platzIndex) {
  const bis = platzIndex >= 0 ? Math.min(platzIndex, 3) : 3;
  return (treffer || []).slice(0, bis).map((t) => {
    let domain = '';
    try { domain = new URL(t.link).hostname.replace(/^www\./, ''); } catch (_e) { /* Link kaputt */ }
    return { titel: String(t.title || '').slice(0, 80), domain };
  }).filter((w) => w.domain);
}

async function checkGoogle(frage, restaurant) {
  const key = process.env.GOOGLE_API_KEY;
  const cse = process.env.GOOGLE_CSE_ID;
  if (!key || !cse) {
    return { status: 'manuell', detail: 'GOOGLE_API_KEY/GOOGLE_CSE_ID nicht gesetzt - bitte manuell googeln' };
  }
  try {
    const url = 'https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(key) +
      '&cx=' + encodeURIComponent(cse) + '&num=10&q=' + encodeURIComponent(frage);
    const antwort = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
    const daten = await antwort.json();
    const treffer = daten.items || [];
    const platz = treffer.findIndex((t) =>
      enthaeltNamen((t.title || '') + ' ' + (t.snippet || '') + ' ' + (t.link || ''), restaurant.name) ||
      (restaurant.slug && String(t.link || '').includes(restaurant.slug))
    );
    const vorDir = wettbewerberVorDir(treffer, platz);
    if (platz >= 0) {
      return { status: 'gefunden', detail: 'Platz ' + (platz + 1) + ' in den Top 10', platz: platz + 1, vor_dir: vorDir };
    }
    return { status: 'nicht-gefunden', detail: 'Nicht in den Top 10', vor_dir: vorDir };
  } catch (e) {
    return { status: 'fehler', detail: 'Google-API-Fehler: ' + e.message };
  }
}

// --- KI-Sichtbarkeit: Wird der Betrieb von Claude (mit Web-Suche) genannt? ---
// Wiederholbarer, dokumentierter Test: gleiche Frage, gleiches Modell,
// Roh-Antwort wird gespeichert. Braucht ANTHROPIC_API_KEY in .env.
async function checkKI(frage, restaurant) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { status: 'manuell', detail: 'ANTHROPIC_API_KEY nicht gesetzt - Frage manuell in ChatGPT/Gemini stellen' };
  }
  const modell = process.env.KI_MODELL || 'claude-sonnet-5';
  try {
    const antwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(45000), // Web-Suche kann laenger dauern
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: modell,
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{
          role: 'user',
          content: 'Du bist ein normaler Nutzer und suchst ein Lokal. Antworte kurz mit konkreten Empfehlungen (Namen). Frage: ' + frage
        }]
      })
    });
    if (!antwort.ok) throw new Error('HTTP ' + antwort.status + ' ' + (await antwort.text()).slice(0, 200));
    const daten = await antwort.json();
    const text = (daten.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const gefunden = enthaeltNamen(text, restaurant.name);
    return {
      status: gefunden ? 'gefunden' : 'nicht-gefunden',
      detail: gefunden ? 'Betrieb wird in der KI-Antwort empfohlen' : 'Betrieb taucht in der KI-Antwort nicht auf',
      antwortAuszug: text.slice(0, 600)
    };
  } catch (e) {
    return { status: 'fehler', detail: 'KI-API-Fehler: ' + e.message };
  }
}

module.exports = { checkKiekmolinSeite, checkEigeneWebsite, checkGoogle, checkKI, wettbewerberVorDir };
