// EINE NUR-TEXT-FASSUNG ZU JEDER E-MAIL.
//
// Gefragt am 31.08.2026: warum manche Mails auf "Gesendet" stehen
// bleiben statt "Geliefert" zu werden.
//
// Eine Ursache, die man beheben kann, ohne zu raten: unsere Mails
// bestehen NUR aus HTML. Spamfilter -- besonders bei web.de und GMX,
// beide United Internet -- werten eine Mail ohne Textfassung schlechter.
// Sie ist damit nicht verboten, aber sie steht weiter hinten in der
// Schlange und wird eher gedrosselt oder aussortiert.
//
// Eine ordentliche Mail hat beides: HTML fuer die, die es koennen, und
// Text fuer alles andere. Das ist kein Zaubermittel gegen Abpraller --
// es nimmt nur einen Grund weg, den wir selbst gesetzt haben.
//
// Absichtlich keine Bibliothek: eine Abhaengigkeit fuer dreissig Zeilen
// ist es nicht wert, und die Mails hier sind selbst gebautes HTML ohne
// Ueberraschungen.

'use strict';

function nurText(html) {
    if (!html) return '';
    var t = String(html);

    // Was gar nicht in den Text gehoert.
    t = t.replace(/<style[\s\S]*?<\/style>/gi, '')
         .replace(/<script[\s\S]*?<\/script>/gi, '')
         .replace(/<!--[\s\S]*?-->/g, '');

    // Ein Link soll seine Adresse behalten -- sonst steht im Text
    // "Bestellung verfolgen" und niemand kann darauf.
    t = t.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, function (_, adresse, inhalt) {
        var wort = inhalt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!adresse || adresse.indexOf('#') === 0) return wort;
        return wort ? wort + ' (' + adresse + ')' : adresse;
    });

    // Zeilenumbrueche dort, wo im HTML einer zu sehen war.
    t = t.replace(/<br\s*\/?>/gi, '\n')
         .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
         .replace(/<li\b[^>]*>/gi, '- ')
         .replace(/<\/td>\s*<td[^>]*>/gi, '  ');

    t = t.replace(/<[^>]+>/g, '');

    // Die paar Entitaeten, die in unseren Vorlagen wirklich vorkommen.
    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
         .replace(/&euro;/g, '€');

    // Aufraeumen: keine Zeilen aus lauter Leerzeichen, hoechstens eine
    // Leerzeile am Stueck.
    return t.split('\n').map(function (z) { return z.replace(/[ \t]+/g, ' ').trim(); })
            .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { nurText: nurText };
