'use strict';

// Vom Bildschirm-Text zum SPRECH-Text.
//
// Claude antwortet in Markdown: Ueberschriften, Listen, Code-Bloecke,
// Dateipfade. Vorgelesen klingt das furchtbar ("Sternchen Sternchen
// Rechnung Sternchen Sternchen"). Dieses Modul macht daraus einen Satz,
// den ein Mensch sagen wuerde - kurz, ohne Zeichensalat.
//
// Der volle Text bleibt im Fenster stehen; gesprochen wird nur der Kern.

// Abkuerzungen, die eine Sprach-KI sonst buchstabiert oder englisch betont.
const AUSSPRACHE = [
  [/\bz\.\s?B\./gi, 'zum Beispiel'],
  [/\bd\.\s?h\./gi, 'das heisst'],
  [/\bu\.\s?a\./gi, 'unter anderem'],
  [/\busw\./gi, 'und so weiter'],
  [/\bca\./gi, 'circa'],
  [/\bNr\./gi, 'Nummer'],
  [/\bMwSt\./gi, 'Mehrwertsteuer'],
  [/\bInkl\./gi, 'inklusive'],
  [/\bggf\./gi, 'gegebenenfalls'],
  [/(\d)\s*€/g, '$1 Euro'],
  [/€\s*(\d)/g, '$1 Euro'],
  [/(\d)\s*%/g, '$1 Prozent'],
  [/\s&\s/g, ' und ']
];

// Emojis und Symbol-Beiwerk raus - die werden entweder vorgelesen
// ("Haekchen") oder erzeugen komische Pausen.
const SYMBOLE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️✅❌⚠]/gu;

function entferneMarkdown(text) {
  let t = String(text || '');

  // Code-Bloecke komplett raus - nie vorlesen.
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/```[\s\S]*$/g, ' ');           // unfertiger Block am Ende
  t = t.replace(/`([^`]*)`/g, '$1');            // Inline-Code: Inhalt behalten

  // Links: [Text](url) -> Text ; nackte URLs raus
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  t = t.replace(/https?:\/\/\S+/g, ' ');

  // Ueberschriften, Zitate, Listenpunkte, Tabellen-Striche
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  t = t.replace(/^\s{0,3}>\s?/gm, '');
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  t = t.replace(/^\s*\d+\.\s+/gm, '');
  t = t.replace(/^\s*\|.*\|\s*$/gm, ' ');
  t = t.replace(/^\s*[-=]{3,}\s*$/gm, ' ');

  // Fett/kursiv/durchgestrichen
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/\*([^*]+)\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/~~([^~]+)~~/g, '$1');

  t = t.replace(SYMBOLE, ' ');

  for (const [muster, ersatz] of AUSSPRACHE) t = t.replace(muster, ersatz);

  // Zeilenumbrueche werden zu Satzgrenzen, damit nichts zusammenklebt.
  t = t.replace(/\n{2,}/g, '. ').replace(/\n/g, '. ');
  t = t.replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ');
  return t.trim();
}

// Text in Saetze zerlegen. Getrennt wird nur bei Punkt UND Leerzeichen -
// sonst zerreisst "Die README.md hat 47 Zeilen" mitten im Dateinamen.
// Kurze Reste (Abkuerzungen, einzelne Zahlen) kleben am Vorgaenger.
function inSaetze(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const teile = t.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  const saetze = [];
  for (const teil of teile) {
    if (saetze.length && teil.length < 12) saetze[saetze.length - 1] += ' ' + teil;
    else saetze.push(teil);
  }
  return saetze;
}

// Hauptfunktion: aus der Bildschirm-Antwort einen sprechbaren Satz machen.
//
//   maxSaetze  wie viele Saetze hoechstens gesprochen werden
//   maxZeichen harte Obergrenze (ElevenLabs kostet pro Zeichen)
//
// Rueckgabe: { text, gekuerzt }  - gekuerzt=true heisst: im Fenster steht mehr.
function sprechbar(antwort, optionen) {
  const o = optionen || {};
  const maxSaetze = o.maxSaetze || 4;
  const maxZeichen = o.maxZeichen || 600;

  const roh = entferneMarkdown(antwort);
  if (!roh) return { text: '', gekuerzt: false };

  const saetze = inSaetze(roh);
  let text = '';
  let benutzt = 0;
  for (const satz of saetze) {
    if (benutzt >= maxSaetze) break;
    if (text.length + satz.length + 1 > maxZeichen) break;
    text = text ? text + ' ' + satz : satz;
    benutzt++;
  }

  // Erster Satz ist laenger als das Limit: hart schneiden, aber am Wort.
  if (!text) {
    text = roh.slice(0, maxZeichen);
    const letzterRaum = text.lastIndexOf(' ');
    if (letzterRaum > maxZeichen * 0.6) text = text.slice(0, letzterRaum);
  }

  const gekuerzt = text.trim().length < roh.length;
  return { text: text.trim(), gekuerzt };
}

// Kurzform fuer die Live-Anzeige "was tut er gerade": aus einem
// Werkzeug-Aufruf eine Zeile Klartext machen.
function werkzeugKlartext(name, eingabe) {
  const e = eingabe || {};
  const kurz = (s) => {
    const t = String(s || '');
    return t.length > 60 ? t.slice(0, 57) + '...' : t;
  };
  const datei = (p) => String(p || '').split('/').pop();

  switch (name) {
    case 'Read': return 'liest ' + datei(e.file_path);
    case 'Edit': return 'aendert ' + datei(e.file_path);
    case 'Write': return 'schreibt ' + datei(e.file_path);
    case 'Bash': return 'fuehrt aus: ' + kurz(e.description || e.command);
    case 'Glob':
    case 'Grep': return 'sucht: ' + kurz(e.pattern);
    case 'WebSearch': return 'sucht im Netz: ' + kurz(e.query);
    case 'WebFetch': return 'liest Webseite';
    case 'Skill': return 'nutzt Skill: ' + kurz(e.skill || e.command);
    case 'Task':
    case 'Agent': return 'schickt einen Helfer los';
    case 'ToolSearch': return 'sucht das passende Werkzeug';
    case 'TodoWrite': return 'sortiert die Schritte';
    default: return name;
  }
}

module.exports = { sprechbar, entferneMarkdown, inSaetze, werkzeugKlartext };
