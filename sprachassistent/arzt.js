#!/usr/bin/env node
'use strict';

// WO KLEMMT ES? — die ganze Kette einmal durchgehen.
//
//   node arzt.js
//
// pruefe.js schaut, ob die Zutaten da sind. Das hier schickt eine echte
// Frage durch den laufenden Server und guckt, wo sie steckenbleibt:
//
//   1. Laeuft ueberhaupt ein Server?
//   2. Antwortet er auf Anfragen?
//   3. Kommt auf eine echte Frage eine echte Antwort - und wie schnell?
//   4. Kann er sprechen?
//
// Am Ende steht EIN Satz, was zu tun ist. Kein Stacktrace.

const http = require('http');
const net = require('net');
const { ladeEnv } = require('./lib/env');

ladeEnv();

const PORT = parseInt(process.env.SPRACH_PORT || '3400', 10);
const FRAGE = process.argv.slice(2).join(' ') || 'Sag einmal kurz Moin.';

function zeichen(ok) { return ok ? ' ok ' : ' !! '; }

function sag(ok, text, hilfe) {
  console.log(' ' + zeichen(ok) + text);
  if (hilfe && !ok) console.log('        -> ' + hilfe);
}

// 1. Horcht jemand auf dem Port?
function laeuft() {
  return new Promise((fertig) => {
    const dose = net.connect({ port: PORT, host: '127.0.0.1' });
    dose.setTimeout(2000);
    dose.on('connect', () => { dose.destroy(); fertig(true); });
    dose.on('error', () => fertig(false));
    dose.on('timeout', () => { dose.destroy(); fertig(false); });
  });
}

function hole(pfad) {
  return new Promise((fertig, daneben) => {
    const anfrage = http.get({ host: '127.0.0.1', port: PORT, path: pfad, timeout: 5000 }, (a) => {
      let roh = '';
      a.on('data', (t) => { roh += t; });
      a.on('end', () => {
        try { fertig(JSON.parse(roh)); } catch (e) { daneben(new Error('Antwort unlesbar')); }
      });
    });
    anfrage.on('error', daneben);
    anfrage.on('timeout', () => { anfrage.destroy(); daneben(new Error('keine Antwort')); });
  });
}

// 3. Eine echte Frage durchschicken und die Ereignisse mitlesen.
function frageDurch(text) {
  return new Promise((fertig) => {
    const koerper = JSON.stringify({ text: text, stufe: 'reden' });
    const beginn = Date.now();
    const gesehen = [];
    let antwort = null;
    let fehler = null;

    const anfrage = http.request({
      host: '127.0.0.1', port: PORT, path: '/api/auftrag', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(koerper) },
      timeout: 90000
    }, (a) => {
      let puffer = '';
      a.on('data', (t) => {
        puffer += t.toString('utf8');
        const bloecke = puffer.split('\n\n');
        puffer = bloecke.pop();
        for (const block of bloecke) {
          const zeile = block.split('\n').find((z) => z.startsWith('data: '));
          if (!zeile) continue;
          let e;
          try { e = JSON.parse(zeile.slice(6)); } catch (_x) { continue; }
          gesehen.push(e.art);
          if (e.art === 'fertig') antwort = e.text;
          if (e.art === 'fehler' || e.art === 'abgebrochen') fehler = e.text;
        }
      });
      a.on('end', () => fertig({ gesehen, antwort, fehler, dauer: Date.now() - beginn }));
    });

    anfrage.on('error', (e) => fertig({ gesehen, antwort, fehler: e.message, dauer: Date.now() - beginn }));
    anfrage.on('timeout', () => {
      anfrage.destroy();
      fertig({ gesehen, antwort, fehler: 'Nach 90 Sekunden kam nichts zurueck', dauer: Date.now() - beginn });
    });
    anfrage.end(koerper);
  });
}

async function main() {
  console.log('');
  console.log('  KURANI · Wo klemmt es?');
  console.log('  ------------------------------------------------');

  // --- 1. Server ------------------------------------------------------------
  if (!(await laeuft())) {
    sag(false, 'Auf Port ' + PORT + ' laeuft kein Server.',
      'In einem Terminal starten und OFFEN lassen:  node server.js');
    console.log('');
    process.exit(1);
  }
  sag(true, 'Server laeuft auf Port ' + PORT);

  // --- 2. Antwortet er? -----------------------------------------------------
  let konfig;
  try {
    konfig = await hole('/api/konfig');
  } catch (e) {
    sag(false, 'Der Server antwortet nicht (' + e.message + ')',
      'Einmal beenden (Strg+C) und neu starten: node server.js');
    console.log('');
    process.exit(1);
  }
  sag(true, 'Server antwortet');
  console.log('        Hoeren: ' + konfig.hoeren + ' · Stimme: ' + (konfig.stimmeName || konfig.stimme) +
    ' · Modell: ' + konfig.modell + ' · Reden: ' + (konfig.plaudern ? 'direkt' : 'ueber Claude Code'));
  if (konfig.demo) sag(false, 'Der Server laeuft im DEMO-Modus - er tut nur so.',
    'Ohne --demo starten:  node server.js');

  // --- 3. Eine echte Frage --------------------------------------------------
  console.log('');
  console.log('  Schicke eine echte Frage durch: "' + FRAGE + '"');
  console.log('  (kann bis zu einer Minute dauern - nicht abbrechen)');
  const lauf = await frageDurch(FRAGE);

  const sekunden = (lauf.dauer / 1000).toFixed(1);

  if (!lauf.gesehen.length) {
    sag(false, 'Der Server hat die Frage nicht einmal angenommen.',
      'Das Fenster im Browser einmal neu laden (Cmd+R) und hier nochmal starten.');
  } else if (lauf.fehler) {
    sag(false, 'Die Frage lief los, kam aber als Fehler zurueck nach ' + sekunden + 's:');
    console.log('        ' + String(lauf.fehler).slice(0, 300));
    if (/claude/i.test(String(lauf.fehler))) {
      console.log('        -> Der Kopf antwortet nicht. Pruefen:  claude --version');
    }
  } else if (!lauf.antwort) {
    sag(false, 'Angenommen, aber keine Antwort nach ' + sekunden + 's.',
      'Meist haengt Claude Code. Pruefen mit: claude -p "sag moin"');
  } else {
    sag(true, 'Antwort nach ' + sekunden + ' Sekunden: "' + lauf.antwort.slice(0, 90) + '"');
    if (lauf.dauer > 8000) {
      console.log('        -> Das ist langsam. Schneller wird es mit einem');
      console.log('           ANTHROPIC_API_KEY in der .env (Reden: direkt).');
    }
  }

  // --- 4. Kann er sprechen? -------------------------------------------------
  console.log('');
  if (konfig.stimme === 'browser') {
    sag(false, 'Es spricht die Browser-Stimme - die klingt blechern und manchmal fremdsprachig.',
      'Eine deutsche nehmen:  node stimmen.js deutsch');
  } else {
    sag(true, 'Stimme: ' + (konfig.stimmeName || konfig.stimme) + ' (ausprobieren: node stimmen.js jetzt)');
  }

  console.log('');
  console.log('  ------------------------------------------------');
  if (lauf.antwort && !lauf.fehler) {
    console.log('  Die Kette steht: Frage rein, Antwort raus.');
    console.log('  Geht es im Browser trotzdem nicht, liegt es am Fenster -');
    console.log('  einmal Cmd+R, und Mikrofon erlauben.');
  } else {
    console.log('  Oben steht, wo es haengt. Das zuerst.');
  }
  console.log('');
}

main().catch((e) => {
  console.error('  Fehlersuche selbst kaputt: ' + e.message);
  process.exit(1);
});
