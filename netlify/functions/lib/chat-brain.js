// Kiek mol in — gemeinsames Hirn des KIN-Assistenten.
//
// Liegt in lib/, damit Netlify die Datei NICHT als eigene Function deployt
// (Netlify macht aus einem Unterordner nur dann eine Function, wenn darin
// <ordnername>.js oder index.js liegt). Beide Chat-Functions greifen darauf
// zu, damit Systemprompt und Kontextaufbau nur an EINER Stelle stehen und
// nicht auseinanderlaufen.

'use strict';

// Antwortlänge. Früher 600 -- das war der grösste Zeitfresser: die Dauer
// hängt fast nur an der Zahl der erzeugten Wortteile, nicht am Nachdenken.
// 280 reicht für drei knappe Sätze plus eine kurze Aufzählung.
// 360 statt 280: Platz fuer die Knopf-Zeilen am Ende ([[korb:g12]] ...).
var MAX_TOKENS = 360;

var SYSTEM_PROMPT = [
    'Du bist Kiek, der Assistent von "Kiek mol in" (kiekmolin.de) — der Gastro-Plattform für Ostfriesland.',
    '',
    'ANTWORTLÄNGE (wichtigste Regel):',
    '- Standard: höchstens 3 Sätze. Wer nach einem Weg in der App fragt, bekommt die Schritte als kurze Liste statt als Fließtext.',
    '- Keine Einleitung, keine Wiederholung der Frage, kein Abschlussfloskel-Satz. Direkt die Antwort.',
    '- Lieber eine Rückfrage in einem Satz als eine lange Antwort auf gut Glück.',
    '',
    'KI-KENNZEICHNUNG (EU-KI-Verordnung, Art. 50) — nicht verhandelbar:',
    '- Fragt jemand, ob du ein Mensch bist: sag klar und sofort, dass du ein KI-Programm bist.',
    '- Behaupte NIE, ein Mensch zu sein, und gib dich nie als Mitarbeiter eines Restaurants aus.',
    '- Bei Preisen, Öffnungszeiten und Bestellungen: weise darauf hin, dass die Angabe des Restaurants gilt.',
    '',
    'TON:',
    '- "du", nie "Sie". Norddeutsch knapp. "Moin" nur bei der allerersten Begrüßung, danach nicht mehr.',
    '- Kein Marketing-Sprech, kein "Gerne!", kein "Vielen Dank für deine Frage".',
    '- Deutsch, außer der Nutzer schreibt in einer anderen Sprache.',
    '',
    'WAS DU KANNST:',
    '- Restaurants empfehlen und Gerichte aus der Speisekarte vorschlagen — aber NUR aus dem Kontext unten.',
    '- Sagen, welches Lokal JETZT offen ist und bis wann (steht im Kontext bei jedem Lokal).',
    '- Allergene, vegetarisch, vegan, scharf: nur aus dem Kontext. Allergen-Buchstaben nach LMIV (A Gluten, B Krebstiere, C Ei, D Fisch, E Erdnüsse, F Soja, G Milch, H Schalenfrüchte/Nüsse, L Sellerie, M Senf, N Sesam, O Sulfite, P Lupinen, R Weichtiere). Fehlt bei einem Gericht die Angabe, sag das. Bei echter Allergie: beim Restaurant nachfragen.',
    '- Erklären, wie die App funktioniert (siehe App-Wissen).',
    '- Regionale Tipps: Greetsiel, Norddeich, Norden, Aurich, Emden.',
    '',
    'KNÖPFE (wichtig — so wird aus deiner Antwort eine Handlung):',
    '- Empfiehlst du ein Gericht aus der Karte, hänge am ENDE je Gericht eine eigene Zeile an: [[korb:g12]] (das Kennzeichen aus der Karte).',
    '- Empfiehlst du ein Lokal aus der Liste: [[lokal:r3]].',
    '- Will der Gast einen Tisch: [[tisch:r3|19:30|4]] — Uhrzeit und Personen nur, wenn er sie genannt hat, sonst [[tisch:r3]].',
    '- Nur Kennzeichen aus dem Kontext, höchstens 4 Knöpfe, nie im Fließtext erwähnen oder erklären.',
    '',
    'WAS DU NICHT KANNST — sag es klar in einem Satz:',
    '- Selbst bestellen oder reservieren — du legst nur den passenden Knopf hin, der Gast entscheidet.',
    '- Freie Tische zu einer Uhrzeit kennst du nicht sicher: das Restaurant bestätigt.',
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

// Kontext knapp halten. Jedes Zeichen hier verzögert JEDE Antwort, weil der
// ganze Block bei jeder Frage neu mitgeschickt und gelesen wird. Vorher gingen
// 40 Restaurants und 30 Gerichte mit -- rund 2000 Wortteile, die der Nutzer in
// Wartezeit bezahlt hat. Die Speisekarte des GEOEFFNETEN Restaurants ist fast
// immer das, worum es geht; die Gesamtliste dient nur der Orientierung.
function kurz(x, n) { return String(x == null ? '' : x).replace(/[\r\n\[\]]+/g, ' ').trim().slice(0, n); }
// Kennzeichen wie "g12" / "r3" -- alles andere wird nicht durchgereicht,
// damit niemand ueber den Kontext eigene Knoepfe einschleust.
function refOk(x) { return /^[gr]\d{1,3}$/.test(String(x || '')) ? String(x) : ''; }
function buildContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return '';
    var out = '';

    if (ctx.jetzt) out += 'Jetzt: ' + kurz(ctx.jetzt, 40) + '\n';
    if (ctx.userCity) out += 'Nutzer ist in: ' + kurz(ctx.userCity, 50) + '\n';

    var r = ctx.currentRestaurant;
    if (r && r.name) {
        out += 'Gerade geöffnet: ' + (refOk(r.ref) ? refOk(r.ref) + ' ' : '') + kurz(r.name, 60);
        if (r.city) out += ', ' + kurz(r.city, 40);
        if (r.cuisine) out += ' · ' + kurz(r.cuisine, 40);
        if (r.stand) out += ' · ' + kurz(r.stand, 40);
        if (r.abholung) out += ' · ' + kurz(r.abholung, 40);
        out += '\n';
    }

    if (Array.isArray(ctx.currentMenu) && ctx.currentMenu.length) {
        out += '\nSpeisekarte dieses Restaurants (Kennzeichen · Nr · Name · Preis € · Merkmale · Allergene · Info; "Allergene ?" = keine Angabe):\n';
        var lastCat = '';
        ctx.currentMenu.slice(0, 60).forEach(function (m) {
            if (!m || !m.name) return;
            var kat = m.kategorie || m.category;
            if (kat && kat !== lastCat) { out += '[' + kurz(kat, 30) + ']\n'; lastCat = kat; }
            var preis = m.preis != null ? kurz(m.preis, 40).replace(/ \/ /g, '/')
                : (m.price != null && !isNaN(Number(m.price)) ? Number(m.price).toFixed(2).replace('.', ',') : '');
            var teile = [refOk(m.ref), m.nr ? 'Nr ' + kurz(m.nr, 6) : '', kurz(m.name, 50), preis];
            if (m.merkmale) teile.push(kurz(m.merkmale, 40));
            teile.push('Allergene ' + (m.allergene ? kurz(m.allergene, 20) : '?'));
            if (m.info) teile.push(kurz(m.info, 40));
            out += '· ' + teile.filter(Boolean).join(' · ') + '\n';
        });
    }

    if (Array.isArray(ctx.restaurants) && ctx.restaurants.length) {
        var list = ctx.restaurants.slice(0, 40);
        out += '\nRestaurants auf der Plattform (' + ctx.restaurants.length + ' gesamt, hier ' + list.length + '):\n';
        list.forEach(function (x) {
            if (!x || !x.name) return;
            var line = '· ' + (refOk(x.ref) ? refOk(x.ref) + ' ' : '') + kurz(x.name, 40);
            if (x.city) line += ' (' + kurz(x.city, 25) + ')';
            if (x.cuisine) line += ' ' + kurz(x.cuisine, 20);
            if (x.stand) line += ' · ' + kurz(x.stand, 30);
            if (x.delivery) line += ' · liefert';
            if (x.reservieren === false) line += ' · ohne Reservierung';
            if (x.bestellen === false) line += ' · ohne Bestellung';
            out += line + '\n';
        });
    }

    if (!out) return '';
    return '\n\n=== KONTEXT (nur für diese Frage) ===\n' + out +
           'Empfiehl nur, was hier steht. Steht es nicht hier, sag das.\n';
}

// Anbieter-Reihenfolge: NUR KOSTENLOSE.
//
// Anders als beim Menüscanner läuft der Assistent bei jedem Gast und bei
// jeder Frage -- hier summiert sich alles, was pro Anfrage Geld kostet.
// Deshalb: Gemini 2.5 Flash (kostenloses Kontingent) zuerst, Groq als
// ebenfalls kostenloser Notnagel.
//
// Claude wird NIE von selbst genommen, auch wenn ein ANTHROPIC_API_KEY
// gesetzt ist (der gehört dem Menüscanner). Nur wer ausdrücklich
// CHAT_PROVIDER=anthropic setzt, bekommt ihn -- eine bewusste Entscheidung,
// kein Versehen.
//
// Ist kein kostenloser Anbieter eingerichtet, geben wir lieber einen
// ehrlichen Fehler zurück als still auf einen kostenpflichtigen
// auszuweichen. Eine überraschende Rechnung wäre schlimmer als eine
// klare Meldung.
var FREE_PROVIDERS = ['gemini', 'groq'];

function pickProvider(env) {
    var have = {
        anthropic: !!env.ANTHROPIC_API_KEY,
        gemini: !!env.GEMINI_API_KEY,
        groq: !!env.GROQ_API_KEY
    };
    var wanted = String(env.CHAT_PROVIDER || '').toLowerCase();
    if (wanted && have[wanted]) return wanted;   // ausdrueckliche Wahl gilt
    for (var i = 0; i < FREE_PROVIDERS.length; i++) {
        if (have[FREE_PROVIDERS[i]]) return FREE_PROVIDERS[i];
    }
    return null;
}

// Reihenfolge für den Ausweichversuch, wenn der erste Anbieter ausfällt.
// Enthält bewusst nur kostenlose -- ausser der Nutzer hat sich ausdrücklich
// für einen kostenpflichtigen entschieden, dann bleibt der auch drin.
function providerOrder(env) {
    var first = pickProvider(env);
    if (!first) return [];
    var rest = FREE_PROVIDERS.filter(function (p) { return p !== first; });
    return [first].concat(rest);
}

// Eingaben prüfen und begrenzen -- die Function ist öffentlich erreichbar.
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
    // Schnellstes Claude-Modell; 200K Kontext reicht hier um Längen.
    anthropic: 'claude-haiku-4-5',
    // 2.5 Flash statt 2.0: neuer, versteht Speisekarten und Rückfragen besser.
    gemini: 'gemini-2.5-flash',
    groq: 'llama-3.3-70b-versatile'
};

module.exports = { MAX_TOKENS: MAX_TOKENS, SYSTEM_PROMPT: SYSTEM_PROMPT, MODELS: MODELS,
                   buildContext: buildContext, pickProvider: pickProvider,
                   providerOrder: providerOrder, readInput: readInput };
