/**
 * Kurani Command Center — KI-Backend (Netlify Function)
 * ------------------------------------------------------
 * Sichere Server-Funktion: ruft die Anthropic-API auf. Der API-Schlüssel
 * liegt ausschließlich serverseitig als Umgebungsvariable ANTHROPIC_API_KEY
 * und wird NIE an den Browser ausgeliefert.
 *
 * Zwei Aktionen (per JSON-Feld "action"):
 *   - "scan"  → Beleg/Rechnungs-Foto (Base64) wird per Vision ausgelesen
 *   - "chat"  → Steuer-/Finanz-Assistent (kennt die übergebene Finanz-Übersicht)
 *
 * Aufruf vom Frontend:  POST /.netlify/functions/ai
 *
 * Setup bei Netlify: Site settings → Environment variables → ANTHROPIC_API_KEY
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

exports.handler = async (event) => {
  // Nur POST
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Nur POST erlaubt." });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Ungültige Anfrage." }); }

  // ElevenLabs-TTS braucht keinen Anthropic-Key; alles andere schon.
  if (body.action !== "tts" && !apiKey) {
    return json(503, {
      error: "KI nicht konfiguriert. Bitte ANTHROPIC_API_KEY in den Netlify-Umgebungsvariablen setzen.",
      needsKey: true,
    });
  }

  try {
    if (body.action === "scan")  return await handleScan(body, apiKey);
    if (body.action === "chat")  return await handleChat(body, apiKey);
    if (body.action === "tts")   return await handleTTS(body);
    return json(400, { error: "Unbekannte Aktion." });
  } catch (e) {
    return json(502, { error: "KI-Aufruf fehlgeschlagen: " + (e.message || String(e)) });
  }
};

/* ---------- Beleg/Rechnung scannen (Vision) ---------- */
async function handleScan(body, apiKey) {
  const { imageBase64, mediaType } = body;
  if (!imageBase64) return json(400, { error: "Kein Bild übergeben." });

  // Strukturiertes JSON-Schema für zuverlässige Felder
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      typ:       { type: "string", enum: ["rechnung", "beleg", "angebot", "sonstiges"] },
      richtung:  { type: "string", enum: ["eingang", "ausgang", "unbekannt"], description: "eingang=Ausgabe/Lieferantenbeleg, ausgang=eigene Rechnung an Kunde" },
      partner:   { type: "string", description: "Name des Händlers/Lieferanten oder Kunden" },
      nummer:    { type: "string", description: "Rechnungs-/Belegnummer, falls vorhanden" },
      datum:     { type: "string", description: "Datum im Format YYYY-MM-DD, sonst leer" },
      betrag:    { type: "number", description: "Gesamtbetrag (brutto) als Zahl, Punkt als Dezimaltrenner" },
      waehrung:  { type: "string" },
      kategorie: { type: "string", description: "kurze Sachkategorie, z.B. Material, Druck, Büro, Fahrzeug" },
      notiz:     { type: "string", description: "kurze Zusammenfassung der Positionen" },
    },
    required: ["typ", "richtung", "partner", "datum", "betrag", "waehrung", "kategorie", "notiz"],
  };

  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system:
      "Du liest deutsche Belege und Rechnungen aus Fotos aus. Gib ausschließlich die strukturierten Felder zurück. " +
      "Betrag ist der Gesamt-/Bruttobetrag als Zahl. Datum immer als YYYY-MM-DD. Wenn ein Feld unklar ist, lass es leer bzw. 0. " +
      "richtung: 'eingang' wenn es eine Rechnung/ein Beleg AN den Nutzer ist (eine Ausgabe), 'ausgang' wenn es eine vom Nutzer gestellte Rechnung ist.",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
        { type: "text", text: "Lies diesen Beleg/diese Rechnung aus." },
      ],
    }],
    output_config: { format: { type: "json_schema", schema }, effort: "low" },
  };

  const res = await callAnthropic(payload, apiKey);
  if (res.stop_reason === "refusal") return json(422, { error: "Bild konnte nicht verarbeitet werden." });
  const text = (res.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  let data;
  try { data = JSON.parse(text); }
  catch { return json(502, { error: "Antwort konnte nicht gelesen werden." }); }
  return json(200, { data, usage: res.usage });
}

/* ---------- Steuer-/Finanz-Assistent (Chat) ---------- */
async function handleChat(body, apiKey) {
  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) return json(400, { error: "Keine Nachricht." });

  const system =
    "Du bist Ibos persönlicher Finanz-Coach für Kurani Design (freiberufliches Grafik-/Werbetechnik-Design, Norden/Ostfriesland). " +
    "Sprich ihn locker und freundlich mit Du an, wie ein cleverer Kumpel, der sich mit Zahlen auskennt — natürlich, motivierend, nie steif. " +
    "Er ist Kleinunternehmer nach §19 UStG — KEINE Umsatzsteuer; alle Beträge netto=brutto. Euro-Format 1.250,00 €. " +
    "SEI PROAKTIV: rede mit, gib von dir aus konkrete, umsetzbare Tipps (welche Rechnung zuerst anmahnen, ob sich ein Auftrag lohnt, wo Geld liegen bleibt), und stell am Ende eine kurze, hilfreiche Rückfrage, damit das Gespräch weiterläuft. " +
    "Antworte SEHR KURZ und sprechbar (2–4 Sätze, keine Aufzählungslisten, keine Markdown-Symbole) — deine Antworten werden vorgelesen. Nenne immer konkrete Zahlen aus der Übersicht unten. " +
    "Wenn etwas auffällt (überfällige Rechnungen, schwache Marge, starker/schwacher Monat), sprich es aktiv an. " +
    "Du ersetzt KEINEN Steuerberater — bei verbindlichen Steuerfragen sag das kurz. Erfinde keine Zahlen.\n\n" +
    "Aktuelle Finanz-Übersicht (Live-Daten aus dem Cockpit):\n" + (context || "(keine Daten übergeben)");

  // Nur Rolle/Text durchreichen (Sicherheit)
  const safeMsgs = messages.slice(-12).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 4000),
  }));

  const payload = {
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: safeMsgs,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
  };

  const res = await callAnthropic(payload, apiKey);
  if (res.stop_reason === "refusal") return json(200, { reply: "Das kann ich leider nicht beantworten." });
  const reply = (res.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  return json(200, { reply: reply || "(keine Antwort)", usage: res.usage });
}

/* ---------- Sprachausgabe (ElevenLabs TTS) ---------- */
async function handleTTS(body) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json(503, { error: "ElevenLabs nicht konfiguriert (ELEVENLABS_API_KEY).", noTTS: true });
  const text = String(body.text || "").slice(0, 1500);
  if (!text) return json(400, { error: "Kein Text." });
  const voice = (body.voiceId || "").trim() || "21m00Tcm4TlvDq8ikWAM"; // Default-Stimme
  const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voice), {
    method: "POST",
    headers: { "xi-api-key": key, "accept": "audio/mpeg", "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
    }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); return json(502, { error: "ElevenLabs-Fehler " + r.status + ": " + t.slice(0, 200) }); }
  const buf = Buffer.from(await r.arrayBuffer());
  return json(200, { audio: buf.toString("base64"), mime: "audio/mpeg" });
}

/* ---------- Helfer ---------- */
async function callAnthropic(payload, apiKey) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("HTTP " + r.status + (t ? " — " + t.slice(0, 300) : ""));
  }
  return r.json();
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}
