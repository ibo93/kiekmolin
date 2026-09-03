// WAS DIE WACHE SICH MERKT -- UND WARUM SIE ES SICH MERKEN MUSS.
//
// Gemeldet am 27.08.2026: "die wache nervt zu viel kommt das mit die
// signale".
//
// Gemessen im Postfach: 96 E-Mails zwischen 22:30 und 07:45, alle 15
// Minuten zwei bis drei, alle mit demselben Satz. Eine Warnung, die so
// oft kommt, liest niemand mehr -- und dann ist die naechste echte
// auch weg.
//
// Die alte Ruhezeit lag in /tmp. Das sah im Programm richtig aus und
// war in Wirklichkeit wirkungslos: eine Netlify-Funktion bekommt fast
// jedes Mal einen frischen Behaelter, /tmp ist beim Start leer, also
// war jede Meldung "die erste". Ein Gedaechtnis, das jeden Start
// vergisst, ist keines.
//
// Deshalb liegt der Zustand jetzt in der Datenbank -- eine Zeile je
// Pruefung, siehe datenbank/21-wache-gedaechtnis.sql.
//
// WENN ES DIE TABELLE NOCH NICHT GIBT
// Dann faellt alles auf /tmp zurueck und von dort auf "melden". Lieber
// einmal zu viel gewarnt als eine Warnung verschluckt -- aber die
// Wache sagt es dann laut ins Protokoll, damit der Grund fuer die
// vielen Meldungen nicht wieder geraten werden muss.

'use strict';

var fs = require('fs');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';

var TABELLE = 'wache_status';

function kopf(extra) {
    var h = {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
}

// Einmal je Aufruf gemerkt, damit nicht jede Pruefung denselben
// 404 erneut ausloest.
var tabelleFehlt = false;

async function lies(kennung) {
    if (!SERVICE_KEY || tabelleFehlt) return null;
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/' + TABELLE
            + '?kennung=eq.' + encodeURIComponent(kennung) + '&select=*&limit=1',
            { headers: kopf() });
        if (res.status === 404 || res.status === 406) { tabelleFehlt = true; return null; }
        if (!res.ok) return null;
        var zeilen = await res.json();
        return (zeilen && zeilen[0]) || null;
    } catch (e) {
        return null;
    }
}

// Eine Zeile je Pruefung, angelegt oder ueberschrieben. on_conflict
// sorgt dafuer, dass zwei gleichzeitige Durchlaeufe sich nicht
// gegenseitig mit einem Schluesselfehler abschiessen.
async function schreib(kennung, felder) {
    if (!SERVICE_KEY || tabelleFehlt) return false;
    var zeile = { kennung: kennung, updated_at: new Date().toISOString() };
    Object.keys(felder).forEach(function (k) { zeile[k] = felder[k]; });
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/' + TABELLE + '?on_conflict=kennung', {
            method: 'POST',
            headers: kopf({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(zeile)
        });
        if (res.status === 404) { tabelleFehlt = true; return false; }
        return res.ok;
    } catch (e) {
        return false;
    }
}

// DER NOTNAGEL, wenn es die Tabelle noch nicht gibt.
//
// /tmp ueberlebt keinen Kaltstart -- deshalb ist das kein Ersatz,
// sondern nur die Bremse fuer den Fall, dass zwei Durchlaeufe
// zufaellig denselben Behaelter erwischen. Und es sagt laut, dass es
// der Notnagel ist.
function tmpBremse(kennung, ruheMs) {
    try {
        var datei = '/tmp/kmi-wache-' + String(kennung).replace(/[^a-z0-9-]/gi, '_');
        var jetzt = Date.now();
        if (fs.existsSync(datei)) {
            var alt = Number(fs.readFileSync(datei, 'utf8')) || 0;
            if (jetzt - alt < ruheMs) return true;
        }
        fs.writeFileSync(datei, String(jetzt));
        return false;
    } catch (e) {
        return false;
    }
}

function gedaechtnisFehlt() { return tabelleFehlt; }

// ---- DIE REGEL, WIE OFT GESTOERT WIRD ------------------------------
//
// Vorher: alle 15 Minuten dieselbe Meldung, Nacht durch. 96 Stueck.
// Jetzt:
//
//   das erste Mal        -> sofort, egal zu welcher Uhrzeit.
//                           Ein Gast, der um 23 Uhr nicht bestellen
//                           kann, ist um 23 Uhr ein Problem.
//   dasselbe danach      -> still. Hoechstens eine Erinnerung pro Tag,
//                           und die nur zwischen 8 und 21 Uhr.
//   wieder in Ordnung    -> eine Entwarnung. Genau eine.
//   etwas ANDERES kaputt -> sofort. Ruhe gilt je Pruefung, nie pauschal
//                           -- sonst verschluckt eine bekannte Stoerung
//                           die naechste unbekannte.
//
// Das ist die Richtung, in die ein Waechter sich irren darf: leiser
// beim Wiederholen, nie leiser bei etwas Neuem.
var TAG_MS   = 24 * 60 * 60 * 1000;
var NOTNAGEL_RUHE_MS = 6 * 60 * 60 * 1000;

// Erinnerungen nur tagsueber. Eine neue Stoerung darf nachts wecken,
// eine bekannte nicht -- die stand um 3 Uhr schon im Postfach.
function tagsueber(jetzt) {
    var stunde;
    try {
        // NICHT .format() NEHMEN.
        //
        // Beim Schreiben dieses Tests aufgefallen: de-DE formatiert die
        // Stunde als "10 Uhr". Number('10 Uhr') ist NaN, NaN >= 8 ist
        // false -- also waere JEDE Stunde Nacht gewesen und die
        // Erinnerung NIE gekommen. Ein Ausfall, der genau so aussieht
        // wie "es klemmt eben gerade nichts": Regel 6.
        //
        // formatToParts gibt die Zahl allein zurueck, ohne Beiwerk.
        var teile = new Intl.DateTimeFormat('de-DE', {
            timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false
        }).formatToParts(jetzt);
        for (var i = 0; i < teile.length; i++) {
            if (teile[i].type === 'hour') stunde = Number(teile[i].value);
        }
        if (!(stunde >= 0)) throw new Error('keine Stunde gefunden');
    } catch (e) {
        // Ohne Zeitzonen-Daten: deutsche Zeit ist UTC+1 oder +2. Mit +2
        // gerechnet faengt der Tag eine Stunde frueher an -- im Zweifel
        // lieber eine Stunde spaeter erinnern als eine Stunde zu frueh
        // wecken, deshalb +1.
        stunde = (jetzt.getUTCHours() + 1) % 24;
    }
    return stunde >= 8 && stunde < 21;
}

// Eine Pruefung bewerten und den neuen Stand hinterlegen.
// Zurueck kommt, was der Betreiber davon mitbekommen soll:
//   'neu'        -- das ist neu, sofort melden
//   'erinnerung' -- klemmt seit gestern, einmal nachfassen
//   'entwarnung' -- geht wieder
//   'still'      -- nichts sagen
async function bewerten(kennung, klemmt, jetzt) {
    jetzt = jetzt || new Date();
    var zeile = await lies(kennung);

    // KEINE TABELLE -> NICHT SCHWEIGEN.
    //
    // Ohne Gedaechtnis liesse sich "schon gemeldet" nicht von "neu"
    // unterscheiden. Ein Waechter, der im Zweifel schweigt, ist
    // schlimmer als einer, der zu oft ruft -- deshalb hier melden,
    // gebremst nur durch /tmp, und mit einer deutlichen Zeile im
    // Protokoll, warum es wieder mehr Meldungen sind.
    // Ohne Dienstschluessel kommt lies() gar nicht erst an die Tabelle
    // und gibt null zurueck -- ununterscheidbar von "noch keine Zeile".
    // Ohne diese Zeile waere jede Meldung wieder "die erste", und zwar
    // lautlos. Genau der Fehler, den die alte /tmp-Ruhezeit hatte.
    if (gedaechtnisFehlt() || !SERVICE_KEY) {
        if (!klemmt) return 'still';
        console.error('[wache] kein Gedaechtnis erreichbar ('
            + (SERVICE_KEY ? 'Tabelle wache_status fehlt -- datenbank/21-wache-gedaechtnis.sql '
                             + 'ist noch nicht eingespielt'
                           : 'SUPABASE_SERVICE_KEY fehlt')
            + '). Bis dahin kann die Wache sich nichts merken und meldet oefter als noetig.');
        return tmpBremse(kennung, NOTNAGEL_RUHE_MS) ? 'still' : 'neu';
    }

    var zustand      = (zeile && zeile.zustand) || 'ok';
    var fehlversuche = (zeile && Number(zeile.fehlversuche)) || 0;
    var zuletzt      = zeile && zeile.zuletzt_gemeldet ? new Date(zeile.zuletzt_gemeldet) : null;

    if (!klemmt) {
        if (zustand === 'klemmt') {
            await schreib(kennung, { zustand: 'ok', fehlversuche: 0, seit: null, text: null });
            return 'entwarnung';
        }
        if (fehlversuche) await schreib(kennung, { fehlversuche: 0 });
        return 'still';
    }

    fehlversuche = fehlversuche + 1;

    if (zustand === 'klemmt') {
        var faellig = !zuletzt || (jetzt - zuletzt) >= TAG_MS;
        if (faellig && tagsueber(jetzt)) {
            await schreib(kennung, { fehlversuche: fehlversuche, zuletzt_gemeldet: jetzt.toISOString() });
            return 'erinnerung';
        }
        await schreib(kennung, { fehlversuche: fehlversuche });
        return 'still';
    }

    await schreib(kennung, {
        zustand: 'klemmt',
        fehlversuche: fehlversuche,
        seit: jetzt.toISOString(),
        zuletzt_gemeldet: jetzt.toISOString()
    });
    return 'neu';
}



// Nur fuer die Tests: der Merker ist sonst fuer die Lebensdauer des
// Behaelters gesetzt und liesse sich zwischen zwei Faellen nicht
// zuruecksetzen.
function zuruecksetzen() { tabelleFehlt = false; }

module.exports = {
    bewerten: bewerten,
    tagsueber: tagsueber,
    lies: lies,
    schreib: schreib,
    tmpBremse: tmpBremse,
    gedaechtnisFehlt: gedaechtnisFehlt,
    zuruecksetzen: zuruecksetzen
};
