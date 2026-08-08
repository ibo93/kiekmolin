// Anfrage-Format und Verhalten von menu-scan.js -- ohne echte API-Aufrufe.
//
// Der wichtigste Punkt hier ist das ZEITBUDGET. Die Function wird von Netlify
// nach 10 Sekunden abgeschnitten. Wer diese Datei liest: die Tests unten
// pruefen, dass die Function vorher SELBST abbricht und zurueckgibt, was sie
// hat -- statt in das Limit zu laufen. Genau daran ist der Scanner wochenlang
// gescheitert, ohne dass es jemand sehen konnte.
var PATH = '/home/user/kiekmolin/netlify/functions/menu-scan.js';
var L = require('./lib/sse');
var sse = L.sseAntwort, sseG = L.sseGemini;
var calls, bodies, letzteUrl;

function mk(sc) {
  return async function (url, opts) {
    var u = String(url), b = JSON.parse(opts.body);
    if (u.indexOf('vision.googleapis') >= 0) { calls.push('ocr'); return { ok: false, status: 403, text: async () => 'off' }; }
    var who = u.indexOf('anthropic') >= 0 ? 'claude' : 'gemini';
    calls.push(who); bodies.push({ who: who, body: b, signal: opts.signal }); letzteUrl = u;
    var S = who === 'claude' ? sse : sseG;
    var mode = sc[who];
    if (mode === 'error') return { ok: false, status: 500, text: async () => 'kaputt' };
    if (mode === 'limit') return { ok: false, status: 429, text: async () => 'rate limit' };
    if (mode === 'haengt') return S('{"items":[]}', { haengt: true, signal: opts.signal });
    // Erste Stufe ablehnen (wie damals bei temperature) -- die Function muss
    // eine einfachere Konfiguration nehmen statt aufzugeben.
    if (mode === 'ablehnt1' && calls.filter(c => c === 'claude').length === 1) {
      return { ok: false, status: 400, text: async () => 'unexpected field: output_config.effort' };
    }
    if (mode === 'abriss') return S('{"items":[{"name":"Pizza","price":9.5,"category":"Pizza"}]}', { stopReason: 'max_tokens' });
    var out = mode === 'empty' ? '{"items":[]}' : '{"items":[{"name":"Pizza","price":9.5,"category":"Pizza"}]}';
    return S(out);
  };
}

async function run(label, env, sc, check, anfrage) {
  ['GEMINI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_VISION_API_KEY','MENU_SCAN_MS','MENU_SCAN_MODEL','MENU_SCAN_PROVIDER'].forEach(k => delete process.env[k]);
  Object.keys(env).forEach(k => process.env[k] = env[k]);
  delete require.cache[require.resolve(PATH)];
  var h = require(PATH).handler;
  calls = []; bodies = []; letzteUrl = '';
  global.fetch = mk(sc);
  var t0 = Date.now();
  var r = await h({ httpMethod: 'POST', body: JSON.stringify(anfrage || { text: 'Pizza 9,50' }) });
  var res = check({ calls: calls.filter(c => c !== 'ocr'), bodies: bodies, body: JSON.parse(r.body), ms: Date.now() - t0, url: letzteUrl });
  console.log((res === true ? 'OK  ' : 'FAIL') + ' | ' + label + (res === true ? '' : '  -> ' + res));
  return res === true;
}

var BOTH = { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
var NUR_CLAUDE = { ANTHROPIC_API_KEY: 'a' };
var CLAUDE_GEWAEHLT = BOTH;
var order = e => r => r.calls.join(',') === e ? true : 'Aufrufe: ' + r.calls.join(',') + ' (erwartet ' + e + ')';

(async function () {
  var all = true;
  // --- Nur Claude. Google ist raus, aus gemessenem Grund ---
  // Gemini liest Karten gut, aber das kostenlose Kontingent erlaubt 20 Anfragen
  // PRO TAG (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier). Eine
  // echte Pizzeria-Karte braucht zehn bis zwanzig -- ein Scan pro Tag, und der
  // bricht mittendrin ab. Deshalb hier nur noch ein Anbieter.
  all &= await run('Claude liefert -> genau ein Aufruf', BOTH, { claude: 'good' }, order('claude'));
  all &= await run('Gemini wird NIE gerufen, auch wenn der Schluessel da ist',
    BOTH, { claude: 'good' }, r => r.calls.indexOf('gemini') < 0 ? true : 'Gemini wurde gerufen');
  all &= await run('leeres Ergebnis -> zweiter Versuch',
    BOTH, { claude: 'empty' }, order('claude,claude'));
  all &= await run('Ausfall -> ehrlicher Fehler statt stillem Ausweichen',
    BOTH, { claude: 'error' }, r => r.body.ok === false && r.calls.indexOf('gemini') < 0
      ? true : 'ok=' + r.body.ok + ' Aufrufe=' + r.calls.join(','));
  all &= await run('ohne ANTHROPIC_API_KEY: klare Ansage',
    { GEMINI_API_KEY: 'g' }, {}, r => r.body.ok === false && /ANTHROPIC_API_KEY/.test(r.body.error || '')
      ? true : JSON.stringify(r.body));
  all &= await run('429 wird als "kurz warten" gekennzeichnet, nicht als Defekt',
    NUR_CLAUDE, { claude: 'limit' },
    r => r.body.kontingent === true ? true : JSON.stringify(r.body).slice(0, 140));

  // --- Anfrage-Format ---
  all &= await run('Claude: kein temperature/top_p/top_k (sonst HTTP 400)', CLAUDE_GEWAEHLT, { claude: 'good' },
    r => 'temperature' in r.bodies[0].body ? 'temperature wird immer noch gesendet'
       : 'top_p' in r.bodies[0].body || 'top_k' in r.bodies[0].body ? 'top_p/top_k gesendet' : true);
  all &= await run('Claude: Antwort wird als Datenstrom gelesen', CLAUDE_GEWAEHLT, { claude: 'good' },
    r => r.bodies[0].body.stream === true ? true : 'stream fehlt');
  all &= await run('Claude: Nachdenken ist AUS (frisst sonst das Zeitbudget)', CLAUDE_GEWAEHLT, { claude: 'good' },
    r => (r.bodies[0].body.thinking || {}).type === 'disabled' ? true : 'thinking: ' + JSON.stringify(r.bodies[0].body.thinking));
  all &= await run('Modell laesst sich per MENU_SCAN_MODEL setzen',
    { ANTHROPIC_API_KEY: 'a', MENU_SCAN_MODEL: 'claude-haiku-4-5' }, { claude: 'good' },
    r => r.bodies[0].body.model === 'claude-haiku-4-5' ? true : r.bodies[0].body.model);

  // --- Zeitbudget: der eigentliche Fehler, an dem alles haengengeblieben ist ---
  all &= await run('haengender Aufruf wird beim Budget abgebrochen, nicht abgewartet',
    { ANTHROPIC_API_KEY: 'a', MENU_SCAN_MS: '2500' }, { claude: 'haengt' },
    r => r.ms > 5000 ? 'hat ' + r.ms + ' ms gewartet statt abzubrechen'
       : r.body.ok !== false ? 'haette einen Fehler melden muessen'
       : /Zeitlimit/.test(r.body.error || '') ? true : 'Fehlertext: ' + r.body.error);

  all &= await run('Abriss am Token-Limit meldet "nicht fertig" (App fragt weiter)',
    NUR_CLAUDE, { claude: 'abriss' },
    r => r.body.fertig === false ? true : 'fertig=' + r.body.fertig);
  all &= await run('sauber zu Ende gelesen meldet "fertig"',
    NUR_CLAUDE, { claude: 'good' },
    r => r.body.fertig === true ? true : 'fertig=' + r.body.fertig);
  all &= await run('Anker fuer die naechste Runde wird mitgeliefert',
    NUR_CLAUDE, { claude: 'abriss' },
    r => (r.body.letzte || []).length && /Pizza/.test(r.body.letzte.join(',')) && r.body.letzteKategorie === 'Pizza'
      ? true : JSON.stringify({ letzte: r.body.letzte, kat: r.body.letzteKategorie }));

  // --- Fortsetzung ---
  all &= await run('Fortsetzung haengt den Weiter-Hinweis als LETZTEN Block an',
    NUR_CLAUDE, { claude: 'good' },
    r => {
      var c = r.bodies[0].body.messages[0].content;
      var letzt = c[c.length - 1];
      return /FORTSETZUNG DERSELBEN KARTE/.test(letzt.text || '') ? true : 'letzter Block: ' + JSON.stringify(letzt).slice(0, 120);
    },
    { images: ['data:image/jpeg;base64,QUJD'], weiter: { anzahl: 12, letzte: ['Pizza Tonno'], kategorie: 'Pizzen' } });

  all &= await run('Fortsetzung nennt die zuletzt gueltige Ueberschrift',
    NUR_CLAUDE, { claude: 'good' },
    r => {
      var t = r.bodies[0].body.messages[0].content.map(c => c.text || '').join('\n');
      return /Pizza Tonno/.test(t) && /zuletzt gueltige Ueberschrift war "Pizzen"/.test(t)
        ? true : 'Hinweis unvollstaendig';
    },
    { images: ['data:image/jpeg;base64,QUJD'], weiter: { anzahl: 12, letzte: ['Pizza Tonno'], kategorie: 'Pizzen' } });

  all &= await run('Bild steht VOR dem Prompt und wird zwischengespeichert',
    NUR_CLAUDE, { claude: 'good' },
    r => {
      var c = r.bodies[0].body.messages[0].content;
      if (c[0].type !== 'image') return 'erster Block ist ' + c[0].type;
      var fest = c.filter(x => x.cache_control);
      return fest.length === 1 && fest[0].type === 'text' ? true : 'Zwischenspeicher-Marke sitzt falsch';
    },
    { images: ['data:image/jpeg;base64,QUJD'] });

  all &= await run('leere Fortsetzung ist KEIN Fehler (Karte war einfach zu Ende)',
    NUR_CLAUDE, { claude: 'empty' },
    r => r.body.ok === true && r.body.count === 0 ? true : JSON.stringify(r.body).slice(0, 140),
    { images: ['data:image/jpeg;base64,QUJD'], weiter: { anzahl: 30, letzte: ['Tiramisu'], kategorie: 'Desserts' } });

  // --- Konfigurations-Leiter: EIN abgelehntes Feld darf den Scanner nie mehr toeten ---
  all &= await run('abgelehntes Feld -> einfachere Stufe statt Totalausfall',
    NUR_CLAUDE, { claude: 'ablehnt1' },
    r => r.body.ok !== true ? 'Scan gekippt: ' + r.body.error
       : r.calls.length < 2 ? 'keine zweite Stufe versucht'
       : 'effort' in (r.bodies[1].body.output_config || {}) ? 'abgelehntes Feld erneut gesendet' : true,
    { text: 'Pizza 9,50' });

  all &= await run('echte Fehler gehen SOFORT raus (keine sinnlose Leiter)',
    NUR_CLAUDE, { claude: 'error' },
    r => r.calls.length === 1 ? true : r.calls.length + ' Aufrufe statt einem');

  console.log(all ? '\nAlle Tests bestanden.' : '\nFEHLER.');
  process.exit(all ? 0 : 1);
})();
