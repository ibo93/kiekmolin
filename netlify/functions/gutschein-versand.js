// Kiek mol in -- GESCHENKGUTSCHEINE AM WUNSCHTAG ZUSTELLEN (04.11.2026).
//
// Ibo: "wie sieht es aus, wenn der Gast es weiterschickt an den, dem er es
// schenken will". Wer online kauft, kann die E-Mail des Beschenkten und einen
// Tag angeben (z. B. Heiligabend). Diese Funktion laeuft stuendlich und
// schickt alle faelligen Geschenk-Mails -- ab 8 Uhr deutscher Zeit, damit das
// Geschenk morgens ankommt und nicht um Mitternacht.
//
// Nie doppelt: zustellen() setzt versendet_am, bevor die Mail rausgeht, und
// gibt es nur zurueck, wenn die Mail scheitert (dann naechste Stunde wieder).
// Gibt IMMER 200 zurueck -- bei 500 startet Netlify die Funktion neu.
'use strict';

var GG = require('./geschenkgutschein');
var I = GG._intern;
var AB_STUNDE = 8;

exports.handler = async function () {
    var stand = { faellig: 0, verschickt: 0, fehler: 0 };
    try {
        if (!process.env.SUPABASE_SERVICE_KEY) { console.warn('[gutschein-versand] SUPABASE_SERVICE_KEY fehlt'); return { statusCode: 200, body: JSON.stringify(stand) }; }
        var jetzt = new Date();
        if (I.stundeBerlin(jetzt) < AB_STUNDE) return { statusCode: 200, body: JSON.stringify(Object.assign(stand, { warten: 'vor 8 Uhr' })) };
        var heute = I.heuteBerlin(jetzt);
        var liste = await I.hol('geschenkgutscheine?versendet_am=is.null&empfaenger_email=not.is.null&versand_am=lte.' + heute
            + '&status=neq.storniert&select=*&order=versand_am.asc&limit=50');
        stand.faellig = liste.length;
        var lokale = {};
        for (var i = 0; i < liste.length; i++) {
            var g = liste[i];
            try {
                if (!lokale[g.restaurant_id]) lokale[g.restaurant_id] = await I.lokal(g.restaurant_id);
                if (await I.zustellen(g, lokale[g.restaurant_id] || { name: 'dem Lokal' })) stand.verschickt++;
                else stand.fehler++;
            } catch (e) { stand.fehler++; console.error('[gutschein-versand] ' + g.code + ': ' + e.message); }
        }
        if (stand.fehler) console.error('[gutschein-versand] ' + stand.fehler + ' von ' + stand.faellig + ' Geschenk-Mails nicht verschickt -- naechste Stunde wieder.');
        else if (stand.verschickt) console.log('[gutschein-versand] ' + stand.verschickt + ' Geschenk-Mails verschickt.');
    } catch (e) {
        // Fehlt die Spalte (SQL 51 noch nicht eingespielt), steht das hier -- nicht still.
        console.error('[gutschein-versand] ' + (e && e.message) + (e && e.text ? ' ' + String(e.text).slice(0, 200) : ''));
        stand.fehler = -1;
    }
    return { statusCode: 200, body: JSON.stringify(stand) };
};
