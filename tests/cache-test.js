var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
process.env.ANTHROPIC_API_KEY = 'a';
process.env.GOOGLE_VISION_API_KEY = 'v';
var h = require(KMI + '/netlify/functions/menu-scan.js').handler;
var calls = [];
global.fetch = async function (url) {
  if (String(url).indexOf('vision') >= 0) { calls.push('vision'); return { ok: false, status: 403, text: async () => 'PERMISSION_DENIED' }; }
  calls.push('claude');
  return { ok: true, json: async () => ({ content: [{ text: '{"items":[{"name":"X","price":1,"category":"Y"}]}' }] }) };
};
var ev = { httpMethod: 'POST', body: JSON.stringify({ images: ['data:image/jpeg;base64,QUJD'] }) };
(async function () {
  await h(ev); await h(ev); await h(ev);
  var got = calls.join(',');
  var ok = got === 'vision,claude,claude,claude';
  console.log((ok ? 'OK  ' : 'FAIL') + ' | nach 403 wird OCR nicht erneut versucht | ' + got);
  process.exit(ok ? 0 : 1);
})();
