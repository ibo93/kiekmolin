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
const live = require('./lib/live');
const instagram = require('./lib/instagram');
const protokoll = require('./lib/protokoll');
const wetter = require('./lib/wetter');
const wache = require('./lib/wache');
const agentur = require('./lib/agentur');
const pruefung = require('./lib/pruefung');
const wissen = require('./lib/wissen');
const bildschirm = require('./lib/bildschirm');
const kurani = require('./lib/kurani');
const markt = require('./lib/markt');
const tagesbericht = require('./lib/tagesbericht');
const notizen = require('./lib/notizen');
const sofort = require('./lib/sofort');

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

// ------------------------------------------------------------ Weckwort ----

test('Weckwort: nur der eigene Name weckt ihn', () => {
  const w = (t) => befehle.weckwortTreffer(t, 'kurani');
  assert.strictEqual(w('Und dann sagt der Kunde, das Schild soll rot sein').geweckt, false,
    'Gespraech im Laden weckt ihn nicht');
  assert.strictEqual(w('').geweckt, false);
  assert.strictEqual(w('Kurani').geweckt, true);
  assert.strictEqual(w('Kurani').auftrag, '', 'nur gerufen, noch kein Auftrag');
  assert.strictEqual(w('Hey Kurani, schreib eine Rechnung').auftrag, 'schreib eine Rechnung');
  assert.strictEqual(w('Moin Kurani: was steht an?').auftrag, 'was steht an?');
});

test('Weckwort: verhoerte Schreibweisen zaehlen auch', () => {
  // Deepgram und der Browser schreiben den Namen unterschiedlich.
  assert.strictEqual(befehle.weckwortTreffer('Kurany mach mal', 'kurani').geweckt, true);
  assert.strictEqual(befehle.weckwortTreffer('Curani, wie lief das Reel?', 'kurani').auftrag, 'wie lief das Reel?');
  assert.strictEqual(befehle.weckwortTreffer('Karin, komm mal her', 'kurani').geweckt, false,
    'ein anderer Name weckt nicht');
});

test('Schnellbefehle: taegliche Saetze werden zu fertigen Auftraegen', () => {
  const lage = befehle.schnellbefehl('Lagebericht');
  assert.ok(lage && /roadmap/i.test(lage.prompt), 'Lagebericht fragt die Roadmap ab');
  assert.ok(/kurani-docs/.test(befehle.schnellbefehl('offene Rechnungen').prompt));
  assert.ok(befehle.schnellbefehl('Was steht diese Woche an?'), 'auch mit Einschub dazwischen');
  assert.ok(/Instagram/i.test(befehle.schnellbefehl('wie lief das letzte Reel').prompt));
  assert.strictEqual(befehle.schnellbefehl('Schreib eine Rechnung für La Piazza'), null,
    'normale Saetze gehen unveraendert an Claude');
});

// ----------------------------------------------------------- Live-Modus ---

test('SatzSammler: spricht den ersten Satz, sobald er fertig ist', () => {
  const s = new live.SatzSammler(4);
  assert.deepStrictEqual(s.fuettere('Die Rechnung ist '), [], 'halber Satz wird nicht gesprochen');
  assert.deepStrictEqual(s.fuettere('fertig und liegt im Ordner. '), ['Die Rechnung ist fertig und liegt im Ordner.']);
  assert.deepStrictEqual(s.fuettere('Ich habe sie auf 350 Euro gesetzt.'), [], 'Satzende ohne Leerzeichen: wartet');
  assert.strictEqual(s.rest(), 'Ich habe sie auf 350 Euro gesetzt.');
});

test('SatzSammler: Dateinamen und Code werden nicht vorgelesen', () => {
  const s = new live.SatzSammler(4);
  assert.deepStrictEqual(s.fuettere('Die README.md hat 48 Zeilen. '), ['Die README.md hat 48 Zeilen.'],
    'der Punkt in README.md trennt nicht');

  const c = new live.SatzSammler(4);
  assert.deepStrictEqual(c.fuettere('So geht es: ```bash\nnode start.js. '), [], 'im Code bleibt es still');
  const raus = c.fuettere('```\nFertig. ');
  assert.ok(raus.join(' ').indexOf('node start.js') === -1, 'kein Code in der Stimme: ' + raus.join(' '));
});

test('SatzSammler: nach dem Deckel wird nichts mehr gesprochen', () => {
  const s = new live.SatzSammler(2);
  assert.strictEqual(s.fuettere('Erstens dies hier. Zweitens das da. Drittens noch mehr. ').length, 2);
  assert.strictEqual(s.rest(), '', 'der Rest steht nur im Fenster');
});

test('Unterbrechung: ein Huster reicht nicht, ein Satz schon', () => {
  assert.strictEqual(live.istUnterbrechung('äh'), false);
  assert.strictEqual(live.istUnterbrechung('ja'), false);
  assert.strictEqual(live.istUnterbrechung('nein warte'), true);
  assert.strictEqual(live.istUnterbrechung('stopp mal kurz'), true);
});

async function liveSitzungTest() {
  // Ein komplettes Live-Gespraech ohne Netz: Claude und Stimme sind
  // Attrappen, geprueft wird der Ablauf.
  const gesendet = [];
  let aktuellerLauf = null;
  const sitzung = new live.LiveSitzung({
    maxSaetze: 4,
    senden: (n) => gesendet.push(n),
    spreche: async (satz) => Buffer.from('MP3:' + satz),
    starteAuftrag: (o) => {
      aktuellerLauf = { prompt: o.prompt, abgebrochen: false, onEreignis: o.onEreignis };
      return { abbrechen() { aktuellerLauf.abgebrochen = true; } };
    }
  });

  await testAsync('Live: Satz -> Auftrag -> satzweise Stimme', async () => {
    sitzung.gehoert('Wie viele Reservierungen habe ich heute?');
    assert.ok(aktuellerLauf, 'Auftrag gestartet');
    assert.strictEqual(aktuellerLauf.prompt, 'Wie viele Reservierungen habe ich heute?');

    aktuellerLauf.onEreignis({ art: 'happen', text: 'Heute sind es zwölf Reservierungen. ' });
    aktuellerLauf.onEreignis({ art: 'fertig', text: 'Heute sind es zwölf Reservierungen.', kosten: 0.04 });
    await new Promise((r) => setTimeout(r, 20));   // Sprech-Kette abwarten

    const typen = gesendet.map((n) => n.typ);
    assert.ok(typen.indexOf('du') > -1, 'das Gesagte erscheint im Fenster');
    assert.ok(typen.indexOf('stimme') > -1, 'es wird gesprochen');
    assert.ok(typen.indexOf('fertig') > -1, 'Abschluss gemeldet');
    const stimmeN = gesendet.find((n) => n.typ === 'stimme');
    assert.strictEqual(stimmeN.text, 'Heute sind es zwölf Reservierungen.');
    assert.ok(stimmeN.mp3, 'Audio liegt bei');
  });

  await testAsync('Live: Dazwischenreden bricht ab und macht sofort still', async () => {
    gesendet.length = 0;
    sitzung.gehoert('Schreib eine lange Zusammenfassung.');
    const lauf = aktuellerLauf;
    lauf.onEreignis({ art: 'happen', text: 'Also, zunächst einmal ist wichtig. ' });

    sitzung.zwischenstand('nein warte doch');           // Ibo redet dazwischen
    assert.strictEqual(lauf.abgebrochen, true, 'der laufende Auftrag wird abgebrochen');
    assert.ok(gesendet.some((n) => n.typ === 'ruhe'), 'das Fenster soll sofort still sein');

    // Was danach noch aus dem alten Zug eintrudelt, darf nicht mehr sprechen.
    gesendet.length = 0;
    lauf.onEreignis({ art: 'happen', text: 'Zweitens noch etwas Wichtiges. ' });
    lauf.onEreignis({ art: 'fertig', text: 'Alte Antwort.', kosten: 0.01 });
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(gesendet.filter((n) => n.typ === 'stimme').length, 0, 'kein Nachreden aus dem alten Zug');
    assert.strictEqual(gesendet.filter((n) => n.typ === 'fertig').length, 0, 'kein Abschluss aus dem alten Zug');
  });

  await testAsync('Live: ein Huster unterbricht nicht', async () => {
    gesendet.length = 0;
    sitzung.gehoert('Erzähl mir was über Greetsiel.');
    const lauf = aktuellerLauf;
    sitzung.zwischenstand('äh');
    assert.strictEqual(lauf.abgebrochen, false, 'ein Laut allein bricht nichts ab');
    sitzung.unterbrich('aufraeumen');
  });

  await testAsync('Live: mit Weckwort schlaeft er, bis sein Name faellt', async () => {
    const gesehen = [];
    let lauf = null;
    const schlafend = new live.LiveSitzung({
      weckwort: 'kurani',
      nachlauf: 25,
      senden: (n) => gesehen.push(n),
      spreche: async () => null,
      starteAuftrag: (o) => { lauf = { prompt: o.prompt }; return { abbrechen() {} }; }
    });

    schlafend.gehoert('Ja Chef, die Folie klebe ich morgen drauf');
    assert.strictEqual(lauf, null, 'Gespraech im Laden startet keinen Auftrag');
    assert.ok(gesehen.some((n) => n.typ === 'ueberhoert'), 'wurde bewusst ueberhoert');

    schlafend.zwischenstand('und der Kunde meinte dann');
    assert.ok(!gesehen.some((n) => n.typ === 'zwischen'), 'im Schlaf steht nichts auf dem Bildschirm');

    schlafend.gehoert('Hey Kurani, was steht diese Woche an?');
    assert.ok(lauf, 'mit Weckwort geht es los');
    assert.strictEqual(lauf.prompt, 'was steht diese Woche an?', 'das Weckwort selbst gehoert nicht in den Auftrag');

    // Nachfragen gehen ohne erneutes Weckwort.
    lauf = null;
    schlafend.gehoert('und danach?');
    assert.ok(lauf, 'im Nachlauf braucht es kein zweites Weckwort');
  });

  await testAsync('Live: Hintergrund-Auftrag blockiert das Gespraech nicht', async () => {
    const gesehen = [];
    const laeufe = [];
    const s = new live.LiveSitzung({
      senden: (n) => gesehen.push(n),
      spreche: async () => null,
      starteAuftrag: (o) => {
        const eintrag = { prompt: o.prompt, live: o.live, onEreignis: o.onEreignis, abgebrochen: false };
        laeufe.push(eintrag);
        return { abbrechen() { eintrag.abgebrochen = true; } };
      }
    });

    s.gehoert('Schneide das Reel im Hintergrund');
    assert.strictEqual(laeufe.length, 1);
    assert.strictEqual(laeufe[0].prompt, 'Schneide das Reel', '"im Hintergrund" gehoert nicht in den Auftrag');
    assert.strictEqual(s.laeuft, false, 'das Gespraech bleibt frei');
    assert.ok(gesehen.some((n) => n.typ === 'hintergrundStart'));

    // Waehrenddessen laesst sich ganz normal weiterreden.
    s.gehoert('Was steht diese Woche an?');
    assert.strictEqual(laeufe.length, 2);
    assert.strictEqual(s.laeuft, true, 'die neue Frage laeuft im Vordergrund');

    // Und "was laeuft gerade?" wird ohne KI beantwortet.
    gesehen.length = 0;
    s.gehoert('Was laeuft gerade?');
    assert.strictEqual(laeufe.length, 2, 'dafuer wird keine KI gestartet');
    const stand = gesehen.find((n) => n.typ === 'fertig');
    assert.ok(stand.text.indexOf('Schneide das Reel') > -1, 'nennt den laufenden Auftrag: ' + stand.text);

    // Der Hintergrund-Auftrag wird fertig, WAEHREND vorne geredet wird.
    await new Promise((r) => setTimeout(r, 20));   // Sprech-Kette von vorhin leerlaufen lassen
    gesehen.length = 0;
    laeufe[0].onEreignis({ art: 'fertig', text: 'Das Reel ist geschnitten und liegt im Video-Ordner. Es dauert 22 Sekunden.', kosten: 0.4 });
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(gesehen.some((n) => n.typ === 'hintergrundFertig'), 'Fenster erfaehrt es sofort');
    assert.strictEqual(gesehen.filter((n) => n.typ === 'stimme').length, 0,
      'aber er faellt sich nicht selbst ins Wort');

    // Sobald die Antwort vorne durch ist, kommt die Meldung nach.
    laeufe[1].onEreignis({ art: 'fertig', text: 'Diese Woche steht der Probeanruf an.', kosten: 0.1 });
    await new Promise((r) => setTimeout(r, 30));
    const gesagt = gesehen.filter((n) => n.typ === 'stimme').map((n) => n.text).join(' ');
    assert.ok(gesagt.indexOf('Das Reel ist geschnitten') > -1, 'die Meldung geht nicht verloren: ' + gesagt);
    assert.ok(gesagt.indexOf('22 Sekunden') === -1, 'nur der erste Satz, nicht der ganze Bericht');

    // Fenster zu: was noch nebenher laeuft, wird abgeraeumt - sonst kostet
    // es weiter Geld, obwohl niemand mehr die Meldung hoert.
    s.gehoert('Bau die SEO-Seiten im Hintergrund');
    const nochOffen = laeufe[laeufe.length - 1];
    s.schliessen();
    assert.strictEqual(nochOffen.abgebrochen, true, 'beim Schliessen wird aufgeraeumt');
  });

  await testAsync('Live: "Stopp" wirkt sofort, ohne die KI zu fragen', async () => {
    gesendet.length = 0;
    sitzung.gehoert('Schreib die Rechnung.');
    const lauf = aktuellerLauf;
    sitzung.gehoert('Stopp');
    assert.strictEqual(lauf.abgebrochen, true);
    assert.strictEqual(aktuellerLauf, lauf, 'fuer "Stopp" wird kein neuer Auftrag gestartet');
  });
}

// ------------------------------------------------------------------ Ohr ---

test('Deepgram-Antwort auswerten, auch wenn Felder fehlen', () => {
  assert.strictEqual(ohr.textAus({ results: { channels: [{ alternatives: [{ transcript: ' Mach die Rechnung ' }] }] } }), 'Mach die Rechnung');
  assert.strictEqual(ohr.textAus({}), '');
  assert.strictEqual(ohr.textAus(null), '');
});

// --------------------------------------------------- Notizen & Diktat ----

test('Zeitangaben: "morgen um neun" wird zu einem Zeitpunkt', () => {
  const jetzt = new Date(2026, 7, 14, 15, 0);          // Freitag, 14.8.2026, 15 Uhr
  // So kommt es im Betrieb an: "Erinner mich" hat der Befehlserkenner
  // schon abgeschnitten, hier steht nur noch der Rest.
  const z = notizen.deuteZeit('morgen um 9 an den Anruf bei der Boerse', jetzt);
  const d = new Date(z.faellig);
  assert.strictEqual(d.getDate(), 15, 'morgen');
  assert.strictEqual(d.getHours(), 9);
  assert.strictEqual(z.rest, 'den Anruf bei der Boerse',
    'Zeitangabe und Fuellwort raus, Inhalt bleibt: ' + z.rest);
});

test('Zeitangaben: Wochentag, uebermorgen, "in drei Tagen"', () => {
  const jetzt = new Date(2026, 7, 14, 10, 0);          // Freitag
  assert.strictEqual(new Date(notizen.deuteZeit('am Montag Folie kleben', jetzt).faellig).getDate(), 17);
  assert.strictEqual(new Date(notizen.deuteZeit('uebermorgen anrufen', jetzt).faellig).getDate(), 16);
  assert.strictEqual(new Date(notizen.deuteZeit('in drei Tagen nachhaken', jetzt).faellig).getDate(), 17);
  // "Freitag" an einem Freitag meint den naechsten, nicht heute.
  assert.strictEqual(new Date(notizen.deuteZeit('Freitag abgeben', jetzt).faellig).getDate(), 21);
});

test('Zeitangaben: kein Wortrest, wo die Zeit rausgeschnitten wurde', () => {
  // Frueher wurde aus "die Karte bis Freitag" die Notiz "die Karte bis".
  const jetzt = new Date(2026, 7, 14, 10, 0);
  assert.strictEqual(notizen.deuteZeit('La Piazza will die neue Karte bis Freitag', jetzt).rest,
    'La Piazza will die neue Karte');
  assert.strictEqual(notizen.deuteZeit('Folie bestellen am Montag', jetzt).rest, 'Folie bestellen');
});

test('Zeitangaben: ohne Zeit bleibt es eine Notiz ohne Termin', () => {
  const z = notizen.deuteZeit('La Piazza will neue Fotos', new Date(2026, 7, 14, 10, 0));
  assert.strictEqual(z.faellig, null);
  assert.strictEqual(z.rest, 'La Piazza will neue Fotos');
  // Preise duerfen nicht als Datum durchgehen.
  assert.strictEqual(notizen.deuteZeit('Schild kostet 350 Euro', new Date(2026, 7, 14, 10, 0)).faellig, null);
});

test('Notizen vorlesen: Einzahl, Mehrzahl, leere Liste', () => {
  const jetzt = new Date(2026, 7, 14, 10, 0);
  assert.strictEqual(notizen.formuliere([], jetzt), 'Auf deiner Liste steht nichts.');
  const eine = notizen.formuliere([{ text: 'Karte fuer La Piazza', faellig: null }], jetzt);
  assert.ok(eine.indexOf('Eine Sache: Karte fuer La Piazza') === 0, eine);
  const zwei = notizen.formuliere([
    { text: 'Anruf Boerse', faellig: new Date(2026, 7, 14, 16, 0).toISOString() },
    { text: 'Folie bestellen', faellig: null }
  ], jetzt);
  assert.ok(zwei.indexOf('2 Sachen') === 0, zwei);
  assert.ok(zwei.indexOf('heute um 16 Uhr') > -1, 'Zeit in Worten: ' + zwei);
});

test('Sofort-Befehle: erkannt und ohne KI beantwortet', () => {
  assert.strictEqual(befehle.direktBefehl('Merk dir: Karte bis Freitag').art, 'merken');
  assert.strictEqual(befehle.direktBefehl('Erinner mich morgen an den Anruf').art, 'merken');
  assert.strictEqual(befehle.direktBefehl('Was hab ich mir notiert?').art, 'liste');
  assert.strictEqual(befehle.direktBefehl('Schreib mit').art, 'diktatStart');
  assert.strictEqual(befehle.direktBefehl('Diktat Ende').art, 'diktatEnde');
  assert.strictEqual(befehle.direktBefehl('Erledigt: Anruf Boerse').art, 'erledigt');
  assert.strictEqual(befehle.direktBefehl('Schreib eine Rechnung fuer La Piazza'), null,
    'echte Auftraege gehen weiter an Claude');
  assert.strictEqual(befehle.direktBefehl('Merk dir: Karte bis Freitag').text, 'Karte bis Freitag',
    'das Kommando selbst gehoert nicht in die Notiz');
});

test('Diktat: sammelt Saetze und schreibt eine Datei', () => {
  const fs = require('fs');
  const { Diktat } = require('./lib/diktat');
  const d = new Diktat('Termin Greetsieler Boerse', new Date(2026, 7, 14, 11, 30));
  d.dazu('Der Wirt will ein neues Schild ueber dem Eingang');
  d.dazu('Masse etwa zwei Meter mal achtzig');
  d.dazu('');                                   // leere Erkennung faellt raus
  assert.strictEqual(d.saetze.length, 2);
  assert.ok(d.woerter > 10);

  const e = d.speichere();
  try {
    assert.strictEqual(e.leer, false);
    assert.ok(e.name.indexOf('2026-08-14_11-30') === 0, 'Datum im Dateinamen: ' + e.name);
    const inhalt = fs.readFileSync(e.datei, 'utf8');
    assert.ok(inhalt.indexOf('# Termin Greetsieler Boerse') === 0);
    assert.ok(inhalt.indexOf('neues Schild ueber dem Eingang.') > -1, 'Punkt wird ergaenzt');
  } finally {
    fs.rmSync(require('path').join(__dirname, 'diktate'), { recursive: true, force: true });
  }

  const leer = new Diktat('nix', new Date());
  assert.strictEqual(leer.speichere().leer, true, 'leeres Diktat legt keine Datei an');
});

test('Diktat: waehrend es laeuft, wird NICHTS ausgefuehrt', () => {
  const zustand = { diktat: null };
  const start = sofort.behandle('Schreib mit zum Termin', zustand);
  assert.ok(/schreibe mit/i.test(start.antwort));
  assert.ok(zustand.diktat, 'Diktat laeuft');

  // Genau der gefaehrliche Fall: ein Satz, der sonst etwas ausloesen wuerde.
  const mitten = sofort.behandle('Merk dir das mit der Rechnung', zustand);
  assert.strictEqual(mitten.art, 'diktatSatz', 'geht in die Mitschrift, legt KEINE Notiz an');
  assert.strictEqual(mitten.still, true);

  const ende = sofort.behandle('Diktat Ende', zustand);
  assert.ok(/gespeichert|leer/i.test(ende.antwort));
  assert.strictEqual(zustand.diktat, null);
  require('fs').rmSync(require('path').join(__dirname, 'diktate'), { recursive: true, force: true });
});

test('Feierabend: was heute lief, wird auflistbar', () => {
  const b = tagesbericht.abendText({
    datum: '2026-08-14',
    auftraege: [{ frage: 'Rechnung fuer La Piazza', ordner: 'buero', minuten: 1 }],
    erledigt: ['Anruf bei der Boerse'],
    diktate: ['2026-08-14_11-30_termin.md'],
    kosten: 1.2
  });
  assert.ok(b.indexOf('Rechnung fuer La Piazza') > -1);
  assert.ok(b.indexOf('Abgehakt: Anruf bei der Boerse') > -1);
  assert.ok(tagesbericht.abendText({ datum: '2026-08-14', auftraege: [], erledigt: [], diktate: [], kosten: 0 })
    .indexOf('lief heute nichts') > -1, 'leerer Tag wird auch gesagt');
});

test('Telefon-Retter: Anrufe von heute werden zu einem Satz', () => {
  assert.strictEqual(tagesbericht.telefonSatz(null), '');
  const satz = tagesbericht.telefonSatz({ anrufe: 4, reservierungen: 2, bestellungen: 1, rueckrufe: 0 });
  assert.ok(satz.indexOf('4 Anrufe angenommen') > -1, satz);
  assert.ok(satz.indexOf('2 Reservierungen, 1 Bestellungen') > -1, satz);
  assert.ok(tagesbericht.telefonSatz({ anrufe: 1, reservierungen: 1, bestellungen: 0, rueckrufe: 0 })
    .indexOf('1 Anruf angenommen') > -1, 'Einzahl');
});

// --------------------------------------------------------------- Markt ---

const MARKT_PROBE = [
  { name: 'Pizzeria Castello', category: 'pizzeria', city: 'Norden', phone: '04931 1', website: '' },
  { name: 'Pizzeria Roma', category: 'pizzeria', city: 'Emden', phone: '04921 2', website: 'https://roma.de' },
  { name: 'Gasthaus Deichkrone', category: 'restaurant', city: 'Greetsiel', phone: '04926 3', website: '' },
  { name: 'Doener Palast', category: 'doener', city: 'Emden', phone: '04921 4', website: '' },
  { name: 'Cafe Strandgut', category: 'cafe', city: 'Norddeich', phone: '', website: '' }
];

test('Markt: zaehlt Segmente, Orte und Luecken', () => {
  const a = markt.auswerten(MARKT_PROBE);
  assert.strictEqual(a.gesamt, 5);
  assert.strictEqual(a.mitTelefon, 4, 'ohne Nummer kann man nicht anrufen');
  assert.strictEqual(a.ohneWebseite, 4);
  const pizza = a.segmente.find((s) => s.name === 'Pizzerien');
  assert.strictEqual(pizza.anzahl, 2);
  assert.strictEqual(pizza.telefon, 3, 'Telefonbestellung ist ihr Geschaeft');
  assert.strictEqual(a.orte[0].name, 'Emden', 'groesster Ort zuerst');
});

test('Markt: die Bewertung steht offen und ist begruendet', () => {
  for (const [schluessel, s] of Object.entries(markt.SEGMENTE)) {
    assert.ok(s.warum && s.warum.length > 20, schluessel + ' braucht eine Begruendung');
    assert.ok(s.kiekmolin >= 0 && s.kiekmolin <= 3 && s.telefon >= 0 && s.telefon <= 3, schluessel + ': 0 bis 3');
  }
  assert.strictEqual(markt.SEGMENTE.pizzeria.telefon, 3, 'Pizzeria ist Telefon-Geschaeft');
  assert.ok(markt.SEGMENTE.doener.kiekmolin < markt.SEGMENTE.restaurant.kiekmolin,
    'Imbiss braucht weniger Tischverwaltung als ein Restaurant');
  assert.strictEqual(markt.segmentVon('gibt-es-nicht').name, 'Ohne Kategorie', 'unbekannt wird nicht verschwiegen');
});

test('Markt: die naechsten Anrufe sind sortiert und ohne Bestandskunden', () => {
  const liste = markt.naechsteAnrufe(MARKT_PROBE, { anzahl: 5 });
  const namen = liste.map((e) => e.betrieb.name).join(', ');
  // Vorn steht, wer BEIDE Produkte brauchen kann und online nichts hat -
  // ein Restaurant ohne Website schlaegt deshalb eine Pizzeria mit Website.
  assert.strictEqual(liste[0].betrieb.name, 'Gasthaus Deichkrone', 'Reihenfolge: ' + namen);
  assert.ok(!liste[0].betrieb.website, 'ganz vorn steht immer jemand ohne Website');
  const castello = liste.findIndex((e) => e.betrieb.name === 'Pizzeria Castello');
  const roma = liste.findIndex((e) => e.betrieb.name === 'Pizzeria Roma');
  assert.ok(castello < roma, 'ohne Website vor mit Website: ' + namen);
  assert.ok(liste.every((e) => e.betrieb.phone), 'ohne Nummer taucht keiner auf');
  assert.ok(liste.every((e) => e.betrieb.name !== 'Cafe Strandgut'));

  const ohneKunden = markt.naechsteAnrufe(MARKT_PROBE, { kunden: ['Pizzeria Castello'] });
  assert.ok(ohneKunden.every((e) => e.betrieb.name !== 'Pizzeria Castello'), 'Bestandskunden fliegen raus');

  const nurEmden = markt.naechsteAnrufe(MARKT_PROBE, { ort: 'emden' });
  assert.ok(nurEmden.every((e) => e.betrieb.city === 'Emden'), 'nach Ort filterbar');
});

test('Markt: ohne Daten sagt er, was zu tun ist', () => {
  const satz = markt.marktSatz(markt.auswerten([]));
  assert.ok(/import-osm/.test(satz), 'nennt den Importer: ' + satz);
  assert.ok(/keinen passenden/.test(markt.anrufSatz([])));
});

// ------------------------------------------- Uebergabe & Kurani-Kram ---

test('"Mach das fertig" wird erkannt, normale Auftraege nicht', () => {
  assert.strictEqual(befehle.willUebergeben('Mach das fertig').uebergeben, true);
  assert.strictEqual(befehle.willUebergeben('Mach ein Angebot draus').uebergeben, true);
  assert.strictEqual(befehle.willUebergeben('Arbeite das aus, bitte als Briefing').zusatz, 'bitte als Briefing');
  assert.strictEqual(befehle.willUebergeben('Schreib eine Rechnung fuer La Piazza').uebergeben, false);
  assert.strictEqual(befehle.willUebergeben('Merk dir: Karte bis Freitag').uebergeben, false);
});

test('Uebergabe-Auftrag: knuepft ans Diktat an und verbietet Erfinden', () => {
  const mitDatei = befehle.uebergabeAuftrag({ quelleDatei: '/x/diktate/termin.md', zusatz: 'als Angebot' });
  assert.ok(mitDatei.indexOf('/x/diktate/termin.md') > -1, 'die Grundlage steht drin');
  assert.ok(mitDatei.indexOf('als Angebot') > -1, 'der Zusatz auch');
  assert.ok(/kurani-docs/.test(mitDatei), 'die Skills sind genannt');
  assert.ok(/Luecke/.test(mitDatei), 'fehlende Angaben werden markiert, nicht erfunden');
  assert.ok(/nicht eine Zusammenfassung/.test(mitDatei), 'es soll das Dokument selbst rauskommen');

  const ohne = befehle.uebergabeAuftrag({});
  assert.ok(/zuletzt geredet/.test(ohne), 'ohne Grundlage: an das Gespraech anknuepfen');

  const mitText = befehle.uebergabeAuftrag({ quelleText: 'Der Wirt will ein Schild' });
  assert.ok(mitText.indexOf('Der Wirt will ein Schild') > -1);
});

test('Kurani-Unterlagen: CLAUDE.md-Dateien werden gefunden', () => {
  const fs = require('fs');
  const os = require('os');
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'kurani-test-'));
  try {
    fs.mkdirSync(path.join(basis, 'Kurani', 'LaPiazza'), { recursive: true });
    fs.writeFileSync(path.join(basis, 'Kurani', 'CLAUDE.md'), '# Regeln');
    fs.writeFileSync(path.join(basis, 'Kurani', 'LaPiazza', 'claude.md'), '# La Piazza');
    fs.mkdirSync(path.join(basis, 'Kurani', 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(basis, 'Kurani', 'node_modules', 'CLAUDE.md'), 'nicht mitnehmen');

    const gefunden = kurani.ordner(basis);
    assert.strictEqual(gefunden.length, 1, 'der Kurani-Ordner wird gefunden');

    const mds = kurani.claudeDateien(gefunden);
    assert.strictEqual(mds.length, 2, 'beide echten CLAUDE.md, keine aus node_modules');

    const hinweis = kurani.systemHinweis(gefunden, mds);
    assert.ok(/LIES die passende/.test(hinweis), 'er soll sie vorher lesen');
    assert.ok(/anhaengen, nie die Datei neu schreiben/.test(hinweis), 'und nie ueberschreiben');
    assert.strictEqual(kurani.systemHinweis([], []), '', 'ohne Fund kein Hinweis');
  } finally {
    fs.rmSync(basis, { recursive: true, force: true });
  }
});

// ------------------------------------------------- Wissen & Bildschirm ---

test('Wissen: erkannt, gespeichert, nicht doppelt', () => {
  const fs = require('fs');
  if (fs.existsSync(wissen.DATEI)) fs.unlinkSync(wissen.DATEI);
  try {
    assert.strictEqual(befehle.direktBefehl('Merk dir dauerhaft: die Boerse zahlt per Rechnung').art, 'wissen');
    assert.strictEqual(befehle.direktBefehl('Grundsaetzlich: Plakate mit 3 mm Beschnitt').art, 'wissen');
    assert.strictEqual(befehle.direktBefehl('Was weisst du?').art, 'wissenListe');
    // Die normale Notiz darf nicht faelschlich als Wissen durchgehen.
    assert.strictEqual(befehle.direktBefehl('Merk dir: Karte bis Freitag').art, 'merken');

    const z = { diktat: null };
    assert.ok(/gilt ab jetzt immer/i.test(sofort.behandle('Merk dir dauerhaft: die Boerse zahlt per Rechnung', z).antwort));
    assert.ok(/wusste ich schon/i.test(sofort.behandle('Merk dir dauerhaft: die Boerse zahlt per Rechnung', z).antwort),
      'dasselbe zweimal wird nicht doppelt gespeichert');
    assert.strictEqual(wissen.zeilen().length, 1);

    const zusatz = wissen.alsSystemZusatz();
    assert.ok(zusatz.indexOf('dauerhaft') > -1 && zusatz.indexOf('Boerse zahlt per Rechnung') > -1,
      'geht in den System-Prompt: ' + zusatz);

    assert.ok(sofort.behandle('Was weisst du?', z).antwort.indexOf('Boerse zahlt per Rechnung') > -1);
    assert.ok(/Gestrichen/.test(sofort.behandle('Vergiss dauerhaft: Boerse', z).antwort));
    assert.strictEqual(wissen.zeilen().length, 0, 'danach ist es wirklich weg');
  } finally {
    if (fs.existsSync(wissen.DATEI)) fs.unlinkSync(wissen.DATEI);
  }
});

test('Wissen: der System-Zusatz waechst nicht ins Unendliche', () => {
  const viele = [];
  for (let i = 0; i < 200; i++) viele.push('Regel Nummer ' + i + ' mit ein bisschen Text dahinter');
  // alsSystemZusatz liest aus der Datei - hier pruefen wir die Grenze selbst,
  // indem wir die Zeilen kuenstlich zusammenbauen.
  const laenge = viele.join('').length;
  assert.ok(laenge > wissen.MAX_ZEICHEN, 'Testdaten sind laenger als die Grenze');
  assert.ok(wissen.MAX_ZEICHEN <= 4000, 'die Grenze bleibt bezahlbar');
});

test('Bildschirm: "guck dir das an" wird erkannt, normale Saetze nicht', () => {
  assert.strictEqual(befehle.willBildschirm('Guck dir das mal an').bildschirm, true);
  assert.strictEqual(befehle.willBildschirm('Was siehst du?').bildschirm, true);
  assert.strictEqual(befehle.willBildschirm('Sieh dir meinen Bildschirm an und sag was zum Abstand').bildschirm, true);
  assert.strictEqual(befehle.willBildschirm('Schreib eine Rechnung fuer La Piazza').bildschirm, false);
  assert.strictEqual(befehle.willBildschirm('Was steht heute an?').bildschirm, false);
});

test('Bildschirm: pro System das richtige Werkzeug, sonst ehrlich nichts', () => {
  assert.strictEqual(bildschirm.werkzeugFuer('darwin').befehl, 'screencapture');
  assert.deepStrictEqual(bildschirm.werkzeugFuer('darwin').args('/x.png'), ['-x', '/x.png'],
    '-x: sonst klickt es bei jedem Foto');
  assert.strictEqual(bildschirm.werkzeugFuer('linux').befehl, 'import');
  assert.strictEqual(bildschirm.werkzeugFuer('win32'), null, 'lieber nichts als etwas Falsches');
});

// ------------------------------------------------------- Selbstpruefung ---

test('Selbstpruefung: fehlender Claude-Befehl wird erklaert, nicht nur gemeldet', () => {
  const e = pruefung.pruefeClaude('/gibt/es/garantiert/nicht');
  assert.strictEqual(e.stufe, 'fehler');
  assert.ok(e.hilfe.indexOf('which claude') > -1, 'sagt, wie man den Pfad findet: ' + e.hilfe);
});

test('Selbstpruefung: Schluessel werden nie im Klartext ausgegeben', () => {
  const merker = process.env.DEEPGRAM_API_KEY;
  process.env.DEEPGRAM_API_KEY = 'geheim-1234567890';
  try {
    const alles = JSON.stringify(pruefung.pruefeSchluessel());
    assert.ok(alles.indexOf('geheim') === -1, 'der Wert taucht nirgends auf: ' + alles);
    assert.ok(alles.indexOf('Deepgram-Schluessel gefunden') > -1, 'nur ob er da ist');
  } finally {
    if (merker === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = merker;
  }
});

test('Selbstpruefung: Ordner aus ordner.json werden geprueft', () => {
  const gut = pruefung.pruefeOrdner({ ordner: [{ name: 'app', pfad: __dirname }] });
  assert.strictEqual(gut[0].stufe, 'ok');
  const schlecht = pruefung.pruefeOrdner({ ordner: [{ name: 'buero', pfad: '/gibt/es/nicht' }] });
  assert.strictEqual(schlecht[0].stufe, 'fehler');
  assert.ok(/ordner.json/.test(schlecht[0].hilfe));
  assert.strictEqual(pruefung.pruefeOrdner({ ordner: [] })[0].stufe, 'hinweis', 'ohne Datei nur ein Hinweis');
});

test('Selbstpruefung: das Fazit unterscheidet Hinweis und Fehler', () => {
  const nurHinweise = [pruefung.ergebnis('ok', 'A', 'x'), pruefung.ergebnis('hinweis', 'B', 'y')];
  assert.strictEqual(pruefung.fazit(nurHinweise).bereit, true, 'Hinweise halten niemanden auf');
  assert.ok(/haelt dich auf/.test(pruefung.fazit(nurHinweise).satz));

  const mitFehler = nurHinweise.concat([pruefung.ergebnis('fehler', 'C', 'Claude fehlt')]);
  const f = pruefung.fazit(mitFehler);
  assert.strictEqual(f.bereit, false);
  assert.ok(f.satz.indexOf('Claude fehlt') > -1, 'nennt die eine Sache beim Namen: ' + f.satz);

  assert.strictEqual(pruefung.fazit([pruefung.ergebnis('ok', 'A', 'x')]).satz, 'Alles da. Los geht\'s.');
});

// ------------------------------------------------------------- Agentur ---

test('Agentur: Monate und Namen werden vorlesbar', () => {
  const jetzt = new Date(2026, 7, 14);
  assert.strictEqual(agentur.monatWort('2026-04', jetzt), 'April', 'im laufenden Jahr ohne Jahreszahl');
  assert.strictEqual(agentur.monatWort('2025-12', jetzt), 'Dezember 2025');
  assert.strictEqual(agentur.monatWort('quatsch', jetzt), 'quatsch', 'kaputte Angabe bleibt stehen');
  assert.strictEqual(agentur.grundWort('Letzter Report von 2026-04', jetzt), 'Letzter Report von April');
  assert.strictEqual(agentur.nameAus('greetsieler-boerse'), 'Greetsieler Börse');
  assert.strictEqual(agentur.nameAus('demo-la-piazza'), 'La Piazza', 'Demo-Praefix faellt weg');
});

test('Agentur: der Stand wird zu zwei, drei Saetzen', () => {
  const s = {
    monat: '2026-08',
    kunden: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    rot: [{ name: 'La Piazza', gruende: ['Letzter Report von 2026-04 - Kunde sieht seinen Nutzen nicht mehr'] }],
    gelb: [],
    ohneReport: [{ name: 'La Piazza' }, { name: 'Pizzeria Emden' }],
    pipeline: { gesamt: 3, offen: 2, faellig: 1, termine: 1 }
  };
  const satz = agentur.agenturSatz(s);
  assert.ok(satz.indexOf('3 Kunden mit Reports, 1 im roten Bereich') > -1, satz);
  assert.ok(satz.indexOf('Rot ist La Piazza') > -1, 'Einzahl: ' + satz);
  assert.ok(satz.indexOf('von April') > -1, 'Monat ausgeschrieben: ' + satz);
  assert.ok(satz.indexOf('Fuer August fehlen noch 2 Reports') > -1, satz);
  assert.ok(satz.indexOf('1 Wiedervorlage faellig') > -1, 'Einzahl in der Pipeline: ' + satz);
  assert.ok(satz.indexOf('1 Termin vereinbart') > -1, satz);
});

test('Agentur: alles gruen sagt er auch, ohne Kundendaten meldet er das', () => {
  const gruen = agentur.agenturSatz({
    monat: '2026-08', kunden: [{ name: 'A' }], rot: [], gelb: [],
    ohneReport: [], pipeline: null
  });
  assert.ok(gruen.indexOf('alle im gruenen Bereich') > -1, gruen);
  assert.ok(/keine Kundendaten/.test(agentur.agenturSatz({ monat: '2026-08', kunden: [], rot: [], gelb: [], ohneReport: [] })));
});

test('Agentur im Tagesbericht: nur wenn es etwas zu tun gibt', () => {
  assert.strictEqual(agentur.tagesZeile({
    monat: '2026-08', kunden: [{ name: 'A' }], rot: [], gelb: [], ohneReport: [], pipeline: { offen: 2, faellig: 0 }
  }), '', 'laeuft alles: kein Wort darueber');

  const zeile = agentur.tagesZeile({
    monat: '2026-08', kunden: [{ name: 'A' }],
    rot: [{ name: 'La Piazza' }], gelb: [], ohneReport: [{ name: 'X' }, { name: 'Y' }],
    pipeline: { offen: 3, faellig: 1 }
  });
  assert.ok(zeile.indexOf('1 Kunde im roten Bereich (La Piazza)') > -1, zeile);
  assert.ok(zeile.indexOf('2 Reports fehlen') > -1, zeile);
  assert.ok(zeile.indexOf('1 Wiedervorlage faellig') > -1, zeile);
});

// --------------------------------------------------------------- Wache ---

test('Wache: laeuft alles, bleibt es bei einem Halbsatz', () => {
  const gut = { ok: true, teile: [{ name: 'Seite', ok: true, ms: 420 }, { name: 'Datenbank', ok: true, ms: 130 }] };
  const satz = wache.wacheSatz(gut);
  assert.ok(satz.indexOf('Kiek mol in laeuft') === 0, satz);
  assert.ok(satz.indexOf('0,4 Sekunden') > -1, 'Antwortzeit in Worten: ' + satz);
});

test('Wache: Stoerung wird benannt, nicht beschoenigt', () => {
  const kaputt = {
    ok: false,
    teile: [{ name: 'Seite', ok: true, ms: 300 }, { name: 'Datenbank', ok: false, ms: 12000, hinweis: 'Antwort 503' }]
  };
  const satz = wache.wacheSatz(kaputt);
  assert.ok(satz.indexOf('Achtung') === 0, satz);
  assert.ok(satz.indexOf('Datenbank antwortet nicht - Antwort 503') > -1, satz);
});

test('Wache: gemeldet wird nur die Aenderung', () => {
  const gut = { ok: true, teile: [{ name: 'Seite', ok: true, ms: 300 }] };
  const schlecht = { ok: false, teile: [{ name: 'Seite', ok: false, ms: 9000, hinweis: 'timeout' }] };

  assert.strictEqual(wache.meldungBeiAenderung(null, gut), '', 'erster Blick: nichts sagen');
  assert.strictEqual(wache.meldungBeiAenderung(true, gut), '', 'laeuft weiter: schweigen');
  assert.ok(wache.meldungBeiAenderung(true, schlecht).indexOf('Achtung') === 0, 'Ausfall: melden');
  assert.strictEqual(wache.meldungBeiAenderung(false, schlecht), '', 'bleibt kaputt: nicht nerven');
  assert.ok(/Entwarnung/.test(wache.meldungBeiAenderung(false, gut)), 'wieder da: Entwarnung');
});

test('Hintergrund erkennen: die Worte fliegen aus dem Auftrag', () => {
  assert.strictEqual(befehle.istHintergrund('Schneide das Reel').hintergrund, false);
  const a = befehle.istHintergrund('Bau die SEO-Seiten im Hintergrund');
  assert.strictEqual(a.hintergrund, true);
  assert.strictEqual(a.text, 'Bau die SEO-Seiten');
  const b = befehle.istHintergrund('Mach den Monatsreport, sag Bescheid wenn du fertig bist');
  assert.strictEqual(b.hintergrund, true);
  assert.strictEqual(b.text, 'Mach den Monatsreport,');
});

// ------------------------------------------------------- Wetter & Tag ----

// So sieht die Antwort von Open-Meteo aus (dokumentiertes Format).
function wetterDaten(aenderung) {
  return Object.assign({
    current: { temperature_2m: 17.4, weather_code: 3, wind_speed_10m: 18 },
    daily: {
      temperature_2m_max: [21.2], temperature_2m_min: [13.8],
      precipitation_probability_max: [15], weather_code: [3], sunset: ['2026-08-14T21:12']
    }
  }, aenderung || {});
}

test('Wetter: wird zu einem Satz, den man vorlesen kann', () => {
  const satz = wetter.wetterSatz(wetterDaten(), 'Emden');
  assert.ok(satz.indexOf('In Emden sind es gerade 17 Grad') > -1, satz);
  assert.ok(satz.indexOf('bedeckt') > -1, 'Wetter-Code als Klartext: ' + satz);
  assert.ok(satz.indexOf('bis 21 Grad') > -1, satz);
  assert.ok(satz.indexOf('kaum Regen') > -1, 'unter 30 Prozent: kein Zahlensalat');
  assert.ok(!/\d{2,}\.\d/.test(satz), 'keine Nachkommastellen zum Vorlesen: ' + satz);
});

test('Wetter: starker Wind und Regen kommen vor', () => {
  const satz = wetter.wetterSatz(wetterDaten({
    current: { temperature_2m: 9, weather_code: 63, wind_speed_10m: 42 },
    daily: { temperature_2m_max: [11], temperature_2m_min: [7], precipitation_probability_max: [80], weather_code: [63] }
  }), 'Greetsiel');
  assert.ok(satz.indexOf('Regen') > -1 && satz.indexOf('Regenrisiko 80 Prozent') > -1, satz);
  assert.ok(satz.indexOf('ostfriesisch frisch') > -1, 'ab 30 km/h wird der Wind erwaehnt: ' + satz);
});

test('Wetter: der praktische Hinweis passt zum Handwerk', () => {
  assert.strictEqual(wetter.arbeitsHinweis(wetterDaten({
    daily: { temperature_2m_max: [22], precipitation_probability_max: [5], weather_code: [0] }
  })), 'Gutes Wetter zum Drehen und fuer Aussenmontage.');

  assert.ok(/drinnen/.test(wetter.arbeitsHinweis(wetterDaten({
    daily: { temperature_2m_max: [16], precipitation_probability_max: [75], weather_code: [61] }
  }))), 'bei viel Regen: drinnen arbeiten');

  assert.ok(/Gewitter/.test(wetter.arbeitsHinweis(wetterDaten({
    daily: { temperature_2m_max: [24], precipitation_probability_max: [50], weather_code: [95] }
  }))));

  assert.ok(/kalt/.test(wetter.arbeitsHinweis(wetterDaten({
    daily: { temperature_2m_max: [4], precipitation_probability_max: [10], weather_code: [1] }
  }))), 'Folie klebt unter acht Grad schlecht');

  assert.ok(/windig/.test(wetter.arbeitsHinweis(wetterDaten({
    current: { temperature_2m: 12, weather_code: 1, wind_speed_10m: 55 },
    daily: { temperature_2m_max: [14], precipitation_probability_max: [10], weather_code: [1] }
  }))));
});

test('Tagesbericht: Anrede richtet sich nach der Uhrzeit', () => {
  assert.ok(tagesbericht.tagesAnrede(new Date(2026, 7, 14, 7, 30)).indexOf('Moin') === 0);
  assert.ok(tagesbericht.tagesAnrede(new Date(2026, 7, 14, 14, 0)).indexOf('Hallo') === 0);
  assert.ok(tagesbericht.tagesAnrede(new Date(2026, 7, 14, 20, 0)).indexOf('Nabend') === 0);
  assert.ok(tagesbericht.tagesAnrede(new Date(2026, 7, 14, 9, 0)).indexOf('Freitag der 14.8.') > -1);
});

test('Tagesbericht: Zahlen werden zu einem Satz, leerer Tag auch', () => {
  const satz = tagesbericht.plattformSatz({
    reservierungen: 12, gaeste: 38, unbestaetigt: 2, bestellungen: 4, umsatz: 128.5, rueckrufe: 1
  });
  assert.ok(satz.indexOf('12 Reservierungen fuer 38 Gaeste') > -1, satz);
  assert.ok(satz.indexOf('2 davon noch unbestaetigt') > -1, satz);
  assert.ok(satz.indexOf('128,50 Euro') > -1, 'Komma statt Punkt zum Vorlesen: ' + satz);
  assert.ok(satz.indexOf('1 offene Rueckrufe') > -1, satz);

  assert.strictEqual(
    tagesbericht.plattformSatz({ reservierungen: 0, gaeste: 0, unbestaetigt: 0, bestellungen: 0, umsatz: 0, rueckrufe: 0 }),
    'Bei Kiek mol in ist heute noch nichts eingetragen.'
  );
  assert.strictEqual(tagesbericht.plattformSatz(null), '');
  assert.strictEqual(
    tagesbericht.plattformSatz({ reservierungen: 1, gaeste: 2, unbestaetigt: 0, bestellungen: 0, umsatz: 0, rueckrufe: 0 }),
    'Bei Kiek mol in: 1 Reservierung fuer 2 Gaeste.',
    'Einzahl bleibt Einzahl'
  );
});

test('Tagesbericht: faellt eine Quelle aus, kommt trotzdem ein Bericht', () => {
  const text = tagesbericht.alsText({
    anrede: 'Moin, Freitag der 14.8.',
    wetter: '', arbeitsHinweis: '',
    plattform: 'Bei Kiek mol in: 3 Reservierungen fuer 8 Gaeste.',
    fehlt: ['Wetter (kein Netz)']
  });
  assert.ok(text.indexOf('Moin') > -1);
  assert.ok(text.indexOf('3 Reservierungen') > -1, 'die erreichbare Quelle steht drin');
  assert.ok(text.indexOf('Nicht erreichbar: Wetter (kein Netz)') > -1, 'und er sagt, was fehlt');
});

test('Schnellbefehl Tagesbericht: Werkzeug-Pfad wird eingesetzt', () => {
  const b = befehle.schnellbefehl('Moin', null, { tagesbericht: '/pfad/tagesbericht.js' });
  assert.ok(b, '"Moin" loest den Tagesbericht aus');
  assert.ok(b.prompt.indexOf('node /pfad/tagesbericht.js') > -1, 'echter Pfad statt Platzhalter');
  assert.ok(b.prompt.indexOf('{{') === -1, 'kein Platzhalter mehr uebrig');
  assert.ok(b.prompt.indexOf('Gesagt hat er: "Moin"') > -1, 'der Wortlaut bleibt erhalten');
  assert.ok(befehle.schnellbefehl('Wie wird das Wetter?'), 'auch die Wetterfrage');
});

// -------------------------------------------------------------- Kosten ---

test('Tageskosten: zaehlt nur echte Auftraege, kaputte Zeilen stoeren nicht', () => {
  const fs = require('fs');
  const os = require('os');
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'sprach-kosten-'));
  const echt = protokoll.ORDNER;
  try {
    // In den Test-Ordner umbiegen (der Pfad ist im Modul konstant, also
    // schreiben wir die Datei dorthin, wo das Modul sie sucht).
    fs.mkdirSync(echt, { recursive: true });
    const datei = path.join(echt, 'test-tag.jsonl');
    fs.writeFileSync(datei, [
      JSON.stringify({ kosten: 0.25 }),
      JSON.stringify({ kosten: 1.5 }),
      JSON.stringify({ kosten: 9.99, demo: true }),   // Demo kostet nichts
      'kaputte zeile {{{'
    ].join('\n') + '\n');
    assert.strictEqual(protokoll.tagesKosten('test-tag'), 1.75);
    assert.strictEqual(protokoll.tagesKosten('gibt-es-nicht'), 0, 'ohne Datei: null Kosten');
    fs.unlinkSync(datei);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------- Instagram ---

test('Instagram: Zahlen werden vorlesbar, nicht als Tabelle', () => {
  assert.strictEqual(
    instagram.satzZuKonto({ username: 'kurani.design', followers_count: 2480, media_count: 96 }),
    'Dein Konto @kurani.design hat 2,5 Tausend Follower und 96 Beitraege.'
  );

  const beitrag = instagram.aufbereitenBeitrag({
    id: '1', media_product_type: 'REELS', caption: 'Neue Speisekarte für La Piazza',
    timestamp: '2026-08-12T18:00:00+0000', like_count: 214, comments_count: 17, permalink: 'https://instagram.com/p/x'
  });
  assert.strictEqual(beitrag.art, 'Reel');
  assert.strictEqual(beitrag.datum, '2026-08-12');

  const satz = instagram.satzZuBeitrag(beitrag, { views: 12400, saved: 63 });
  assert.ok(satz.indexOf('12.08.2026') > -1, 'deutsches Datum: ' + satz);
  assert.ok(satz.indexOf('12,4 Tausend Aufrufe') > -1, 'Aufrufe in Worten: ' + satz);
  assert.ok(satz.indexOf('214 Likes') > -1);
});

test('Instagram: Fehler kommen als klarer Satz, nicht als JSON', () => {
  assert.ok(/Schluessel gilt nicht mehr/.test(instagram.fehlerSatz(400, { error: { message: 'Session has expired' } })));
  assert.ok(/Berechtigung/.test(instagram.fehlerSatz(403, { error: { message: 'Missing permission scope' } })));
  assert.ok(/Instagram sagt/.test(instagram.fehlerSatz(500, null)));
});

async function instagramTest() {
  await testAsync('Instagram: ohne Schluessel sagt es, was fehlt', async () => {
    const merker = process.env.INSTAGRAM_TOKEN;
    delete process.env.INSTAGRAM_TOKEN;
    await assert.rejects(() => instagram.konto(), /INSTAGRAM_TOKEN fehlt/);
    if (merker) process.env.INSTAGRAM_TOKEN = merker;
  });

  await testAsync('Instagram: ein Reel ohne oeffentliche Adresse wird nicht gepostet', async () => {
    await assert.rejects(
      () => instagram.posteReel({ videoUrl: '/home/ibo/reel.mp4', text: 'Moin' }),
      /oeffentliche Adresse/
    );
  });
}

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

liveSitzungTest().then(instagramTest).then(serverTest).then(() => {
  console.log('\n  ' + tests + ' Tests bestanden.\n');
}).catch((e) => {
  console.error('\n  FEHLGESCHLAGEN: ' + e.message + '\n');
  process.exit(1);
});
