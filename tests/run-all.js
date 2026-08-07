// Fuehrt alle Testdateien aus und fasst zusammen. Exit-Code 1, sobald etwas rot ist.
var cp = require('child_process'), fs = require('fs'), path = require('path');
var dir = __dirname;
var dateien = fs.readdirSync(dir)
    .filter(function (f) { return /-test\.(js|mjs)$/.test(f) || f === 'e2e.js'; })
    .sort();
var ges = 0, fehl = 0;
dateien.forEach(function (f) {
    var out = '';
    try { out = cp.execSync('node ' + JSON.stringify(path.join(dir, f)), { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    var a = (out.match(/^OK  /gm) || []).length;
    var b = (out.match(/^FAIL/gm) || []).length;
    ges += a + b; fehl += b;
    console.log('  ' + f.padEnd(18) + String(a + b).padStart(3) + '  ' + (b ? b + ' ROT' : 'grün'));
    if (b) out.split('\n').filter(function (l) { return l.indexOf('FAIL') === 0; })
              .forEach(function (l) { console.log('       ' + l); });
});
console.log('  ' + '─'.repeat(34));
console.log('  GESAMT: ' + ges + ' Tests, ' + fehl + ' fehlgeschlagen');
process.exit(fehl ? 1 : 0);
