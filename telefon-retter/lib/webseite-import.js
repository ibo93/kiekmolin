'use strict';

// Speisekarte von der Webseite des Wirts einlesen.
//
// Sonst muesste man die ganze Karte abtippen - bei 60 Gerichten eine
// Stunde Arbeit pro Kunde, und Tippfehler landen im Telefongespraech.
// Stattdessen: Webseite holen, Text rausziehen, von der KI in Gerichte
// mit Preisen zerlegen, Ergebnis PRUEFEN und speichern.
//
// EHRLICH: Ein Import ist ein Vorschlag, keine Wahrheit. Preise aendern
// sich, Webseiten sind unvollstaendig. Deshalb wird das Ergebnis immer
// angezeigt und muss bestaetigt werden - und die KI darf nichts erfinden,
// was nicht im Text steht.

// --- 1. Aus HTML wird lesbarer Text --------------------------------------
// Skripte, Stile und Navigationsmuell fliegen raus. Was bleibt, ist der
// Text, den auch ein Besucher liest.
function textAusHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|header|footer|svg)[\s\S]*?<\/\1>/gi, ' ')
    // Zeilenstruktur erhalten: Gerichte stehen meist je Zeile
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, '€')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&middot;/g, '·').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…').replace(/&deg;/g, '°').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // Zahlen-Entities (&#8364; = Euro, &#228; = ä, ...) allgemein aufloesen
    .replace(/&#(\d+);/g, (_t, n) => { try { return String.fromCodePoint(Number(n)); } catch (_e) { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_t, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (_e) { return ' '; } })
    // Was jetzt noch als &irgendwas; uebrig ist, wuerde die KI nur verwirren
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map((z) => z.trim()).join('\n')
    .trim();
}

// --- 2. Wo steht die Karte? ---------------------------------------------
// Viele Betriebe haben die Speisekarte auf einer Unterseite. Diese Links
// lohnen sich zusaetzlich zu holen.
const KARTEN_WORT = /(speisekarte|speisen|menu|men(ü|ue)|karte|gerichte|pizza|bestellen|lieferservice)/i;

function findeSpeisekartenLinks(html, basisUrl) {
  const treffer = new Set();
  const regex = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = regex.exec(String(html || '')))) {
    const ziel = m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ');
    if (!KARTEN_WORT.test(ziel) && !KARTEN_WORT.test(text)) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(ziel)) continue;
    try {
      const url = new URL(ziel, basisUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      // Nur dieselbe Domain - fremde Seiten (Lieferando & Co.) nicht mitziehen
      if (basisUrl && new URL(basisUrl).hostname !== url.hostname) continue;
      url.hash = '';
      treffer.add(url.toString());
    } catch (_e) { /* kaputter Link - egal */ }
  }
  return [...treffer].slice(0, 4);
}

// --- 3. Der Auftrag an die KI -------------------------------------------
function baueImportPrompt(text, url) {
  return [
    'Unten steht der Text der Webseite eines Gastronomiebetriebs' + (url ? ' (' + url + ')' : '') + '.',
    'Ziehe daraus die Stammdaten und die Speisekarte.',
    '',
    'EISERNE REGELN:',
    '- Erfinde NICHTS. Was nicht im Text steht, bleibt null bzw. wird weggelassen.',
    '- Preise nur uebernehmen, wenn sie eindeutig zum Gericht gehoeren. Sonst Preis null.',
    '- Bei mehreren Groessen (z.B. Pizza 26/32 cm) nimm die KLEINSTE Variante und schreibe die Groesse in die Beschreibung.',
    '- Keine Getraenke-Endlosliste: hoechstens 60 Gerichte, die wichtigsten zuerst.',
    '- Oeffnungszeiten als "HH:MM". Gibt es mehrere Tage/Zeiten, nimm die haeufigste Oeffnung und Schliessung.',
    '',
    'Antworte NUR mit diesem JSON, ohne Erklaerung, ohne Code-Zaeune:',
    '{',
    '  "name": "...", "stadt": "...", "adresse": "...", "plz": "...", "telefon": "...",',
    '  "beschreibung": "ein Satz, was den Betrieb ausmacht",',
    '  "oeffnet": "HH:MM", "schliesst": "HH:MM", "liefergebuehr": null,',
    '  "speisekarte": [',
    '    { "name": "...", "preis": 8.5, "kategorie": "...", "beschreibung": "..." }',
    '  ],',
    '  "unklar": ["was du NICHT sicher gefunden hast - z.B. Preise fehlen, Oeffnungszeiten unklar"]',
    '}',
    '',
    '--- WEBSEITEN-TEXT ---',
    text
  ].join('\n');
}

// --- 3b. Nur die Speisekarte (Foto, PDF-Text oder abgetippt) ------------
// Fuer Betriebe ohne Webseite: Der Wirt hat eine Papierkarte, Ibo
// fotografiert sie oder tippt sie ab. Stammdaten braucht es hier nicht.
function baueKartenPrompt(text) {
  return [
    text
      ? 'Unten steht der Text einer Speisekarte. Zerlege ihn in einzelne Gerichte.'
      : 'Auf den Bildern ist eine Speisekarte. Lies sie ab und zerlege sie in einzelne Gerichte.',
    '',
    'EISERNE REGELN:',
    '- Erfinde NICHTS. Nur was wirklich dasteht.',
    '- Ist ein Preis nicht eindeutig lesbar, setze preis auf null - NICHT schaetzen.',
    '- Bei mehreren Groessen (Pizza 26/32 cm) nimm die KLEINSTE und schreibe die Groesse in die Beschreibung.',
    '- Nummern vor Gerichten ("12. Pizza Salami") weglassen.',
    '- Allergen-Kennzeichnungen wie (a,c,1) gehoeren nicht in den Namen.',
    '- Getraenke nur aufnehmen, wenn die Karte fast nur aus Getraenken besteht.',
    '- Hoechstens 80 Gerichte.',
    '',
    'Antworte NUR mit diesem JSON, ohne Erklaerung, ohne Code-Zaeune:',
    '{ "speisekarte": [ { "name": "...", "preis": 8.5, "kategorie": "...", "beschreibung": "..." } ],',
    '  "unklar": ["was du nicht sicher lesen konntest"] }',
    text ? '\n--- SPEISEKARTEN-TEXT ---\n' + text : ''
  ].join('\n');
}

// Gemeinsame Reinigung fuer beide Wege (Webseite und Karte).
// Lieber ein Gericht weniger als ein falscher Preis am Telefon.
function sauberGerichte(liste, maxAnzahl) {
  const gesehen = new Set();
  return (Array.isArray(liste) ? liste : [])
    .map((g) => {
      const name = String((g && g.name) || '').trim();
      if (!name || name.length > 90) return null;
      const schluessel = name.toLowerCase();
      if (gesehen.has(schluessel)) return null;
      gesehen.add(schluessel);
      return {
        name,
        preis: preisWert(g && g.preis),
        kategorie: String((g && g.kategorie) || '').trim() || undefined,
        beschreibung: String((g && g.beschreibung) || '').trim() || undefined
      };
    })
    .filter(Boolean)
    .slice(0, maxAnzahl || 60);
}

function preisWert(wert) {
  if (wert == null) return null;
  const n = Number(String(wert).replace(',', '.').replace(/[^0-9.]/g, ''));
  // Ueber 200 Euro fuer ein Gericht ist mit Sicherheit ein Lesefehler
  return Number.isFinite(n) && n > 0 && n < 200 ? Math.round(n * 100) / 100 : null;
}

// Antwort des Karten-Auslesens pruefen
function parseKarte(roh) {
  const d = holeJson(roh);
  const speisekarte = sauberGerichte(d.speisekarte, 80);
  const unklar = (Array.isArray(d.unklar) ? d.unklar : []).map((u) => String(u).trim()).filter(Boolean);
  const ohnePreis = speisekarte.filter((g) => g.preis == null).length;
  if (ohnePreis) unklar.push(ohnePreis + ' Gericht(e) ohne erkennbaren Preis - bitte nachtragen');
  if (!speisekarte.length) unklar.push('Keine Gerichte erkannt - Foto zu unscharf oder zu wenig Text?');
  return { speisekarte, unklar };
}

// --- 4. Antwort pruefen -------------------------------------------------
// Die KI kann sich vertippen oder Code-Zaeune mitschicken. Hier wird
// aufgeraeumt und alles Unbrauchbare verworfen - lieber ein Feld weniger
// als ein falscher Preis am Telefon.
// Aus der Antwort das JSON herausschaelen (Code-Zaeune, Vorreden)
function holeJson(roh) {
  let text = String(roh || '').trim();
  const zaun = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (zaun) text = zaun[1].trim();
  const start = text.indexOf('{');
  const ende = text.lastIndexOf('}');
  if (start < 0 || ende <= start) throw new Error('Die KI hat kein JSON geliefert');
  try {
    return JSON.parse(text.slice(start, ende + 1));
  } catch (e) {
    throw new Error('Antwort der KI ist kein gueltiges JSON: ' + e.message);
  }
}

function parseImportAntwort(roh) {
  const d = holeJson(roh);
  const name = String(d.name || '').trim();
  if (!name) throw new Error('Kein Betriebsname gefunden - Webseite pruefen oder Datei von Hand anlegen');

  const zeit = (w) => {
    const t = String(w || '').trim();
    return /^\d{1,2}:\d{2}$/.test(t) ? (t.length === 4 ? '0' + t : t) : null;
  };
  const preis = preisWert;
  const speisekarte = sauberGerichte(d.speisekarte, 60);

  const unklar = (Array.isArray(d.unklar) ? d.unklar : []).map((u) => String(u).trim()).filter(Boolean);
  const ohnePreis = speisekarte.filter((g) => g.preis == null).length;
  if (ohnePreis) unklar.push(ohnePreis + ' Gericht(e) ohne erkennbaren Preis - vor dem Scharfschalten ergaenzen');
  if (!speisekarte.length) unklar.push('Keine Speisekarte gefunden - vermutlich als Bild oder PDF auf der Seite');

  return {
    kunde: {
      name,
      stadt: String(d.stadt || '').trim() || undefined,
      adresse: String(d.adresse || '').trim() || undefined,
      plz: String(d.plz || '').trim() || undefined,
      telefon: String(d.telefon || '').trim() || undefined,
      beschreibung: String(d.beschreibung || '').trim() || undefined,
      oeffnet: zeit(d.oeffnet) || undefined,
      schliesst: zeit(d.schliesst) || undefined,
      liefergebuehr: preis(d.liefergebuehr) || undefined,
      speisekarte
    },
    unklar
  };
}

// Dateiname aus dem Betriebsnamen
function slugAusName(name) {
  return String(name || 'kunde').toLowerCase()
    // Deutsche Umlaute nach deutscher Gewohnheit ausschreiben
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    // Alles andere mit Akzent auf den Grundbuchstaben zurueckfuehren
    // ("Café" -> "cafe", nicht "caf")
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kunde';
}

module.exports = {
  textAusHtml, findeSpeisekartenLinks, baueImportPrompt, parseImportAntwort, slugAusName,
  baueKartenPrompt, parseKarte, sauberGerichte, preisWert
};
