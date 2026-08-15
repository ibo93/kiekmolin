'use strict';

// SELBSTPRUEFUNG — was fehlt, damit es laeuft?
//
// Wenn etwas nicht geht, soll der Assistent selbst sagen was, und zwar in
// einem Satz, den man umsetzen kann ("Claude Code finde ich nicht - trag
// SPRACH_CLAUDE_BEFEHL in die .env ein"). Nicht: ein Stacktrace.
//
// Regel fuer alle Pruefungen hier: NIEMALS Schluessel-Werte ausgeben.
// Nur "gefunden" oder "fehlt". Das Ergebnis landet sonst schnell in einem
// Screenshot.

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFileSync } = require('child_process');

// stufe: 'ok' | 'hinweis' | 'fehler'
function ergebnis(stufe, name, text, hilfe) {
  return { stufe: stufe, name: name, text: text, hilfe: hilfe || '' };
}

function pruefeNode() {
  const version = process.versions.node;
  const gross = parseInt(version.split('.')[0], 10);
  if (gross >= 18) return ergebnis('ok', 'Node', 'Node ' + version);
  return ergebnis('fehler', 'Node', 'Node ' + version + ' ist zu alt',
    'Node 18 oder neuer installieren: nodejs.org');
}

function pruefeClaude(befehl) {
  const cmd = befehl || process.env.SPRACH_CLAUDE_BEFEHL || 'claude';
  try {
    const ausgabe = execFileSync(cmd, ['--version'], { encoding: 'utf8', timeout: 20000 }).trim();
    return ergebnis('ok', 'Claude Code', ausgabe.split('\n')[0]);
  } catch (e) {
    return ergebnis('fehler', 'Claude Code', 'Der Befehl "' + cmd + '" laeuft nicht',
      'Pfad herausfinden mit "which claude" und als SPRACH_CLAUDE_BEFEHL in die .env eintragen.');
  }
}

function pruefeWs(wurzel) {
  const pfad = path.join(wurzel, 'node_modules', 'ws');
  if (fs.existsSync(pfad)) return ergebnis('ok', 'Live-Modus', 'ws ist installiert');
  return ergebnis('hinweis', 'Live-Modus', 'Das Paket ws fehlt - Live-Gespraech geht nicht',
    'Im Ordner sprachassistent einmal "npm install" ausfuehren.');
}

// Schluessel: nur melden OB sie da sind. Nie WAS drinsteht.
function pruefeSchluessel() {
  const liste = [];
  const dg = !!process.env.DEEPGRAM_API_KEY;
  const el = !!process.env.ELEVENLABS_API_KEY && !!(process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID);

  liste.push(dg
    ? ergebnis('ok', 'Zuhoeren', 'Deepgram-Schluessel gefunden')
    : ergebnis('hinweis', 'Zuhoeren', 'Kein Deepgram-Schluessel - der Browser hoert selbst zu',
      'Reicht fuer kurze Saetze in Chrome. Besser mit Schluessel aus telefon-retter/.env.'));

  liste.push(el
    ? ergebnis('ok', 'Stimme', 'ElevenLabs-Schluessel und Stimme gefunden')
    : ergebnis('hinweis', 'Stimme', 'Kein ElevenLabs-Schluessel - die Browser-Stimme spricht',
      'Klingt blechern, kostet aber nichts.'));

  if (process.env.INSTAGRAM_TOKEN) liste.push(ergebnis('ok', 'Instagram', 'Token gefunden'));
  if (process.env.SUPABASE_URL || process.env.SUPABASE_ANON_KEY) {
    liste.push(ergebnis('ok', 'Datenbank', 'Supabase-Zugang gefunden'));
  }
  return liste;
}

// Arbeitsordner aus ordner.json: gibt es die Pfade wirklich?
function pruefeOrdner(konfig) {
  const liste = [];
  for (const o of (konfig && konfig.ordner) || []) {
    if (fs.existsSync(o.pfad)) liste.push(ergebnis('ok', 'Ordner ' + o.name, o.pfad));
    else liste.push(ergebnis('fehler', 'Ordner ' + o.name, 'Gibt es nicht: ' + o.pfad,
      'Pfad in ordner.json anpassen - oder den Eintrag loeschen.'));
  }
  if (!liste.length) liste.push(ergebnis('hinweis', 'Ordner', 'Keine ordner.json - er arbeitet immer im Repository',
    'Vorlage kopieren: cp ordner.json.example ordner.json'));
  return liste;
}

// Das CM: findet er Ibos Kundenverwaltung? Kein Fehler, wenn nicht - aber
// dann soll dastehen, wie man sie ihm zeigt.
function pruefeCrm(quellen, anzahlKunden) {
  const liste = quellen || [];
  const dateien = liste.filter((q) => q.art === 'datei');
  const rest = liste.filter((q) => q.art !== 'datei' && q.art !== 'fehlt');

  if (dateien.length) {
    // anzahlKunden ist die Zahl NACH dem Zusammenfuehren - derselbe Kunde
    // steht oft in zwei Dateien. Ohne die Angabe lieber von Eintraegen
    // sprechen als eine zu hohe Kundenzahl melden.
    const zeilen = dateien.reduce((s, q) => s + (q.anzahl || 0), 0);
    const was = typeof anzahlKunden === 'number' ? anzahlKunden + ' Kunden' : zeilen + ' Eintraege';
    return ergebnis('ok', 'CM', was + ' aus ' + dateien.length +
      (dateien.length === 1 ? ' Datei' : ' Dateien') + ' (' + path.basename(dateien[0].pfad) + ')');
  }
  if (rest.length) {
    return ergebnis('hinweis', 'CM', rest[0].art + ' gefunden: ' + rest[0].pfad,
      'Lesen kann er das nur ueber die Kommandozeile - fuer die Kurzbefehle brauchst du eine Datei oder Adresse.');
  }
  return ergebnis('hinweis', 'CM', 'Deine Kundenverwaltung finde ich nicht',
    'Pfad einmal eintragen: SPRACH_CRM=~/Pfad/zum/CM in die .env. Nachsehen mit "node crm.js quellen".');
}

function pruefeSchreibrecht(wurzel) {
  const ziel = path.join(wurzel, 'protokoll');
  try {
    fs.mkdirSync(ziel, { recursive: true });
    const probe = path.join(ziel, '.schreibprobe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return ergebnis('ok', 'Schreibrechte', 'Mitschrift und Notizen koennen gespeichert werden');
  } catch (e) {
    return ergebnis('fehler', 'Schreibrechte', 'Kann nicht in ' + ziel + ' schreiben', e.message);
  }
}

// Ist der Port frei? Laeuft schon ein Server, ist das kein Fehler - nur
// gut zu wissen ("das Fenster ist vielleicht schon offen").
function pruefePort(port) {
  return new Promise((fertig) => {
    const server = net.createServer();
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        fertig(ergebnis('hinweis', 'Port ' + port, 'Belegt - laeuft der Assistent schon?',
          'Im Browser http://localhost:' + port + ' aufmachen, oder SPRACH_PORT aendern.'));
      } else {
        fertig(ergebnis('fehler', 'Port ' + port, e.message));
      }
    });
    server.once('listening', () => server.close(() => fertig(ergebnis('ok', 'Port ' + port, 'frei'))));
    server.listen(port, '127.0.0.1');
  });
}

// Zaehlt zusammen und sagt in einem Satz, woran man ist.
function fazit(liste) {
  const fehler = liste.filter((e) => e.stufe === 'fehler');
  const hinweise = liste.filter((e) => e.stufe === 'hinweis');
  if (fehler.length) {
    return { bereit: false, satz: fehler.length === 1
      ? 'Eine Sache fehlt noch: ' + fehler[0].text + '.'
      : fehler.length + ' Sachen fehlen noch - siehe oben.' };
  }
  if (hinweise.length) {
    return { bereit: true, satz: 'Laeuft. ' + hinweise.length + ' Hinweis' + (hinweise.length === 1 ? '' : 'e') +
      ' - nichts davon haelt dich auf.' };
  }
  return { bereit: true, satz: 'Alles da. Los geht\'s.' };
}

function zeichen(stufe) {
  return stufe === 'ok' ? ' ok ' : (stufe === 'hinweis' ? ' -- ' : ' !! ');
}

module.exports = { pruefeNode, pruefeClaude, pruefeWs, pruefeSchluessel, pruefeOrdner, pruefeCrm, pruefeSchreibrecht, pruefePort, fazit, zeichen, ergebnis };
