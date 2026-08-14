#!/usr/bin/env node
'use strict';

// Tests fuer den Sprachassistenten. Laufen ohne Schluessel, ohne Netz,
// ohne Kosten:   node test.js
//
// Der letzte Test startet den Server im Demo-Modus und schickt einen
// echten Auftrag durch die Leitung - er beweist, dass Ereignisse,
// Ordnerwahl und Sprech-Text zusammenpassen.

const assert = require('assert');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const { sprechbar, entferneMarkdown, werkzeugKlartext } = require('./lib/sprechtext');
const befehle = require('./lib/befehle');
const kopf = require('./lib/kopf');
const ohr = require('./lib/ohr');

let tests = 0;
function test(name, fn) { tests++; fn(); console.log('  ok  ' + name); }
async function testAsync(name, fn) { tests++; await fn(); console.log('  ok  ' + name); }

// ------------------------------------------------------------ Sprechtext --

test('Sprechtext: Markdown, Code und Links verschwinden', () => {
  const roh = [
    '## Fertig',
    '',
    'Die **Rechnung** liegt im Ordner. Siehe [Anleitung](https://kiekmolin.de/x).',
    '',
    '```bash',
    'node kunden-anlegen.js --alles',
    '```',
    '',
    '- Punkt eins',
    '- Punkt zwei'
  ].join('\n');
  const t = entferneMarkdown(roh);
  assert.ok(!/[#*`\[\]]/.test(t), 'keine Markdown-Zeichen mehr: ' + t);
  assert.ok(t.indexOf('node kunden-anlegen') === -1, 'Code wird nie vorgelesen');
  assert.ok(t.indexOf('https') === -1, 'keine URL vorlesen');
  assert.ok(t.indexOf('Rechnung') > -1, 'Inhalt bleibt erhalten');
});

test('Sprechtext: Abkuerzungen und Zeichen werden ausgesprochen', () => {
  const t = entferneMarkdown('Kostet 350 € inkl. MwSt., z.B. für 3 Schilder & Montage.');
  assert.ok(t.indexOf('350 Euro') > -1, 'Euro statt Zeichen: ' + t);
  assert.ok(t.indexOf('Mehrwertsteuer') > -1, 'MwSt. ausgeschrieben: ' + t);
  assert.ok(t.indexOf('zum Beispiel') > -1, 'z.B. ausgeschrieben: ' + t);
  assert.ok(t.indexOf(' und ') > -1, '& wird "und": ' + t);
});

test('Sprechtext: lange Antworten werden auf wenige Saetze gekuerzt', () => {
  const lang = 'Satz eins ist fertig. Satz zwei kommt danach. Satz drei folgt hier. Satz vier steht auch noch. Satz fuenf ist zu viel.';
  const k = sprechbar(lang, { maxSaetze: 2 });
  assert.strictEqual(k.gekuerzt, true, 'als gekuerzt markiert');
  assert.ok(k.text.indexOf('Satz zwei') > -1);
  assert.ok(k.text.indexOf('Satz drei') === -1, 'nach zwei Saetzen Schluss: ' + k.text);

  const kurz = sprechbar('Alles erledigt.', { maxSaetze: 4 });
  assert.strictEqual(kurz.gekuerzt, false, 'kurze Antwort bleibt ganz');
  assert.strictEqual(kurz.text, 'Alles erledigt.');
});

test('Sprechtext: Dateinamen zerreissen den Satz nicht', () => {
  // Frueherer Fehler: "Die README.md hat 47 Zeilen." wurde am Punkt in
  // "README.md" getrennt - vorgelesen wurde nur "md hat 47 Zeilen".
  const k = sprechbar('Die README.md hat 47 Zeilen.');
  assert.strictEqual(k.text, 'Die README.md hat 47 Zeilen.');
  assert.strictEqual(k.gekuerzt, false);
  assert.strictEqual(sprechbar('Das kostet 1.250 Euro netto.').text, 'Das kostet 1.250 Euro netto.');
});

test('Sprechtext: leere Antwort erzeugt keinen Muell', () => {
  assert.deepStrictEqual(sprechbar(''), { text: '', gekuerzt: false });
  assert.deepStrictEqual(sprechbar('```\nnur code\n```'), { text: '', gekuerzt: false });
});

test('Sprechtext: Werkzeuge werden auf Deutsch angesagt', () => {
  assert.strictEqual(werkzeugKlartext('Read', { file_path: '/home/ibo/rechnung.docx' }), 'liest rechnung.docx');
  assert.strictEqual(werkzeugKlartext('Bash', { description: 'Git-Stand prüfen' }), 'fuehrt aus: Git-Stand prüfen');
  assert.strictEqual(werkzeugKlartext('Unbekannt', {}), 'Unbekannt');
});

// -------------------------------------------------------------- Befehle ---

test('Steuerworte wirken sofort und gehen nicht an die KI', () => {
  assert.strictEqual(befehle.steuerwort('Stopp'), 'stopp');
  assert.strictEqual(befehle.steuerwort('hör auf'), 'stopp');
  assert.strictEqual(befehle.steuerwort('neues Thema'), 'neu');
  assert.strictEqual(befehle.steuerwort('ähm'), 'leer');
  assert.strictEqual(befehle.steuerwort(''), 'leer');
  assert.strictEqual(befehle.steuerwort('Schreib eine Rechnung'), null, 'echte Aufgaben laufen durch');
  assert.strictEqual(befehle.steuerwort('Stopp die Bestellung im Dashboard'), 'stopp', 'Satzanfang zaehlt');
});

test('Ordnerwahl: Stichworte entscheiden, ausdrueckliche Ansage gewinnt', () => {
  const konfig = {
    standard: 'app',
    ordner: [
      { name: 'app', pfad: '/repo', stichworte: ['app', 'dashboard', 'reservierung'] },
      { name: 'büro', pfad: '/buero', stichworte: ['rechnung', 'angebot', 'steuer'] },
      { name: 'video', pfad: '/video', stichworte: ['reel', 'schnitt', 'video'] }
    ]
  };
  assert.strictEqual(befehle.waehleOrdner('Schreib eine Rechnung für La Piazza', konfig).name, 'büro');
  assert.strictEqual(befehle.waehleOrdner('Das Dashboard zeigt keine Reservierung', konfig).name, 'app');
  assert.strictEqual(befehle.waehleOrdner('Schneide das Reel zusammen', konfig).name, 'video');
  assert.strictEqual(befehle.waehleOrdner('Wie ist das Wetter', konfig).name, 'app', 'ohne Treffer: Standard');
  assert.strictEqual(befehle.waehleOrdner('Im video: mach mal die Rechnung fertig', konfig).name, 'video', 'Ansage schlaegt Stichwort');
});

test('Ordnerwahl: Stichwort trifft nur ganze Woerter', () => {
  const konfig = { standard: 'buero', ordner: [
    { name: 'app', pfad: '/repo', stichworte: ['app'] },
    { name: 'buero', pfad: '/b', stichworte: ['rechnung'] }
  ] };
  assert.strictEqual(befehle.waehleOrdner('Der Apparat ist kaputt', konfig).name, 'buero', '"app" darf nicht in "Apparat" treffen');
});

test('Sicherheitsstufen: freie Hand nur mit ausdruecklicher Freigabe', () => {
  assert.strictEqual(befehle.stufeAufloesen('frei', false), 'arbeiten', 'ohne Freigabe zurueck auf arbeiten');
  assert.strictEqual(befehle.stufeAufloesen('frei', true), 'frei');
  assert.strictEqual(befehle.stufeAufloesen('quatsch', true), 'arbeiten', 'Unsinn faellt auf arbeiten zurueck');
});

test('"Nur reden" kann nichts kaputt machen', () => {
  const reden = befehle.STUFEN.reden;
  assert.strictEqual(reden.permissionMode, 'manual');
  assert.ok(reden.erlaubt.indexOf('Write') === -1, 'darf nichts schreiben');
  assert.ok(reden.erlaubt.indexOf('Bash') === -1, 'darf keine Befehle ausfuehren');
  // Entscheidend: das VERBOT, denn eine Freigabe kann auch aus Ibos
  // eigener Claude-Konfiguration kommen - Verbote stechen sie.
  ['Bash', 'Edit', 'Write', 'Task'].forEach((w) => {
    assert.ok(reden.verboten.indexOf(w) > -1, w + ' muss verboten sein');
  });
});

test('"Arbeiten" darf werkeln, aber nicht loeschen oder veroeffentlichen', () => {
  const arbeiten = befehle.STUFEN.arbeiten;
  assert.ok(arbeiten.erlaubt.indexOf('Bash') > -1, 'Rechnungen und Videos brauchen die Kommandozeile');
  const verboten = arbeiten.verboten.join(' ');
  ['rm', 'sudo', 'git push', 'mkfs'].forEach((b) => {
    assert.ok(verboten.indexOf('Bash(' + b) > -1, b + ' muss gesperrt sein: ' + verboten);
  });
  assert.strictEqual(befehle.STUFEN.frei.permissionMode, 'bypassPermissions');
});

test('Haltung: der System-Zusatz verlangt kurze, sprechbare Antworten', () => {
  const h = befehle.systemZusatz();
  assert.ok(/vorgelesen/i.test(h));
  assert.ok(/3 kurze Saetze/i.test(h));
  assert.ok(/Rueckfrage/i.test(h));
});

test('Ordner-Pfade: ~ und relative Angaben werden aufgeloest', () => {
  assert.strictEqual(befehle.pfadAusfuellen('.', '/repo'), '/repo');
  assert.strictEqual(befehle.pfadAusfuellen('agentur', '/repo'), '/repo/agentur');
  assert.ok(path.isAbsolute(befehle.pfadAusfuellen('~/Kurani', '/repo')));
});

// ------------------------------------------------------------ Claude-Strom --

test('Strom: Werkzeuge, Text und Ergebnis werden richtig gelesen', () => {
  const z = kopf.neuerZustand();
  const alle = [];
  const lauf = (zeile) => kopf.verarbeiteZeile(zeile, z).forEach((e) => alle.push(e));

  lauf(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc-123', model: 'claude-sonnet-5' }));
  lauf(JSON.stringify({ type: 'assistant', session_id: 'abc-123', message: { content: [
    { type: 'tool_use', name: 'Read', input: { file_path: '/x/rechnung.docx' } }
  ] } }));
  lauf(JSON.stringify({ type: 'assistant', session_id: 'abc-123', message: { content: [
    { type: 'text', text: 'Die Rechnung ist fertig.' }
  ] } }));
  lauf('nicht json - muss ignoriert werden');
  lauf('');
  lauf(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'abc-123', result: 'Die Rechnung liegt im Büro-Ordner.', total_cost_usd: 0.12 }));

  assert.deepStrictEqual(alle.map((e) => e.art), ['start', 'werkzeug', 'text', 'fertig']);
  assert.strictEqual(alle[0].sitzung, 'abc-123', 'Sitzung fuer Rueckfragen gemerkt');
  assert.strictEqual(alle[1].text, 'liest rechnung.docx');
  assert.strictEqual(alle[3].text, 'Die Rechnung liegt im Büro-Ordner.');
  assert.strictEqual(alle[3].kosten, 0.12);
  assert.strictEqual(z.gemeldet, true, 'Ende gemeldet - beim Prozessende nicht doppelt');
});

test('Strom: bei Abbruch bleibt wenigstens der bisherige Text', () => {
  const z = kopf.neuerZustand();
  kopf.verarbeiteZeile(JSON.stringify({ type: 'assistant', session_id: 's1', message: { content: [{ type: 'text', text: 'Ich schaue nach.' }] } }), z);
  const e = kopf.verarbeiteZeile(JSON.stringify({
    type: 'result', session_id: 's1', is_error: true, subtype: 'error_max_budget_usd',
    errors: ['Reached maximum budget ($3)'], total_cost_usd: 3
  }), z);
  assert.strictEqual(e[0].art, 'fertig');
  assert.strictEqual(e[0].text, 'Ich schaue nach.');
  assert.strictEqual(e[0].fehlerText, 'Reached maximum budget ($3)');
});

test('Fehlerzeilen werden auf eine lesbare Zeile eingedampft', () => {
  assert.strictEqual(kopf.kurzerFehler(''), '');
  assert.strictEqual(kopf.kurzerFehler('\nHinweis\nError: keine Berechtigung\n'), 'Error: keine Berechtigung');
  assert.ok(kopf.kurzerFehler('x'.repeat(500)).length <= 200);
});

// ------------------------------------------------------------------ Ohr ---

test('Deepgram-Antwort auswerten, auch wenn Felder fehlen', () => {
  assert.strictEqual(ohr.textAus({ results: { channels: [{ alternatives: [{ transcript: ' Mach die Rechnung ' }] }] } }), 'Mach die Rechnung');
  assert.strictEqual(ohr.textAus({}), '');
  assert.strictEqual(ohr.textAus(null), '');
});

// ------------------------------------------------- Server im Demo-Modus ---

async function serverTest() {
  const port = 3987;
  const kind = spawn(process.execPath, [path.join(__dirname, 'server.js'), '--demo'], {
    env: Object.assign({}, process.env, { SPRACH_PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await new Promise((erfuellt, abgelehnt) => {
      const zeitlimit = setTimeout(() => abgelehnt(new Error('Server startet nicht')), 8000);
      kind.stdout.on('data', (d) => {
        if (d.toString().indexOf('Sprachassistent') > -1) { clearTimeout(zeitlimit); setTimeout(erfuellt, 200); }
      });
    });

    await testAsync('Server: Konfiguration meldet Ohren, Stimme und Ordner', async () => {
      const k = await (await fetch('http://localhost:' + port + '/api/konfig')).json();
      assert.strictEqual(k.demo, true);
      assert.ok(k.ordner.length >= 1, 'mindestens ein Arbeitsordner');
      assert.ok(['browser', 'deepgram'].indexOf(k.hoeren) > -1);
    });

    await testAsync('Server: Auftrag laeuft durch und liefert Sprech-Text', async () => {
      const res = await fetch('http://localhost:' + port + '/api/auftrag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Schreib eine Rechnung für La Piazza über 350 Euro' })
      });
      const roh = await res.text();
      const ereignisse = roh.split('\n\n').filter(Boolean).map((b) => JSON.parse(b.replace('data: ', '')));
      const arten = ereignisse.map((e) => e.art);
      assert.ok(arten.indexOf('angenommen') > -1, 'Auftrag angenommen');
      assert.ok(arten.indexOf('fertig') > -1, 'Auftrag beendet');
      const fertig = ereignisse[ereignisse.length - 1];
      assert.ok(fertig.sprich.length > 0, 'es gibt etwas zu sprechen');
      assert.ok(fertig.sprich.indexOf('*') === -1, 'Sprech-Text ohne Markdown');
    });

    await testAsync('Server: "Stopp" wird sofort beantwortet, ohne KI', async () => {
      const res = await fetch('http://localhost:' + port + '/api/auftrag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Stopp' })
      });
      const roh = await res.text();
      assert.ok(roh.indexOf('Gestoppt') > -1, 'sofortige Antwort: ' + roh);
    });

    await testAsync('Server: fremde Hosts werden abgewiesen (kein Zugriff aus dem Netz)', async () => {
      // Bewusst mit http.request statt fetch: fetch laesst den Host-Header
      // nicht faelschen - genau das muss der Server aber abwehren.
      const status = await new Promise((erfuellt, abgelehnt) => {
        const anfrage = http.request(
          { host: '127.0.0.1', port: port, path: '/api/konfig', headers: { Host: 'boese.example.com' } },
          (a) => { a.resume(); erfuellt(a.statusCode); }
        );
        anfrage.on('error', abgelehnt);
        anfrage.end();
      });
      assert.strictEqual(status, 403);
    });
  } finally {
    kind.kill('SIGTERM');
  }
}

serverTest().then(() => {
  console.log('\n  ' + tests + ' Tests bestanden.\n');
}).catch((e) => {
  console.error('\n  FEHLGESCHLAGEN: ' + e.message + '\n');
  process.exit(1);
});
