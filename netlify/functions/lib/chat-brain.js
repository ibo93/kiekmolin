// Kiek mol in — gemeinsames Hirn des KIN-Assistenten.
//
// Liegt in lib/, damit Netlify die Datei NICHT als eigene Function deployt
// (Netlify macht aus einem Unterordner nur dann eine Function, wenn darin
// <ordnername>.js oder index.js liegt). Beide Chat-Functions greifen darauf
// zu, damit Systemprompt und Kontextaufbau nur an EINER Stelle stehen und
// nicht auseinanderlaufen.

'use strict';

// Antwortlaenge. Frueher 600 -- das war der groesste Zeitfresser: die Dauer
// haengt fast nur an der Zahl der erzeugten Wortteile, nicht am Nachdenken.
// 280 reicht fuer drei knappe Saetze plus eine kurze Aufzaehlung.
var MAX_TOKENS = 280;

var SYSTEM_PROMPT = [
    'Du bist KIN, der Assistent von "Kiek mol in" (kiekmolin.de) — der Gastro-Plattform für Ostfriesland.',
    '',
    'ANTWORTLÄNGE (wichtigste Regel):',
    '- Standard: höchstens 3 Sätze. Wer nach einem Weg in der App fragt, bekommt die Schritte als kurze Liste statt als Fließtext.',
    '- Keine Einleitung, keine Wiederholung der Frage, kein Abschlussfloskel-Satz. Direkt die Antwort.',
    '- Lieber eine Rückfrage in einem Satz als eine lange Antwort auf gut Glück.',
    '',
    'TON:',
    '- "du", nie "Sie". Norddeutsch knapp. "Moin" nur bei der allerersten Begrüßung, danach nicht mehr.',
    '- Kein Marketing-Sprech, kein "Gerne!", kein "Vielen Dank für deine Frage".',
    '- Deutsch, außer der Nutzer schreibt in einer anderen Sprache.',
    '',
    'WAS DU KANNST:',
    '- Restaurants empfehlen und Gerichte aus der Speisekarte vorschlagen — aber NUR aus dem Kontext unten.',
    '- Erklären, wie die App funktioniert (siehe App-Wissen).',
    '- Regionale Tipps: Greetsiel, Norddeich, Norden, Aurich, Emden.',
    '',
    'WAS DU NICHT KANNST — sag es klar in einem Satz und nenne den Weg in der App:',
    '- Selbst bestellen oder reservieren.',
    '- Live-Daten wie freie Tische oder heutige Öffnungszeiten.',
    '- Erfinde nichts. Steht ein Restaurant oder Gericht nicht im Kontext, sag dass du es nicht siehst.',
    '',
    'APP-WISSEN:',
    '- Bestellen: Restaurant antippen → Speisekarte → Gericht in den Warenkorb → Bestellen.',
    '- Reservieren: Restaurant → "Tisch reservieren" → Datum/Zeit/Personen → Absenden.',
    '- Bezahlen: bar oder Karte vor Ort, PayPal online, Überweisung.',
    '- Konto: oben rechts Profil. Bestellen geht auch als Gast.',
    '- Stornieren: Profil → Meine Bestellungen → Bestellung → "Stornieren" (nur solange Status "Eingegangen").',
    '- Push: Banner antippen oder Profil → Einstellungen → Benachrichtigungen. iPhone erst "zum Home-Bildschirm hinzufügen".',
    '- Dark Mode: Profil → Erscheinungsbild. Sprache: oben rechts DE/EN/NL. Favoriten: Herz-Icon (braucht Konto).',
    '- Lieferung: nicht jedes Restaurant liefert — Filter "Liefert" in der Liste.',
    '- Gastronom werden: info@kiekmolin.de, keine Provisionen.',
    '- Rechtliches/Datenschutz: verweise auf info@kiekmolin.de.'
].join('\n');

// Kontext knapp halten. Jedes Zeichen hier verzoegert JEDE Antwort, weil der
// ganze Block bei jeder Frage neu mitgeschickt und gelesen wird. Vorher gingen
// 40 Restaurants und 30 Gerichte mit -- rund 2000 Wortteile, die der Nutzer in
// Wartezeit bezahlt hat. Die Speisekarte des GEOEFFNETEN Restaurants ist fast
// immer das, worum es geht; die Gesamtliste dient nur der Orientierung.
function buildContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return '';
    var out = '';

    if (ctx.userCity) out += 'Nutzer ist in: ' + String(ctx.userCity).slice(0, 50) + '\n';

    var r = ctx.currentRestaurant;
    if (r && r.name) {
        out += 'Gerade geöffnet: ' + String(r.name).slice(0, 60);
        if (r.city) out += ', ' + String(r.city).slice(0, 40);
        if (r.cuisine) out += ' · ' + String(r.cuisine).slice(0, 40);
        out += '\n';
    }

    if (Array.isArray(ctx.currentMenu) && ctx.currentMenu.length) {
        out += '\nSpeisekarte dieses Restaurants:\n';
        var lastCat = '';
        ctx.currentMenu.slice(0, 20).forEach(function (m) {
            if (!m || !m.name) return;
            if (m.category && m.category !== lastCat) {
                out += '[' + String(m.category).slice(0, 30) + ']\n';
                lastCat = m.category;
            }
            var price = (m.price != null && !isNaN(Number(m.price)))
                ? ' ' + Number(m.price).toFixed(2).replace('.', ',') + '€' : '';
            out += '· ' + String(m.name).slice(0, 50) + price + '\n';
        });
    }

    if (Array.isArray(ctx.restaurants) && ctx.restaurants.length) {
        var list = ctx.restaurants.slice(0, 25);
        out += '\nRestaurants auf der Plattform (' + ctx.restaurants.length + ' gesamt, hier ' + list.length + '):\n';
        list.forEach(function (x) {
            if (!x || !x.name) return;
            var line = '· ' + String(x.name).slice(0, 50);
            if (x.city) line += ' (' + String(x.city).slice(0, 25) + ')';
            if (x.cuisine) line += ' ' + String(x.cuisine).slice(0, 25);
            if (x.delivery) line += ' liefert';
            out += line + '\n';
        });
    }

    if (!out) return '';
    return '\n\n=== KONTEXT (nur für diese Frage) ===\n' + out +
           'Empfiehl nur, was hier steht. Steht es nicht hier, sag das.\n';
}

// Anbieter-Reihenfolge: Claude Haiku zuerst.
// Haiku 4.5 ist das schnellste Claude-Modell und versteht die Frage deutlich
// besser als Gemini 2.0 Flash, das hier vorher lief. Bei diesen kurzen
// Antworten kostet ein Gespraech Bruchteile eines Cents.
// Gemini bleibt als kostenloser Notnagel, damit ein Ausfall bei Anthropic den
// Assistenten nicht stumm schaltet.
function pickProvider(env) {
    var wanted = String(env.CHAT_PROVIDER || '').toLowerCase();
    var have = {
        anthropic: !!env.ANTHROPIC_API_KEY,
        gemini: !!env.GEMINI_API_KEY,
        groq: !!env.GROQ_API_KEY
    };
    if (wanted && have[wanted]) return wanted;
    if (have.anthropic) return 'anthropic';
    if (have.gemini) return 'gemini';
    if (have.groq) return 'groq';
    return null;
}

// Eingaben pruefen und begrenzen -- die Function ist oeffentlich erreichbar.
function readInput(body) {
    var message = (body.message || '').toString().trim();
    if (!message) return { error: 'message required' };
    if (message.length > 2000) return { error: 'message too long (max 2000 chars)' };

    var raw = Array.isArray(body.history) ? body.history.slice(-6) : [];
    var history = raw
        .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'; })
        .map(function (m) { return { role: m.role, content: String(m.content).slice(0, 1000) }; });

    return {
        message: message,
        history: history,
        system: SYSTEM_PROMPT + buildContext(body.context)
    };
}

var MODELS = {
    // Schnellstes Claude-Modell; 200K Kontext reicht hier um Laengen.
    anthropic: 'claude-haiku-4-5',
    // 2.5 Flash statt 2.0: neuer, versteht Speisekarten und Rueckfragen besser.
    gemini: 'gemini-2.5-flash',
    groq: 'llama-3.3-70b-versatile'
};

module.exports = { MAX_TOKENS: MAX_TOKENS, SYSTEM_PROMPT: SYSTEM_PROMPT, MODELS: MODELS,
                   buildContext: buildContext, pickProvider: pickProvider, readInput: readInput };
