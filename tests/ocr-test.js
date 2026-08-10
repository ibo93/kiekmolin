// Testet die OCR-Vorstufe von menu-scan.js ohne echte API-Aufrufe.
var PATH = '/home/user/kiekmolin/netlify/functions/menu-scan.js';
var sse = require('./lib/sse').sseAntwort;
var calls, prompts;

function mk(scenario) {
  return async function (url, opts) {
    var u = String(url);
    var body = JSON.parse(opts.body);
    if (u.indexOf('vision.googleapis.com') >= 0) {
      calls.push('vision');
      if (scenario.vision === 'denied') return { ok: false, status: 403, text: async () => 'API not enabled' };
      if (scenario.vision === 'apierror') return { ok: true, json: async () => ({ responses: [{ error: { message: 'Bad image' } }] }) };
      return { ok: true, json: async () => ({ responses: [{ fullTextAnnotation: { text: 'PIZZA SALAMI 9,50\nCOLA 0,3l 2,80' } }] }) };
    }
    calls.push('claude');
    // Der Prompt steht jetzt NACH dem Bild (damit das Bild zwischengespeichert
    // werden kann). Deshalb alle Textblöcke zusammenziehen statt content[0].
    prompts.push(body.messages[0].content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
    return sse('{"items":[{"name":"Pizza Salami","price":9.5,"category":"Pizza"}]}');
  };
}

async function run(label, env, scenario, check, zusatz) {
  ['GEMINI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_VISION_API_KEY','MENU_SCAN_PROVIDER'].forEach(k => delete process.env[k]);
  Object.keys(env).forEach(k => process.env[k] = env[k]);
  delete require.cache[require.resolve(PATH)];
  delete require.cache[require.resolve('/home/user/kiekmolin/netlify/functions/lib/scan-kern.js')];
  var h = require(PATH).handler;
  calls = []; prompts = [];
  global.fetch = mk(scenario);
  var anfrage = Object.assign({ images: ['data:image/jpeg;base64,QUJD'] }, zusatz || {});
  var r = await h({ httpMethod: 'POST', body: JSON.stringify(anfrage) });
  var res = check({ calls: calls, prompts: prompts, body: JSON.parse(r.body) });
  console.log((res === true ? 'OK  ' : 'FAIL') + ' | ' + label + (res === true ? '' : ' -> ' + res) + '\n       Aufrufe: ' + calls.join(','));
  return res === true;
}

(async function () {
  var all = true;

  all &= await run('eigener Vision-Key: OCR laeuft, Text landet im Prompt',
    { ANTHROPIC_API_KEY: 'a', GOOGLE_VISION_API_KEY: 'v' }, { vision: 'ok' },
    r => r.calls.join(',') !== 'vision,claude' ? 'falsche Reihenfolge: ' + r.calls.join(',')
       : r.prompts[0].indexOf('PIZZA SALAMI 9,50') < 0 ? 'OCR-Text fehlt im Prompt'
       : r.prompts[0].indexOf('OCR-TEXT') < 0 ? 'OCR-Abschnitt nicht markiert'
       : r.body.ok !== true ? 'Scan fehlgeschlagen' : true);

  all &= await run('kein eigener Vision-Key: Gemini-Key wird fuer die OCR probiert',
    { ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }, { vision: 'ok' },
    r => r.calls.join(',') === 'vision,claude' ? true : 'OCR wurde nicht versucht: ' + r.calls.join(','));

  all &= await run('Vision 403 (API nicht aktiviert): Scan laeuft trotzdem durch',
    { ANTHROPIC_API_KEY: 'a', GOOGLE_VISION_API_KEY: 'v' }, { vision: 'denied' },
    r => r.body.ok !== true ? 'Scan gekippt statt weiterzulaufen'
       : r.prompts[0].indexOf('OCR-TEXT') >= 0 ? 'leerer OCR-Block trotzdem angehaengt' : true);

  all &= await run('Vision meldet Bildfehler: Scan laeuft trotzdem durch',
    { ANTHROPIC_API_KEY: 'a', GOOGLE_VISION_API_KEY: 'v' }, { vision: 'apierror' },
    r => r.body.ok === true && r.prompts[0].indexOf('OCR-TEXT') < 0 ? true : 'nicht sauber uebersprungen');

  all &= await run('ohne OCR bleibt der Prompt exakt wie vorher',
    { ANTHROPIC_API_KEY: 'a', GOOGLE_VISION_API_KEY: 'v' }, { vision: 'denied' },
    r => /Speisekarten-Parser[\s\S]*letzte Spalte\/Seite erfasst hast\.$/.test(r.prompts[0].trim()) ? true : 'Prompt veraendert');

  // Neu: die OCR darf das Zeitbudget nicht auffressen und läuft nur in Runde 1.
  all &= await run('Fortsetzung ruft die OCR NICHT erneut auf',
    { ANTHROPIC_API_KEY: 'a', GOOGLE_VISION_API_KEY: 'v' }, { vision: 'ok' },
    r => r.calls.indexOf('vision') < 0 ? true : 'OCR lief in der Fortsetzung: ' + r.calls.join(','),
    { weiter: { anzahl: 5, letzte: ['Pizza Salami'], kategorie: 'Pizza' } });

  console.log(all ? '\nAlle Tests bestanden.' : '\nFEHLER.');
  process.exit(all ? 0 : 1);
})();
