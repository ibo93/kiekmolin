'use strict';

// Was hat Ibo gerade gesagt - und WO soll gearbeitet werden?
//
// Zwei Aufgaben:
//   1. Steuerworte erkennen ("stopp", "neues Gespraech") - die gehen NICHT
//      an die KI, die wirken sofort.
//   2. Den Arbeitsordner waehlen. "Schreib eine Rechnung fuer La Piazza"
//      gehoert in den Buero-Ordner, "die App zeigt einen Fehler" ins
//      Kiek-mol-in-Repository. Claude Code laeuft dann GENAU DORT und
//      findet die passenden Skills, Dateien und Regeln.

const fs = require('fs');
const path = require('path');
const os = require('os');

// --------------------------------------------------------- Steuerworte ----

// Sofort-Stopp: der laufende Auftrag wird abgebrochen.
const STOPP = /^(stopp?|halt|abbrechen|abbruch|hör auf|hoer auf|lass gut sein|schluss)\b/i;
// Gedaechtnis leeren: naechste Frage startet ein frisches Gespraech.
const NEU = /^(neues gespräch|neues gespraech|neues thema|vergiss das|von vorne|reset|fang neu an)\b/i;
// Reine Fuellsaetze der Spracherkennung - nicht an die KI schicken.
const LEER = /^(ähm|ehm|hm+|ok|okay|ja|nein|danke|test)[.!?]?$/i;

function steuerwort(text) {
  const t = String(text || '').trim();
  if (!t) return 'leer';
  if (STOPP.test(t)) return 'stopp';
  if (NEU.test(t)) return 'neu';
  if (LEER.test(t)) return 'leer';
  return null;
}

// ------------------------------------------------------- Arbeitsordner ----

// Standard-Ordner, wenn es keine ordner.json gibt: das Repository selbst.
// Stichworte decken die haeufigsten Zurufe ab; ergaenzen kann Ibo in
// ordner.json (Vorlage: ordner.json.example).
function standardKonfig(repoWurzel) {
  return {
    standard: 'app',
    ordner: [
      {
        name: 'app',
        pfad: repoWurzel,
        beschreibung: 'Kiek mol in, Agentur, Telefon-Retter',
        stichworte: [
          'app', 'kiek mol in', 'kiekmolin', 'dashboard', 'reservierung', 'bestellung',
          'supabase', 'netlify', 'webseite', 'deploy', 'fehler', 'bug', 'telefon-retter',
          'agentur', 'sichtbarkeit', 'report', 'wirt', 'gast', 'speisekarte'
        ]
      }
    ]
  };
}

function ladeOrdnerKonfig(repoWurzel) {
  const datei = path.join(__dirname, '..', 'ordner.json');
  if (!fs.existsSync(datei)) return standardKonfig(repoWurzel);

  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch (e) {
    // Kaputte Datei darf den Assistenten nicht lahmlegen - lieber Standard.
    console.error('  ! ordner.json ist kaputt (' + e.message + ') - nutze Standard-Ordner');
    return standardKonfig(repoWurzel);
  }

  const liste = Array.isArray(roh.ordner) ? roh.ordner : [];
  const ordner = liste
    .map((o) => ({
      name: String(o.name || '').trim(),
      pfad: pfadAusfuellen(o.pfad, repoWurzel),
      beschreibung: String(o.beschreibung || ''),
      stichworte: (o.stichworte || []).map((s) => String(s).toLowerCase())
    }))
    .filter((o) => o.name && o.pfad);

  if (!ordner.length) return standardKonfig(repoWurzel);
  return { standard: roh.standard || ordner[0].name, ordner: ordner };
}

// "~/Kurani/Buero" und "." in echte Pfade uebersetzen.
function pfadAusfuellen(pfad, repoWurzel) {
  let p = String(pfad || '').trim();
  if (!p) return '';
  if (p === '.' || p === './') return repoWurzel;
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  if (!path.isAbsolute(p)) p = path.resolve(repoWurzel, p);
  return p;
}

// Welcher Ordner passt zum Satz? Gewinner ist der mit den meisten Treffern.
// Ausdrueckliche Ansage gewinnt immer: "im Buero: ..." / "Ordner Buero".
function waehleOrdner(text, konfig) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const ordner = konfig.ordner;
  const standard = ordner.find((o) => o.name === konfig.standard) || ordner[0];

  for (const o of ordner) {
    const name = o.name.toLowerCase();
    if (new RegExp('(^|\\s)(im|in|ordner|projekt)\\s+' + escape(name) + '\\b').test(t)) return o;
  }

  let bester = null;
  let bestPunkte = 0;
  for (const o of ordner) {
    let punkte = 0;
    for (const wort of o.stichworte) {
      if (!wort) continue;
      // Wortgrenzen, damit "app" nicht in "Apparat" trifft.
      if (new RegExp('(^|[^a-zäöüß])' + escape(wort) + '([^a-zäöüß]|$)').test(t)) punkte++;
    }
    if (punkte > bestPunkte) { bestPunkte = punkte; bester = o; }
  }
  return bester || standard;
}

function escape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ------------------------------------------------------------ Weckwort ----

// Im Live-Modus laeuft das Mikrofon durch. Ohne Weckwort landet JEDES Wort
// beim Assistenten - auch das Telefonat nebenbei und das Gespraech mit dem
// Kunden im Laden. Mit Weckwort schlaeft er, bis sein Name faellt.
//
// Rueckgabe: { geweckt, auftrag }
//   geweckt=false        -> ignorieren, weiterschlafen
//   auftrag=''           -> nur geweckt ("Kurani?") -> kurz bestaetigen
//   auftrag='...'        -> geweckt UND schon ein Auftrag dabei
function weckwortTreffer(text, weckwort) {
  const wort = String(weckwort || 'kurani').toLowerCase().trim();
  const t = String(text || '').trim();
  if (!t) return { geweckt: false, auftrag: '' };

  // Spracherkennung schreibt Namen gern falsch - ein paar Varianten mit.
  const varianten = [wort].concat(VARIANTEN[wort] || []);
  const muster = new RegExp(
    '(^|\\b)(hey |hallo |moin |ok |okay )?(' + varianten.map(escape).join('|') + ')\\b[,.:!?]*\\s*',
    'i'
  );
  const treffer = muster.exec(t);
  if (!treffer) return { geweckt: false, auftrag: '' };

  const auftrag = (t.slice(0, treffer.index) + ' ' + t.slice(treffer.index + treffer[0].length))
    .replace(/\s+/g, ' ').trim();
  return { geweckt: true, auftrag: auftrag };
}

// Was Deepgram und die Browser-Erkennung aus "Kurani" machen.
const VARIANTEN = {
  kurani: ['kurani', 'kurany', 'curani', 'kirani', 'korani', 'kurahni', 'kuranie']
};

// -------------------------------------------------- Befehle ohne die KI ---

// Manche Saetze braucht man nicht an eine KI zu schicken. "Merk dir X"
// ist eine Zeile in einer Datei - da waere jede Sekunde Wartezeit und
// jeder Cent zu viel. Diese Befehle beantwortet der Server selbst,
// sofort und kostenlos.
//
// Rueckgabe: { art, text } oder null (dann geht es an Claude).
const DIREKT = [
  // Dauerhaftes Wissen ZUERST: "merk dir dauerhaft ..." wuerde sonst als
  // normale Notiz gelesen, weil "merk dir" frueher passt.
  // Dauerhaftes Wissen (gilt in jedem kuenftigen Auftrag)
  { art: 'wissen', muster: /^(merk(e)? dir dauerhaft|merk dir fuer immer|merk dir für immer|dauerhaft merken|grunds(ae|ä)tzlich gilt|grunds(ae|ä)tzlich)\b[:,]?\s*/i },
  { art: 'wissenVergessen', muster: /^(vergiss dauerhaft|streich aus dem wissen|das gilt nicht mehr)\b[:,]?\s*/i },
  { art: 'wissenListe', muster: /^(was weisst du|was weißt du|dein wissen|was gilt bei mir)\b/i },
  // Merken / Erinnern
  { art: 'merken', muster: /^(merk(e)?\s+dir|notier(e)?( dir)?|notiz|schreib auf|denk dran|vergiss nicht)\b[:,]?\s*/i },
  { art: 'merken', muster: /^(erinner(e)?\s+mich|erinnerung)\b[:,]?\s*/i },
  // Liste vorlesen
  { art: 'liste', muster: /^(was (hab|habe) ich mir notiert|meine notizen|notizen vorlesen|meine liste|was steht auf (meiner|der) liste|erinnerungen)\b/i },
  // Abhaken
  { art: 'erledigt', muster: /^(erledigt|hab ich erledigt|abhaken|streich)\b[:,]?\s*/i },
  // Diktat - das Schlusswort MUSS vor dem Startwort stehen, sonst wuerde
  // "Diktat Ende" als "Diktat" (starten) gelesen.
  { art: 'diktatEnde', muster: /^(diktat\s+(ende|aus|stopp|fertig)|ende diktat|fertig mit (dem )?diktat|aufhoeren mit schreiben)\b/i },
  { art: 'diktatStart', muster: /^(schreib mit|diktat(\s+start(en)?)?|mitschreiben|nimm auf)\b(?!\s*(ende|aus|stopp|fertig))[:,]?\s*/i }
];

function direktBefehl(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const eintrag of DIREKT) {
    const treffer = eintrag.muster.exec(t);
    if (!treffer) continue;
    return { art: eintrag.art, text: t.slice(treffer[0].length).trim() };
  }
  return null;
}

// ---------------------------------------------------------- Bildschirm ----

// "Guck dir das an" - der Assistent soll sehen, woran gerade gearbeitet
// wird. Ein Foto vom Bildschirm entsteht NUR auf diese Ansage hin.
const BILDSCHIRM = /\b(guck (dir )?(das |mal |hier )*an|schau (dir )?(das |mal )*an|was siehst du|sieh dir (das|meinen bildschirm) an|guck auf (meinen |den )?bildschirm|bildschirm angucken|was ist hier falsch)\b/i;

function willBildschirm(text) {
  const t = String(text || '');
  if (!BILDSCHIRM.test(t)) return { bildschirm: false, text: t.trim() };
  // Der Rest ist die eigentliche Frage ("...und sag mir, ob der Abstand passt")
  return { bildschirm: true, text: t.trim() };
}

// ---------------------------------------------------------- Uebergeben ----

// "Mach das fertig." - der wichtigste Satz im Alltag.
//
// Ibo hat gerade diktiert, etwas erzaehlt oder eine Notiz gemacht. Jetzt
// soll daraus etwas Richtiges werden: ein Angebot, ein Briefing, ein
// sauberes Protokoll. Das kann kein Schnellbefehl - das macht Claude mit
// den Skills. Hier wird nur erkannt, DASS uebergeben werden soll, und
// woran angeknuepft wird.
const UEBERGEBEN = /^(mach(e)? (das |es )?fertig|schreib(e)? das (aus|auf|sauber)|mach (ein|eine|einen) (dokument|notiz|protokoll|angebot|briefing) draus|arbeite das aus|uebernimm das|übernimm das|gib das an claude|mach was draus)\b[:,]?\s*/i;

function willUebergeben(text) {
  const t = String(text || '').trim();
  const treffer = UEBERGEBEN.exec(t);
  if (!treffer) return { uebergeben: false, zusatz: '' };
  return { uebergeben: true, zusatz: t.slice(treffer[0].length).trim() };
}

// Der Auftrag an Claude, wenn uebergeben wird. quelle = Datei (Diktat)
// oder der zuletzt gesprochene Text.
function uebergabeAuftrag({ quelleDatei, quelleText, zusatz }) {
  const teile = [];
  if (quelleDatei) teile.push('Nimm die Datei ' + quelleDatei + ' als Grundlage - das hat Ibo gerade diktiert.');
  else if (quelleText) teile.push('Grundlage ist, was Ibo gerade gesagt hat: "' + quelleText + '"');
  else teile.push('Ibo hat keine Grundlage genannt - nimm das, worueber ihr zuletzt geredet habt.');

  teile.push(zusatz ? 'Sein Zusatz dazu: "' + zusatz + '".' : '');
  teile.push(
    'Mach daraus das fertige Ergebnis - nicht eine Zusammenfassung, sondern das Dokument selbst. ' +
    'Welche Art, entscheidest du aus dem Inhalt: Angebot oder Rechnung mit kurani-docs, ' +
    'Briefing mit kurani-design, Drehplan mit kurani-content, Speisekarte mit menumaker. ' +
    'Leg es dort ab, wo der Kunde oder das Projekt schon liegt (in den Kurani-Unterlagen), ' +
    'nicht irgendwo. Fehlt eine Angabe, die man nicht raten darf (Preis, Datum, Adresse), ' +
    'lass eine klar markierte Luecke und sag sie mir am Ende. ' +
    'Antworte gesprochen in zwei Saetzen: was du gemacht hast und wo es liegt.'
  );
  return teile.filter(Boolean).join(' ');
}

// --------------------------------------------------- Hintergrund-Arbeit ---

// Manche Aufgaben dauern: ein Reel schneiden, alle SEO-Seiten bauen, einen
// Report fuer alle Kunden. Solange das laeuft, soll man weiterreden koennen.
// Diese Woerter schicken den Auftrag in den Hintergrund - der Assistent
// meldet sich, wenn er fertig ist.
const HINTERGRUND = /\b(im hintergrund|nebenbei|sag bescheid,? wenn du fertig bist|sag bescheid wenn es fertig ist|melde dich,? wenn|lass (es )?laufen)\b/i;

function istHintergrund(text) {
  const t = String(text || '');
  const treffer = HINTERGRUND.exec(t);
  if (!treffer) return { hintergrund: false, text: t.trim() };
  const rest = (t.slice(0, treffer.index) + ' ' + t.slice(treffer.index + treffer[0].length))
    .replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim().replace(/^[,.]\s*/, '');
  return { hintergrund: true, text: rest };
}

// ------------------------------------------------------- Schnellbefehle ---

// Saetze, die Ibo jeden Tag sagt - einmal ordentlich ausformuliert, damit
// die Antwort nicht davon abhaengt, wie genau er gerade fragt.
const SCHNELLBEFEHLE = [
  {
    name: 'tagesbericht',
    hoert: /^(moin|guten morgen|morgen|tagesbericht|lagebericht|lage|wie sieht'?s aus|wie steht'?s|stand der dinge|wie wird das wetter|wetter)\b/i,
    prompt: 'Fuehre zuerst dieses Werkzeug aus: node {{tagesbericht}} ' +
      '- es liefert das Wetter von heute und die aktuellen Zahlen von Kiek mol in. ' +
      'Ergaenze dann aus deinen Skills: was laut kurani-roadmap diese Woche dran ist ' +
      'und ob Rechnungen offen sind (kurani-docs). ' +
      'Fasse alles zu einem gesprochenen Tagesbericht zusammen: Begruessung, Wetter mit ' +
      'dem praktischen Hinweis, die Zahlen von heute, dann was ansteht - hoechstens ' +
      'fuenf kurze Saetze. Zum Schluss EIN Satz dazu, was ich zuerst anpacken soll. ' +
      'Wenn eine Quelle nicht erreichbar war, sag das in drei Worten, statt zu raten.'
  },
  {
    name: 'feierabend',
    hoert: /^(feierabend|was hab(e)? ich heute (gemacht|geschafft)|tagesabschluss|was war heute)\b/i,
    prompt: 'Fuehre aus: node {{tagesbericht}} abend - das listet, was heute ueber den ' +
      'Assistenten lief, was abgehakt wurde und welche Diktate entstanden sind. ' +
      'Fasse daraus in drei Saetzen zusammen, was ich heute geschafft habe, ' +
      'gesprochen. Wenn etwas davon abrechenbar aussieht (Kundenarbeit), sag es ' +
      'in einem Satz dazu - ohne zu erfinden, was nicht dasteht.'
  },
  {
    name: 'agentur',
    hoert: /^(agentur|wie geht'?s der agentur|kundenampel|wer ist rot|welche reports fehlen|meine kunden)\b/i,
    prompt: 'Fuehre aus: node {{agentur}} - das liefert Kundenampel, fehlende Reports ' +
      'und den Stand der Neukunden-Pipeline. Lies das Wichtigste vor: hoechstens drei ' +
      'Saetze, gesprochen. Steht ein Kunde auf Rot, sag WARUM und was der naechste ' +
      'Schritt waere. Erzeuge KEINE Reports von dir aus - das kostet Geld und dauert; ' +
      'frag vorher.'
  },
  {
    name: 'beweis',
    hoert: /^(beweis|beweis.?zettel|was hat (mein|das) geld gebracht|was hat es gebracht|kundennutzen|monatsnachweis)\b/i,
    prompt: 'Fuehre aus: node {{beweis}} - das zeigt fuer jeden Kunden, was der ' +
      'Telefon-Retter und die Sichtbarkeit im letzten Monat gebracht haben. ' +
      'Sag mir gesprochen in zwei Saetzen, bei welchem Kunden die Zahlen am besten ' +
      'aussehen (den zeigt man beim naechsten Verkaufsgespraech) und bei welchem ' +
      'sie duenn sind (da droht die Kuendigung). Soll ich die Blaetter erzeugen, ' +
      'frag vorher - das schreibt Dateien.'
  },
  {
    name: 'saison',
    hoert: /^(saison|was kommt saisonal|was muss ich jetzt verkaufen|was steht saisonal an|gr(ue|ü)nkohl)\b/i,
    prompt: 'Fuehre aus: node {{saison}}. Das rechnet rueckwaerts - nicht wann ein Anlass ' +
      'ist, sondern ab wann man darueber reden muss. Sag mir gesprochen in zwei Saetzen, ' +
      'was jetzt dran ist und bei WELCHEN meiner Kunden sich das lohnt (nutz dafuer ' +
      'node {{agentur}} kunden). Kein Kalender-Vorlesen.'
  },
  {
    name: 'markt',
    hoert: /^(markt|wie sieht der markt aus|wen soll ich anrufen|wen rufe ich an|neukunden|wo lohnt sich (der )?telefon.?retter|welche kunden)\b/i,
    prompt: 'Fuehre aus: node {{markt}} und node {{markt}} anrufe. Das erste zeigt den ' +
      'Markt nach Segmenten (KMI = passt zu Kiek mol in, Tel = passt zum Telefon-Retter, ' +
      'je 0 bis 3), das zweite die naechsten Anrufe mit Nummer. ' +
      'Sag mir gesprochen in drei Saetzen: wo die groesste Luft ist und wen ich als ' +
      'Erstes anrufen soll - mit Name und Ort. Keine Liste vorlesen.'
  },
  {
    name: 'offene posten',
    hoert: /^(offene posten|offene rechnungen|was ist noch offen|wer schuldet mir)\b/i,
    prompt: 'Nutze kurani-docs: welche Rechnungen sind noch unbezahlt? ' +
      'Nenne Betrag, Kunde und wie lange sie schon offen sind. Kurz, gesprochen.'
  },
  {
    name: 'was steht an',
    hoert: /^(was steht.{0,25}an|was ist heute|was mache ich heute|naechste aufgabe|nächste aufgabe)\b/i,
    prompt: 'Nutze kurani-roadmap: was ist diese Woche dran und was ist der naechste konkrete Schritt? ' +
      'Antworte in zwei Saetzen, gesprochen.'
  },
  {
    name: 'instagram',
    hoert: /^(instagram|wie lief das (letzte )?reel|wie laufen die reels|zahlen von instagram)\b/i,
    prompt: 'Wie lief der letzte Instagram-Beitrag? Nutze das Instagram-Werkzeug, ' +
      'nenne Aufrufe, Likes und Kommentare, und sag in einem Satz, was das bedeutet.'
  }
];

// Passt der Satz auf einen Schnellbefehl? Dann den ausformulierten Auftrag
// zurueckgeben, sonst null (dann geht der Satz so wie er ist an Claude).
//
// pfade fuellt Platzhalter wie {{tagesbericht}} mit dem echten Pfad des
// Werkzeugs - der haengt davon ab, wo das Repository liegt.
function schnellbefehl(text, liste, pfade) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const b of (liste || SCHNELLBEFEHLE)) {
    const muster = b.hoert instanceof RegExp ? b.hoert : new RegExp(b.hoert, 'i');
    if (!muster.test(t)) continue;
    let prompt = b.prompt;
    for (const [name, pfad] of Object.entries(pfade || {})) {
      prompt = prompt.split('{{' + name + '}}').join(pfad);
    }
    // Was Ibo woertlich gesagt hat, bleibt dabei - sonst geht der Zusatz
    // verloren ("Tagesbericht, aber ohne Instagram").
    return { name: b.name, prompt: prompt + '\n\nGesagt hat er: "' + t + '"' };
  }
  return null;
}

// ------------------------------------------------------------ Auftrag -----

// Der Satz, der Claude Code zum SPRACH-Assistenten macht. Ohne ihn bekommt
// man Bildschirm-Antworten mit Listen und Code - vorgelesen unbrauchbar.
const HALTUNG = [
  'Du bist der Sprach-Assistent von Ibo (Kurani Design, Ostfriesland).',
  'Deine Antwort wird VORGELESEN. Also: hoechstens 3 kurze Saetze, keine',
  'Listen, keine Ueberschriften, kein Code, keine Dateipfade, keine Emojis.',
  'Sprich Ibo mit "du" an, wie ein Kollege - ruhig und ohne Floskeln.',
  'Wenn du etwas erledigt hast, sag in einem Satz WAS du getan hast',
  '(z.B. "Rechnung liegt im Buero-Ordner").',
  'Wenn dir eine Angabe fehlt, stell GENAU EINE kurze Rueckfrage.',
  'Bei riskanten Schritten (loeschen, veroeffentlichen, Geld) erst fragen.',
  'Lange Ergebnisse gehoeren in eine Datei - vorgelesen wird nur das Fazit.'
].join(' ');

function systemZusatz(extra) {
  return extra ? HALTUNG + ' ' + extra : HALTUNG;
}

// Sicherheitsstufen: was darf der Assistent auf dem Rechner anfassen?
//
//   reden    nur lesen und antworten - aendert NIE etwas
//   arbeiten darf Dateien schreiben und Befehle ausfuehren, aber die
//            gefaehrlichen sind gesperrt (loeschen, sudo, git push, ...)
//   frei     alles, ohne Sperren
//
// Wichtig: 'verboten' hat IMMER Vorrang vor 'erlaubt' - und auch vor dem,
// was in Ibos eigener Claude-Konfiguration schon freigegeben ist. Nur so
// bleibt "Nur reden" wirklich lesend, egal wie der Rechner eingerichtet ist.
//
// Der Anschnallgurt ersetzt kein Urteilsvermoegen: wer "frei" schaltet,
// gibt einer Stimme die Rechte seiner Tastatur.
const GEFAEHRLICH = [
  'Bash(rm:*)', 'Bash(rmdir:*)', 'Bash(sudo:*)', 'Bash(dd:*)', 'Bash(mkfs:*)',
  'Bash(shutdown:*)', 'Bash(reboot:*)', 'Bash(git push:*)', 'Bash(npm publish:*)'
];

const STUFEN = {
  reden: {
    titel: 'Nur reden',
    permissionMode: 'manual',
    erlaubt: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Skill'],
    verboten: ['Bash', 'Edit', 'Write', 'NotebookEdit', 'Task', 'KillShell']
  },
  arbeiten: {
    titel: 'Arbeiten',
    permissionMode: 'acceptEdits',
    // Bash ausdruecklich erlauben: sonst haengt es davon ab, was in der
    // persoenlichen Konfiguration steht - und Rechnungen (.docx), Videos
    // (ffmpeg) oder ein "git status" brauchen die Kommandozeile.
    erlaubt: ['Bash'],
    verboten: GEFAEHRLICH
  },
  frei: {
    titel: 'Freie Hand',
    permissionMode: 'bypassPermissions',
    erlaubt: null,
    verboten: null
  }
};

function stufeAufloesen(wunsch, freieHandErlaubt) {
  const s = STUFEN[wunsch] ? wunsch : 'arbeiten';
  if (s === 'frei' && !freieHandErlaubt) return 'arbeiten';
  return s;
}

module.exports = {
  steuerwort, waehleOrdner, ladeOrdnerKonfig, standardKonfig, pfadAusfuellen,
  systemZusatz, HALTUNG, STUFEN, stufeAufloesen,
  weckwortTreffer, schnellbefehl, SCHNELLBEFEHLE,
  direktBefehl, DIREKT, istHintergrund, willBildschirm,
  willUebergeben, uebergabeAuftrag
};
