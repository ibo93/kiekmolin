// Sprache → Text, serverseitig (NICHT die Browser-Spracherkennung – THECHEF.md).
//
// Welcher Dienst Kurmancî am besten erkennt, ist NICHT gemessen. Deshalb ist
// der Anbieter austauschbar (STT_ANBIETER) und die App zeigt das Erkannte
// immer zur Bestätigung. Vor dem Start: werkzeug/stt-vergleich.md durchgehen.
import { admin, aufrufer, bedienen, fehler, json } from '../_shared/http.ts';

// Sprachcodes, die wir den Diensten mitgeben. Kurmancî ("ku") nicht fest
// vorgeben: ob der jeweilige Dienst den Code kennt, ist nicht geprüft.
const CODE: Record<string, string | undefined> = { de: 'de', tr: 'tr', ar: 'ar', en: 'en', ku: undefined, ckb: undefined };

bedienen(async (req) => {
  const { betrieb } = await aufrufer(req);
  const form = await req.formData();
  const audio = form.get('audio');
  const sprache = String(form.get('sprache') ?? 'de');
  const dauer = Number(form.get('dauer_sekunden') ?? 0);
  if (!(audio instanceof File) || audio.size === 0) return fehler('audio fehlt');
  if (audio.size > 10 * 1024 * 1024) return fehler('Aufnahme zu lang');

  const anbieter = Deno.env.get('STT_ANBIETER') ?? 'openai';
  let text = '';
  if (anbieter === 'openai') {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return fehler('OPENAI_API_KEY fehlt (Supabase → Edge Functions → Secrets)', 500);
    const f = new FormData();
    f.append('file', audio, audio.name || 'aufnahme.webm');
    f.append('model', Deno.env.get('STT_MODELL') ?? 'gpt-4o-transcribe');
    if (CODE[sprache]) f.append('language', CODE[sprache]!);
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: f });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return fehler(`Spracherkennung: ${j.error?.message ?? r.status}`, 502);
    text = j.text ?? '';
  } else if (anbieter === 'elevenlabs') {
    const key = Deno.env.get('ELEVENLABS_API_KEY');
    if (!key) return fehler('ELEVENLABS_API_KEY fehlt', 500);
    const f = new FormData();
    f.append('file', audio, audio.name || 'aufnahme.webm');
    f.append('model_id', Deno.env.get('STT_MODELL') ?? 'scribe_v1');
    if (CODE[sprache]) f.append('language_code', CODE[sprache]!);
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: f });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return fehler(`Spracherkennung: ${j.detail?.message ?? j.detail ?? r.status}`, 502);
    text = j.text ?? '';
  } else {
    return fehler(`Unbekannter STT_ANBIETER: ${anbieter}`, 500);
  }

  // Kosten grob nach Dauer (Preis je Minute als Secret, weil er je Anbieter anders ist)
  const proMinute = Number(Deno.env.get('STT_PREIS_PRO_MINUTE_USD') ?? '0');
  if (proMinute > 0 && dauer > 0) {
    const usd = (dauer / 60) * proMinute;
    await admin().from('ki_kosten').insert({ betrieb_id: betrieb.id, art: 'sprache', modell: anbieter, kosten_usd: usd, kosten_eur: usd * Number(Deno.env.get('CHEF_USD_EUR') ?? '0.9') });
  }
  return json({ text: text.trim() });
});
