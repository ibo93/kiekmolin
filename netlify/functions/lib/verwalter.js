// IST DER ANRUFER WIRKLICH IBO? -- an EINER Stelle.
//
// Diese Pruefung stand bis zum 25.09.2026 nur in zahlsperre.js. Beim Bau
// von abo-stand.js waere sie ein zweites Mal entstanden -- und zwei
// Fassungen einer Sicherheitspruefung heissen: eine davon wird irgendwann
// nachgebessert und die andere nicht. Deshalb hier, einmal.
//
// WIE GEPRUEFT WIRD
// =================
// Ueber die ECHTE Supabase-Sitzung, nicht ueber ein Feld, das der Browser
// mitschickt. Der Ablauf:
//
//   1. Das Token gegen /auth/v1/user halten -- daraus kommt die E-Mail.
//      Faelschen geht nicht: Supabase hat es signiert.
//   2. In customers nachsehen, ob zu dieser E-Mail die Rolle
//      'superadmin' steht.
//
// Schritt 2 ist noetig, weil jeder Gast ein gueltiges Supabase-Token
// bekommt. Angemeldet zu sein heisst nicht, etwas zu duerfen.
//
// IM ZWEIFEL NEIN
// ===============
// Anders als bei der Zahlsperre selbst, wo im Zweifel offen gilt. Dort
// geht es darum, ob ein Gast bestellen darf -- hier darum, wer
// abschalten darf. Ist Supabase nicht erreichbar, ist die Antwort nein.

'use strict';

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

// Holt das Bearer-Token aus den Kopfzeilen. Netlify schreibt die Namen
// klein, andere Wege nicht -- beide Schreibweisen ansehen.
function token(event) {
    var kopf = (event && event.headers
        && (event.headers.authorization || event.headers.Authorization)) || '';
    return kopf.indexOf('Bearer ') === 0 ? kopf.slice(7).trim() : '';
}

async function istSuperadmin(tok, dienstschluessel) {
    var key = dienstschluessel || process.env.SUPABASE_SERVICE_KEY || '';
    if (!tok || !key) return false;
    try {
        var u = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: { apikey: key, Authorization: 'Bearer ' + tok }
        });
        if (!u.ok) return false;
        var nutzer = await u.json();
        if (!nutzer || !nutzer.email) return false;

        var r = await fetch(SUPABASE_URL + '/rest/v1/customers?role=eq.superadmin&select=email&email=eq.'
            + encodeURIComponent(nutzer.email) + '&limit=1',
            { headers: { apikey: key, Authorization: 'Bearer ' + key } });
        if (!r.ok) return false;
        return ((await r.json()) || []).length > 0;
    } catch (e) {
        console.warn('[verwalter] Pruefung fehlgeschlagen: ' + (e && e.message) + ' -- im Zweifel nein.');
        return false;
    }
}

// Der uebliche Aufruf: aus dem event heraus, in einer Zeile.
async function darfVerwalten(event, dienstschluessel) {
    return istSuperadmin(token(event), dienstschluessel);
}

module.exports = { token: token, istSuperadmin: istSuperadmin, darfVerwalten: darfVerwalten };
