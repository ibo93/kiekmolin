#!/usr/bin/env node
'use strict';

// WO GEHT DIE ZEIT HIN?
//
//   node zeitmessung.js
//
// "Zu langsam" ist kein Befund, sondern ein Gefuehl. Dieses Werkzeug
// misst, was zwischen "fertig gesprochen" und "erstes Wort der Antwort"
// wirklich passiert - auf DIESEM Rechner, mit DIESER Konfiguration.
//
// Gemessen werden zwei Wege durch denselben Satz:
//
//   normal   so, wie der Assistent es heute macht. Claude Code laedt
//            dabei Hooks, Plugins, MCP-Server, CLAUDE.md-Dateien und die
//            Skills - alles, was fuer echte Arbeit gebraucht wird.
//   bare     der abgespeckte Weg (--bare): ohne all das. Fuer "Moin" und
//            "was ist mit La Piazza" braucht es keine Skills - da zaehlt
//            nur, dass die Antwort kommt.
//
// Der Unterschied ist der Hebel. Ist bare deutlich schneller, lohnt es
// sich, das Reden davon abzuspalten - genau das, was ein Sprachassistent
// von einer Werkbank unterscheidet.

const { spawn } = require('child_process');
const { ladeEnv } = require('./lib/env');

ladeEnv();

const BEFEHL = process.env.SPRACH_CLAUDE_BEFEHL || 'claude';
const SATZ = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') ||
  'Sag in einem kurzen Satz Moin.';

// Ein Durchlauf. Misst drei Zeitpunkte, die man auch hoert:
//   start    Prozess laeuft los
//   erstes   das erste Zeichen der Antwort (ab hier koennte gesprochen werden)
//   fertig   die Antwort ist vollstaendig
function lauf(name, extraArgs) {
  return new Promise((erfuellt) => {
    const args = ['-p', SATZ, '--output-format', 'stream-json', '--verbose',
      '--include-partial-messages'].concat(extraArgs || []);

    const beginn = Date.now();
    let ersterHappen = null;
    let text = '';
    let fehler = '';

    const kind = spawn(BEFEHL, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let puffer = '';

    kind.stdout.on('data', (t) => {
      puffer += t.toString('utf8');
      const zeilen = puffer.split('\n');
      puffer = zeilen.pop();
      for (const zeile of zeilen) {
        if (!zeile.trim() || zeile.trim()[0] !== '{') continue;
        let d;
        try { d = JSON.parse(zeile); } catch (_e) { continue; }
        if (d.type === 'stream_event' && d.event && d.event.type === 'content_block_delta') {
          const stueck = (d.event.delta || {}).text;
          if (stueck) {
            if (ersterHappen === null) ersterHappen = Date.now() - beginn;
            text += stueck;
          }
        }
        if (d.type === 'result' && typeof d.result === 'string') text = text || d.result;
      }
    });

    kind.stderr.on('data', (t) => { fehler += t.toString('utf8'); });

    kind.on('error', (e) => erfuellt({ name: name, kaputt: e.message }));
    kind.on('close', (code) => erfuellt({
      name: name,
      erstes: ersterHappen,
      fertig: Date.now() - beginn,
      text: text.trim().slice(0, 80),
      kaputt: code !== 0 ? (fehler.trim().split('\n')[0] || 'Abbruch, Code ' + code) : null
    }));
  });
}

function sek(ms) {
  return ms === null || ms === undefined ? '  –   ' : (ms / 1000).toFixed(1).padStart(5) + 's';
}

async function main() {
  console.log('');
  console.log('  WO GEHT DIE ZEIT HIN?');
  console.log('  ------------------------------------------------------------');
  console.log('  Satz: "' + SATZ + '"');
  console.log('  (Jeder Weg wird einmal gemessen. Dauert ein bis zwei Minuten.)');
  console.log('');

  const wege = [
    { name: 'normal (heute)', args: ['--model', 'haiku'] }
  ];

  // --bare geht nur mit API-Schluessel: es faellt bewusst aus der
  // Anmeldung ueber das Abo heraus.
  if (process.env.ANTHROPIC_API_KEY) {
    wege.push({ name: 'bare (ohne Skills)', args: ['--model', 'haiku', '--bare'] });
  }

  const ergebnisse = [];
  for (const weg of wege) {
    process.stdout.write('  ' + weg.name.padEnd(22) + ' laeuft ... ');
    const e = await lauf(weg.name, weg.args);
    ergebnisse.push(e);
    console.log(e.kaputt ? 'geht nicht' : 'fertig');
  }

  console.log('');
  console.log('  Weg                     erstes Wort    komplett');
  console.log('  ------------------------------------------------------------');
  for (const e of ergebnisse) {
    if (e.kaputt) {
      console.log('  ' + e.name.padEnd(22) + '  ' + e.kaputt.slice(0, 40));
      continue;
    }
    console.log('  ' + e.name.padEnd(22) + sek(e.erstes) + '      ' + sek(e.fertig));
  }
  console.log('  ------------------------------------------------------------');

  const gut = ergebnisse.filter((e) => !e.kaputt && e.erstes !== null);
  if (gut.length >= 2) {
    const [normal, bare] = gut;
    const gespart = normal.erstes - bare.erstes;
    console.log('');
    if (gespart > 700) {
      console.log('  Der abgespeckte Weg ist ' + (gespart / 1000).toFixed(1) +
        ' Sekunden frueher am ersten Wort.');
      console.log('  Das ist der Unterschied zwischen "antwortet" und "denkt nach".');
    } else {
      console.log('  Kein nennenswerter Unterschied - die Zeit geht woanders hin.');
      console.log('  Dann liegt es am Modell oder an der Leitung, nicht am Start.');
    }
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.log('');
    console.log('  Nur ein Weg gemessen: fuer den abgespeckten Vergleich braucht es');
    console.log('  einen ANTHROPIC_API_KEY in der .env (--bare kann das Abo nicht nutzen).');
  }

  console.log('');
  console.log('  Zum Vergleich: ChatGPTs Sprachmodus antwortet in etwa einer halben');
  console.log('  Sekunde. Der kann dafuer aber nicht deine Dateien anfassen.');
  console.log('');
}

main().catch((e) => {
  console.error('  Messung fehlgeschlagen: ' + e.message);
  process.exit(1);
});
