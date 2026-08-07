var fs = require('fs');
var html = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi, m, n = 0, bad = 0;
while ((m = re.exec(html))) {
  if (/\bsrc\s*=/.test(m[1])) continue;
  if (/type\s*=\s*["'](?!text\/javascript|module|application\/javascript)/.test(m[1])) continue;
  n++;
  try { new Function(m[2]); }
  catch (e) { bad++; console.log('SYNTAXFEHLER in Block ' + n + ': ' + e.message); }
}
console.log((bad ? 'FEHLER' : 'OK') + ' — ' + n + ' <script>-Bloecke geprueft, ' + bad + ' fehlerhaft');
process.exit(bad ? 1 : 0);
