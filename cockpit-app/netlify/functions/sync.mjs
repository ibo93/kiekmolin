/**
 * Kurani Command Center — Geräte-Sync über Netlify Blobs
 * ------------------------------------------------------
 * KEIN externer Dienst, KEINE Keys, KEINE Datenbank.
 * Netlify stellt den Blob-Speicher automatisch bereit, sobald die Site
 * deployt ist. Daten liegen unter einem persönlichen Sync-Code.
 *
 * Aufruf: POST /.netlify/functions/sync   { action:"pull"|"push", code, data }
 */
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Nur POST." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Ungültige Anfrage." }); }
  const code = String(body.code || "").trim().slice(0, 64);
  if (!code) return json(400, { error: "Kein Sync-Code." });

  let store;
  try { store = getStore("kurani-cockpit"); }
  catch (e) { return json(503, { error: "Speicher nicht verfügbar: " + (e.message || e), needsSetup: true }); }

  try {
    if (body.action === "pull") {
      const v = await store.get("d_" + code, { type: "json" });
      if (!v) return json(200, { empty: true });
      return json(200, { data: v.data, updated_at: v.updated_at });
    }
    if (body.action === "push") {
      const rec = { data: body.data, updated_at: new Date().toISOString() };
      await store.setJSON("d_" + code, rec);
      return json(200, { ok: true, updated_at: rec.updated_at });
    }
    return json(400, { error: "Unbekannte Aktion." });
  } catch (e) {
    return json(502, { error: "Sync fehlgeschlagen: " + (e.message || String(e)) });
  }
};

function json(status, obj) {
  return { statusCode: status, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(obj) };
}
