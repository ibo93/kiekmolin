// Claude-Aufrufe NUR hier – der API-Schlüssel liegt als Secret in Supabase, nie im Frontend.
// Jeder Aufruf wird mit Tokens und Kosten in ki_kosten protokolliert.
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const MODELL = Deno.env.get('CHEF_MODELL') ?? 'claude-opus-5';

// US-$ je 1 Mio. Tokens (Stand der Preisliste im Code; bei Modellwechsel prüfen).
const PREISE: Record<string, { ein: number; aus: number }> = {
  'claude-opus-5': { ein: 5, aus: 25 },
  'claude-opus-5-5': { ein: 4, aus: 20 },
  'claude-sonnet-5': { ein: 2, aus: 10 },
  'claude-haiku-4-5': { ein: 1, aus: 5 },
};
// Fester Umrechnungskurs – ausdrücklich eine Näherung, im Admin so beschriftet.
const USD_EUR = Number(Deno.env.get('CHEF_USD_EUR') ?? '0.9');

let client: Anthropic | null = null;
export function claude() {
  if (!client) {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY fehlt (Supabase → Edge Functions → Secrets)');
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export type Nutzung = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

export async function kostenBuchen(db: SupabaseClient, betriebId: string, art: string, u: Nutzung, bezug?: string, modell = MODELL) {
  const p = PREISE[modell] ?? PREISE['claude-opus-5'];
  const ein = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  const usd = (ein * p.ein + u.output_tokens * p.aus) / 1e6;
  const r = await db.from('ki_kosten').insert({
    betrieb_id: betriebId, art, modell,
    tokens_ein: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokens_aus: u.output_tokens, kosten_usd: usd, kosten_eur: usd * USD_EUR, bezug: bezug ?? null,
  });
  if (r.error) console.error('Kosten nicht protokolliert:', r.error.message);
}

/** Summe der Nutzung über mehrere Antworten (Tool-Schleife). */
export function addieren(a: Nutzung, b: Nutzung): Nutzung {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
  };
}
export const NULL_NUTZUNG: Nutzung = { input_tokens: 0, output_tokens: 0 };

/**
 * Anfrage mit serverseitigem Ausweichmodell bei einer Ablehnung (fallbacks: "default")
 * und strukturierter Ausgabe (JSON-Schema). Gibt die fertige Nachricht zurück.
 */
// deno-lint-ignore no-explicit-any
export async function anfrage(params: Record<string, any>) {
  // deno-lint-ignore no-explicit-any
  const m = await (claude().beta.messages.create as any)({
    model: MODELL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    ...params,
  });
  if (m.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.');
  if (m.stop_reason === 'max_tokens') throw new Error('Antwort zu lang abgebrochen.');
  return m as Anthropic.Beta.BetaMessage;
}

export function textAus(m: Anthropic.Beta.BetaMessage): string {
  return m.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
}

export function base64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
