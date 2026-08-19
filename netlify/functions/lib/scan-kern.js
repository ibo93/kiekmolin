// Kiek mol in — Kern des Menüscanners.
//
// Hier steht alles, was BEIDE Wege brauchen:
//   menu-scan.js             -- der normale Weg, 10 Sekunden Zeitlimit
//   menu-scan-background.js  -- ohne Zeitlimit, ein Aufruf wie im Chat
//
// Liegt in lib/, damit Netlify die Datei nicht als eigene Function deployt.
// Ein zweiter Codepfad mit eigenem Prompt und eigenem Parser wäre die
// schlechteste aller Lösungen: die beiden Wege würden auseinanderlaufen, und
// ein Fehler wäre mal da und mal nicht.

function buildPromptVoll(text, extra, kategorien) {
    // ACHTUNG: die vorhandenen Kategorien des Restaurants gehen bewusst NICHT
    // mehr an das Modell.
    //
    // Sie standen früher als Liste im Prompt, mit der Bitte, die vorhandene
    // Schreibweise zu nehmen ("Karte: Pizza, vorhanden: Pizzen -> Pizzen").
    // Gedacht war das gegen doppelte Kategorien. In der Praxis hat es dem
    // Modell die Erlaubnis gegeben, Gerichte EINZUSORTIEREN statt Überschriften
    // ABZULESEN: auf einer echten Karte landeten 48 Pizzen unter
    // "Fleischgerichte" -- ein Wort, das auf der Karte nirgends steht.
    //
    // Das Zusammenführen mit vorhandenen Kategorien macht jetzt die App, in
    // Code, mit einem engen Abgleich (findeKategorie, Toleranz zwei Zeichen).
    // Der Unterschied ist entscheidend: Code kann "Pizza" und "Pizzen"
    // zusammenführen, aber niemals "Pizza" zu "Fleischgerichte" machen.
    return PROMPT + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') + (extra || '');
}

// Kiek mol in — KI-Menüscanner (Vision).
// Liest Speisekarten-Bilder (oder Text) und gibt sauber kategorisierte Gerichte
// zurück. Deutlich besser als reines OCR: erkennt Namen, Preise, Größen,
// Beschreibungen und ordnet alles in passende Kategorien ein.
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Modell: ANTHROPIC_API_KEY -> Claude Sonnet 5 (MENU_SCAN_MODEL übersteuert).
// Hochauflösende Bilderkennung bis 2576 px Kantenlänge, liest also auch das
// Kleingedruckte einer Karte. Kostet pro Seite wenige Cent.
//
// BEWUSST OHNE zweiten Anbieter. Ein stiller Rückfall auf ein schwächeres
// Modell heißt, dass ein Scan mal gut und mal mittelmässig ausfällt, ohne
// dass jemand erkennen kann warum -- und man sucht den Fehler dann bei der
// Karte oder beim Foto. Ein klarer Fehler ist hier mehr wert als ein
// unauffällig schlechteres Ergebnis: der Scan lässt sich wiederholen,
// eine halb falsche Speisekarte im System merkt niemand.
//
// Bei leerem Ergebnis wird derselbe Aufruf einmal wiederholt -- Vision-Modelle
// sind nicht deterministisch, ein zweiter Versuch rettet häufig den Scan.
//
// Body: { images?: ["data:image/...;base64,..."], text?: "...",
//         categories?: ["Pizza", ...],
//         weiter?: { anzahl, letzte:[...], kategorie } }   <- Fortsetzung
// Antwort: { ok:true, items:[{name,description,price,category,dish_number,
//            is_vegetarian,is_vegan,is_spicy,is_beef,is_chicken,is_pork,
//            is_fish,is_seafood}] }

// OCR-VORSTUFE (optional, empfohlen):
//   GOOGLE_VISION_API_KEY -> Google Cloud Vision, DOCUMENT_TEXT_DETECTION.
// Das ist dieselbe OCR-Maschine, die hinter Google Lens und der Menükarten-
// Erkennung im Google-Unternehmensprofil steckt. Sie liefert die Zeichen EXAKT,
// mit Position -- ein Vision-Modell allein "liest" das Bild dagegen frei und
// vertut sich vor allem bei Preisen und mehrspaltigen Karten.
// Wir kombinieren beides: die OCR liefert den exakten Wortlaut, das Modell
// bekommt zusätzlich das Bild für die Struktur (Spalten, Überschriften,
// welcher Preis zu welchem Gericht gehört).
// Ohne Schlüssel läuft alles genau wie bisher weiter -- die OCR wird dann
// einfach übersprungen. Kein Schlüssel = kein Risiko.
// Kontingent: 1000 Bilder/Monat kostenlos, danach ca. 1,50 $ pro 1000.

'use strict';

var ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// ============================================================================
// DAS ZEITLIMIT IST DIE WICHTIGSTE GROESSE IN DIESER DATEI. BITTE LESEN.
// ============================================================================
// Eine Netlify-Function wird nach 10 Sekunden hart abgeschnitten (Standard,
// ohne [functions]-Eintrag in netlify.toml). Bis dahin MUSS eine Antwort
// stehen -- sonst bekommt der Browser einen Fehler, und in der App lief
// danach still die einfache Texterkennung an. Der Gastronom sah ein
// schlechtes Ergebnis und dachte, die KI habe es gelesen.
//
// Eine dichte Speisekarte mit 60 Gerichten sind rund 4000 Wortteile Ausgabe.
// Kein Modell schreibt das in 10 Sekunden. Das heißt: ein einziger Aufruf
// pro Seite KANN nicht funktionieren, egal wie gut der Prompt ist. Genau
// deshalb haben fünf Runden Prompt-Verbesserung nichts geändert.
//
// Lösung: die Function liest die Antwort im DATENSTROM mit und behält ihr
// eigenes Zeitbudget im Auge. Kurz vor dem Limit bricht sie den Aufruf ab und
// gibt zurück, was bis dahin fertig ist -- zusammen mit "fertig: false" und
// den zuletzt gelesenen Gerichten. Die App fragt dann einfach weiter
// ("weiter"-Feld im Body), bis die Karte durch ist. Nichts geht verloren,
// nichts läuft ins Limit.
//
// Wer hier das Modell oder die Einstellungen ändert: das Budget ist eine
// harte Wand. Was ein Modell in der Zeit nicht schreibt, steht nicht in der
// Karte. Nachdenken (thinking) kostet Budget, BEVOR das erste Gericht
// herauskommt -- deshalb ist es hier aus.
// ============================================================================

// NUR CLAUDE. Google ist raus -- und zwar aus einem gemessenen Grund.
//
// Gemini 2.5 Flash liest Speisekarten sehr gut (an einer Testkarte: 28 von 28
// Gerichten, Preise und Kategorien vollständig, in 5 Sekunden). Nur lässt
// Google im kostenlosen Kontingent GENAU 20 ANFRAGEN PRO TAG zu:
//
//   quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
//   quotaValue: 20
//
// Eine echte Pizzeria-Karte (Querformat, vier Spalten, 140 Gerichte auf zwei
// Seiten, davon 88 mit zwei Preisspalten) braucht zehn bis zwanzig Anfragen.
// EIN Scan verbraucht also das Tageskontingent -- und mitten in der Karte war
// Schluss. gemini-2.5-flash-lite gibt es für neue Nutzer nicht mehr,
// gemini-2.0-flash hat im kostenlosen Kontingent Limit 0.
//
// Kostenlos ist damit für diesen Zweck keine Option. Der Menüscanner läuft
// pro Restaurant ein paar Mal, nicht bei jedem Gast -- hier ist Verlässlichkeit
// mehr wert als ein paar Cent. (Der KIN-Assistent bleibt kostenlos, der läuft
// bei jeder Frage jedes Gastes; das ist der Unterschied.)
var ANTHROPIC_MODEL = process.env.MENU_SCAN_MODEL || 'claude-sonnet-5';

// Zeitbudget der Function in Millisekunden. 8500 lässt bei 10 s Limit noch
// Luft für das Zusammenbauen der Antwort. Wer das Limit in Netlify auf 26 s
// hochsetzt, setzt hier MENU_SCAN_MS=24000 -- dann sind es weniger Runden.
var BUDGET_MS = parseInt(process.env.MENU_SCAN_MS || '8500', 10);

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

var PROMPT = [
    'Du bist ein praeziser Speisekarten-Parser fuer ein Restaurant-Bestellsystem.',
    'Lies die Speisekarte (Bild oder Text) SORGFAELTIG und gib ALLE Gerichte und Getraenke aus — wirklich jede Position.',
    '',
    // AUSGABEFORMAT: bewusst KEIN JSON.
    //
    // Bei JSON sind rund zwei Drittel der Zeichen reines Gerüst
    // ("description":"", "is_vegetarian":false, ...). Das Gerüst muss das
    // Modell Zeichen für Zeichen mitschreiben, und genau daran läuft die
    // Zeit ab: eine Karte mit 60 Gerichten waren über 19000 Zeichen, davon
    // rund 12000 Gerüst. In Zeilenform sind es rund 5000 -- derselbe Inhalt,
    // ein Viertel der Zeit. Abgerissene Zeilen sind ausserdem harmlos: die
    // letzte unvollständige Zeile fällt weg, alle davor bleiben gültig.
    'AUSGABEFORMAT — eine Zeile pro Position, Felder mit | getrennt, NICHTS sonst:',
    'NR|Name|Beschreibung|Preis|Kategorie|Allergene|Zusatzstoffe|Merkmale',
    '',
    'Beispiel:',
    '12|Pizza Salami|Tomate, Kaese, Salami|9.50|Pizzen|gluten,milch|1,2|s',
    '|Ostfriesentee|mit Kluntje und Sahne|3.20|Getraenke|milch||v',
    '',
    'Kein JSON, keine Aufzaehlungszeichen, keine Ueberschriften, keine Erklaerung.',
    'Fehlt ein Feld, bleibt es leer — die | stehen trotzdem alle da.',
    'GENAU 8 Felder und GENAU 7 Trenner pro Zeile. Kein | am Zeilenende, keine leeren Felder anhaengen.',
    'Kommt ein | im Namen oder in der Beschreibung vor, schreibe stattdessen /.',
    'Jede Position genau EINE Zeile, keine Zeilenumbrueche innerhalb einer Zeile.',
    '',
    'DIE FELDER:',
    '- NR: Artikel-/Gerichtnummer von der Karte (z.B. 12 oder 12a), sonst leer.',
    '  Nummern stehen meist VOR dem Namen. Verwechsle Nummern nicht mit Preisen.',
    // NICHT WIEDER "ä/ö/ü ist auch ok" schreiben. Genau das stand hier, und
    // das Modell hat es bei einem unscharfen Foto sofort benutzt: "Getränke",
    // "Rote Grütze", "Hänchenbrustfilet". Eine Kategorie "Getränke" trifft
    // die vorhandene "Getränke" nicht -> zwei Kategorien im Menü, genau der
    // Fehler, über den sich der Wirt beschwert hat.
    '- Name: der Name des Gerichts. Deutsche Umlaute IMMER als ä ö ü ß schreiben,',
    '  niemals als ae/oe/ue/ss — auch nicht, wenn das Foto unscharf ist.',
    '  Auch wenn die Karte GROSSBUCHSTABEN nutzt: normale Gross-/Kleinschreibung',
    '  ("PIZZA SALAMI" -> "Pizza Salami").',
    '- Beschreibung: die Zutaten-/Beschreibungszeile unter dem Namen, sonst leer.',
    '  Die Kennzeichnungen in Klammern wie "(1,2,a,c)" gehoeren NICHT hierhin —',
    '  die wertest du in den naechsten beiden Feldern aus.',
    '- Preis: Zahl mit Punkt (12,90 -> 12.90). Unleserlich -> 0.',
    '  Mehrere Groessen: klein:6.50/gross:8.50 (siehe unten).',
    '  Preise stehen oft rechtsbuendig in einer eigenen Spalte — ordne jeden Preis',
    '  der richtigen Zeile zu.',
    '- Kategorie: siehe unten. Auch hier Umlaute ausschreiben ("Getränke", nicht "Getraenke").',
    '- Allergene: die CODES (gluten, milch, ...) mit Komma getrennt, sonst leer.',
    '  Die Buchstaben von der Karte uebersetzt du in Codes (Liste unten) und schreibst',
    '  NUR die Codes — nicht zusaetzlich die Buchstaben.',
    '- Zusatzstoffe: NUR Ziffern mit Komma getrennt (1,2,11), sonst leer. Hier gehoeren',
    '  KEINE Buchstaben hinein.',
    '- Merkmale: Buchstaben ohne Trenner, sonst leer:',
    '  v=vegetarisch  V=vegan  s=scharf',
    '  r=Rind  h=Haehnchen/Gefluegel  w=Schwein  L=Lamm  f=Fisch  m=Meeresfruechte',
    '',
    // Gemessen: bei einer Imbisskarte blieben Currywurst, Bratwurst und
    // Schnitzel OHNE Kennzeichnung. Für einen Gast, der kein Schweinefleisch
    // isst, ist genau das die gefährliche Richtung -- ein fehlendes Merkmal
    // heißt in der App "unbedenklich". Deshalb hier ausdrückliche Beispiele.
    '  Diese Merkmale leitest du aus Name UND Zutaten ab, auch wenn die Karte',
    '  nichts dazuschreibt. Beispiele, die oft vergessen werden:',
    '    Currywurst, Bratwurst, Schnitzel (ohne Zusatz), Schinken, Speck, Bacon,',
    '    Salami, Gyros, Doener vom Schwein, Kassler, Leberkaese, Frikadelle -> w',
    '    Rumpsteak, Filetsteak, Burger, Bolognese, Tatar, Hackfleisch -> r',
    '    Haehnchen, Pute, Chicken, Nuggets, Tavuk -> h',
    '    Backfisch, Matjes, Lachs, Scholle, Thunfisch, Rollmops -> f',
    '    Krabben, Garnelen, Muscheln, Calamari, Scampi -> m',
    '  Steht ausdruecklich eine andere Fleischsorte dabei ("Schnitzel vom Kalb",',
    '  "Gyros vom Haehnchen"), gilt DIE. Sonst die uebliche.',
    '  Bei Schwein im Zweifel LIEBER kennzeichnen: wer kein Schweinefleisch isst,',
    '  verlaesst sich darauf.',
    '',
    'REGELN:',
    '- Lies das Bild systematisch: Spalte fuer Spalte, von oben nach unten. Viele Karten haben',
    '  ZWEI oder MEHR SPALTEN — lies erst die linke Spalte komplett, dann die rechte.',
    // MEHRERE GROESSEN IN EINER ZEILE.
    //
    // Gemessen an einer echten Pizzeria-Karte (Querformat, vier Spalten, 140
    // Gerichte, davon 88 mit zwei Preisspalten): als zwei getrennte Zeilen sind
    // das 228 Zeilen Ausgabe. Die Zeit hängt fast nur an der Zahl der
    // geschriebenen Zeichen -- so wurde aus einer Seite ein Scan über neun
    // Runden. In einer Zeile sind es 140. Die App macht daraus wieder zwei
    // Einträge; das kostet dort nichts.
    '- Hat ein Gericht MEHRERE GROESSEN (Pizza klein/gross, Getraenke 0,3l/0,5l,',
    '  zwei Preisspalten), schreibe das in EINE Zeile. In das Preisfeld kommen dann',
    '  die Groessen mit Doppelpunkt, getrennt durch /:',
    '    1|Pizza Margherita||klein:6.50/gross:8.50|Pizza|gluten,milch|1,2|v',
    '    |Cola||0,3l:3.20/0,5l:4.40|Getränke||1,3|',
    '  Die Groessennamen nimmst du von der Karte (die Spaltenueberschriften, z.B.',
    '  KLEIN und GROSS, oder 0,3l und 0,5l). Hat ein Gericht nur EINEN Preis,',
    '  schreibst du nur die Zahl — ohne Doppelpunkt.',
    '- KATEGORIE: DU ERFINDEST KEINE KATEGORIEN. Du liest die Ueberschriften der Karte ab.',
    '',
    '  SO FUNKTIONIERT EINE SPEISEKARTE: Eine Ueberschrift steht EINMAL und gilt dann fuer',
    '  ALLE Gerichte darunter, bis die naechste Ueberschrift kommt. Steht "Pizza" als',
    '  Ueberschrift und darunter zwoelf Pizzen, bekommen ALLE ZWOELF die Kategorie "Pizza" —',
    '  nicht nur die erste. Arbeite die Karte von oben nach unten durch und merke dir die',
    '  zuletzt gelesene Ueberschrift; jedes Gericht bekommt diese, bis eine neue auftaucht.',
    '',
    '  Schreibe die Ueberschrift Wort fuer Wort so, wie sie gedruckt ist. Steht "Vom Grill"',
    '  auf der Karte, ist die Kategorie "Vom Grill" und NICHT "Fleischgerichte". Steht',
    '  "Von de Waterkant" da, schreibst du "Von de Waterkant". Uebersetze nicht,',
    '  vereinheitliche nicht, verschoenere nicht. Nur die Gross-/Kleinschreibung darfst du',
    '  normalisieren ("VOM GRILL" -> "Vom Grill").',
    '',
    '  NUR EIN EINZIGER FALL ergibt eine leere Kategorie: wenn das Bild MITTEN in einem',
    '  Abschnitt beginnt und ueber dem ERSTEN Gericht des Bildes keine Ueberschrift steht,',
    '  weil sie oberhalb des Bildrands liegt. Dann bleibt das Feld bis zur ersten sichtbaren',
    '  Ueberschrift leer — die App ergaenzt das aus der vorigen Seite. Rate in diesem Fall',
    '  NICHT, wie die Ueberschrift geheissen haben koennte. Lass die Kategorie NIEMALS leer,',
    '  nur weil ein Gericht nicht unmittelbar unter der Ueberschrift steht.',
    '',
    '- Du sortierst NICHT ein. Du schreibst ab. Ob ein Gericht inhaltlich zu einer',
    '  anderen Ueberschrift passen wuerde, ist egal: eine Pizza mit Schinken bleibt',
    '  unter "Pizza" und wird NICHT zu "Fleischgerichte". Es zaehlt allein, unter',
    '  welcher gedruckten Ueberschrift die Zeile auf der Karte steht.',
    '',
    'ALLERGENE UND ZUSATZSTOFFE (deutsche Karten kennzeichnen das in Klammern):',
    '- BUCHSTABEN = Allergene nach LMIV. Uebersetze sie in genau diese Codes:',
    '  A=gluten B=krebstiere C=eier D=fisch E=erdnuss F=soja G=milch H=schalenfruechte',
    '  I=sellerie J=senf K=sesam L=sulfite M=lupinen N=weichtiere',
    '  Steht das Allergen ausgeschrieben da ("mit Milch", "enthaelt Nuesse"), nimm denselben Code.',
    '- ZAHLEN = Zusatzstoffe. Als Ziffern ausgeben: 1,2,11',
    '- Rate NICHT. Nur was auf der Karte gekennzeichnet ist. Dass Pizza Mehl enthaelt,',
    '  ist kein Grund fuer gluten, wenn die Karte es nicht kennzeichnet.',
    '',
    '- Erfinde nichts. Nur was wirklich auf der Karte steht. Keine doppelten Zeilen.',
    '- Ueberschriften, Oeffnungszeiten, Adressen, Werbetexte sind KEINE Gerichte — auslassen.',
    '- WICHTIG: Liste WIRKLICH JEDE Position vollstaendig auf — von der ersten bis zur',
    '  allerletzten Zeile der Karte. NICHT kuerzen, NICHT zusammenfassen, NICHT vorzeitig',
    '  aufhoeren. Auch bei sehr vielen Gerichten (50, 100, 200) alle ausgeben.',
    '- Bevor du antwortest: pruefe nochmal, ob du Randbereiche, Fusszeilen, Kaesten und',
    '  die letzte Spalte/Seite erfasst hast.'
].join('\n');

function stripToJson(s) {
    if (!s) return '';
    s = String(s).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return s;
}

// JSON parsen; wenn die Antwort mitten im Array abgerissen ist (Token-Limit),
// das letzte vollständige Objekt retten statt alles zu verwerfen.
function parseItemsLoose(raw) {
    var s = stripToJson(raw);
    try { return JSON.parse(s); } catch (e) {}
    var idx = s.lastIndexOf('},');
    if (idx > 0) {
        try { return JSON.parse(s.slice(0, idx + 1) + ']}'); } catch (e2) {}
    }
    idx = s.lastIndexOf('}');
    if (idx > 0) {
        try { return JSON.parse(s.slice(0, idx + 1) + ']}'); } catch (e3) {}
    }
    return null;
}

// Buchstaben-Kennzeichnung der Karte -> Codes, die die App kennt.
// Sicherheitsnetz: das Modell soll die Codes schon liefern, aber wenn doch
// "A, C" oder "milch" zurückkommt, landet es trotzdem richtig.
var ALLERGEN_CODES = ['gluten','krebstiere','eier','fisch','erdnuss','soja','milch',
                      'schalenfruechte','sellerie','senf','sesam','sulfite','lupinen','weichtiere'];
var BUCHSTABE_ZU_CODE = { a:'gluten', b:'krebstiere', c:'eier', d:'fisch', e:'erdnuss',
                          f:'soja', g:'milch', h:'schalenfruechte', i:'sellerie', j:'senf',
                          k:'sesam', l:'sulfite', m:'lupinen', n:'weichtiere' };
// Häufige Schreibweisen, die keine Codes sind
var WORT_ZU_CODE = { weizen:'gluten', getreide:'gluten', laktose:'milch', milchprodukte:'milch',
                     nuesse:'schalenfruechte', nuss:'schalenfruechte', 'nüsse':'schalenfruechte',
                     ei:'eier', schwefel:'sulfite', sulfit:'sulfite', erdnuesse:'erdnuss',
                     'erdnüsse':'erdnuss', sojabohnen:'soja', meeresfruechte:'weichtiere' };

function normAllergene(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (x) {
        var t = String(x || '').trim().toLowerCase().replace(/[().,;:]/g, '');
        if (!t) return;
        var code = null;
        if (ALLERGEN_CODES.indexOf(t) >= 0) code = t;
        else if (t.length === 1 && BUCHSTABE_ZU_CODE[t]) code = BUCHSTABE_ZU_CODE[t];
        else if (WORT_ZU_CODE[t]) code = WORT_ZU_CODE[t];
        if (code && out.indexOf(code) < 0) out.push(code);
    });
    return out.slice(0, 14);
}

// Zusatzstoffe sind reine Ziffern 1-13. Alles andere fliegt raus, damit keine
// Buchstaben-Allergene versehentlich als Zusatzstoff landen.
function normZusatzstoffe(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (x) {
        var t = String(x || '').replace(/[^0-9]/g, '');
        if (!t) return;
        var n = parseInt(t, 10);
        if (n >= 1 && n <= 13 && out.indexOf(String(n)) < 0) out.push(String(n));
    });
    return out.slice(0, 13);
}

// Kompakte Zeilen -> Gerichte.
//
// NR|Name|Beschreibung|Preis|Kategorie|Allergene|Zusatzstoffe|Merkmale
//
// Robust gegen einen Abriss mitten in der Antwort: eine unvollständige letzte
// Zeile hat zu wenige Trenner und fällt weg -- alles davor bleibt gültig.
// Das ist der Grund, warum hier keine JSON-Rettung mehr nötig ist.
var MERKMAL = { v: 'is_vegetarian', V: 'is_vegan', s: 'is_spicy', r: 'is_beef',
                h: 'is_chicken', w: 'is_pork', L: 'is_lamb', f: 'is_fish', m: 'is_seafood' };

// "klein:6.50/groß:8.50" -> [{label:'klein',preis:'6.50'}, {label:'groß',preis:'8.50'}]
// Nur eine Zahl oder gar kein Doppelpunkt -> null (ein ganz normaler Preis).
function zerlegeGroessen(preisFeld) {
    var f = String(preisFeld || '').trim();
    if (f.indexOf(':') < 0) return null;
    var teile = f.split('/');
    var out = [];
    for (var i = 0; i < teile.length; i++) {
        var m = /^\s*([^:]{1,24}?)\s*:\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*$/.exec(teile[i]);
        if (!m) return null;                       // unklar -> lieber unveraendert lassen
        var label = m[1].trim();
        // Schreibweise angleichen: die Karte schreibt GROSS, im Menü steht groß.
        if (/^gross$/i.test(label)) label = 'groß';
        else if (/^klein$/i.test(label)) label = 'klein';
        out.push({ label: label, preis: m[2] });
    }
    return out.length > 1 ? out : null;            // eine Groesse ist keine Groesse
}

function parseZeilen(roh) {
    // Die Helfer stehen bewusst INNERHALB dieser Funktion: die Tests des
    // Projekts schneiden einzelne Funktionen aus dieser Datei heraus und
    // fuehren sie fuer sich aus. Was im Modul-Rumpf steht, fehlt dort.
    // Kennzeichnungen, die im Namen oder in der Beschreibung stehen geblieben sind.
    //
    // Der Prompt sagt dem Modell, dass "(1,2,a,c)" in die eigenen Felder gehoert.
    // Auf einer dichten Pizzeria-Karte mit 140 Positionen haelt es sich nicht
    // immer daran -- dann steht die Klammer weiter im Namen, die Allergen-Felder
    // bleiben leer, und beim Gast heisst das Gericht "Pizza Salami (1,2,a,c)".
    // Genau dieses Bild lieferten zwei Karten: alle Gerichte da, null Allergene.
    //
    // Das hier ist KEIN Raten. Die Codes stehen auf der Karte, sie sind nur im
    // falschen Feld gelandet -- dieselbe Reparatur, die es fuer vertauschte
    // Allergen- und Zusatzstoff-Felder laengst gibt.
    //
    // Streng gefasst, damit nichts Falsches eingesammelt wird: nur Klammern, die
    // AUSSCHLIESSLICH aus Ziffern und einzelnen Buchstaben a-n bestehen (mehr
    // Buchstaben kennt die LMIV nicht). "(hausgemacht)", "(scharf)", "(0,33 l)"
    // bleiben unangetastet.
    var KLAMMER_CODES = /\(\s*([0-9]{1,2}|[a-nA-N])(\s*,\s*([0-9]{1,2}|[a-nA-N]))*\s*\)/g;

    function codesAusText(text) {
        var codes = [];
        var rest = String(text || '').replace(KLAMMER_CODES, function (treffer) {
            treffer.slice(1, -1).split(',').forEach(function (x) {
                x = x.trim();
                if (x) codes.push(x);
            });
            return ' ';
        });
        // Doppelte Leerzeichen und ein haengendes Komma, die durch das
        // Herausschneiden entstehen, wieder wegraeumen.
        rest = rest.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
        rest = rest.replace(/[,;]\s*$/, '').trim();
        return { text: rest, codes: codes };
    }

    if (!roh) return [];
    var out = [];
    String(roh).split('\n').forEach(function (z) {
        z = z.replace(/\r$/, '').trim();
        if (!z || z.slice(0, 3) === '```') return;
        var t = z.split('|');
        // Sieben Felder sind kein Grund, ein Gericht wegzuwerfen.
        //
        // Hier stand "< 8 -> weg". Das Merkmale-Feld ist das letzte und bei den
        // meisten Gerichten leer -- laesst das Modell das abschliessende | weg,
        // hatte die Zeile sieben Felder und das GANZE Gericht verschwand. Nicht
        // die Allergene: das Gericht. Still, ohne Meldung, mitten in einer Karte
        // mit 140 Positionen.
        //
        // Sieben Felder heissen: alles da ausser den Merkmalen. Das fehlende
        // Feld wird ergaenzt, der Rest gilt.
        if (t.length === 7) t.push('');
        if (t.length < 8) return;                     // wirklich unvollstaendig -> weg

        // Feldsuche statt starrer Position.
        //
        // WARUM: Auf einem unscharfen Foto liefert das Modell schon mal neun
        // oder zehn Felder statt acht -- ein zusätzliches leeres Feld, oder ein
        // | mitten im Namen. Wurde starr nach Position gelesen, rutschte ALLES
        // danach eine Stelle weiter: der Preis landete in der Kategorie, die
        // Kategorie in den Allergenen. Aus einem kleinen Lesefehler wurde so
        // eine komplett falsche Zeile.
        //
        // Der Preis ist das einzige Feld, das man sicher erkennt: eine nackte
        // Zahl. Von ihm aus stehen Kategorie und der Rest fest.
        // Als Preisfeld gilt: eine nackte Zahl ODER die Größenform
        // "klein:6.50/groß:8.50". Ohne den zweiten Fall würde bei einem
        // Gericht mit zwei Größen das ZUSATZSTOFF-Feld ("1,2") als Preis
        // durchgehen -- es sieht wie eine Zahl aus. Genau das ist beim Testen
        // passiert.
        var pi = -1;
        for (var i = 2; i < t.length - 1; i++) {
            if (/^\s*\d+([.,]\d{1,2})?\s*$/.test(t[i]) || zerlegeGroessen(t[i])) { pi = i; break; }
        }
        if (pi < 0) pi = 3;                           // keine Zahl gefunden -> alte Ordnung

        var name = (t[1] || '').trim();
        if (!name) return;

        var rest = t.slice(pi + 2);                   // alles nach der Kategorie
        // Merkmale sind reine Buchstaben aus der festen Liste. Alles andere in
        // diesem Bereich sind Allergene oder Zusatzstoffe -- in welchem Feld sie
        // gelandet sind, ist egal: Ziffern sind Zusatzstoffe, Wörter/Buchstaben
        // sind Allergene. Früher fiel eine Ziffer im Allergen-Feld einfach weg.
        var merkmale = '', roheCodes = [];
        rest.forEach(function (x, k) {
            x = (x || '').trim();
            if (!x) return;
            if (k === rest.length - 1 && /^[vVsrhwLfm]+$/.test(x)) { merkmale = x; return; }
            x.split(',').forEach(function (y) { y = y.trim(); if (y) roheCodes.push(y); });
        });

        // Was im Namen oder in der Beschreibung stehen geblieben ist, gehoert
        // in die Code-Felder -- und aus dem Text raus. Sonst heisst das Gericht
        // beim Gast "Pizza Salami (1,2,a,c)".
        var nameRein = codesAusText(name);
        var beschrRein = codesAusText(t.slice(2, pi).join(' ').trim());
        nameRein.codes.concat(beschrRein.codes).forEach(function (c) { roheCodes.push(c); });

        var basis = {
            dish_number: (t[0] || '').trim(),
            name: nameRein.text || name,
            description: beschrRein.text,
            price: (t[pi] || '').trim(),
            category: (t[pi + 1] || '').trim(),
            allergens: roheCodes.filter(function (x) { return /[a-zA-Zäöü]/.test(x); }),
            additives: roheCodes.filter(function (x) { return /^\d+$/.test(x); })
        };
        for (var m = 0; m < merkmale.length; m++) { if (MERKMAL[merkmale[m]]) basis[MERKMAL[merkmale[m]]] = true; }

        // "klein:6.50/groß:8.50" -> zwei Einträge. Das Aufteilen passiert hier
        // und nicht beim Modell: hier kostet es nichts, dort kostet es die
        // doppelte Schreibzeit (und damit bei einer großen Karte Runden).
        var groessen = zerlegeGroessen(basis.price);
        if (groessen) {
            groessen.forEach(function (g) {
                var kopie = {};
                for (var k in basis) kopie[k] = Array.isArray(basis[k]) ? basis[k].slice() : basis[k];
                kopie.name = basis.name + ' (' + g.label + ')';
                kopie.price = g.preis;
                out.push(kopie);
            });
        } else {
            out.push(basis);
        }
    });
    return out;
}

// Erst Zeilen versuchen, sonst JSON. Sollte das Modell trotz Anweisung JSON
// liefern (ältere Modelle tun das gern), geht der Scan trotzdem durch.
function parseAntwort(roh) {
    var zeilen = parseZeilen(roh);
    if (zeilen.length) return zeilen;
    var j = parseItemsLoose(roh);
    return (j && Array.isArray(j.items)) ? j.items : (Array.isArray(j) ? j : []);
}

function normalizeItems(parsed) {
    var arr = (parsed && Array.isArray(parsed.items)) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    var out = [];
    arr.forEach(function (it) {
        if (!it || !it.name) return;
        var price = it.price;
        if (typeof price === 'string') price = parseFloat(price.replace(',', '.').replace(/[^0-9.]/g, ''));
        price = Number(price); if (!isFinite(price) || price < 0) price = 0;
        out.push({
            name: String(it.name).trim().slice(0, 120),
            description: String(it.description || '').trim().slice(0, 300),
            price: Math.round(price * 100) / 100,
            // Leer bleibt leer: "" heißt "auf diesem Bild war keine Überschrift
            // zu sehen". Die App füllt das anschließend aus der vorigen Seite
            // auf. Würden wir hier "Sonstiges" einsetzen, wäre die Information
            // weg und genau die falsche Kategorie stünde fest.
            category: String(it.category || '').trim().slice(0, 60),
            dish_number: String(it.dish_number || it.dishNumber || '').trim().slice(0, 10),
            selected: true,
            is_vegetarian: !!it.is_vegetarian, is_vegan: !!it.is_vegan, is_spicy: !!it.is_spicy,
            is_beef: !!it.is_beef, is_chicken: !!it.is_chicken, is_pork: !!it.is_pork,
            is_fish: !!it.is_fish, is_seafood: !!it.is_seafood, is_lamb: !!it.is_lamb,
            is_gluten: !!it.is_gluten,
            allergens: normAllergene(it.allergens),
            additives: normZusatzstoffe(it.additives)
        });
    });
    return out;
}

function splitDataUrl(d) {
    var m = String(d || '').match(/^data:([^;]+);base64,(.*)$/);
    if (m) return { media: m[1], data: m[2] };
    return { media: 'image/jpeg', data: String(d || '').replace(/^data:[^,]*,/, '') };
}

// Google Cloud Vision: exakter Text eines Bildes.
// DOCUMENT_TEXT_DETECTION (nicht TEXT_DETECTION) ist auf dichte, mehrspaltige
// Dokumente ausgelegt -- genau der Fall Speisekarte.
async function ocrImage(key, dataUrl) {
    var p = splitDataUrl(dataUrl);
    var res = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [{
                image: { content: p.data },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                imageContext: { languageHints: ['de', 'en'] }
            }]
        })
    });
    if (!res.ok) { var t = await res.text(); throw new Error('Vision ' + res.status + ': ' + t.slice(0, 200)); }
    var j = await res.json();
    var r = j.responses && j.responses[0];
    if (r && r.error && r.error.message) throw new Error('Vision: ' + r.error.message.slice(0, 200));
    var txt = (r && r.fullTextAnnotation && r.fullTextAnnotation.text) || '';
    return String(txt).slice(0, 40000);
}

// OCR für alle Bilder -- Fehler sind hier NIE fatal: schlägt die OCR fehl
// (Schlüssel fehlt, API nicht aktiviert, Kontingent leer), scannen wir
// weiter wie bisher nur mit dem Bild.
// Merkt sich pro Function-Instanz, dass ein Schlüssel keine Vision-Rechte hat.
// Sonst läuft bei JEDEM Scan ein von vornherein aussichtsloser Aufruf ins Leere
// (typischer Fall: der Gemini-Schlüssel wird mitbenutzt, in dessen Google-Projekt
// die Cloud Vision API gar nicht aktiviert ist). 401/403 = Rechteproblem, das sich
// ohne Zutun nicht ändert; alles andere (Quota, Netz) darf es weiter versuchen.
var _visionDenied = {};

async function ocrAll(key, images) {
    if (!key || !images || !images.length) return '';
    if (_visionDenied[key]) return '';
    var parts = await Promise.all(images.map(function (img) {
        return ocrImage(key, img).catch(function (e) {
            if (/\b(401|403)\b|PERMISSION_DENIED|has not been used|is disabled/i.test(e.message)) {
                _visionDenied[key] = 1;
                console.warn('[menu-scan] OCR dauerhaft aus (kein Zugriff):', e.message);
            } else {
                console.warn('[menu-scan] OCR uebersprungen:', e.message);
            }
            return '';
        });
    }));
    return parts.filter(Boolean).join('\n\n--- naechste Seite ---\n\n');
}

// OCR-Text so einbetten, dass das Modell ihn als Beleg nutzt statt ihn
// blind abzuschreiben: die Zeichen stimmen, die Lesereihenfolge nicht immer.
function ocrBlock(ocr) {
    if (!ocr) return '';
    return '\n\nOCR-TEXT (maschinell aus demselben Bild gelesen — die ZEICHEN und vor allem die ZAHLEN\n' +
           'sind exakt, die Reihenfolge kann bei mehrspaltigen Karten durcheinander sein):\n' +
           '"""\n' + ocr + '\n"""\n' +
           'Nutze das Bild fuer die STRUKTUR (Spalten, Ueberschriften, welcher Preis zu welcher Zeile gehoert)\n' +
           'und den OCR-Text fuer die exakte SCHREIBWEISE und die PREISE. Weichen Bild und OCR bei einer Zahl\n' +
           'voneinander ab, gilt der OCR-Text. Steht ein Gericht im OCR-Text, muss es auch in deiner Liste stehen.';
}

// Prompt zusammensetzen. Nutzertext (eingetippte Karte) und OCR-Text sind zwei
// verschiedene Dinge und bekommen deshalb getrennte, klar benannte Abschnitte --
// sonst hält das Modell den OCR-Auszug für die vom Wirt eingegebene Karte.
// Der Preis-Nachtrag darf den großen Parser-Prompt NICHT mitbekommen.
//
// Gemessen: mit dem vollen Prompt davor hat das Modell die Nachfrage als
// "gib die Karte nochmal aus" verstanden und Preise geraten -- von sechs
// nachgetragenen war einer richtig. Ein falscher Preis ist schlimmer als gar
// keiner: 0 sieht der Wirt und korrigiert es, eine falsche Zahl übernimmt er.
function buildPrompt(text, extra, kategorien, nurExtra) {
    if (nurExtra) return String(extra || '');
    return buildPromptVoll(text, extra, kategorien);
}

function buildPromptVoll(text, extra, kategorien) {
    // ACHTUNG: die vorhandenen Kategorien des Restaurants gehen bewusst NICHT
    // mehr an das Modell -- der Parameter bleibt nur, damit die Aufrufe gleich
    // bleiben.
    //
    // Früher standen sie als Liste im Prompt, mit der Bitte, die vorhandene
    // Schreibweise zu nehmen ("Karte: Pizza, vorhanden: Pizzen -> Pizzen").
    // Gedacht war das gegen doppelte Kategorien. In Wahrheit war es die
    // Erlaubnis, Gerichte EINZUSORTIEREN statt Überschriften ABZULESEN: auf
    // einer echten Karte landeten 48 Pizzen unter "Fleischgerichte" -- ein
    // Wort, das auf der Karte nirgends steht.
    //
    // Das Zusammenführen mit vorhandenen Kategorien macht jetzt die App, in
    // Code, mit einem engen Abgleich (findeKategorie, Toleranz zwei Zeichen).
    // Der Unterschied ist entscheidend: Code führt "Pizza" und "Pizzen"
    // zusammen, macht aber niemals "Fleischgerichte" daraus.
    return PROMPT + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') + (extra || '');
}

// Anweisung für eine FORTSETZUNG desselben Bildes.
//
// Steht bewusst als eigener, LETZTER Textblock -- alles davor (Bild, Prompt,
// OCR, Kategorien) bleibt zwischen den Runden Zeichen für Zeichen gleich und
// kann deshalb zwischengespeichert werden. Das spart in Runde 2, 3, 4 ... sowohl
// Geld als auch die Zeit, das Bild erneut zu verarbeiten.
function weiterBlock(w) {
    if (!w || !w.anzahl) return '';
    var letzte = Array.isArray(w.letzte) ? w.letzte.slice(-8) : [];
    var t = '\n\n=== FORTSETZUNG DERSELBEN KARTE ===\n' +
        'Du hast dieses Bild bereits gelesen bis zu der Stelle, die unten steht. ' +
        w.anzahl + ' Positionen sind schon erfasst.\n';
    if (letzte.length) {
        t += 'Die zuletzt erfassten Positionen waren, in dieser Reihenfolge:\n' +
             letzte.map(function (n, i) { return (i + 1) + '. ' + String(n).slice(0, 90); }).join('\n') + '\n';
    }
    if (w.kategorie) {
        t += 'Die zuletzt gueltige Ueberschrift war "' + String(w.kategorie).slice(0, 60) +
             '". Sie gilt weiter, bis im Bild eine neue Ueberschrift kommt.\n';
    }
    t += 'AUFGABE JETZT: Fange GENAU NACH der zuletzt genannten Position an und lies von dort\n' +
         'weiter bis zum Ende der Karte.\n' +
         '- Gib die oben genannten Positionen NICHT noch einmal aus.\n' +
         '- Fang NICHT wieder oben an.\n' +
         '- Findest du nach dieser Stelle nichts mehr, gib {"items":[]} zurueck.';
    return t;
}

// Reihenfolge der Konfigurationsstufen (nur Claude).
//
// WARUM DAS HIER STEHT: Der Scanner war über Wochen tot, weil EIN einziges
// Feld (temperature) von den neuen Claude-Modellen mit HTTP 400 abgelehnt wurde.
// Jeder Aufruf schlug fehl, und niemand sah es. Damit das nie wieder passiert,
// gibt es keine feste Konfiguration mehr, sondern eine Leiter: wird ein Feld
// abgelehnt, fällt es weg und der Aufruf läuft trotzdem. Die letzte Stufe ist
// das absolute Minimum und funktioniert bei jedem Claude-Modell.
var STUFEN = [
    { effort: 'low', denkenAus: true,  cache: true  },
    { effort: null,  denkenAus: true,  cache: true  },
    { effort: null,  denkenAus: false, cache: true  },
    { effort: null,  denkenAus: false, cache: false }
];
// Merkt sich pro Function-Instanz die erste Stufe, die durchging -- damit nicht
// jeder Aufruf die abgelehnten Stufen erneut durchprobiert und Zeit verliert.
var _stufeAbs = 0;

function baueBody(stufe, content) {
    var b = { model: ANTHROPIC_MODEL, max_tokens: 16000, stream: true,
              messages: [{ role: 'user', content: content }] };
    // Nachdenken AUS. Bei einer harten Zeitgrenze ist Nachdenken der teuerste
    // Posten: es verbraucht Budget, BEVOR das erste Gericht herauskommt. Was
    // das Modell nicht mehr schreibt, fehlt hinterher in der Speisekarte.
    if (stufe.denkenAus) b.thinking = { type: 'disabled' };
    // Kein Antwortschema: das galt für JSON. Die Zeilenform braucht keins --
    // eine abgerissene Zeile fällt einfach weg, statt das ganze Dokument
    // ungültig zu machen. Genau dafür war das Schema da.
    if (stufe.effort) b.output_config = { effort: stufe.effort };
    return b;
}

// Inhalt des Aufrufs. Reihenfolge ist Absicht:
//   1. Bild        2. fester Prompt + OCR + Kategorien   3. Fortsetzungs-Hinweis
// Nur Teil 3 ändert sich zwischen den Runden. Die Zwischenspeicher-Marke sitzt
// deshalb am Ende von Teil 2: Runde 2 und alle weiteren müssen das Bild nicht
// erneut verarbeiten -- das ist der grösste Zeitgewinn überhaupt.
function baueContent(images, text, extra, kategorien, weiter, cache, nurExtra) {
    var content = [];
    (images || []).forEach(function (d) {
        var p = splitDataUrl(d);
        content.push({ type: 'image', source: { type: 'base64', media_type: p.media, data: p.data } });
    });
    var fest = { type: 'text', text: buildPrompt(text, extra, kategorien, nurExtra) };
    // Zwischenspeicher nur, wenn ein Bild dabei ist. Ein reiner Text-Scan
    // (eingetippte Karte) liegt unter der Mindestgröße -- die Marke wäre
    // dort wirkungslos und nur ein zusätzliches Feld, das schiefgehen kann.
    if (cache && images && images.length) fest.cache_control = { type: 'ephemeral' };
    content.push(fest);
    var w = weiterBlock(weiter);
    if (w) content.push({ type: 'text', text: w });
    return content;
}

// Einen Datenstrom (Server-Sent Events) bis zum Ende oder bis zum Zeitbudget
// mitlesen. Beide Anbieter schicken SSE, nur der Inhalt der Ereignisse
// unterscheidet sich -- deshalb steckt der Unterschied in "hole".
async function leseStrom(res, ac, hole) {
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '', roh = '', stopReason = '', abgebrochen = false;
    try {
        for (;;) {
            var chunk = await reader.read();
            if (chunk.done) break;
            buf += dec.decode(chunk.value, { stream: true });
            var zeilen = buf.split('\n');
            buf = zeilen.pop();
            for (var zi = 0; zi < zeilen.length; zi++) {
                var z = zeilen[zi];
                if (z.slice(0, 5) !== 'data:') continue;
                var nutz = z.slice(5).trim();
                if (!nutz || nutz === '[DONE]') continue;
                var ev;
                try { ev = JSON.parse(nutz); } catch (e) { continue; }
                var r = hole(ev);
                if (r) {
                    if (r.text) roh += r.text;
                    if (r.stop) stopReason = r.stop;
                    if (r.fehler) throw new Error(r.fehler);
                }
            }
        }
    } catch (e) {
        if (ac.signal.aborted) abgebrochen = true;
        else throw e;
    }
    return { roh: roh, stopReason: stopReason, abgebrochen: abgebrochen };
}

// Liest die Antwort im Datenstrom mit und bricht am Zeitbudget ab.
async function callAnthropic(key, images, text, extra, kategorien, weiter, frist, nurExtra) {
    var lastErr = null;
    for (var si = _stufeAbs; si < STUFEN.length; si++) {
        var stufe = STUFEN[si];
        var rest = frist - Date.now();
        // Keine Zeit mehr für einen weiteren Versuch. Das ist KEIN Fehler in der
        // Konfiguration, sondern schlicht das Zeitlimit -- also auch so melden.
        if (rest < 1200) {
            if (lastErr) throw lastErr;
            return { roh: '', abgebrochen: true, stufe: si };
        }

        var ac = new AbortController();
        var timer = setTimeout(function () { ac.abort(); }, rest);
        var res;
        try {
            res = await fetch(ANTHROPIC_API, {
                method: 'POST',
                headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                body: JSON.stringify(baueBody(stufe, baueContent(images, text, extra, kategorien, weiter, stufe.cache, nurExtra))),
                signal: ac.signal
            });
        } catch (e) {
            clearTimeout(timer);
            if (ac.signal.aborted) return { roh: '', abgebrochen: true, stufe: si };
            throw e;
        }

        if (!res.ok) {
            clearTimeout(timer);
            var t = '';
            try { t = await res.text(); } catch (e2) {}
            // 400 = eine Einstellung passt diesem Modell nicht -> nächste Stufe.
            // Alles andere (401 Schlüssel, 429 Limit, 529 überlastet) wäre mit
            // einer anderen Einstellung genauso kaputt: sofort melden.
            if (res.status === 400) {
                console.warn('[menu-scan] Stufe ' + si + ' abgelehnt, versuche einfacher: ' + t.slice(0, 200));
                lastErr = new Error('Anthropic 400: ' + t.slice(0, 200));
                continue;
            }
            // 429 = zu viele Anfragen kurz hintereinander, 529 = überlastet.
            // Beides geht von selbst wieder weg. Als eigener Fehlertyp, damit
            // die App WARTET statt die halbe Karte zu verlieren -- eine große
            // Karte braucht viele Anfragen hintereinander.
            if (res.status === 429 || res.status === 529) {
                var eW = new Error(res.status === 429
                    ? 'Zu viele Anfragen kurz hintereinander — kurz warten.'
                    : 'Der Dienst ist gerade überlastet — kurz warten.');
                eW.kontingent = true;
                throw eW;
            }
            throw new Error('Anthropic ' + res.status + ': ' + t.slice(0, 200));
        }

        if (si > _stufeAbs) _stufeAbs = si;            // diese Stufe geht durch

        var erg = await leseStrom(res, ac, function (ev) {
            if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
                return { text: ev.delta.text };
            }
            if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
                return { stop: ev.delta.stop_reason };
            }
            if (ev.type === 'error') return { fehler: 'Anthropic: ' + JSON.stringify(ev.error).slice(0, 200) };
            return null;
        });
        clearTimeout(timer);
        erg.stufe = si;
        return erg;
    }
    throw (lastErr || new Error('Keine Konfiguration wurde akzeptiert'));
}

// ZWEITER BLICK: das Gelesene noch einmal gegen das Bild prüfen.
//
// WARUM: Ein einzelner Durchgang liest eine Karte sehr gut, aber wenn doch eine
// Zeile daneben liegt, MERKT ES NIEMAND. Der Wirt sieht eine plausible Liste,
// häkelt sie ab und hat einen falschen Preis in der Karte stehen. Das ist der
// eigentliche Unterschied zu "im Chat vorlegen": dort liest ein Mensch mit.
//
// Diese Prüfung bekommt das Bild UND das Gelesene und soll nur eines sagen:
// was stimmt nicht, und was fehlt. Ist alles richtig, ist die Antwort ein Wort
// und dauert eine Sekunde. Sie läuft als EIGENE Anfrage, hat also ihr eigenes
// Zeitbudget und kann den Scan nicht ins Limit ziehen.
//
// Grundregel wie beim Preis-Nachtrag: RATEN IST VERBOTEN. Eine Korrektur, die
// selbst geraten ist, macht es schlimmer, nicht besser.
// ABSCHNITTE: erst die Überschriften holen, dann alle Abschnitte GLEICHZEITIG.
//
// WARUM: Bisher las der Scanner die Karte von oben nach unten, Runde für
// Runde, jede Runde auf die vorige wartend. An der echten Karte von Pronto
// Pronto (140 Gerichte) waren das acht Anfragen nacheinander -- 45 Sekunden,
// in denen der Gastronom auf einen Zähler starrt.
//
// Nacheinander muss das nur sein, weil eine Runde wissen muss, wo die vorige
// aufgehört hat. Diese Abhängigkeit fällt weg, wenn jede Anfrage von
// vornherein einen EIGENEN Abschnitt bekommt: "lies nur, was unter 'Pizza'
// steht". Dann laufen alle Abschnitte gleichzeitig, und der Scan dauert nur
// noch so lang wie der grösste Abschnitt.
//
// Das Bild bekommt jede Anfrage GANZ -- es wird nichts zerschnitten. Der
// Abschnitt steht im Text, nicht in der Schere. Genau das war der Fehler von
// früher: geschnittene Bilder zerreissen mehrspaltige Layouts.
//
// Nebenwirkung, die uns entgegenkommt: die Kategorie steht damit fest, statt
// aus der Bildlage geraten zu werden.
function ueberschriftenBlock() {
    return '=== NUR DIE ABSCHNITTE ===\n' +
        'Gib NUR die Ueberschriften dieser Speisekarte zurueck, eine pro Zeile, in der\n' +
        'Reihenfolge, in der sie auf der Karte stehen. Nichts sonst -- keine Gerichte,\n' +
        'keine Preise, keine Nummerierung, keine Erklaerung.\n\n' +
        'Als Ueberschrift zaehlt, was ueber einer Gruppe von Gerichten steht: "Pizza",\n' +
        '"Nudeln", "Vom Grill", "Getränke". Auch Zwischenueberschriften innerhalb einer\n' +
        'Gruppe ("Spaghetti", "Rigatoni" unter "Nudeln") sind eigene Abschnitte --\n' +
        'nimm sie einzeln auf, nicht die Gruppe darueber.\n' +
        'Steht eine Ueberschrift mehrfach, weil der Abschnitt in der naechsten Spalte\n' +
        'weitergeht ("Pizza (Forts.)"), nenne sie NUR EINMAL und ohne den Zusatz.\n' +
        'Der Name des Restaurants, Fusszeilen und Hinweise sind KEINE Ueberschriften.\n\n' +
        'ERFINDE KEINE UEBERSCHRIFT. Nur Woerter, die GEDRUCKT auf der Karte stehen.\n' +
        'Fasse nicht zusammen, benenne nicht um, ordne nicht nach Inhalt. Steht dort\n' +
        '"Pizza", schreibst du "Pizza" -- nicht "Fleischgerichte", auch wenn Fleisch\n' +
        'darauf ist. Findest du keine Ueberschriften, gib nichts zurueck.\n' +
        'Schreibe sie zeichengenau ab, mit Umlauten.';
}

// Anweisung, nur EINEN Abschnitt zu lesen.
function abschnittBlock(name) {
    return '\n\n=== NUR DIESER ABSCHNITT ===\n' +
        'Gib AUSSCHLIESSLICH die Positionen aus, die auf der Karte unter der Ueberschrift\n' +
        '"' + String(name).slice(0, 60) + '" stehen.\n' +
        '- Geht der Abschnitt in einer anderen Spalte oder auf der naechsten Seite weiter\n' +
        '  (oft mit "(Forts.)" ueberschrieben), gehoert das MIT dazu.\n' +
        '- Alles unter anderen Ueberschriften laesst du weg -- auch wenn es direkt daneben\n' +
        '  steht. Ein anderer Durchgang kuemmert sich darum.\n' +
        '- In das Feld Kategorie schreibst du bei JEDER Zeile genau: ' + String(name).slice(0, 60) + '\n' +
        '- Findest du diesen Abschnitt nicht, gib nichts zurueck.';
}

// ZAEHLEN: wie viele Positionen stehen unter dieser Überschrift?
//
// WARUM: Ein Abschnitt gilt als fertig, wenn das Modell von selbst aufhört.
// Das ist eine Behauptung, keine Tatsache -- und im Betrieb kamen 148 von 228
// Einträgen an, also ein Drittel zu wenig, ohne jede Fehlermeldung. Das Modell
// hatte einfach früher aufgehört und "fertig" gemeldet.
//
// Zählen ist etwas ganz anderes als Vorlesen: die Antwort ist EINE ZAHL, dauert
// eine Sekunde und lässt sich nicht "abkürzen". Damit hat die App eine
// unabhängige Sollzahl und liest weiter, bis sie erreicht ist -- statt dem
// Modell zu glauben.
function zaehlBlock(name) {
    return '=== NUR ZAEHLEN ===\n' +
        'Zaehle, wie viele Positionen (Gerichte/Getraenke) auf dieser Karte unter der\n' +
        'Ueberschrift "' + String(name).slice(0, 60) + '" stehen.\n' +
        '- Geht der Abschnitt in einer anderen Spalte oder auf der naechsten Seite\n' +
        '  weiter (oft "(Forts.)"), zaehle das MIT.\n' +
        '- Zaehle ZEILEN, nicht Preise: ein Gericht mit zwei Preisen (klein/gross)\n' +
        '  zaehlt EINMAL.\n' +
        '- Ueberschriften, Hinweise und Fusszeilen zaehlen nicht mit.\n\n' +
        'Antworte NUR mit der Zahl. Keine Erklaerung, kein Wort, nichts sonst.';
}

function pruefBlock(zeilen) {
    return '=== PRUEFUNG ===\n' +
        'Unten steht, was aus DIESEM Bild gelesen wurde — eine Zeile je Position im Format\n' +
        'NR|Name|Beschreibung|Preis|Kategorie|Allergene|Zusatzstoffe|Merkmale\n\n' +
        'Vergleiche JEDE Zeile Feld fuer Feld mit dem Bild. Achte besonders auf:\n' +
        '- Preise (stehen oft rechtsbuendig in einer eigenen Spalte — richtige Zeile?)\n' +
        '- Kategorie (gilt die Ueberschrift darueber wirklich fuer dieses Gericht?)\n' +
        '- Gerichtnummern und Groessenangaben\n\n' +
        // Gemessen: bei einer falschen Gerichtnummer hat das Modell die Zeile
        // als "fehlt" gemeldet statt sie zu korrigieren -- es hielt die richtig
        // nummerierte Position für ein anderes Gericht. Deshalb hier explizit.
        'WICHTIG: Steht ein Gericht unten schon drin und stimmt nur ein FELD nicht\n' +
        '(z.B. die Nummer oder der Preis), ist das eine KORREKTUR — NICHT "FEHLT".\n' +
        '"FEHLT" ist nur fuer Gerichte, deren Name unten ueberhaupt nicht vorkommt.\n\n' +
        'Antworte NUR so:\n' +
        '- Fuer jede Zeile, die NICHT stimmt, die komplette korrigierte Zeile:\n' +
        '  KORREKTUR|NR|Name|Beschreibung|Preis|Kategorie|Allergene|Zusatzstoffe|Merkmale\n' +
        '- Fuer jede Position, die auf der Karte steht, unten aber FEHLT:\n' +
        '  FEHLT|NR|Name|Beschreibung|Preis|Kategorie|Allergene|Zusatzstoffe|Merkmale\n' +
        '- Stimmt alles und fehlt nichts, antworte nur mit dem Wort: OK\n\n' +
        'RATE NICHT. Korrigiere nur, was du im Bild eindeutig ANDERS LESEN kannst.\n' +
        'Einen Preis, den du nicht sicher lesen kannst, laesst du wie er ist.\n' +
        'Erfinde keine Positionen. Kein Kommentar, keine Erklaerung.\n\n' +
        'GELESEN:\n' + zeilen.join('\n');
}

// Zeilen mit Präfix (KORREKTUR|... / FEHLT|...) trennen und auswerten.
function lesePruefung(roh) {
    var korr = [], fehlt = [];
    String(roh || '').split('\n').forEach(function (z) {
        z = z.trim();
        var m = /^(KORREKTUR|FEHLT)\s*\|(.*)$/i.exec(z);
        if (!m) return;
        var items = parseZeilen(m[2]);
        if (!items.length) return;
        (m[1].toUpperCase() === 'FEHLT' ? fehlt : korr).push(items[0]);
    });
    return { korr: normalizeItems(korr), fehlt: normalizeItems(fehlt) };
}

// Fehlende Preise gezielt nachschlagen.
//
// BEOBACHTET an einem schräg fotografierten Foto: in der rechten Spalte kamen
// sechs von acht Getränken ohne Preis zurück (0). Der Name stand da, die
// Kategorie stand da -- nur die rechtsbündige Preisspalte hat das Modell dort
// nicht mehr sicher zugeordnet.
//
// Ein kompletter zweiter Durchgang wäre dafür Verschwendung. Diese Nachfrage
// nennt nur die betroffenen Namen und will nur Zahlen zurück: ein paar hundert
// Zeichen Ausgabe, also ein bis zwei Sekunden. Das Bild liegt beim Modell
// ohnehin schon im Zwischenspeicher.
async function preiseNachtragen(key, images, ohnePreis, kategorien, frist) {
    if (!images.length || !ohnePreis.length) return 0;
    if (frist - Date.now() < 3000) return 0;

    var liste = ohnePreis.slice(0, 40).map(function (it) {
        return (it.dish_number ? it.dish_number + ' ' : '') + it.name;
    });
    var frage = '\n\n=== NUR PREISE NACHTRAGEN ===\n' +
        'Bei diesen Positionen fehlt der Preis. Sieh im Bild GENAU bei diesen Zeilen nach —\n' +
        'der Preis steht meistens rechtsbuendig am Ende derselben Zeile, oft in einer eigenen\n' +
        'Spalte weit rechts. Achte darauf, in der RICHTIGEN Spalte zu suchen.\n\n' +
        liste.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') + '\n\n' +
        'Antworte NUR mit einer Zeile je Position, nichts sonst:\n' +
        'Name|Preis\n' +
        'Beispiel:  Espresso|2.40\n\n' +
        'WICHTIG: RATE NICHT. Kannst du den Preis nicht eindeutig im Bild LESEN, schreibe 0.\n' +
        'Ein falscher Preis ist schlimmer als gar keiner — der Wirt sieht die 0 und traegt sie\n' +
        'selbst nach, eine erfundene Zahl uebernimmt er ungeprueft.\n' +
        'Leite den Preis NICHT aus aehnlichen Gerichten oder ueblichen Preisen ab.';

    try {
        var r = await callAnthropic(key, images, '', frage, kategorien, null, frist, true);
        var treffer = {};
        String(r.roh || '').split('\n').forEach(function (z) {
            var t = z.split('|');
            if (t.length < 2) return;
            var name = t[0].replace(/^\s*\d+[.)]?\s*/, '').trim().toLowerCase();
            var pr = parseFloat(String(t[1]).replace(',', '.').replace(/[^0-9.]/g, ''));
            if (name && isFinite(pr) && pr > 0) treffer[name] = Math.round(pr * 100) / 100;
        });
        var n = 0;
        ohnePreis.forEach(function (it) {
            var p = treffer[it.name.trim().toLowerCase()];
            if (p) { it.price = p; n++; }
        });
        return n;
    } catch (e) {
        console.warn('[menu-scan] Preis-Nachtrag fehlgeschlagen:', e.message);
        return 0;
    }
}


// ---------------------------------------------------------------------------
// Die ganze Karte in EINEM Zug lesen -- der einfache Weg.
//
// Genau das passiert, wenn man eine Karte im Chat vorlegt: ein Aufruf, alles
// zurück. Möglich ist das nur ohne Zeitlimit, also in der
// Background-Function. Die Fortsetzung bleibt trotzdem drin, aber nur noch
// für den seltenen Fall, dass das Modell am Token-Limit abreisst -- nicht
// mehr als Umgehung einer Zeitschranke.
// ---------------------------------------------------------------------------
async function leseGanz(key, images, text, kategorien, frist) {
    var alle = [], gesehen = {}, weiter = null, fehler = null;

    for (var runde = 1; runde <= 12; runde++) {
        if (frist - Date.now() < 5000) break;
        var r;
        try {
            r = await callAnthropic(key, images, text, '', kategorien, weiter, frist);
        } catch (e) {
            // Zu viele Anfragen oder überlastet: hier ist Warten kein Problem,
            // wir haben Minuten statt Sekunden.
            if (e.kontingent && frist - Date.now() > 40000) {
                await new Promise(function (r2) { setTimeout(r2, 30000); });
                runde--;
                continue;
            }
            fehler = e.message;
            break;
        }

        var teil = normalizeItems(parseAntwort(r.roh));
        var neu = 0;
        teil.forEach(function (it) {
            var k = schluessel(it);
            if (gesehen[k]) return;
            gesehen[k] = 1; alle.push(it); neu++;
        });

        var fertig = !r.abgebrochen && r.stopReason !== 'max_tokens';
        if (fertig || !neu) break;

        var letzteKategorie = '';
        for (var i = alle.length - 1; i >= 0; i--) { if (alle[i].category) { letzteKategorie = alle[i].category; break; } }
        weiter = {
            anzahl: alle.length,
            letzte: alle.slice(-8).map(function (x) {
                return (x.dish_number ? x.dish_number + ' ' : '') + x.name + (x.price ? ' ' + x.price : '');
            }),
            kategorie: letzteKategorie
        };
    }

    return { items: alle, fehler: fehler };
}

// Duplikat-Schlüssel. Die GERICHTNUMMER gehört dazu: auf einer echten Karte
// stehen "114. Roma Spezial" (Hähnchen) und "115. Roma Spezial" (Rind) --
// gleicher Name, gleicher Preis, zwei verschiedene Gerichte.
function schluessel(it) {
    return (it.name + '|' + it.price + '|' + (it.dish_number || '')).toLowerCase().replace(/\s+/g, ' ');
}

function entdoppeln(liste) {
    var seen = {}, out = [];
    liste.forEach(function (it) {
        var k = schluessel(it);
        if (!seen[k]) { seen[k] = 1; out.push(it); }
    });
    return out;
}

module.exports = {
    MODELL: ANTHROPIC_MODEL,
    leseGanz: leseGanz,
    entdoppeln: entdoppeln,
    schluessel: schluessel,
    ALLERGEN_CODES: ALLERGEN_CODES,
    ANTHROPIC_API: ANTHROPIC_API,
    ANTHROPIC_MODEL: ANTHROPIC_MODEL,
    BUCHSTABE_ZU_CODE: BUCHSTABE_ZU_CODE,
    CORS: CORS,
    MERKMAL: MERKMAL,
    PROMPT: PROMPT,
    STUFEN: STUFEN,
    WORT_ZU_CODE: WORT_ZU_CODE,
    abschnittBlock: abschnittBlock,
    baueBody: baueBody,
    baueContent: baueContent,
    buildPrompt: buildPrompt,
    buildPromptVoll: buildPromptVoll,
    callAnthropic: callAnthropic,
    json: json,
    lesePruefung: lesePruefung,
    leseStrom: leseStrom,
    normAllergene: normAllergene,
    normZusatzstoffe: normZusatzstoffe,
    normalizeItems: normalizeItems,
    ocrAll: ocrAll,
    ocrBlock: ocrBlock,
    ocrImage: ocrImage,
    parseAntwort: parseAntwort,
    parseItemsLoose: parseItemsLoose,
    parseZeilen: parseZeilen,
    preiseNachtragen: preiseNachtragen,
    pruefBlock: pruefBlock,
    splitDataUrl: splitDataUrl,
    stripToJson: stripToJson,
    ueberschriftenBlock: ueberschriftenBlock,
    weiterBlock: weiterBlock,
    zaehlBlock: zaehlBlock,
    zerlegeGroessen: zerlegeGroessen
};
