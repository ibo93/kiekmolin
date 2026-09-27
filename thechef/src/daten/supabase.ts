// Echte Daten über Supabase.
//
// Regel für jede Abfrage: Fehler werfen, nie still [] zurückgeben.
// Eine leere Liste sieht aus wie eine Antwort (CLAUDE.md, Regel 6).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Bereich, BestandZeile, Betrieb, Briefing, EinkaufEintrag, Erkennung, Hinweis, Namen, Nutzer, Position, Produkt, Scan, Weggeworfen,
} from '../../supabase/functions/_shared/logik/typen.ts';
import { DatenFehler, type Api, type AssistentAntwort, type LokalerScan, type LokalesFoto, type Sitzung } from './api.ts';

type Antwort<T> = { data: T | null; error: { message: string; code?: string } | null };

function pruefe<T>(r: Antwort<T>, was: string): T {
  if (r.error) throw new DatenFehler('fehler.laden', `${was}: ${r.error.message}`);
  if (r.data == null) throw new DatenFehler('fehler.laden', `${was}: keine Daten`);
  return r.data;
}
function pruefeOhne(r: { error: { message: string } | null }, was: string) {
  if (r.error) throw new DatenFehler('fehler.speichern', `${was}: ${r.error.message}`);
}
const zahl = (x: unknown) => (x == null ? null : Number(x));

export function supabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let aktuell: { nutzer: Nutzer; betrieb: Betrieb } | null = null;
  const urlCache = new Map<string, { url: string; bis: number }>();

  function betriebId() {
    if (!aktuell) throw new DatenFehler('fehler.nicht_angemeldet');
    return aktuell.betrieb.id;
  }

  async function funktion<T>(name: string, body: unknown): Promise<T> {
    const r = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
    if (r.error) {
      let detail = r.error.message;
      try {
        const ctx = (r.error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') detail = (await ctx.json()).fehler ?? detail;
      } catch { /* Text bleibt */ }
      throw new DatenFehler('fehler.server', `${name}: ${detail}`);
    }
    return r.data as T;
  }

  async function fotoHochladen(bucket: string, pfad: string, blob: Blob, ersetzen: boolean) {
    const r = await sb.storage.from(bucket).upload(pfad, blob, { contentType: blob.type || 'image/jpeg', upsert: ersetzen });
    // Schon da (zweiter Versuch nach Netzabbruch) ist kein Fehler.
    if (r.error && !/exists|Duplicate/i.test(r.error.message)) throw new DatenFehler('fehler.foto', r.error.message);
    urlCache.delete(`${bucket}/${pfad}`);
  }

  const api: Api = {
    demo: false,

    async sitzung() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) { aktuell = null; return null; }
      const n = await sb.from('nutzer').select('*').eq('id', user.id).maybeSingle();
      if (n.error) throw new DatenFehler('fehler.laden', n.error.message);
      if (!n.data) { aktuell = null; return { art: 'ohne_betrieb', email: user.email ?? null } satisfies Sitzung; }
      const b = pruefe(await sb.from('betriebe').select('*').eq('id', n.data.betrieb_id).single(), 'Betrieb');
      aktuell = { nutzer: n.data as Nutzer, betrieb: b as unknown as Betrieb };
      return { art: 'fertig', ...aktuell } satisfies Sitzung;
    },

    async anmelden(email, passwort) {
      const r = await sb.auth.signInWithPassword({ email, password: passwort });
      if (r.error) throw new DatenFehler('fehler.anmelden', r.error.message);
    },
    async registrieren(email, passwort) {
      const r = await sb.auth.signUp({ email, password: passwort, options: { emailRedirectTo: location.origin } });
      if (r.error) throw new DatenFehler('fehler.registrieren', r.error.message);
      return { mailBestaetigen: !r.data.session };
    },
    async abmelden() {
      await sb.auth.signOut();
      aktuell = null;
    },
    async betriebAnlegen(name, nutzername, sprache) {
      pruefeOhne(await sb.rpc('betrieb_anlegen', { p_name: name, p_nutzername: nutzername, p_sprache: sprache }), 'Betrieb anlegen');
    },
    async beitreten(code, name, sprache) {
      // Mitarbeiter brauchen kein Passwort: anonyme Anmeldung, dann Code einlösen.
      const s = await sb.auth.getSession();
      if (!s.data.session) {
        const a = await sb.auth.signInAnonymously();
        if (a.error) throw new DatenFehler('fehler.beitreten', a.error.message);
      }
      const r = await sb.rpc('einladung_annehmen', { p_code: code, p_name: name, p_sprache: sprache });
      if (r.error) throw new DatenFehler(/ungültig/.test(r.error.message) ? 'fehler.code_ungueltig' : 'fehler.beitreten', r.error.message);
    },
    async einladungErstellen() {
      return pruefe(await sb.rpc('einladung_erstellen', { p_rolle: 'mitarbeiter' }), 'Einladung') as string;
    },
    async profilAendern(p) {
      if (!aktuell) return;
      pruefeOhne(await sb.from('nutzer').update(p).eq('id', aktuell.nutzer.id), 'Profil');
      aktuell = { ...aktuell, nutzer: { ...aktuell.nutzer, ...p } };
    },
    async betriebAendern(p) {
      pruefeOhne(await sb.from('betriebe').update(p).eq('id', betriebId()), 'Betrieb');
      if (aktuell) aktuell = { ...aktuell, betrieb: { ...aktuell.betrieb, ...p } };
    },
    async team() {
      return pruefe(await sb.from('nutzer').select('*').order('erstellt_am'), 'Team') as Nutzer[];
    },
    async teamEntfernen(id) {
      pruefeOhne(await sb.from('nutzer').delete().eq('id', id), 'Team');
    },

    async bereiche() {
      return pruefe(await sb.from('bereiche').select('*').eq('aktiv', true).order('reihenfolge'), 'Bereiche') as Bereich[];
    },
    async bereichSpeichern(b) {
      const zeile = { ...b, betrieb_id: betriebId() };
      return pruefe(await sb.from('bereiche').upsert(zeile).select().single(), 'Bereich') as Bereich;
    },
    async bereichLoeschen(id) {
      pruefeOhne(await sb.from('bereiche').update({ aktiv: false }).eq('id', id), 'Bereich');
    },
    async positionen() {
      return pruefe(await sb.from('scan_positionen').select('*').eq('aktiv', true).order('reihenfolge'), 'Positionen') as Position[];
    },
    async positionSpeichern(p, foto) {
      const id = p.id ?? crypto.randomUUID();
      let pfad = p.referenzfoto_pfad ?? null;
      if (foto) {
        pfad = `${betriebId()}/positionen/${id}-${Date.now()}.jpg`;
        await fotoHochladen('katalog', pfad, foto, true);
      }
      const zeile = { ...p, id, referenzfoto_pfad: pfad, betrieb_id: betriebId() };
      return pruefe(await sb.from('scan_positionen').upsert(zeile).select().single(), 'Position') as Position;
    },
    async positionLoeschen(id) {
      pruefeOhne(await sb.from('scan_positionen').update({ aktiv: false }).eq('id', id), 'Position');
    },
    async produkte() {
      const r = pruefe(await sb.from('produkte').select('*').order('erstellt_am'), 'Produkte') as Produkt[];
      return r.map((p) => ({
        ...p,
        mindestbestand: Number(p.mindestbestand),
        menge_pro_einheit: zahl(p.menge_pro_einheit),
        preis_pro_einheit: zahl(p.preis_pro_einheit),
      }));
    },
    async produktSpeichern(p, foto) {
      const id = p.id ?? crypto.randomUUID();
      let pfad = p.referenzfoto_pfad ?? null;
      if (foto) {
        pfad = `${betriebId()}/produkte/${id}-${Date.now()}.jpg`;
        await fotoHochladen('katalog', pfad, foto, true);
      }
      const zeile = { ...p, id, referenzfoto_pfad: pfad, betrieb_id: betriebId() };
      return pruefe(await sb.from('produkte').upsert(zeile).select().single(), 'Produkt') as Produkt;
    },
    async produktLoeschen(id) {
      // Nicht wirklich löschen: Bestand und Weggeworfen-Verlauf hängen daran.
      pruefeOhne(await sb.from('produkte').update({ aktiv: false }).eq('id', id), 'Produkt');
    },
    async namenVorschlagen(name, von) {
      return funktion<{ namen: Namen }>('uebersetzen', { name, von }).then((r) => r.namen);
    },
    async bildUrl(pfad) {
      if (!pfad) return null;
      const bucket = pfad.includes('/produkte/') || pfad.includes('/positionen/') ? 'katalog' : 'scan-fotos';
      const k = `${bucket}/${pfad}`;
      const c = urlCache.get(k);
      if (c && c.bis > Date.now()) return c.url;
      const r = await sb.storage.from(bucket).createSignedUrl(pfad, 3600);
      if (r.error) return null; // Foto gelöscht (Löschfrist) – dann eben kein Bild
      urlCache.set(k, { url: r.data.signedUrl, bis: Date.now() + 50 * 60 * 1000 });
      return r.data.signedUrl;
    },

    async scansSeit(iso) {
      return pruefe(await sb.from('scans').select('*').gte('zeitpunkt', iso).order('zeitpunkt', { ascending: false }), 'Scans') as Scan[];
    },
    async scanHochladen(scan: LokalerScan, fotos: LokalesFoto[]) {
      const b = betriebId();
      const frist = aktuell!.betrieb.foto_loeschfrist_tage;
      pruefeOhne(await sb.from('scans').upsert({
        betrieb_id: b, bereich_id: scan.bereich_id, nutzer_id: aktuell!.nutzer.id, lokal_id: scan.lokal_id,
        aufgenommen_am: scan.aufgenommen_am, status: 'hochgeladen',
      }, { onConflict: 'betrieb_id,lokal_id', ignoreDuplicates: true }), 'Scan');
      const s = pruefe(await sb.from('scans').select('id').eq('lokal_id', scan.lokal_id).single(), 'Scan') as { id: string };
      for (const f of fotos) {
        const pfad = `${b}/${s.id}/${f.id}.jpg`;
        await fotoHochladen('scan-fotos', pfad, f.blob, false);
        const loeschen = new Date(Date.parse(f.aufgenommen_am) + frist * 86400000).toISOString();
        pruefeOhne(await sb.from('scan_fotos').upsert({
          id: f.id, betrieb_id: b, scan_id: s.id, position_id: f.position_id, foto_pfad: pfad,
          breite: f.breite, hoehe: f.hoehe, aufgenommen_am: f.aufgenommen_am, loeschen_am: loeschen,
        }, { onConflict: 'id', ignoreDuplicates: true }), 'Foto');
      }
      return s.id;
    },
    async erkennen(scanId) {
      await funktion('scan-erkennen', { scan_id: scanId });
    },
    async erkennungen(scanId) {
      const r = pruefe(await sb.from('scan_erkennungen').select('*').eq('scan_id', scanId), 'Erkennungen') as Erkennung[];
      return r.map((e) => ({ ...e, anzahl_erkannt: Number(e.anzahl_erkannt), sicherheit: Number(e.sicherheit), anzahl_bestaetigt: zahl(e.anzahl_bestaetigt) }));
    },
    async scanFotos(scanId) {
      const r = pruefe(await sb.from('scan_fotos').select('id, position_id, foto_pfad, breite, hoehe').eq('scan_id', scanId), 'Fotos') as
        Array<{ id: string; position_id: string | null; foto_pfad: string | null; breite: number | null; hoehe: number | null }>;
      return Promise.all(r.map(async (f) => ({ ...f, url: f.foto_pfad ? await api.bildUrl(f.foto_pfad) : null })));
    },
    async letztesFotoUrl(positionId) {
      const r = await sb.from('scan_fotos').select('foto_pfad').eq('position_id', positionId).eq('geloescht', false)
        .order('aufgenommen_am', { ascending: false }).limit(1).maybeSingle();
      if (r.error || !r.data?.foto_pfad) return null;
      return api.bildUrl(r.data.foto_pfad);
    },
    async scanBestaetigen(scanId, positionen) {
      // Was die KI übersehen hat und von Hand dazukam, als Erkennung mit 0 festhalten –
      // sonst fehlt genau dieser Fehler in der Genauigkeits-Messung.
      const da = new Set((await api.erkennungen(scanId)).map((e) => e.produkt_id));
      const neu = [...new Set(positionen.map((p) => p.produkt_id))].filter((id) => !da.has(id));
      if (neu.length) {
        pruefeOhne(await sb.from('scan_erkennungen').insert(neu.map((produkt_id) => ({
          betrieb_id: betriebId(), scan_id: scanId, produkt_id, anzahl_erkannt: 0, sicherheit: 0, von_hand: true,
        }))), 'Erkennung');
      }
      return pruefe(await sb.rpc('scan_bestaetigen', { p_scan_id: scanId, p_positionen: positionen }), 'Bestätigen') as { produkte: number };
    },
    async nachScan(scanId) {
      await funktion('nach-scan', { scan_id: scanId });
    },

    async bestand() {
      const r = pruefe(await sb.from('aktueller_bestand').select('*'), 'Bestand') as BestandZeile[];
      return r.map((z) => ({
        ...z,
        menge_einheiten: Number(z.menge_einheiten),
        chargen: (z.chargen ?? []).map((c) => ({ ...c, menge: Number(c.menge) })),
      }));
    },
    async weggeworfen(von, bis) {
      const r = pruefe(await sb.from('weggeworfen').select('*').gte('zeitpunkt', von).lt('zeitpunkt', bis), 'Weggeworfen') as Weggeworfen[];
      return r.map((w) => ({ ...w, menge_einheiten: Number(w.menge_einheiten), wert_eur: zahl(w.wert_eur) }));
    },
    async wegwerfen(produktId, menge) {
      const p = pruefe(await sb.from('produkte').select('preis_pro_einheit').eq('id', produktId).single(), 'Produkt') as { preis_pro_einheit: number | null };
      pruefeOhne(await sb.from('weggeworfen').insert({
        betrieb_id: betriebId(), produkt_id: produktId, menge_einheiten: menge, nutzer_id: aktuell!.nutzer.id,
        wert_eur: p.preis_pro_einheit == null ? null : Math.round(menge * Number(p.preis_pro_einheit) * 100) / 100,
      }), 'Weggeworfen');
    },
    async einkaufEintraege(datum) {
      const r = pruefe(await sb.from('einkauf_eintraege').select('*').eq('datum', datum), 'Einkauf') as EinkaufEintrag[];
      return r.map((e) => ({ ...e, menge_extra: Number(e.menge_extra) }));
    },
    async einkaufSetzen(e) {
      pruefeOhne(await sb.from('einkauf_eintraege').upsert({ ...e, betrieb_id: betriebId() }, { onConflict: 'betrieb_id,datum,produkt_id' }), 'Einkauf');
    },

    async fragen(frage, sprache) {
      return funktion<AssistentAntwort>('assistent', { frage, sprache });
    },
    async verlauf() {
      const r = pruefe(await sb.from('assistent_verlauf').select('frage, antwort, zeitpunkt, verworfen')
        .order('zeitpunkt', { ascending: false }).limit(20), 'Verlauf') as Array<{ frage: string; antwort: AssistentAntwort; zeitpunkt: string; verworfen: boolean }>;
      return r.reverse().map((x) => ({ ...x, antwort: { ...x.antwort, verworfen: x.verworfen } }));
    },
    async briefing(datum) {
      const r = await sb.from('briefings').select('*').eq('datum', datum).maybeSingle();
      if (r.error) throw new DatenFehler('fehler.laden', r.error.message);
      return (r.data as Briefing) ?? null;
    },
    async tagesgericht(sprache) {
      return funktion<{ gericht: string; grund: string } | null>('assistent', { art: 'tagesgericht', sprache });
    },
    async hinweise() {
      return pruefe(await sb.from('hinweise').select('*').eq('erledigt', false).order('prioritaet', { ascending: false }).limit(5), 'Hinweise') as Hinweis[];
    },
    async hinweisErledigt(id) {
      pruefeOhne(await sb.from('hinweise').update({ erledigt: true }).eq('id', id), 'Hinweis');
    },
    async spracheZuText(audio, sprache, dauerSekunden) {
      const { data } = await sb.auth.getSession();
      const form = new FormData();
      form.append('audio', audio, 'aufnahme');
      form.append('sprache', sprache);
      if (dauerSekunden) form.append('dauer_sekunden', String(Math.round(dauerSekunden)));
      const r = await fetch(`${url}/functions/v1/sprache`, {
        method: 'POST', body: form,
        headers: { Authorization: `Bearer ${data.session?.access_token ?? anonKey}`, apikey: anonKey },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new DatenFehler('fehler.sprache', j.fehler ?? String(r.status));
      return { text: String(j.text ?? '') };
    },
    async pushSpeichern(abo) {
      pruefeOhne(await sb.from('push_abos').upsert({
        betrieb_id: betriebId(), nutzer_id: aktuell!.nutzer.id, endpoint: abo.endpoint,
        p256dh: abo.keys?.p256dh, auth: abo.keys?.auth,
      }, { onConflict: 'endpoint' }), 'Push');
    },

    async kosten(seit) {
      const r = pruefe(await sb.from('ki_kosten').select('*').gte('zeitpunkt', seit).order('zeitpunkt', { ascending: false }).limit(2000), 'Kosten') as Array<Record<string, unknown>>;
      return r.map((k) => ({ ...k, kosten_eur: Number(k.kosten_eur) })) as never;
    },
    async genauigkeit(seit) {
      const r = pruefe(await sb.from('scan_erkennungen')
        .select('scan_id, produkt_id, anzahl_erkannt, anzahl_bestaetigt, sicherheit, von_hand, scans!inner(zeitpunkt, status)')
        .eq('bestaetigt', true).gte('scans.zeitpunkt', seit), 'Genauigkeit') as Array<Record<string, unknown>>;
      return r.map((e) => ({
        scan_id: e.scan_id as string, produkt_id: e.produkt_id as string,
        erkannt: Number(e.anzahl_erkannt), bestaetigt: Number(e.anzahl_bestaetigt ?? 0), sicherheit: Number(e.sicherheit),
        von_hand: Boolean(e.von_hand), zeitpunkt: (e.scans as { zeitpunkt: string }).zeitpunkt,
      }));
    },
  };
  return api;
}
