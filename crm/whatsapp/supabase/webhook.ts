/* ============================================================
   Kurani CRM – WhatsApp-Empfaenger (Supabase Edge Function)

   Meta schickt jede eingehende Nachricht hierher. Was passiert:
     1. Signatur pruefen – sonst nimmt jeder Fremde hier Einfluss
     2. Nachricht wegschreiben
     3. Je nach Stufe: melden, beantworten oder nur ablegen
     4. Antwort ueber die Cloud API zurueckschicken

   Stufen:
     1 = nur melden      ("hab ich gesehen")
     2 = beantworten     nur wo die Antwort feststeht, sonst Entwurf
     3 = voll            die KI antwortet auf alles

   Bremsen auf jeder Stufe:
     - keine Preise, die nicht in der Preisliste stehen
     - keine Terminzusagen
     - bei Reklamation/Mahnung/Anwalt: Finger weg, Ibo kriegt Meldung

   Bereitstellen:
     supabase functions deploy wa-webhook --no-verify-jwt
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ---------- Zugangsdaten aus der Umgebung ---------- */
const UMG = (name: string) => Deno.env.get(name) ?? '';

const SUPABASE_URL   = UMG('SUPABASE_URL');
const SERVICE_KEY    = UMG('SUPABASE_SERVICE_ROLE_KEY');
const META_TOKEN     = UMG('WA_TOKEN');           // dauerhafter Zugangsschluessel
const META_NUMMER_ID = UMG('WA_NUMMER_ID');       // Phone Number ID aus dem Meta-Konto
const META_GEHEIM    = UMG('WA_APP_SECRET');      // fuer die Signaturpruefung
const PRUEF_WORT     = UMG('WA_VERIFY_TOKEN');    // einmalig beim Einrichten
const KI_KEY         = UMG('ANTHROPIC_API_KEY');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/* ============================================================
   Signatur pruefen – Meta unterschreibt jede Meldung
   ============================================================ */
async function signaturStimmt(roh: string, kopf: string | null): Promise<boolean> {
  if (!META_GEHEIM) return false;              // ohne Geheimnis nichts durchlassen
  if (!kopf?.startsWith('sha256=')) return false;

  const schluessel = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(META_GEHEIM),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', schluessel, new TextEncoder().encode(roh));
  const meins = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  const seins = kopf.slice(7);

  /* Zeitgleicher Vergleich – ein frueher Abbruch verraet sonst Stellen */
  if (meins.length !== seins.length) return false;
  let gleich = 0;
  for (let i = 0; i < meins.length; i++) gleich |= meins.charCodeAt(i) ^ seins.charCodeAt(i);
  return gleich === 0;
}

/* ============================================================
   An WhatsApp zurueckschreiben
   ============================================================ */
async function senden(an: string, text: string): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${META_NUMMER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: an,
      type: 'text',
      text: { preview_url: false, body: text }
    })
  });
  if (!res.ok) {
    console.error('Senden fehlgeschlagen:', res.status, await res.text());
    return null;
  }
  const j = await res.json();
  return j?.messages?.[0]?.id ?? null;
}

/* ============================================================
   Wen haben wir da? Kunde aus dem CRM-Stand heraussuchen
   ============================================================ */
function nurZiffern(s: string){ return String(s || '').replace(/\D/g, ''); }

async function kundeZuNummer(nummer: string){
  /* Der komplette CRM-Stand liegt als eine Zeile in crm_state */
  const { data } = await db.from('crm_state').select('payload').limit(1).maybeSingle();
  const stand = data?.payload;
  if (!stand?.customers) return null;

  const ziel = nurZiffern(nummer);
  const passt = (t: string) => {
    const z = nurZiffern(t);
    if (!z) return false;
    /* Die letzten neun Ziffern reichen – 0049 / +49 / 0 vorne stoert sonst */
    return z.slice(-9) === ziel.slice(-9);
  };

  const kunde = stand.customers.find((c: any) => passt(c.telefon) || passt(c.mobil));
  if (!kunde) return null;

  const projekte = (stand.projects || []).filter((p: any) => p.customerId === kunde.id);
  const offen = (stand.documents || []).filter((d: any) =>
    d.customerId === kunde.id && ['versendet','faellig','ueberfaellig'].includes(d.status));

  return { kunde, projekte, offen };
}

/* ============================================================
   Was will der Kunde? Und darf die Automatik ran?
   ============================================================ */
function istGesperrt(text: string, woerter: string[]): boolean {
  const t = (text || '').toLowerCase();
  return woerter.some(w => t.includes(String(w).toLowerCase()));
}

function inRuhezeit(von: string, bis: string): boolean {
  const jetzt = new Date();
  /* Deutsche Zeit, egal wo der Server steht */
  const hhmm = jetzt.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false
  });
  /* Ruhe geht ueber Mitternacht: 20:00 bis 07:00 */
  return von > bis ? (hhmm >= von || hhmm < bis) : (hhmm >= von && hhmm < bis);
}

/* ============================================================
   Claude fragen
   ============================================================ */
const REGELN = `
Du schreibst als Ibrahim Kurani von Kurani Design, Werbetechnik- und
Grafikagentur in Norden, Ostfriesland. Du antwortest einem Kunden auf WhatsApp.

So schreibst du:
- kurz, freundlich, auf Augenhoehe. Wie unter Handwerkern, nicht wie ein Amt.
- Begruessung "Moin". Duzen, ausser der Kunde siezt.
- zwei, drei Saetze. Keine Textwand, kein Marketinggeschwurbel.
- keine Emojis.

Was du NIEMALS tust:
- einen Preis nennen, der nicht in den mitgelieferten Daten steht
- einen Termin oder eine Lieferzeit zusagen
- eine Zusage machen, die Ibo binden wuerde
Stattdessen: "Ich schau mir das an und melde mich mit einem Preis."

Kennst du die Antwort nicht sicher, sag das ehrlich und kuendige eine
Rueckmeldung an. Lieber nichts sagen als etwas Falsches.
`.trim();

async function antwortBauen(text: string, lage: any, stufe: number){
  if (!KI_KEY) return null;

  const daten = lage
    ? `Der Schreiber ist ein bekannter Kunde:\n${JSON.stringify({
        firma: lage.kunde.firma,
        ansprechpartner: lage.kunde.ansprechpartner,
        ort: lage.kunde.ort,
        laufende_projekte: lage.projekte.map((p: any) => ({ titel: p.titel, status: p.status })),
        offene_rechnungen: lage.offen.map((d: any) => ({ nummer: d.nummer, faellig: d.faellig }))
      }, null, 1)}`
    : 'Der Schreiber steht nicht im Kundenstamm – vermutlich eine neue Anfrage.';

  const auftrag = stufe >= 3
    ? 'Beantworte die Nachricht so gut du kannst.'
    : `Beantworte NUR, wenn die Antwort zweifelsfrei aus den Daten hervorgeht –
       etwa Stand eines Auftrags, Rechnungsnummer, Erreichbarkeit.
       Bei allem anderen antworte ausschliesslich mit dem Wort: ENTWURF`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KI_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      system: REGELN,
      messages: [{ role: 'user', content: `${daten}\n\nNachricht des Kunden:\n"${text}"\n\n${auftrag}` }]
    })
  });

  if (!res.ok) { console.error('KI-Fehler:', res.status, await res.text()); return null; }
  const j = await res.json();
  const antwort = (j.content?.[0]?.text || '').trim();
  return antwort === 'ENTWURF' ? null : antwort;
}

/* ============================================================
   Der Einstieg
   ============================================================ */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  /* --- Metas Einrichtungsanfrage --- */
  if (req.method === 'GET') {
    const modus = url.searchParams.get('hub.mode');
    const wort  = url.searchParams.get('hub.verify_token');
    const echo  = url.searchParams.get('hub.challenge');
    if (modus === 'subscribe' && wort && wort === PRUEF_WORT) {
      return new Response(echo ?? '', { status: 200 });
    }
    return new Response('nein', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('nur POST', { status: 405 });

  const roh = await req.text();
  if (!(await signaturStimmt(roh, req.headers.get('x-hub-signature-256')))) {
    console.warn('Meldung mit falscher Signatur abgewiesen');
    return new Response('Signatur stimmt nicht', { status: 401 });
  }

  /* Meta will schnell ein OK sehen, sonst schickt es nochmal.
     Also erst quittieren, dann in Ruhe arbeiten. */
  const arbeit = verarbeiten(roh).catch(e => console.error('Verarbeitung:', e));
  // @ts-ignore – in Deno Deploy verfuegbar
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(arbeit); else await arbeit;

  return new Response('ok', { status: 200 });
});

async function verarbeiten(roh: string){
  const daten = JSON.parse(roh);

  for (const eintrag of daten.entry ?? []){
    for (const aend of eintrag.changes ?? []){
      const wert = aend.value ?? {};
      const namen: Record<string,string> = {};
      for (const k of wert.contacts ?? []) namen[k.wa_id] = k.profile?.name ?? '';

      for (const n of wert.messages ?? []){
        const nummer = n.from;
        const art    = n.type;
        const text   = art === 'text' ? (n.text?.body ?? '')
                     : art === 'button' ? (n.button?.text ?? '')
                     : art === 'interactive' ? (n.interactive?.list_reply?.title ?? n.interactive?.button_reply?.title ?? '')
                     : '';

        /* Doppelte abfangen – Meta schickt bei Zweifel nochmal */
        const { data: schonDa } = await db.from('wa_nachrichten')
          .select('id').eq('wa_id', n.id).maybeSingle();
        if (schonDa) continue;

        const { data: zeile } = await db.from('wa_nachrichten').insert({
          wa_id: n.id, richtung: 'rein', nummer, name: namen[nummer] ?? null,
          text, art,
          medien_id: n.image?.id ?? n.audio?.id ?? n.document?.id ?? null,
          empfangen_am: new Date(Number(n.timestamp) * 1000).toISOString()
        }).select('id').single();

        await entscheiden(zeile?.id, nummer, text, art);
      }
    }
  }
}

async function entscheiden(zeilenId: number | undefined, nummer: string, text: string, art: string){
  const { data: e } = await db.from('wa_einstellungen').select('*').eq('id', 1).maybeSingle();
  if (!e?.aktiv) return;                        // Automatik steht aus

  const merken = (patch: Record<string, unknown>) =>
    zeilenId ? db.from('wa_nachrichten').update(patch).eq('id', zeilenId) : Promise.resolve();

  /* --- Bremse 1: heikle Woerter --- */
  if (istGesperrt(text, e.gesperrte_woerter ?? [])){
    await merken({ antwort_art: 'gesperrt' });
    return;                                     // Ibo sieht es im CRM, die Automatik schweigt
  }

  /* --- Bremse 2: nur Text wird beantwortet --- */
  if (art !== 'text' && art !== 'button' && art !== 'interactive'){
    await merken({ antwort_art: 'keine' });
    return;
  }

  /* --- Nicht zweimal hintereinander melden --- */
  const vorhin = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { count } = await db.from('wa_nachrichten')
    .select('id', { count: 'exact', head: true })
    .eq('nummer', nummer).eq('richtung', 'raus').gte('empfangen_am', vorhin);
  const schonGemeldet = (count ?? 0) > 0;

  const lage  = await kundeZuNummer(nummer);
  const ruhe  = inRuhezeit(e.ruhe_von ?? '20:00', e.ruhe_bis ?? '07:00');
  const stufe = ruhe ? Math.min(e.stufe, 1) : e.stufe;   // nachts nur melden

  let antwort: string | null = null;
  let wieso = 'entwurf';

  if (stufe >= 2){
    antwort = await antwortBauen(text, lage, stufe);
    if (antwort) wieso = 'auto';
  }

  if (!antwort && !schonGemeldet){
    antwort = e.melde_text;
    wieso = 'melden';
  }

  if (!antwort){ await merken({ antwort_art: wieso }); return; }

  const voll = e.signatur ? `${antwort}\n\n${e.signatur}` : antwort;
  const gesendetId = await senden(nummer, voll);

  await merken({ antwort_art: wieso, antwort_text: voll, gesendet_am: gesendetId ? new Date().toISOString() : null });

  if (gesendetId){
    await db.from('wa_nachrichten').insert({
      wa_id: gesendetId, richtung: 'raus', nummer, text: voll, art: 'text'
    });
  }
}
