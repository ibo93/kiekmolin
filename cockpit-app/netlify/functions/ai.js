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
  if (!apiKey) {
    return json(503, {
      error: "KI nicht konfiguriert. Bitte ANTHROPIC_API_KEY in den Netlify-Umgebungsvariablen setzen.",
      needsKey: true,
    });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Ungültige Anfrage." }); }

  try {
    if (body.action === "scan")  return await handleScan(body, apiKey);
    if (body.action === "chat")  return await handleChat(body, apiKey);
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
    "Du bist der persönliche Finanz- und Steuer-Assistent von Ibo (Kurani Design), einem freiberuflichen Grafik-/Werbetechnik-Designer in Norden/Ostfriesland. " +
    "Er ist Kleinunternehmer nach §19 UStG — es gibt KEINE Umsatzsteuer; alle Beträge sind netto=brutto. " +
    "Du hilfst beim Kalkulieren (Stundensätze, Margen, ob sich ein Auftrag lohnt), beim Verstehen der Zahlen, beim Formulieren von Angeboten/Mahnungen und bei allgemeinen kaufmännischen Fragen. " +
    "Rechne konkret mit den Zahlen aus der Finanz-Übersicht unten. Antworte auf Deutsch, klar, kurz, freundlich und praxisnah. Nutze Euro im Format 1.250,00 €. " +
    "WICHTIG: Du ersetzt KEINEN Steuerberater. Bei verbindlichen steuerlichen/rechtlichen Fragen weise freundlich darauf hin, dass das ein Steuerberater prüfen sollte. Erfinde keine Zahlen.\n\n" +
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
