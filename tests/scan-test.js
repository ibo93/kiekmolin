// Testet Anbieter-Reihenfolge und Anfrage-Format von menu-scan.js ohne echte API-Aufrufe.
var PATH = '/home/user/kiekmolin/netlify/functions/menu-scan.js';
var calls, bodies;

function mk(sc) {
  return async function (url, opts) {
    var u = String(url), b = JSON.parse(opts.body);
    if (u.indexOf('vision.googleapis') >= 0) { calls.push('ocr'); return { ok: false, status: 403, text: async () => 'off' }; }
    var who = u.indexOf('anthropic') >= 0 ? 'claude' : 'gemini';
    calls.push(who); bodies.push({ who: who, body: b });
    var mode = sc[who];
    if (mode === 'error') return { ok: false, status: 429, text: async () => 'quota' };
    var out = mode === 'empty' ? '{"items":[]}' : '{"items":[{"name":"Pizza","price":9.5,"category":"Pizza"}]}';
    if (who === 'claude') return { ok: true, json: async () => ({ content: [{ text: out }] }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: out }] } }] }) };
  };
}

async function run(label, env, sc, check) {
  ['GEMINI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_VISION_API_KEY','MENU_SCAN_PROVIDER'].forEach(k => delete process.env[k]);
  Object.keys(env).forEach(k => process.env[k] = env[k]);
  delete require.cache[require.resolve(PATH)];
  var h = require(PATH).handler;
  calls = []; bodies = [];
  global.fetch = mk(sc);
  var r = await h({ httpMethod: 'POST', body: JSON.stringify({ text: 'Pizza 9,50' }) });
  var res = check({ calls: calls.filter(c => c !== 'ocr'), bodies: bodies, body: JSON.parse(r.body) });
  console.log((res === true ? 'OK  ' : 'FAIL') + ' | ' + label + (res === true ? '' : '  -> ' + res));
  return res === true;
}

var BOTH = { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
var order = e => r => r.calls.join(',') === e ? true : 'Aufrufe: ' + r.calls.join(',') + ' (erwartet ' + e + ')';

(async function () {
  var all = true;
  all &= await run('Claude liefert -> genau ein Aufruf', BOTH, { claude: 'good' }, order('claude'));
  all &= await run('Gemini wird NIE gerufen, auch wenn der Schluessel da ist',
    BOTH, { claude: 'good' }, r => r.calls.indexOf('gemini') < 0 ? true : 'Gemini wurde gerufen');
  all &= await run('leeres Ergebnis -> zweiter Versuch bei Claude',
    BOTH, { claude: 'empty' }, order('claude,claude'));
  all &= await run('Ausfall -> ehrlicher Fehler statt stillem Ausweichen',
    BOTH, { claude: 'error' }, r => r.body.ok === false && r.calls.indexOf('gemini') < 0
      ? true : 'ok=' + r.body.ok + ' Aufrufe=' + r.calls.join(','));
  all &= await run('ohne ANTHROPIC_API_KEY: klare Ansage',
    { GEMINI_API_KEY: 'g' }, {}, r => r.body.ok === false && /ANTHROPIC_API_KEY/.test(r.body.error || '')
      ? true : JSON.stringify(r.body));

  // Das eigentliche Bugfix: Anfrage-Format an Claude
  all &= await run('Claude-Anfrage: kein temperature (sonst HTTP 400)', BOTH, { claude: 'good' },
    r => 'temperature' in r.bodies[0].body ? 'temperature wird immer noch gesendet'
       : 'top_p' in r.bodies[0].body || 'top_k' in r.bodies[0].body ? 'top_p/top_k gesendet' : true);
  all &= await run('Claude-Anfrage: Denkschritte aus (kein Budget-Klau)', BOTH, { claude: 'good' },
    r => (r.bodies[0].body.thinking || {}).type === 'disabled' ? true : 'thinking nicht disabled');
  all &= await run('Claude-Anfrage: Modell + Token-Budget', BOTH, { claude: 'good' },
    r => r.bodies[0].body.model !== 'claude-sonnet-5' ? 'falsches Modell: ' + r.bodies[0].body.model
       : r.bodies[0].body.max_tokens !== 32000 ? 'max_tokens ' + r.bodies[0].body.max_tokens : true);

  console.log(all ? '\nAlle Tests bestanden.' : '\nFEHLER.');
  process.exit(all ? 0 : 1);
})();
