// The Chef – Live-Voice (ElevenLabs Conversational AI).
// Findet oder erstellt den "The Chef Live"-Agenten und liefert dem Browser
// eine signierte WebSocket-URL. Der ELEVENLABS_API_KEY bleibt serverseitig.
//
// POST { voiceId?: "..." }  ->  { signed_url, agent_id }
//
// Der Agent wird EINMAL angelegt (Name: "The Chef Live") und danach
// wiederverwendet. Optional kann ELEVENLABS_AGENT_ID als Env-Var gesetzt
// werden, dann entfaellt die Suche.

'use strict';

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

var AGENT_NAME = 'The Chef Live';

var CHEF_PROMPT = 'Du bist "The Chef" – der persoenliche KI-Assistent fuer Gastronomen, live im Gespraech. ' +
  'Du sprichst Deutsch, per Du, locker aber kompetent – wie ein erfahrener Kollege in der Kueche. ' +
  'Antworte KURZ (1-3 Saetze), das ist ein gesprochenes Gespraech, kein Aufsatz. ' +
  'Sei handlungsorientiert: sag was zu tun ist. Keine Emojis, keine Aufzaehlungen. ' +
  'Wenn dir Betriebsdaten im Kontext mitgegeben wurden, nutze NUR diese – erfinde keine Bestaende oder Zahlen. ' +
  'Wenn Daten fehlen, sag ehrlich, dass du es nicht weisst.';

function el(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' }, opts.headers || {});
  return fetch('https://api.elevenlabs.io' + path, opts);
}

async function findAgent() {
  var res = await el('/v1/convai/agents?page_size=30');
  if (!res.ok) return null;
  var data = await res.json();
  var list = (data && data.agents) || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === AGENT_NAME) return list[i].agent_id;
  }
  return null;
}

async function createAgent(voiceId) {
  var body = {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        language: 'de',
        first_message: 'Moin Chef, ich bin dran – was brauchst du?',
        prompt: {
          prompt: CHEF_PROMPT,
          llm: 'claude-3-5-sonnet',
          temperature: 0.4
        }
      },
      tts: voiceId ? { voice_id: voiceId } : undefined,
      asr: { quality: 'high' }
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { prompt: { prompt: true }, first_message: true, language: true },
          tts: { voice_id: true }
        }
      }
    }
  };
  var res = await el('/v1/convai/agents/create', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    var t = await res.text();
    // Fallback: manche Felder sind versionsabhaengig – minimal erneut versuchen
    var minimal = {
      name: AGENT_NAME,
      conversation_config: {
        agent: {
          language: 'de',
          first_message: 'Moin Chef, ich bin dran – was brauchst du?',
          prompt: { prompt: CHEF_PROMPT }
        }
      }
    };
    var res2 = await el('/v1/convai/agents/create', { method: 'POST', body: JSON.stringify(minimal) });
    if (!res2.ok) {
      var t2 = await res2.text();
      var e = new Error('Agent-Erstellung fehlgeschlagen: ' + (t2 || t).slice(0, 300));
      e.status = res2.status;
      throw e;
    }
    var d2 = await res2.json();
    return d2.agent_id;
  }
  var d = await res.json();
  return d.agent_id;
}

async function signedUrl(agentId) {
  var res = await el('/v1/convai/conversation/get-signed-url?agent_id=' + encodeURIComponent(agentId));
  if (!res.ok) {
    var t = await res.text();
    var e = new Error('Signed-URL fehlgeschlagen: ' + t.slice(0, 300));
    e.status = res.status;
    throw e;
  }
  var d = await res.json();
  return d.signed_url;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.ELEVENLABS_API_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'ELEVENLABS_API_KEY nicht gesetzt' }) };
  }

  var payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {}

  try {
    var agentId = process.env.ELEVENLABS_AGENT_ID || await findAgent();
    if (!agentId) agentId = await createAgent(payload.voiceId || '');
    var url = await signedUrl(agentId);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ signed_url: url, agent_id: agentId }) };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    console.error('convai-session:', status, err && err.message);
    return {
      statusCode: status >= 400 && status < 600 ? status : 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Live-Voice-Session fehlgeschlagen', detail: err && err.message })
    };
  }
};
