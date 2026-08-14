'use strict';

// Der Kopf: Claude Code auf DIESEM Rechner, ferngesteuert per Stimme.
//
// Warum nicht direkt die Anthropic-API? Weil Claude Code schon alles kann,
// was Ibo braucht: seine Skills (kurani-docs, menumaker, kiekmolin, ...),
// seine Dateien, git, node, ffmpeg. Der Sprachassistent muss das alles
// nicht nachbauen - er ruft einfach das auf, was ohnehin da ist:
//
//   claude -p "..." --output-format stream-json  (im gewaehlten Ordner)
//
// Die Zeilen, die dabei zurueckkommen, uebersetzen wir in Ereignisse:
// 'werkzeug' (was er gerade tut), 'text' (was er sagt), 'fertig'.

const { spawn } = require('child_process');
const { werkzeugKlartext } = require('./sprechtext');

// ----------------------------------------------------- Strom auswerten ----

function neuerZustand() {
  return { sitzung: null, text: '', modell: null, kosten: 0, fehler: null, gemeldet: false };
}

// Eine Zeile stream-json auswerten. Reine Funktion -> im Test pruefbar.
// Gibt die Ereignisse zurueck, die daraus entstehen.
function verarbeiteZeile(zeile, zustand) {
  const roh = String(zeile || '').trim();
  if (!roh || roh[0] !== '{') return [];

  let d;
  try { d = JSON.parse(roh); } catch (_e) { return []; } // Fortschrittsmuell ignorieren

  const ereignisse = [];
  if (d.session_id && !zustand.sitzung) {
    zustand.sitzung = d.session_id;
    ereignisse.push({ art: 'start', sitzung: d.session_id });
  }

  if (d.type === 'system' && d.subtype === 'init') {
    zustand.modell = d.model || null;
    return ereignisse;
  }

  // Live-Betrieb: einzelne Wortschnipsel, sobald sie entstehen. Damit kann
  // der erste Satz schon gesprochen werden, waehrend der Rest noch kommt.
  if (d.type === 'stream_event' && d.event && d.event.type === 'content_block_delta') {
    const delta = d.event.delta || {};
    if (delta.type === 'text_delta' && delta.text) ereignisse.push({ art: 'happen', text: delta.text });
    return ereignisse;
  }

  if (d.type === 'assistant' && d.message && Array.isArray(d.message.content)) {
    for (const block of d.message.content) {
      if (block.type === 'text' && block.text) {
        zustand.text += (zustand.text ? '\n' : '') + block.text;
        ereignisse.push({ art: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        ereignisse.push({ art: 'werkzeug', text: werkzeugKlartext(block.name, block.input) });
      }
    }
    return ereignisse;
  }

  if (d.type === 'result') {
    // Bei Erfolg steht die Endantwort in d.result; bei Abbruch (Zeitlimit,
    // Budget) haben wir wenigstens den bisher gesammelten Text.
    const text = (typeof d.result === 'string' && d.result.trim()) ? d.result.trim() : zustand.text.trim();
    zustand.kosten = d.total_cost_usd || 0;
    if (d.is_error) {
      zustand.fehler = (d.errors && d.errors[0]) || d.subtype || 'Fehler';
    }
    zustand.gemeldet = true;   // 'fertig' ist raus - beim Prozessende nicht nochmal
    ereignisse.push({
      art: 'fertig',
      text: text,
      sitzung: zustand.sitzung,
      kosten: zustand.kosten,
      modell: zustand.modell,
      fehlerText: zustand.fehler
    });
  }

  return ereignisse;
}

// ------------------------------------------------------ Auftrag starten ----

// optionen:
//   prompt     was Ibo gesagt hat
//   ordner     Arbeitsverzeichnis (dort laufen Skills & Dateien)
//   stufe      Eintrag aus befehle.STUFEN (Rechte)
//   sitzung    Sitzungs-ID zum Weiterreden (null = neues Gespraech)
//   system     Zusatz fuer den System-Prompt (Sprach-Haltung)
//   modell     'sonnet' | 'opus' | ...
//   budget     Kostendeckel in USD pro Auftrag ('' = aus)
//   zeitlimit  Sekunden bis zum Abbruch
//   onEreignis Rueckruf fuer jedes Ereignis
//
// Rueckgabe: { abbrechen() }  - zum Stoppen per "Stopp"-Knopf.
function starteAuftrag(optionen) {
  const o = optionen || {};
  const melde = o.onEreignis || function () {};
  const befehl = process.env.SPRACH_CLAUDE_BEFEHL || 'claude';

  const args = ['-p', o.prompt, '--output-format', 'stream-json', '--verbose'];
  if (o.live) args.push('--include-partial-messages');
  // Zugriff auf weitere Ordner (z.B. das ganze Home-Verzeichnis), damit der
  // Assistent auch Dateien ausserhalb des Arbeitsordners findet.
  for (const extra of (o.zusatzOrdner || [])) args.push('--add-dir', extra);
  if (o.system) args.push('--append-system-prompt', o.system);
  if (o.modell) args.push('--model', o.modell);
  if (o.sitzung) args.push('--resume', o.sitzung);
  if (o.stufe && o.stufe.permissionMode) args.push('--permission-mode', o.stufe.permissionMode);
  if (o.stufe && o.stufe.erlaubt && o.stufe.erlaubt.length) args.push('--allowedTools', o.stufe.erlaubt.join(' '));
  // Verbote zuletzt - sie stechen jede Freigabe (auch die aus Ibos
  // eigener Claude-Konfiguration).
  if (o.stufe && o.stufe.verboten && o.stufe.verboten.length) args.push('--disallowedTools', o.stufe.verboten.join(' '));
  if (o.budget) args.push('--max-budget-usd', String(o.budget));

  const kind = spawn(befehl, args, {
    cwd: o.ordner,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const zustand = neuerZustand();
  let rest = '';
  let fehlerAusgabe = '';
  let beendet = false;

  const zeitlimit = setTimeout(() => {
    if (!beendet) {
      melde({ art: 'werkzeug', text: 'Zeitlimit erreicht - ich breche ab' });
      try { kind.kill('SIGTERM'); } catch (_e) { /* schon weg */ }
    }
  }, (o.zeitlimit || 300) * 1000);

  kind.stdout.on('data', (stueck) => {
    rest += stueck.toString('utf8');
    const zeilen = rest.split('\n');
    rest = zeilen.pop();                       // letzte Zeile ist evtl. halb
    for (const zeile of zeilen) {
      for (const e of verarbeiteZeile(zeile, zustand)) melde(e);
    }
  });

  kind.stderr.on('data', (stueck) => { fehlerAusgabe += stueck.toString('utf8'); });

  kind.on('error', (e) => {
    beendet = true;
    clearTimeout(zeitlimit);
    const hinweis = e.code === 'ENOENT'
      ? 'Ich finde den Befehl "' + befehl + '" nicht. Ist Claude Code installiert?'
      : e.message;
    melde({ art: 'fehler', text: hinweis });
  });

  kind.on('close', (code) => {
    if (beendet) return;
    beendet = true;
    clearTimeout(zeitlimit);
    for (const e of verarbeiteZeile(rest, zustand)) melde(e);   // Rest verarbeiten

    // 'fertig' kam schon ueber das result-Ereignis? Dann sind wir durch.
    if (zustand.gemeldet) return;

    if (zustand.text.trim() || code === 0) {
      zustand.gemeldet = true;
      melde({
        art: 'fertig',
        text: zustand.text.trim() || 'Fertig.',
        sitzung: zustand.sitzung,
        kosten: zustand.kosten,
        modell: zustand.modell,
        fehlerText: zustand.fehler
      });
      return;
    }
    melde({
      art: 'fehler',
      text: kurzerFehler(fehlerAusgabe) || ('Der Auftrag ist abgebrochen (Code ' + code + ').')
    });
  });

  return {
    abbrechen() {
      if (beendet) return;
      beendet = true;
      clearTimeout(zeitlimit);
      try { kind.kill('SIGTERM'); } catch (_e) { /* schon weg */ }
      melde({ art: 'abgebrochen', text: 'Abgebrochen.' });
    }
  };
}

// Aus einer langen stderr-Ausgabe die erste sinnvolle Zeile ziehen.
function kurzerFehler(text) {
  const zeilen = String(text || '').split('\n').map((z) => z.trim()).filter(Boolean);
  if (!zeilen.length) return '';
  const wichtig = zeilen.find((z) => /error|fehler|not found|invalid|denied/i.test(z)) || zeilen[0];
  return wichtig.length > 200 ? wichtig.slice(0, 197) + '...' : wichtig;
}

module.exports = { starteAuftrag, verarbeiteZeile, neuerZustand, kurzerFehler };
