// Führt alle Testdateien aus und fasst zusammen. Exit-Code 1, sobald etwas rot ist.
var cp = require('child_process'), fs = require('fs'), path = require('path');
var dir = __dirname;
var dateien = fs.readdirSync(dir)
    .filter(function (f) { return /-test\.(js|mjs)$/.test(f) || f === 'e2e.js'; })
    .sort();
var ges = 0, fehl = 0;
dateien.forEach(function (f) {
    var out = '', code = 0;
    try { out = cp.execSync('node ' + JSON.stringify(path.join(dir, f)), { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status == null ? 1 : e.status; }
    var a = (out.match(/^OK  /gm) || []).length;
    var b = (out.match(/^FAIL/gm) || []).length;

    // Eine Datei, die gar nicht erst läuft (Tippfehler, Absturz beim Laden),
    // hat früher "0 grün" gemeldet -- also genau wie eine bestandene Datei.
    // Ein Test, der still verschwindet, ist schlimmer als gar keiner: er
    // behauptet Sicherheit, die es nicht gibt. Deshalb zählt das jetzt rot.
    if (!a && !b) {
        fehl++; ges++;
        console.log('  ' + f.padEnd(18) + '  -  ' + 'ABGESTUERZT (kein einziger Test gelaufen)');
        console.log(out.split('\n').slice(0, 6).map(function (l) { return '       ' + l; }).join('\n'));
        return;
    }
    if (code && !b) {                      // Fehlercode ohne FAIL-Zeile
        fehl++; ges++;
        console.log('  ' + f.padEnd(18) + String(a).padStart(3) + '  ABBRUCH nach ' + a + ' Tests (Exit ' + code + ')');
        return;
    }

    ges += a + b; fehl += b;
    console.log('  ' + f.padEnd(18) + String(a + b).padStart(3) + '  ' + (b ? b + ' ROT' : 'grün'));
    if (b) out.split('\n').filter(function (l) { return l.indexOf('FAIL') === 0; })
              .forEach(function (l) { console.log('       ' + l); });
});
console.log('  ' + '─'.repeat(34));
console.log('  GESAMT: ' + ges + ' Tests, ' + fehl + ' fehlgeschlagen');
process.exit(fehl ? 1 : 0);
