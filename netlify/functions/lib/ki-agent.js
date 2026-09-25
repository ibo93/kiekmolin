// Kiek mol in — die Logik hinter kiekmolin.de/mcp (KI-Assistenten).
//
// WARUM EINE EIGENE DATEI OHNE NETZ
// ==================================
// Alles, was hier steht, rechnet nur: Allergene uebersetzen, Oeffnungszeiten
// lesen, freie Zeiten bestimmen, Filter anwenden, Eingaben pruefen. Kein
// fetch, keine Datenbank. So laesst sich jede Regel in tests/ ohne Netz
// pruefen -- und die Funktion mcp.mjs bleibt der duenne Teil, der nur
// holt und schreibt.
//
// ZWEI GRUNDSAETZE, DIE UEBERALL GELTEN
// =====================================
// 1. Nichts Personenbezogenes geht hinaus. Die Eingaben kommen nur aus den
//    Sichten agent_restaurants_v / agent_menu_v (Schritt 36) -- dort gibt
//    es gar keine Gaeste-, Umsatz- oder Kundendaten.
// 2. Keine Angabe ist keine Zusage. Ein Gericht ohne eingetragene
//    Allergene ist NICHT allergenfrei, sondern "keine Angabe". Ein Tag,
//    fuer den die Zeiten nicht lesbar sind, ist nicht "offen", sondern
//    "unbekannt". Ein Assistent, der "enthaelt keine Nuesse" sagt, weil
//    das Feld leer war, kann jemanden ins Krankenhaus bringen.

'use strict';

var crypto = require('crypto');

// ==================== ALLERGENE (LMIV) ====================
// Die Datenbank speichert Kuerzel wie 'gluten' oder 'milch' (siehe
// LMIV_ALLERGENS in index.html). Auf Speisekarten stehen in Deutschland
// ueblicherweise Buchstaben. Die Reihe geht von A bis R und laesst I, J,
// K und Q aus -- "A bis N" reicht also nicht fuer alle 14.
var ALLERGENE = {
    gluten:          { code: 'A', name: 'Glutenhaltiges Getreide' },
    krebstiere:      { code: 'B', name: 'Krebstiere' },
    eier:            { code: 'C', name: 'Eier' },
    fisch:           { code: 'D', name: 'Fisch' },
    erdnuss:         { code: 'E', name: 'Erdnüsse' },
    soja:            { code: 'F', name: 'Soja' },
    milch:           { code: 'G', name: 'Milch/Laktose' },
    schalenfruechte: { code: 'H', name: 'Schalenfrüchte (Nüsse)' },
    sellerie:        { code: 'L', name: 'Sellerie' },
    senf:            { code: 'M', name: 'Senf' },
    sesam:           { code: 'N', name: 'Sesam' },
    sulfite:         { code: 'O', name: 'Schwefeldioxid/Sulfite' },
    lupinen:         { code: 'P', name: 'Lupinen' },
    weichtiere:      { code: 'R', name: 'Weichtiere' }
};

// Dieselbe Liste wie ZUSATZSTOFFE in index.html.
var ZUSATZSTOFFE = {
    '1': 'mit Farbstoff', '2': 'mit Konservierungsstoff', '3': 'mit Antioxidationsmittel',
    '4': 'mit Geschmacksverstärker', '5': 'geschwefelt', '6': 'geschwärzt', '7': 'gewachst',
    '8': 'mit Phosphat', '9': 'mit Süßungsmittel', '10': 'enthält eine Phenylalaninquelle',
    '11': 'koffeinhaltig', '12': 'chininhaltig', '13': 'mit Milcheiweiß'
};

var HINWEIS_ALLERGENE = 'Angaben des Restaurants. Bei Allergien bitte vor Ort nachfragen.';

// Listen stehen je nach Alter des Datensatzes als Array, als JSON-Text,
// als Postgres-Array-Text ('{a,b}') oder als Komma-Text in der Datenbank.
function liste(x) {
    if (Array.isArray(x)) return x.map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
    if (x == null) return [];
    var s = String(x).trim();
    if (!s) return [];
    if (s.charAt(0) === '[') { try { return liste(JSON.parse(s)); } catch (e) { /* weiter */ } }
    if (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') s = s.slice(1, -1);
    return s.split(',').map(function (v) { return v.replace(/^"|"$/g, '').trim(); }).filter(Boolean);
}

function normalize(s) {
    return String(s == null ? '' : s).toLowerCase().trim()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

// ==================== TEXT NACH AUSSEN ====================
// Beschreibungen schreibt der Wirt, Notizen der Gast -- beides geht an ein
// Sprachmodell zurueck. Steuerzeichen und HTML raus, Laenge begrenzen.
// Das verhindert keine geschickt formulierte Anweisung im Text, aber es
// nimmt die billigen Tricks (versteckte Zeichen, Markup) weg; der Rest
// steht als reines Datenfeld im JSON, nie als Teil unserer eigenen Saetze.
function sauber(s, max) {
    return String(s == null ? '' : s)
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max || 300);
}

function gerichtFuerAgent(m) {
    var codes = liste(m.allergens).map(function (a) { return normalize(a); });
    var allergene = [];
    codes.forEach(function (c) {
        var a = ALLERGENE[c];
        if (a && !allergene.some(function (x) { return x.code === a.code; })) allergene.push({ code: a.code, name: a.name });
    });
    allergene.sort(function (a, b) { return a.code < b.code ? -1 : 1; });

    // In additives steht auch die Gerichtnummer als 'nr:12' -- die ist kein
    // Zusatzstoff und bleibt draussen.
    var zusatz = [];
    liste(m.additives).forEach(function (z) {
        if (/^nr:/i.test(z)) return;
        var t = ZUSATZSTOFFE[String(z).replace(/\D/g, '')];
        if (t && zusatz.indexOf(t) < 0) zusatz.push(t);
    });

    var preis = Number(m.base_price);
    var g = {
        name: sauber(m.name, 120),
        kategorie: m.kategorie ? sauber(m.kategorie, 80) : null,
        beschreibung: m.description ? sauber(m.description, 300) : null,
        preis_eur: isFinite(preis) && preis > 0 ? Math.round(preis * 100) / 100 : null,
        vegetarisch: m.is_vegetarian === true || m.is_vegan === true,
        vegan: m.is_vegan === true,
        scharf: m.is_spicy === true,
        // Nur wenn der Wirt etwas eingetragen hat, ist die Liste eine Aussage.
        allergene_angegeben: allergene.length > 0,
        allergene: allergene.length ? allergene : 'keine Angabe',
        zusatzstoffe: zusatz
    };
    return g;
}

// ==================== ZEIT (immer Europe/Berlin) ====================
// Netlify rechnet in UTC. "Heute 19 Uhr" meint aber Greetsiel, nicht
// Greenwich -- ohne diese Umrechnung waere zwei Stunden lang "gestern".
function berlin(jetzt) {
    var d = jetzt instanceof Date ? jetzt : new Date(jetzt == null ? Date.now() : jetzt);
    var teile = {};
    new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).forEach(function (p) { teile[p.type] = p.value; });
    var std = Number(teile.hour) % 24;
    return {
        datum: teile.year + '-' + teile.month + '-' + teile.day,
        minuten: std * 60 + Number(teile.minute)
    };
}

function tagPlus(datum, n) {
    var d = new Date(datum + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

// 0 = Montag ... 6 = Sonntag (wie rest_day in der Datenbank)
function wochentag(datum) {
    return (new Date(datum + 'T12:00:00Z').getUTCDay() + 6) % 7;
}

// 'heute', 'morgen', 'übermorgen' oder JJJJ-MM-TT. Alles andere: null --
// dann fragt der Assistent nach, statt dass wir raten.
function datumLesen(eingabe, jetzt) {
    var s = normalize(eingabe);
    var heute = berlin(jetzt).datum;
    if (!s || s === 'heute' || s === 'today') return s ? heute : null;
    if (s === 'morgen' || s === 'tomorrow') return tagPlus(heute, 1);
    if (s === 'uebermorgen') return tagPlus(heute, 2);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z').getTime())) return s;
    return null;
}

function hhmm(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
    if (!m) return null;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 24 || mi > 59) return null;
    return (h < 10 ? '0' : '') + h + ':' + m[2];
}
function minuten(t) { var s = hhmm(t); return s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null; }
function alsZeit(min) { var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

function oh(rest) {
    var o = rest && rest.opening_hours;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
    return o && typeof o === 'object' ? o : null;
}

function ruhetag(rest) {
    var roh = rest && rest.rest_day;
    // Number(null) ist 0 -- ohne diese Pruefung haette jedes Haus ohne
    // Ruhetag montags zu. (Derselbe Fehler steht in build-seo-pages.js
    // beschrieben.)
    if (roh === null || roh === undefined || roh === '') return -1;
    var n = Number(roh);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : -1;
}

// Betriebsferien stehen als 'vacation:JJJJ-MM-TT:JJJJ-MM-TT' in features
// (siehe getVacationInfo in index.html).
function ferien(rest, datum) {
    var f = liste(rest && rest.features);
    for (var i = 0; i < f.length; i++) {
        var m = /^vacation:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(f[i]);
        if (m && datum >= m[1] && datum <= m[2]) return { von: m[1], bis: m[2] };
    }
    return null;
}

var KUERZEL = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

// Oeffnungszeiten eines Tages. Dieselben drei Quellen und dieselbe
// Reihenfolge wie parseOeffnungszeiten in build-seo-pages.js:
//   1. flach pro Tag (mo_start/mo_end, mo_start2/mo_end2) -- was das
//      Dashboard heute schreibt
//   2. opening_time/closing_time fuer die ganze Woche, mit Pause
// Ergebnis: { status: 'offen'|'geschlossen'|'unbekannt', schichten, grund }
function oeffnungAm(rest, datum) {
    var fe = ferien(rest, datum);
    if (fe) return { status: 'geschlossen', schichten: [], grund: 'Betriebsferien bis ' + fe.bis };
    var wt = wochentag(datum);
    if (wt === ruhetag(rest)) return { status: 'geschlossen', schichten: [], grund: 'Ruhetag' };

    var o = oh(rest);
    var flach = o && KUERZEL.some(function (k) { return Object.prototype.hasOwnProperty.call(o, k + '_start'); });
    if (flach) {
        var k = KUERZEL[wt], s = [];
        if (hhmm(o[k + '_start']) && hhmm(o[k + '_end'])) s.push([hhmm(o[k + '_start']), hhmm(o[k + '_end'])]);
        if (hhmm(o[k + '_start2']) && hhmm(o[k + '_end2'])) s.push([hhmm(o[k + '_start2']), hhmm(o[k + '_end2'])]);
        if (s.length) return { status: 'offen', schichten: s, grund: null };
        // Tage ohne Zeiten sind in der Maske geschlossen -- aber nur, wenn
        // an irgendeinem Tag ueberhaupt etwas steht.
        var irgendwas = KUERZEL.some(function (kk) { return hhmm(o[kk + '_start']) && hhmm(o[kk + '_end']); });
        if (irgendwas) return { status: 'geschlossen', schichten: [], grund: 'laut Öffnungszeiten geschlossen' };
    }

    var auf = hhmm(rest && rest.opening_time), zu = hhmm(rest && rest.closing_time);
    if (auf && zu) {
        var p1 = o && o.pause_enabled !== false ? hhmm(o.pause_start) : null;
        var p2 = o && o.pause_enabled !== false ? hhmm(o.pause_end) : null;
        if (p1 && p2 && p1 > auf && p2 < zu) return { status: 'offen', schichten: [[auf, p1], [p2, zu]], grund: null };
        return { status: 'offen', schichten: [[auf, zu]], grund: null };
    }
    return { status: 'unbekannt', schichten: [], grund: 'keine Öffnungszeiten hinterlegt' };
}

// Hat das Haus zum Zeitpunkt (Berlin) offen? null = weiss nicht.
function offenJetzt(rest, jetzt) {
    var b = berlin(jetzt);
    var tag = oeffnungAm(rest, b.datum);
    if (tag.status === 'unbekannt') return null;
    return tag.schichten.some(function (s) {
        var a = minuten(s[0]), z = minuten(s[1]);
        if (z <= a) z += 1440;               // Schliessung nach Mitternacht
        return b.minuten >= a && b.minuten < z;
    });
}

// ==================== FREIE ZEITEN ====================
// Dieselbe Rechnung wie loadAvailableSlots + generateReservationSlots in
// index.html, damit der Assistent keine Zeit anbietet, die die Seite
// nicht auch anbieten wuerde:
//   Raster opening_time .. closing_time-30, Abstand slot_interval_minutes,
//   Pause (pause_start/pause_end), disabled_slots, Ganztags-Sperre,
//   Slot-Sperre, gesperrte Tische, Buchungen je Slot < Tische.
//
// ZWEI DINGE STRENGER ALS DIE SEITE, bewusst:
//   * Ruhetag und Betriebsferien -> gar keine Zeiten. (Die Seite prueft
//     die Ferien auch, den Ruhetag im Raster aber nicht.)
//   * Stehen fuer den Tag eigene Schichten im flachen Format, fallen
//     Zeiten ausserhalb davon weg (Start frueher als 30 Min vor Schluss).
// Ein Assistent, der eine Zeit am Ruhetag anbietet, erzeugt eine Anfrage,
// die der Wirt nur ablehnen kann -- das ist fuer den Gast schlechter als
// "an dem Tag geschlossen".
function rasterFuer(rest) {
    var o = oh(rest) || {};
    var start = minuten(rest.opening_time || '11:00');
    var ende = rest.closing_time ? minuten(rest.closing_time) - 30 : minuten('21:30');
    var abstand = Number(rest.slot_interval_minutes) > 0 ? Number(rest.slot_interval_minutes) : 30;
    var pause = o.pause_enabled === false ? null : [minuten(o.pause_start || '14:00'), minuten(o.pause_end || '17:00')];
    var aus = Array.isArray(o.disabled_slots) ? o.disabled_slots.map(hhmm) : [];
    var r = [];
    if (start == null || ende == null) return r;
    for (var m = start; m <= ende; m += abstand) {
        if (pause && m >= pause[0] && m < pause[1]) continue;
        var t = alsZeit(m);
        if (aus.indexOf(t) < 0) r.push(t);
    }
    return r;
}

function freieZeiten(rest, datum, belegung, tische, jetzt) {
    var tag = oeffnungAm(rest, datum);
    if (tag.status === 'geschlossen') return { geschlossen: true, grund: tag.grund, zeiten: [] };

    var raster = rasterFuer(rest);
    var o = oh(rest);
    var flach = o && KUERZEL.some(function (k) { return Object.prototype.hasOwnProperty.call(o, k + '_start'); });
    if (flach && tag.status === 'offen') {
        raster = raster.filter(function (t) {
            var m = minuten(t);
            return tag.schichten.some(function (s) { return m >= minuten(s[0]) && m <= minuten(s[1]) - 30; });
        });
    }

    var da = (belegung || []).filter(function (r) { return ['confirmed', 'pending', 'blocked'].indexOf(r.status) >= 0; });
    var zeitVon = function (r) { return hhmm(r.reservation_time) || '00:00'; };
    if (da.some(function (r) { return r.status === 'blocked' && !r.table_id && zeitVon(r) === '00:00'; })) {
        return { geschlossen: true, grund: 'an diesem Tag keine Reservierungen möglich', zeiten: [] };
    }
    var slotGesperrt = da.filter(function (r) { return r.status === 'blocked' && !r.table_id && zeitVon(r) !== '00:00'; }).map(zeitVon);
    var tischGesperrt = {};
    da.filter(function (r) { return r.status === 'blocked' && r.table_id; }).forEach(function (r) {
        if (zeitVon(r) === '00:00') raster.forEach(function (s) { tischGesperrt[s] = (tischGesperrt[s] || 0) + 1; });
        else tischGesperrt[zeitVon(r)] = (tischGesperrt[zeitVon(r)] || 0) + 1;
    });
    var gebucht = da.filter(function (r) { return r.status !== 'blocked'; }).map(zeitVon);

    var b = berlin(jetzt);
    var anzahl = Number(tische) > 0 ? Number(tische) : 30;   // wie die App: ohne Tische 30
    var zeiten = raster.filter(function (t) {
        if (slotGesperrt.indexOf(t) >= 0) return false;
        if (datum < b.datum) return false;
        if (datum === b.datum && minuten(t) <= b.minuten) return false;
        var max = anzahl - (tischGesperrt[t] || 0);
        if (max < 1) max = 1;
        return gebucht.filter(function (g) { return g === t; }).length < max;
    });
    return { geschlossen: false, grund: null, zeiten: zeiten };
}

// ==================== SUCHE ====================
var AUSSTATTUNG = {
    hunde:    { tags: ['hunde_erlaubt'], name: 'Hunde erlaubt' },
    draussen: { tags: ['terrasse', 'biergarten', 'outdoor'], name: 'Sitzplätze draußen' },
    kinder:   { tags: ['kinderfreundlich'], name: 'kinderfreundlich' },
    barrierefrei: { tags: ['barrierefrei'], name: 'barrierefrei' },
    meerblick: { tags: ['meerblick'], name: 'Meerblick' },
    parkplatz: { tags: ['parkplatz'], name: 'Parkplatz' }
};

// Kueche: was der Gast sagt -> was in cuisine/cuisine_type steht.
var KUECHE = {
    fisch: ['fisch', 'seafood', 'meeresfruechte', 'krabben', 'matjes', 'fischrestaurant'],
    pizza: ['pizza', 'pizzeria', 'italienisch', 'italian'],
    italienisch: ['italienisch', 'italian', 'pizza', 'pizzeria', 'pasta'],
    griechisch: ['griechisch', 'greek', 'gyros'],
    doener: ['doener', 'kebab', 'tuerkisch', 'turkish'],
    cafe: ['cafe', 'kaffee', 'kuchen', 'eiscafe'],
    asiatisch: ['asiatisch', 'asia', 'sushi', 'chinesisch', 'thai', 'vietnamesisch'],
    burger: ['burger', 'amerikanisch'],
    deutsch: ['deutsch', 'regional', 'ostfriesisch', 'gutbuergerlich', 'norddeutsch']
};

// Kuerzel aus der Datenbank -> lesbare Kueche fuer Assistent und schema.org.
// Auf der Seite der Greetsieler Boerse stand servesCuisine ["fisch","bar"].
var KUECHE_NAME = {
    fisch: 'Fischrestaurant', pizza: 'Pizzeria', pizzeria: 'Pizzeria', italienisch: 'Italienisch',
    griechisch: 'Griechisch', doener: 'Döner', tuerkisch: 'Türkisch', cafe: 'Café', eiscafe: 'Eiscafé',
    asiatisch: 'Asiatisch', burger: 'Burger', deutsch: 'Deutsch', regional: 'Regional',
    bar: 'Bar', imbiss: 'Imbiss', grill: 'Grill', steak: 'Steakhaus', vegetarisch: 'Vegetarisch'
};
function kuechen(rest) {
    var roh = [].concat(rest.cuisine ? [rest.cuisine] : [], liste(rest.cuisine_type));
    var r = [];
    roh.forEach(function (c) {
        var n = KUECHE_NAME[normalize(c)] || sauber(c, 40);
        if (n && r.indexOf(n) < 0) r.push(n.charAt(0).toUpperCase() + n.slice(1));
    });
    return r;
}

function tagsVon(rest) { return liste(rest.tags).concat(liste(rest.features)).map(normalize); }

function passtKueche(rest, wunsch) {
    var w = normalize(wunsch);
    if (!w) return true;
    var worte = KUECHE[w] || KUECHE[w.replace(/restaurant$/, '')] || [w];
    var blob = [rest.cuisine].concat(liste(rest.cuisine_type), [rest.name, rest.description]).map(normalize).join(' ');
    return worte.some(function (x) { return blob.indexOf(x) >= 0; });
}

function passtOrt(rest, ort) {
    var o = normalize(ort);
    if (!o) return true;
    var blob = normalize([rest.city, rest.zip, rest.street].join(' '));
    return blob.indexOf(o) >= 0;
}

function suchen(restaurants, f, jetzt) {
    f = f || {};
    return (restaurants || []).filter(function (r) {
        if (!passtOrt(r, f.ort)) return false;
        if (!passtKueche(r, f.kueche)) return false;
        var t = tagsVon(r);
        if (f.hunde_erlaubt && !AUSSTATTUNG.hunde.tags.some(function (x) { return t.indexOf(x) >= 0; })) return false;
        if (f.draussen_sitzen && !AUSSTATTUNG.draussen.tags.some(function (x) { return t.indexOf(x) >= 0; })) return false;
        if (f.heute_offen) {
            var heute = oeffnungAm(r, berlin(jetzt).datum);
            if (heute.status !== 'offen') return false;
        }
        return true;
    });
}

function kannReservieren(rest) { return liste(rest.features).indexOf('no_reservations') < 0; }

function restaurantFuerAgent(r, jetzt) {
    var t = tagsVon(r);
    var ausstattung = [];
    Object.keys(AUSSTATTUNG).forEach(function (k) {
        if (AUSSTATTUNG[k].tags.some(function (x) { return t.indexOf(x) >= 0; })) ausstattung.push(AUSSTATTUNG[k].name);
    });
    var heute = oeffnungAm(r, berlin(jetzt).datum);
    return {
        restaurant_id: r.slug || r.id,
        name: sauber(r.name, 120),
        kueche: kuechen(r),
        beschreibung: r.description ? sauber(r.description, 300) : null,
        adresse: [sauber(r.street, 120), [sauber(r.zip, 10), sauber(r.city, 80)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        telefon: r.phone ? sauber(r.phone, 40) : null,
        preisniveau: r.price_range ? sauber(r.price_range, 8) : null,
        ausstattung: ausstattung,
        heute: heute.status === 'offen'
            ? 'geöffnet ' + heute.schichten.map(function (s) { return s[0] + '–' + s[1]; }).join(' und ') + ' Uhr'
            : heute.status === 'geschlossen' ? 'geschlossen (' + heute.grund + ')' : 'Öffnungszeiten unbekannt',
        jetzt_offen: offenJetzt(r, jetzt),
        reservierung_anfragbar: kannReservieren(r),
        webseite: 'https://kiekmolin.de/' + (r.slug || '')
    };
}

// ==================== ANFRAGE PRUEFEN ====================
function anfrageLesen(a, jetzt) {
    a = a || {};
    var fehler = [];
    var name = sauber(a.gast_name, 120);
    var tel = sauber(a.telefon, 40);
    var email = sauber(a.email, 160);
    var personen = parseInt(a.personen, 10);
    var datum = datumLesen(a.datum, jetzt);
    var zeit = hhmm(a.uhrzeit);

    if (name.length < 2) fehler.push('gast_name fehlt');
    var ziffern = tel.replace(/\D/g, '');
    if (ziffern.length < 6 || ziffern.length > 15 || /[^\d\s+()\/-]/.test(tel)) fehler.push('telefon fehlt oder ist keine Telefonnummer');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fehler.push('email ist ungültig');
    if (!(personen >= 1 && personen <= 20)) fehler.push('personen muss 1 bis 20 sein (größere Gruppen bitte direkt anrufen)');
    if (!datum) fehler.push('datum muss JJJJ-MM-TT, "heute" oder "morgen" sein');
    if (!zeit) fehler.push('uhrzeit muss HH:MM sein');
    if (datum) {
        var heute = berlin(jetzt).datum;
        if (datum < heute) fehler.push('datum liegt in der Vergangenheit');
        if (datum > tagPlus(heute, 90)) fehler.push('Anfragen gehen höchstens 90 Tage im Voraus');
    }
    return {
        fehler: fehler,
        wert: {
            gast_name: name, telefon: tel, email: email || null, personen: personen,
            datum: datum, uhrzeit: zeit, notiz: sauber(a.notiz, 300)
        }
    };
}

// Nur die Ziffern zaehlen -- '+49 4926 123' und '04926123' sollen nicht
// als zwei verschiedene Gaeste durch die Drossel rutschen.
function telefonSchluessel(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.indexOf('49') === 0) d = d.slice(2);
    return d.replace(/^0+/, '');
}

function hash(wert, salz) {
    if (!wert) return null;
    return crypto.createHash('sha256').update(String(salz || '') + '|' + String(wert)).digest('hex').slice(0, 32);
}

// ==================== DROSSEL ====================
// ACHTUNG BEI DER IP: Anfragen von ChatGPT und Claude kommen aus den
// Rechenzentren von OpenAI und Anthropic -- viele echte Gaeste teilen sich
// also dieselbe IP. Eine enge Grenze pro IP wuerde am Samstagabend alle
// Claude-Nutzer gleichzeitig aussperren. Deshalb ist die IP-Grenze fuer
// Lesen grosszuegig, und die eigentliche Bremse fuer Anfragen sitzt an
// der Telefonnummer und am Haus.
var GRENZEN = {
    lesen_pro_ip_10min: 300,
    anfragen_pro_ip_stunde: 30,
    anfragen_pro_telefon_tag: 3,
    anfragen_pro_haus_tag: 15
};

function drossel(z) {
    if (z.lesen_ip_10min != null && z.lesen_ip_10min >= GRENZEN.lesen_pro_ip_10min) return 'Zu viele Anfragen von dieser Quelle. Bitte in ein paar Minuten erneut versuchen.';
    if (z.anfragen_ip_stunde != null && z.anfragen_ip_stunde >= GRENZEN.anfragen_pro_ip_stunde) return 'Zu viele Reservierungsanfragen von dieser Quelle. Bitte später erneut versuchen.';
    if (z.anfragen_telefon_tag != null && z.anfragen_telefon_tag >= GRENZEN.anfragen_pro_telefon_tag) return 'Für diese Telefonnummer liegen heute schon mehrere Anfragen vor. Bitte das Restaurant direkt anrufen.';
    if (z.anfragen_haus_tag != null && z.anfragen_haus_tag >= GRENZEN.anfragen_pro_haus_tag) return 'Das Restaurant hat heute schon viele Online-Anfragen. Bitte direkt anrufen.';
    return null;
}

// ==================== WER FRAGT ====================
function clientName(ua, clientInfo) {
    var s = normalize((clientInfo && clientInfo.name ? clientInfo.name + ' ' : '') + (ua || ''));
    if (/openai|chatgpt/.test(s)) return 'ChatGPT';
    if (/claude|anthropic/.test(s)) return 'Claude';
    if (/gemini|google/.test(s)) return 'Gemini';
    if (/perplexity/.test(s)) return 'Perplexity';
    if (/copilot|microsoft/.test(s)) return 'Copilot';
    if (/mcp-inspector|inspector/.test(s)) return 'MCP Inspector';
    return 'unbekannt';
}

module.exports = {
    ALLERGENE: ALLERGENE, ZUSATZSTOFFE: ZUSATZSTOFFE, HINWEIS_ALLERGENE: HINWEIS_ALLERGENE,
    AUSSTATTUNG: AUSSTATTUNG, GRENZEN: GRENZEN, KUECHE_NAME: KUECHE_NAME,
    liste: liste, normalize: normalize, sauber: sauber,
    gerichtFuerAgent: gerichtFuerAgent, restaurantFuerAgent: restaurantFuerAgent, kuechen: kuechen,
    berlin: berlin, tagPlus: tagPlus, wochentag: wochentag, datumLesen: datumLesen, hhmm: hhmm,
    oeffnungAm: oeffnungAm, offenJetzt: offenJetzt, rasterFuer: rasterFuer, freieZeiten: freieZeiten,
    suchen: suchen, kannReservieren: kannReservieren,
    anfrageLesen: anfrageLesen, telefonSchluessel: telefonSchluessel, hash: hash,
    drossel: drossel, clientName: clientName
};
