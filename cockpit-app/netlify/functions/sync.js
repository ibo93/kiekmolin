/**
 * Kurani Command Center — Geräte-Sync (Netlify Function + Supabase)
 * ----------------------------------------------------------------
 * Speichert deine Daten unter einem persönlichen Sync-Code in der Cloud,
 * damit Handy & PC denselben Stand haben.
 *
 * Setup (einmalig):
 *  1) Supabase-Tabelle anlegen (SQL):
 *       create table if not exists cockpit_sync (
 *         code text primary key,
 *         data jsonb,
 *         updated_at timestamptz default now()
 *       );
 *  2) Netlify Environment Variables setzen:
 *       SUPABASE_URL          = https://<projekt>.supabase.co
 *       SUPABASE_SERVICE_KEY  = <service_role key aus Supabase>
 *  3) Neu deployen.
 *
 * Aufruf: POST /.netlify/functions/sync   { action:"pull"|"push", code, data }
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Nur POST." });
  const env = process.env;
  const url = env.SUPABASE_URL || env.SUPABASE_REST_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || env.SUPABASE_PROJECT_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_KEY
            || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return json(503, { error: "Sync nicht konfiguriert: SUPABASE_URL und SUPABASE_SERVICE_KEY (oder SUPABASE_SERVICE_ROLE_KEY) als Netlify-Variablen setzen.", needsSetup: true });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Ungültige Anfrage." }); }
  const code = String(body.code || "").trim().slice(0, 64);
  if (!code) return json(400, { error: "Kein Sync-Code." });

  const base = url.replace(/\/$/, "") + "/rest/v1/cockpit_sync";
  const h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

  try {
    if (body.action === "pull") {
      const r = await fetch(base + "?code=eq." + encodeURIComponent(code) + "&select=data,updated_at", { headers: h });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
      const rows = await r.json();
      if (!rows.length) return json(200, { empty: true });
      return json(200, { data: rows[0].data, updated_at: rows[0].updated_at });
    }
    if (body.action === "push") {
      const rec = { code, data: body.data, updated_at: new Date().toISOString() };
      const r = await fetch(base, {
        method: "POST",
        headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rec),
      });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
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
