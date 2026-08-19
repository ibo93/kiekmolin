// EIN COOKIE-BANNER, KEINE BEWERTUNGSFENSTER NACH DEM BESTELLEN.
//
// GEMELDET WURDE
// --------------
// "Der Banner nervt so da sind unsauber" (Bildschirmfoto: zwei Cookie-Banner
// übereinander, dazu quer über der Willkommens-Tour) und "das mit Google
// Bewertung nach dem bestellen auch komplet raus es kommen 2 Sachen".
//
// WAS WIRKLICH DA WAR
// -------------------
// DREI Cookie-Banner im Quelltext:
//   #cookieConsent       -- zeigt sich bei DOMContentLoaded  (Schlüssel kmi_consent)
//   #cookieConsentBanner -- zeigt sich nach 1,5 s            (Schlüssel kin_cookie_consent)
//   #cookieBanner        -- display:none, von nirgends eingeblendet
// Zwei verschiedene Speicherschlüssel heißt: wer den einen beantwortet, wird
// vom anderen weiter gefragt. Deshalb standen beide gleichzeitig da.
//
// Und DREI Bewertungsfenster nach der Bestellung, nicht zwei:
//   nach  30 s  showReviewPrompt      "Google Bewertung schreiben"
//   nach  60 s  showRatingPrompt      fünf Sterne
//   nach 120 s  showAutoReviewPrompt  "Google Bewertung"
// Dazu eine Abfrage alle 20 Sekunden, die dauerhaft die Bestellungen des
// Gastes aus der Datenbank holte, nur um den Moment abzupassen.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var M = fs.readFileSync(KMI + '/netlify/functions/order-email.js', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- 1. Nur noch EIN Banner ------------------------------------------------
var banner = (H.match(/<div id="cookie[A-Za-z]*"/g) || []);
t('es gibt genau einen Cookie-Banner im Quelltext',
  banner.length === 1 && banner[0].indexOf('cookieConsent"') > 0, banner.join(', ') || 'keiner');
t('der zweite Banner ist weg', H.indexOf('cookieConsentBanner') < 0);
t('der tote dritte ebenfalls', !/<div id="cookieBanner"/.test(H));
t('und die alte cookieConsent()-Funktion dazu', !/function cookieConsent\(choice\)/.test(H));

// ---- 2. Der eine Banner deckt jetzt BEIDES ab ------------------------------
// Google Analytics läuft wirklich (G-...), also braucht es die Einwilligung.
t('Google Analytics ist tatsaechlich eingebunden', /googletagmanager\.com\/gtag\/js\?id=G-/.test(H));
t('Consent Mode steht standardmaessig auf verweigert',
  /analytics_storage: 'denied'/.test(H));
t('"Akzeptieren" schaltet die Analyse frei',
  /gtag\('consent', 'update', \{ analytics_storage: 'granted' \}\)/.test(H));
t('und schreibt den Schluessel, den der Kopfbereich liest',
  /localStorage\.setItem\('kin_cookie_consent', alles \? 'accepted' : 'declined'\)/.test(H));
t('"Nur Notwendige" schaltet sie NICHT frei',
  /if \(alles && typeof gtag === 'function'\)/.test(H));

var F = new Function('localStorage', 'document', 'gtag',
    H.slice(H.indexOf('function _cookieEntscheidung('), H.indexOf('function _cookieBannerZeigen('))
    + '; return { ent: _cookieEntscheidung, schon: _cookieSchonEntschieden };');

function welt(vorbelegt) {
    var sp = vorbelegt || {};
    var gtagRufe = [];
    var api = F({
        getItem: function (k) { return sp[k] || null; },
        setItem: function (k, v) { sp[k] = v; },
        removeItem: function (k) { delete sp[k]; }
    }, { getElementById: function () { return { style: {} }; } },
       function (a, b, c) { gtagRufe.push([a, b, c]); });
    return { api: api, sp: sp, gtag: gtagRufe };
}

var w = welt();
t('vor der Entscheidung gilt: noch nicht gefragt', w.api.schon() === false);
w.api.ent(true);
t('Akzeptieren setzt beide Schluessel',
  w.sp.kmi_consent === 'all' && w.sp.kin_cookie_consent === 'accepted', JSON.stringify(w.sp));
t('und meldet die Einwilligung an Google', w.gtag.length === 1, JSON.stringify(w.gtag));

var w2 = welt();
w2.api.ent(false);
t('Nur Notwendige setzt "declined"',
  w2.sp.kin_cookie_consent === 'declined' && w2.sp.kmi_consent === 'essential', JSON.stringify(w2.sp));
t('und meldet NICHTS an Google', w2.gtag.length === 0, JSON.stringify(w2.gtag));

// Wer den ALTEN Banner schon beantwortet hatte, darf nicht erneut gefragt
// werden -- sonst sieht jeder Bestandsgast den Banner noch einmal.
t('wer nur den alten Banner beantwortet hat, wird nicht neu gefragt',
  welt({ kin_cookie_consent: 'accepted' }).api.schon() === true);
t('wer nur den neuen beantwortet hat, ebenso',
  welt({ kmi_consent: 'essential' }).api.schon() === true);

// ---- 3. Nicht über die Willkommens-Tour legen -----------------------------
// Einmal nachsehen reicht nicht: beim ersten Blick steht die Tour noch auf
// display:none und geht erst rund eine Sekunde später auf -- dann liegt der
// Banner schon da. Genau das war nach dem ERSTEN Versuch noch zu sehen.
// Statt an der Zeit zu raten wird nachgesehen, OB die Tour ueberhaupt noch
// kommt -- sie hinterlaesst "kmi_onboarded", sobald der Gast sie durch hat.
// Eine feste Wartezeit allein hat es nur halb geloest: braucht die Tour auf
// einem langsamen Geraet laenger, blitzte der Banner trotzdem kurz auf.
t('der Banner wartet, solange die Tour noch kommen kann',
  /function _tourKommtNoch\(\)/.test(H)
  && /localStorage\.getItem\('kmi_onboarded'\)/.test(H)
  && /if \(!_tourGesehen && _tourKommtNoch\(\) && \(Date\.now\(\) - _cookieStart\) < COOKIE_ANLAUF_MS\)/.test(H));
t('eine Reissleine gibt es trotzdem, falls die Tour nie erscheint',
  /var COOKIE_ANLAUF_MS = 12000;/.test(H));
t('und sieht danach weiter hin, bis der Gast entschieden hat',
  /_cookieWaechter = setInterval\(pruefe, 300\)/.test(H));
// Frueher stand hier "el.style.display = 'none'" direkt. Das Schreiben laeuft
// jetzt ueber setze(), damit der Waechter die Seite nicht dreimal pro Sekunde
// grundlos anfasst -- die Absicht ist dieselbe geblieben.
t('taucht die Tour auf, verschwindet der Banner',
  /_tourGesehen = true;\s*\n\s*setze\('none'\);/.test(H));
t('und geschrieben wird nur bei einer echten Aenderung',
  /if \(el\.style\.display !== wert\) el\.style\.display = wert;/.test(H));
// offsetParent wäre hier die naheliegende Prüfung -- und eine Falle: bei
// position:fixed ist sie IMMER null, auch wenn das Element groß auf dem
// Bildschirm steht. Die Tour ist fixed. Daran ist der erste Versuch
// gescheitert, und die Kopfzeilen-Messung gleich mit.
t('Sichtbarkeit wird nicht ueber offsetParent geprueft',
  /function _istSichtbar\(el\)/.test(H)
  && /r\.width > 0 && r\.height > 0/.test(H)
  && !/onboardingOverlay'\)\.offsetParent/.test(H));
t('auch die Kopfzeilen-Messung benutzt den verlaesslichen Test',
  H.indexOf('if (_istSichtbar(liste[j])) return liste[j];') > 0);
t('die Tour gibt es unter diesem Namen wirklich',
  /<div id="onboardingOverlay"/.test(H));

// ---- 4. Alle drei Bewertungsfenster sind raus ------------------------------
['showRatingPrompt', 'showAutoReviewPrompt', 'showReviewPrompt', 'scheduleReviewPrompt',
 'dismissReviewPrompt', 'openReviewFromPrompt', 'submitCustomerReview', 'setReviewStar'].forEach(function (f) {
    t(f + ' ist entfernt', H.indexOf('function ' + f + '(') < 0);
});
t('kein Aufruf ist stehen geblieben',
  !/onclick="openReviewFromPrompt/.test(H) && !/scheduleReviewPrompt\(orderNum/.test(H));
t('die 20-Sekunden-Abfrage der Bestellungen ist weg',
  !/_previousActiveOrderIds/.test(H));
t('auch das 60-Sekunden-Sternefenster wird nicht mehr eingeplant',
  !/_ratingScheduled/.test(H));
t('der Grund steht im Quelltext, nicht nur hier',
  /GOOGLE-BEWERTUNG NACH DER BESTELLUNG -- ENTFERNT/.test(H));

// Der Bestell-Banner "Dein Essen ist fertig" bleibt -- der ist eine
// Information, keine Bitte.
t('der Status-Banner der laufenden Bestellung bleibt bestehen',
  /function checkActiveOrderBanner/.test(H));

// ---- 5. Stattdessen: die Bitte steht in der E-Mail -------------------------
t('die E-Mail hat einen Bewertungs-Block', /function bewertungsBlock\(rest, restName\)/.test(M));
t('er benutzt den Google-Link des Restaurants',
  /rest\.google_maps_url \|\| rest\.googleMapsUrl/.test(M));

var B = new Function('esc', M.slice(M.indexOf('function bewertungsBlock('),
    M.indexOf('function buildEmail(')) + '; return bewertungsBlock;')(function (x) { return String(x); });

t('ohne Google-Link kommt gar nichts', B(null, 'La Piazza') === '');
t('auch nicht bei leerem Link', B({ google_maps_url: '' }, 'La Piazza') === '');
// Eine Google-SUCHE nach dem Namen wäre geraten und landet oft falsch.
t('es wird KEINE Google-Suche als Ersatz gebastelt',
  M.indexOf('google.com/search') < 0);
t('mit Link steht der Knopf drin',
  B({ google_maps_url: 'https://maps.google.com/?cid=1' }, 'La Piazza').indexOf('Bei Google bewerten') > 0);
t('der Restaurantname steht dabei',
  B({ google_maps_url: 'https://maps.google.com/?cid=1' }, 'La Piazza').indexOf('La Piazza') > 0);

t('die Bestellbestaetigung enthaelt ihn', /bewertungsBlock\(rest, o\.restaurant_name\)/.test(M));
t('das Restaurant wird dafuer nachgeladen',
  /select=name,google_maps_url/.test(M));
t('scheitert das, geht die Bestaetigung trotzdem raus',
  /catch \(e\) \{\}\s*\n\s*\}\s*\n\s*await sendViaResend\(to, buildEmail\(order, restOrder\)\)/.test(M));

// Bei der Reservierung nur nach der BESTAETIGUNG -- nicht bei der Anfrage
// (da war der Gast noch nicht da) und erst recht nicht bei einer Absage.
t('Reservierung: nur bei der Bestaetigung',
  /eventType === 'confirmed' \? bewertungsBlock\(rest, restName\) : ''/.test(M));
t('das Restaurant liefert dafuer den Google-Link mit',
  /select=name,street,city,phone,google_maps_url/.test(M));

// ---- 6. Der obere Banner lag AUF der Kopfzeile --------------------------
// .guest-header schwebt: position:fixed, top:16px, z-index:1000.
// Der Bestellstatus-Banner klebte bei top:0 -- genau dort -- und hatte mit
// z-index:9990 auch noch Vorrang. Beim Scrollen legte er sich über Logo,
// Sprachwahl und Profil-Symbol.
t('die Kopfzeile schwebt wirklich (das ist die Ursache)',
  /\.guest-header \{[\s\S]{0,300}position: fixed;[\s\S]{0,120}z-index: 1000;/.test(H));
t('der Banner hat keinen Vorrang mehr vor der Kopfzeile',
  /id="liveOrderBanner"[\s\S]{0,240}z-index:990;/.test(H)
  && !/id="liveOrderBanner"[\s\S]{0,240}z-index:9990;/.test(H));
t('seine Position wird an der Kopfzeile gemessen',
  /function _bannerUnterKopfzeile\(\)/.test(H)
  && /kopf\.getBoundingClientRect\(\)\.bottom/.test(H));
t('gemessen wird beim Einblenden',
  /banner\.style\.display = 'block';\s*\n\s*_bannerUnterKopfzeile\(\);/.test(H));
t('und neu gemessen, wenn sich das Fenster dreht oder aendert',
  /addEventListener\('resize', _bannerUnterKopfzeile\)/.test(H)
  && /orientationchange/.test(H));

// _istSichtbar und _sichtbareKopfzeile gehören mit in die Attrappe.
var P = new Function('document', 'window',
    H.slice(H.indexOf('function _istSichtbar(el)'), H.indexOf('var _cookieWaechter'))
  + H.slice(H.indexOf('function _sichtbareKopfzeile()'),
            H.indexOf("window.addEventListener('resize', _bannerUnterKopfzeile)"))
  + '; return _bannerUnterKopfzeile;');

function messe(kopfUnten, kopfSichtbar) {
    var banner = { style: {} };
    var kopf = {
        getBoundingClientRect: function () {
            return kopfSichtbar === false ? { bottom: 0, width: 0, height: 0 }
                                          : { bottom: kopfUnten, width: 390, height: 56 };
        }
    };
    var fenster = { getComputedStyle: function () { return { display: 'block', visibility: 'visible', opacity: '1' }; } };
    P({ getElementById: function () { return banner; },
        querySelectorAll: function (sel) { return sel === '#guestTopNav' ? [kopf] : []; } }, fenster)();
    return banner.style.top;
}

// Es gibt DREI .guest-header, alle in versteckten Ansichten -- und die
// Kopfzeile der Startseite heisst #guestTopNav. querySelector haette stur die
// erste unsichtbare genommen und immer 0 gemessen.
t('gesucht wird die SICHTBARE Kopfzeile, nicht die erste',
  /function _sichtbareKopfzeile\(\)/.test(H)
  && /var kandidaten = \['#guestTopNav', '\.top-nav', '\.guest-header'\]/.test(H)
  && /if \(_istSichtbar\(liste\[j\]\)\) return liste\[j\]/.test(H));
t('die Startseiten-Kopfzeile gibt es unter diesem Namen wirklich',
  /id="guestTopNav"/.test(H));
t('von .guest-header gibt es mehr als eine',
  (H.match(/class="guest-header"/g) || []).length > 1,
  (H.match(/class="guest-header"/g) || []).length);
t('unter einer 56px hohen Kopfzeile sitzt er bei 64px', messe(56) === '64px', messe(56));
t('auf einem groesseren Bildschirm entsprechend tiefer', messe(120) === '128px', messe(120));
// Feste Zahlen hätten hier nicht gereicht: ohne Kopfzeile -- etwa im
// Vollbild-Speisekarten-Fenster -- gehört er wieder ganz nach oben.
t('ohne sichtbare Kopfzeile geht er zurueck auf 0', messe(0, false) === '0px', messe(0, false));
t('eine hochgescrollte Kopfzeile schiebt ihn nicht nach oben aus dem Bild',
  messe(-40) === '0px', messe(-40));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
