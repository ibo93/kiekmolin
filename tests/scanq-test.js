// Bauweise des Scanners: Zeitbudget, Fortsetzung, Bildaufbereitung.
//
// Diese Datei prueft NICHT den Wortlaut von Prompts, sondern die Eigenschaften,
// ohne die der Scanner im Betrieb nicht funktionieren kann.
var fs=require('fs'), n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var html=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
var fn=fs.readFileSync('/home/user/kiekmolin/netlify/functions/menu-scan.js','utf8');

// --- Zeitbudget: DAS Problem, an dem fuenf Runden Prompt-Arbeit vorbeigelaufen sind ---
t('Function hat ein eigenes Zeitbudget', /BUDGET_MS = parseInt\(process\.env\.MENU_SCAN_MS/.test(fn));
t('Budget bleibt unter dem 10-Sekunden-Limit von Netlify',
  /MENU_SCAN_MS \|\| '8500'/.test(fn));
t('Antwort wird im Datenstrom gelesen (sonst kein Teilergebnis moeglich)',
  /stream: true/.test(fn) && /res\.body\.getReader\(\)/.test(fn) && /text_delta/.test(fn));
t('Aufruf wird per AbortController hart abgebrochen',
  /new AbortController\(\)/.test(fn) && /signal: ac\.signal/.test(fn));
t('Zeitlimit steht als Warnung im Kopf der Datei',
  /DAS ZEITLIMIT IST DIE WICHTIGSTE GROESSE/.test(fn));

// --- Fortsetzung ---
t('Server nimmt einen Fortsetzungs-Punkt entgegen', /body\.weiter && body\.weiter\.anzahl/.test(fn));
t('Server meldet, ob die Karte zu Ende ist', /fertig: fertig/.test(fn));
t('"fertig" ist nur wahr ohne Abbruch und ohne Token-Abriss',
  /var fertig = !r\.abgebrochen && r\.stopReason !== 'max_tokens'/.test(fn));
t('Server liefert den Anker fuer die naechste Runde', /letzteKategorie: letzteKategorie/.test(fn));
t('Client fragt so lange weiter, bis die Seite durch ist',
  /async function scanSeiteKomplett/.test(html) && /if \(a\.fertig\) break;/.test(html));
t('Endlosschleife ist ausgeschlossen (Rundenzahl + Stillstand)',
  /MAX_RUNDEN = 20/.test(html) && /if \(!neu\) break;/.test(html));

// --- Zwischenspeicher: macht Runde 2+ schnell und billig ---
t('Bild steht vor dem Prompt, Marke sitzt am festen Teil',
  /cache_control = \{ type: 'ephemeral' \}/.test(fn));
t('Fortsetzungs-Hinweis kommt als letzter, NICHT gespeicherter Block',
  /var w = weiterBlock\(weiter\);\n\s*if \(w\) content\.push/.test(fn));

// --- Konfigurations-Leiter gegen den temperature-Totalausfall ---
t('abgelehnte Felder fuehren zu einer einfacheren Stufe, nicht zum Ausfall',
  /var STUFEN = \[/.test(fn) && /res\.status === 400/.test(fn));
t('letzte Stufe kommt ohne Sonderfelder aus',
  /\{ effort: null,  denkenAus: false, cache: false \}/.test(fn));
t('erfolgreiche Stufe wird gemerkt (spart Zeit beim naechsten Aufruf)', /_stufeAbs/.test(fn));

// --- Kompaktes Ausgabeformat: der zweite grosse Zeitfresser ---
// Bei JSON waren rund zwei Drittel der Zeichen reines Geruest. Eine Karte mit
// 60 Gerichten: 19362 Zeichen als JSON, 5438 als Zeilen. Bei 360 Zeichen/s sind
// das 54 s gegen 15 s -- also 9 Runden gegen 2.
t('Ausgabe ist die kompakte Zeilenform, kein JSON',
  /NR\|Name\|Beschreibung\|Preis\|Kategorie\|Allergene\|Zusatzstoffe\|Merkmale/.test(fn));
t('Prompt verbietet JSON ausdruecklich', /Kein JSON, keine Aufzaehlungszeichen/.test(fn));
t('Zeilen-Parser vorhanden', /function parseZeilen/.test(fn));
t('unvollstaendige letzte Zeile faellt weg statt alles zu kippen',
  /if \(t\.length < 8\) return;/.test(fn));
t('Preisfeld wird gesucht, nicht abgezaehlt (ein | zu viel verschiebt sonst alles)',
  /\^\\s\*\\d\+\(\[\.,\]\\d\{1,2\}\)\?\\s\*\$/.test(fn));
t('Umlaute duerfen NICHT als ae/oe/ue geschrieben werden',
  /Umlaute IMMER als ä ö ü ß schreiben/.test(fn) && /niemals als ae\/oe\/ue/.test(fn));
t('fehlende Preise werden gezielt nachgeschlagen', /async function preiseNachtragen/.test(fn));
t('Preis-Nachtrag nur wenn noch Zeit ist', /if \(frist - Date\.now\(\) < 3000\) return 0;/.test(fn));
t('Merkmal-Buchstaben werden uebersetzt (v/V/s/r/h/w/f/m)',
  /var MERKMAL = \{ v: 'is_vegetarian', V: 'is_vegan'/.test(fn));
t('JSON bleibt als Rueckfall erlaubt, falls das Modell doch JSON liefert',
  /function parseAntwort/.test(fn) && /parseItemsLoose/.test(fn));
t('kein Antwortschema mehr im Aufruf', !/json_schema/.test(fn));

// Anbieterwahl: kostenlos zuerst. Gemessen an einer Testkarte mit 28 Gerichten
// liest Gemini 2.5 Flash sie in 5,2 s vollstaendig -- Claude kostet pro Scan.
// Google ist raus -- der Grund steht gemessen im Code, damit es niemand
// versehentlich zurueckbaut: 20 Anfragen pro Tag im kostenlosen Kontingent.
t('Gemini ist als Modell raus', !/callGemini|streamGenerateContent/.test(fn));
t('der gemessene Grund steht im Code', /quotaValue: 20/.test(fn) && /20 ANFRAGEN PRO TAG/.test(fn));
t('Antwort wird im Datenstrom gelesen', /async function leseStrom/.test(fn) && /text_delta/.test(fn));
t('429 und 529 heissen "warten", nicht "kaputt"',
  /res\.status === 429 \|\| res\.status === 529/.test(fn) && /eW\.kontingent = true/.test(fn));
t('Gemini-Schluessel bleibt auch fuer die Google-OCR erlaubt',
  /GOOGLE_VISION_API_KEY \|\| process\.env\.GEMINI_API_KEY/.test(fn));
t('OCR laeuft nur in der ersten Runde', /if \(!weiter && visionKey/.test(fn));

// --- Bildaufbereitung ---
var seg = html.slice(html.indexOf('function splitImageVertically'), html.indexOf('async function startMenuScan'));
t('skaliert auf die lange Kante (2576), nicht auf die Breite',
  /MAX_KANTE = 2576/.test(seg) && /MAX_KANTE \/ Math\.max\(w, sh\)/.test(seg));
t('alte Breiten-Begrenzung 2400 ist weg', !/2400 \/ img\.width/.test(seg));
t('NORMALE Fotos werden NICHT geschnitten (Regression von #127 zurueckgenommen)',
  /if \(h \/ w < 2\.2\) \{ resolve\(\[stueck\(0, h\)\]\); return; \}/.test(seg));
t('nur echtes Panorama ab Verhaeltnis 2,2 wird geteilt', /2\.2/.test(seg) && !/verhaeltnis >= 1\.25/.test(seg));
t('Warnung gegen erneutes Zerschneiden steht wieder im Code',
  /BITTE NICHT WIEDER AENDERN/.test(seg) && /an einer echten Karte messen/.test(seg));
t('Schnitt quer, nicht laengs (Spalten bleiben heil)',
  /drawImage\(img, 0, y0, w, sh, 0, 0, cw, ch\)/.test(seg));
t('Panorama-Schnitt hat Ueberlappung gegen zerschnittene Zeilen',
  /var ueber = Math\.floor\(h \* 0\.08\)/.test(seg));
t('weisser Grund gegen schwarze Transparenz', /fillStyle = '#ffffff'/.test(seg));
t('kleine Fotos gehen unveraendert raus (kein zweites JPEG)',
  /if \(Math\.max\(w, h\) <= MAX_KANTE\) \{ resolve\(\[dataUrl\]\); return; \}/.test(seg));
t('Neukodierung mit hoeherer Qualitaet', /toDataURL\('image\/jpeg', 0\.95\)/.test(seg));

// --- Seiten parallel, Fortschritt sichtbar ---
var scan = html.slice(html.indexOf('async function startMenuScan'), html.indexOf('async function startMenuScan')+5000);
t('Seiten werden parallel gelesen', /await Promise\.all\(images\.map/.test(scan));
t('alte Warteschleife ist weg', !/for \(var pi = 0; pi < images\.length; pi\+\+\)/.test(scan));
t('Fortschritt zeigt die laufende Zahl der Gerichte', /Gerichte gelesen/.test(scan));
t('eine kaputte Seite kippt nicht den ganzen Scan', /\.catch\(function \(e\) \{\n\s*return \{ items: \[\]/.test(scan));

// --- Ehrlichkeit ueber die Quelle ---
t('stiller Rueckfall auf OCR ist als solcher gekennzeichnet', /_scanQuelleOCR/.test(html));
t('OCR-Ergebnis bekommt ein Warnbanner', /Ohne KI gelesen\.<\/strong>/.test(html));
t('Grund des KI-Ausfalls wird vor dem Loeschen gesichert',
  /_scanFehlerGrund = _ersterFehler \|\| window\._lastMenuScanError/.test(html));
t('Bericht enthaelt Runde, Dauer und Ergebnis je Aufruf', /protokoll: _protokoll/.test(html));

// --- Parser wirklich laufen lassen ---
var pm = fn.match(/var MERKMAL = \{[\s\S]*?\nfunction parseZeilen[\s\S]*?\n\}/)[0];
var P = new Function(fn.match(/function zerlegeGroessen[\s\S]*?\n\}/)[0] + ';' + pm + '; return parseZeilen;')();
// Die Zeilen unten sind KEINE Fantasie -- genau so kamen sie bei einem echten
// Lauf gegen ein schraeg fotografiertes Kartenfoto zurueck.
var z = P([
  '12|Pizza Salami|Tomate, Käse, Salami|9.50|Pizzen|gluten,milch|1,2|s',
  '|Ostfriesentee|mit Kluntje|3.20|Getränke|milch||v',
  '7|Lachs | Dill|frisch|18.90|Fisch|fisch||f',        // ein | zu viel im Namen
  '|Espresso||2.40|Getränke||||v',                     // ein leeres Feld zu viel
  '11|Salami|Tomaten, Mozzarella|9.50|Pizzen|a,g,2||', // Ziffer im Allergen-Feld
  '99|Kaputt|abgeschnitten mitten'                     // Abriss
].join('\n'));
t('Parser liest alle vollstaendigen Zeilen', z.length === 5, z.length + ' Zeilen');
t('Felder landen richtig',
  z[0].name === 'Pizza Salami' && z[0].price === '9.50' && z[0].category === 'Pizzen',
  JSON.stringify(z[0]));
t('Allergene und Zusatzstoffe getrennt',
  JSON.stringify(z[0].allergens) === '["gluten","milch"]' && JSON.stringify(z[0].additives) === '["1","2"]',
  JSON.stringify(z[0]));
t('Merkmal s = scharf', z[0].is_spicy === true && !z[0].is_vegetarian);
t('leere Gerichtnummer ist erlaubt', z[1].dish_number === '' && z[1].name === 'Ostfriesentee');
t('ein | zu viel verschiebt Preis und Kategorie NICHT',
  z[2].price === '18.90' && z[2].category === 'Fisch', JSON.stringify(z[2]));
t('abgerissene letzte Zeile faellt weg, der Rest bleibt',
  z.map(function(x){return x.name;}).indexOf('Kaputt') < 0, JSON.stringify(z.map(function(x){return x.name;})));
t('ein leeres Feld zu viel verschiebt Preis und Kategorie NICHT',
  z[3].name === 'Espresso' && z[3].price === '2.40' && z[3].category === 'Getränke',
  JSON.stringify(z[3]));
t('Merkmal bleibt trotz Extrafeld erhalten', z[3].is_vegetarian === true, JSON.stringify(z[3]));
t('Ziffer im Allergen-Feld landet bei den Zusatzstoffen statt wegzufallen',
  JSON.stringify(z[4].allergens) === '["a","g"]' && JSON.stringify(z[4].additives) === '["2"]',
  JSON.stringify(z[4]));

// --- Preise: lieber keiner als ein falscher ---
// Gemessen an einem schraeg fotografierten Kartenfoto: als das Modell raten
// durfte, waren von sechs nachgetragenen Preisen fuenf falsch. Ein falscher
// Preis landet ungeprueft in der Speisekarte, eine 0 faellt auf.
t('Preis-Nachtrag verbietet Raten ausdruecklich',
  /RATE NICHT/.test(fn) && /Ein falscher Preis ist schlimmer als gar keiner/.test(fn));
t('Preis-Nachtrag bekommt NICHT den grossen Parser-Prompt',
  /if \(nurExtra\) return String\(extra \|\| ''\);/.test(fn)
  && /kategorien, null, frist, true\)/.test(fn));
t('nur Preise > 0 werden uebernommen', /isFinite\(pr\) && pr > 0/.test(fn));
t('App markiert Gerichte ohne Preis',
  /var _fehltPreis = !item\.price;/.test(html) && /Preis war im Foto nicht lesbar/.test(html));
t('App nennt die Zahl der fehlenden Preise oben', /' ohne Preis'/.test(html));

// --- Zweiter Blick ---
// Gemessen mit echtem Bild und echtem Modellaufruf (tests/beweis-pruefung.js):
// drei absichtlich falsche Felder und ein weggelassenes Gericht -> 4 von 4
// gefunden, in 1,8 s. Bei einer korrekten Liste meldet die Pruefung NICHTS --
// sie erfindet also keine Korrekturen.
t('Server kennt den Pruefmodus', /Array\.isArray\(body\.pruefen\)/.test(fn) && /function pruefBlock/.test(fn));
t('Pruefung laeuft als eigene Anfrage (eigenes Zeitlimit)',
  /if \(pruefen && pruefen\.length && images\.length\)/.test(fn));
t('Pruefung trennt Korrektur von Nachtrag', /\^\(KORREKTUR\|FEHLT\)/.test(fn));
t('nur ein falsches FELD ist eine Korrektur, kein Nachtrag',
  /ist das eine KORREKTUR — NICHT "FEHLT"/.test(fn));
t('Pruefung darf nicht raten', /RATE NICHT\. Korrigiere nur, was du im Bild eindeutig ANDERS LESEN kannst/.test(fn));
t('eine gescheiterte Pruefung kippt den Scan NICHT',
  /Eine gescheiterte Pruefung darf den Scan NICHT kippen/.test(fn));
t('Client prueft jede Seite', /async function pruefeSeite/.test(html));
t('Client uebernimmt nur wirklich abweichende Felder', /if \(geaendert\.length\) \{ alt\._geprueft = geaendert;/.test(html));
t('Nachtrag legt kein Duplikat an',
  /if \(nachName\[String\(f\.name\)\.trim\(\)\.toLowerCase\(\)\]\) return;/.test(html));
t('korrigierte Zeilen sind in der Liste markiert',
  /item\._geprueft && item\._geprueft\.length/.test(html) && /korrigiert: /.test(html));
t('Bericht nennt das Ergebnis der Pruefung', /pruefung: _pruef/.test(html));

// --- Mehrere Groessen in EINER Zeile ---
// Gemessen an einer echten Pizzeria-Karte (Pronto Pronto, Riepe): 140 Gerichte
// auf zwei Seiten, davon 88 mit zwei Preisspalten. Als getrennte Zeilen waeren
// das 228 Zeilen Ausgabe -- neun Runden allein fuer Seite 1. In einer Zeile
// sind es 140.
var G = new Function(fn.match(/function zerlegeGroessen[\s\S]*?\n\}/)[0] + '; return zerlegeGroessen;')();
t('klein/gross wird zerlegt',
  JSON.stringify(G('klein:6.50/gross:8.50')) === '[{"label":"klein","preis":"6.50"},{"label":"groß","preis":"8.50"}]',
  JSON.stringify(G('klein:6.50/gross:8.50')));
t('GROSS wird zu groß (Schreibweise wie im Menue)',
  (G('KLEIN:7/GROSS:9') || [])[1].label === 'groß');
t('Getraenkegroessen funktionieren genauso',
  JSON.stringify(G('0,3l:3.20/0,5l:4.40')) === '[{"label":"0,3l","preis":"3.20"},{"label":"0,5l","preis":"4.40"}]',
  JSON.stringify(G('0,3l:3.20/0,5l:4.40')));
t('ein normaler Preis bleibt unangetastet', G('9.50') === null);
t('eine einzelne Groesse ist keine Groessenliste', G('klein:6.50') === null);
t('unklares Preisfeld wird NICHT zerlegt (lieber unveraendert)', G('ab 6.50/nach Wahl') === null);
var zg = P('1|Pizza Margherita||klein:6.50/gross:8.50|Pizza|gluten,milch|1,2|v');
t('aus einer Zeile werden zwei Eintraege', zg.length === 2, zg.length);
t('Groesse haengt am Namen, Preis stimmt je Groesse',
  zg[0].name === 'Pizza Margherita (klein)' && zg[0].price === '6.50'
  && zg[1].name === 'Pizza Margherita (groß)' && zg[1].price === '8.50',
  JSON.stringify(zg.map(function(x){return x.name+'='+x.price;})));
t('beide Eintraege behalten Kategorie, Allergene und Merkmale',
  zg[1].category === 'Pizza' && JSON.stringify(zg[1].allergens) === '["gluten","milch"]'
  && zg[1].is_vegetarian === true, JSON.stringify(zg[1]));
t('Allergenlisten sind eigene Kopien, keine geteilte Liste',
  zg[0].allergens !== zg[1].allergens);

// --- Kontingent-Ende ist kein Defekt ---
// Gemessen: das kostenlose Google-Kontingent erlaubt 20 Anfragen PRO TAG
// (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier). Eine grosse
// Karte braucht mehr -- bisher war danach der Rest der Karte verloren.
t('Server kennzeichnet Wartefaelle gesondert', /eW\.kontingent = true/.test(fn)
  && /kontingent: !!e\.kontingent/.test(fn));
t('App wartet dann und wiederholt dieselbe Runde',
  /window\._lastMenuScanKontingent && wartezeiten < MAX_WARTEN/.test(html)
  && /runde--;/.test(html));
t('Wartepausen sind begrenzt', /MAX_WARTEN = 4/.test(html));

// --- Duplikate: die Gerichtnummer gehoert in den Schluessel ---
// Auf der echten Karte von Pronto Pronto stehen "114. Roma Spezial"
// (Haehnchen) und "115. Roma Spezial" (Rind): gleicher Name, gleicher Preis,
// zwei verschiedene Gerichte. Ohne Nummer im Schluessel verschwand eines
// stillschweigend -- gemessen: 226 statt 228 Eintraege.
t('Duplikat-Schluessel enthaelt die Gerichtnummer (Server)',
  /\(it\.name \+ '\|' \+ it\.price \+ '\|' \+ \(it\.dish_number \|\| ''\)\)/.test(fn));
t('Duplikat-Schluessel enthaelt die Gerichtnummer (App, beide Stellen)',
  (html.match(/name \+ '\|' \+ it\.price \+ '\|' \+ \(it\.dish_number \|\| ''\)/g) || []).length >= 2);
t('der Grund steht im Code, damit ihn niemand wieder rausnimmt',
  /114\. Roma Spezial/.test(fn) && /114\. Roma Spezial/.test(html));

// --- Abschnitte gleichzeitig lesen ---
// Vorher lief der Scan nacheinander, weil jede Runde wissen musste, wo die
// vorige aufgehoert hat. An der echten Karte (140 Gerichte, zwei Seiten):
// 8 Anfragen nacheinander, 44,6 s. Mit Abschnitten: 13,5 s bei gleichem
// Ergebnis (228 Eintraege, Preise/Kategorien/Nummern 226/226).
t('Server kann nur die Ueberschriften liefern',
  /body\.ueberschriften && images\.length/.test(fn) && /function ueberschriftenBlock/.test(fn));
t('Server kann auf EINEN Abschnitt begrenzt lesen', /function abschnittBlock/.test(fn)
  && /body\.abschnitt/.test(fn));
t('Zwischenueberschriften zaehlen als eigene Abschnitte',
  /"Spaghetti", "Rigatoni" unter "Nudeln"/.test(fn));
t('"(Forts.)" wird nur einmal genannt und gehoert zum selben Abschnitt',
  /nenne sie NUR EINMAL/.test(fn) && /gehoert das MIT dazu/.test(fn));
t('das Bild wird dabei NICHT zerschnitten (steht als Warnung im Code)',
  /Abschnitt steht im Text, nicht in der Schere/.test(fn));
t('leeres Ergebnis eines Abschnitts ist kein Fehler',
  /if \(!deduped\.length && !weiter && !abschnitt\)/.test(fn));
t('App holt erst die Abschnitte, dann alle gleichzeitig',
  /async function holeAbschnitte/.test(html) && /async function scanSeiteParallel/.test(html)
  && /await Promise\.all\(abschnitte\.map/.test(html));
t('unter drei Abschnitten wird am Stueck gelesen (Extra-Aufruf lohnt nicht)',
  /if \(abschnitte\.length < 3\)/.test(html));
t('faellt die Abschnittssuche aus, laeuft der Scan wie bisher weiter',
  /catch \(e\) \{ abschnitte = \[\]; \}/.test(html));

// --- Stiller Fehlschlag: Antworten ohne "items" ---
// Die Function hat drei Betriebsarten; nur eine liefert "items". Die alte
// Bedingung "j.ok && Array.isArray(j.items)" hat die beiden anderen als
// Fehlschlag behandelt -- der zweite Blick lief ins Leere und die Abschnitte
// kamen nie an, beides ohne jede Meldung.
t('Antworten ohne "items" gelten nicht mehr als Fehlschlag',
  /if \(j && j\.ok\) \{/.test(html) && !/j\.ok && Array\.isArray\(j\.items\)/.test(html));
t('fehlendes items-Feld wird zu einer leeren Liste',
  /if \(!Array\.isArray\(j\.items\)\) j\.items = \[\];/.test(html));

console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
