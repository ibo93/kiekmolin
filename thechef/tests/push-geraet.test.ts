// Mitarbeiter konnten sich nirgends für Push anmelden – die Scan-Erinnerung
// ging ins Leere. Und der Schalter beim Chef zeigte „an“, weil push_an in der
// Datenbank standardmäßig true ist, obwohl das Handy nie angemeldet wurde.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const lesen = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
let abo: { endpoint: string } | null = null;
const umgebung = { permission: 'granted' as NotificationPermission };
const speicher = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k),
});
vi.stubGlobal('navigator', { userAgent: '', serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => abo } }) } });
vi.stubGlobal('window', { PushManager: class {}, Notification: class {} });
vi.stubGlobal('Notification', { get permission() { return umgebung.permission; } });
const { pushAufGeraet, pushMerken } = await import('../src/lib/geraet.ts');

describe('Ist dieses Gerät für DIESEN Nutzer angemeldet?', () => {
  beforeEach(() => { abo = null; umgebung.permission = 'granted'; speicher.clear(); });
  it('erlaubt, aber kein Abo: nein', async () => expect(await pushAufGeraet('halil')).toBe(false));
  it('Abo da, aber Mitteilungen abgelehnt: nein', async () => {
    abo = { endpoint: 'e1' }; pushMerken('halil', 'e1'); umgebung.permission = 'denied';
    expect(await pushAufGeraet('halil')).toBe(false);
  });
  it('erlaubt, Abo da und für ihn gespeichert: ja', async () => {
    abo = { endpoint: 'e1' }; pushMerken('halil', 'e1');
    expect(await pushAufGeraet('halil')).toBe(true);
  });
  it('geteiltes Küchen-iPad: für Halil gespeichert heißt NICHT für Ayşe', async () => {
    abo = { endpoint: 'e1' }; pushMerken('halil', 'e1');
    expect(await pushAufGeraet('ayse')).toBe(false);
  });
  it('Abmelden vergisst den Merker', async () => {
    abo = { endpoint: 'e1' }; pushMerken('halil', 'e1'); pushMerken('halil', null);
    expect(await pushAufGeraet('halil')).toBe(false);
  });
});

describe('Verdrahtung', () => {
  it('der Schalter in den Einstellungen zeigt das Gerät, nicht nur push_an aus der Datenbank', () => {
    const e = lesen('../src/seiten/Einstellungen.tsx');
    expect(e).toContain('an={push.aktiv}');
    expect(e).not.toMatch(/an=\{nutzer\.push_an\}/);
  });
  it('Mitarbeiter können Push auf ihrer Startseite einschalten', () => {
    const m = lesen('../src/seiten/MitarbeiterStart.tsx');
    expect(m).toContain('usePush()');
    expect(m).toContain('push.setzen(true)');
    expect(m).toContain('#/installieren'); // iPhone ohne Home-Bildschirm: erst installieren
  });
  it('aktiv heißt: push_an UND Abo auf dem Gerät', () => {
    expect(lesen('../src/ui/push.tsx')).toContain('aktiv: nutzer.push_an && geraet === true');
  });
});

describe('Verdrahtung: Gerätewechsel, Abmelden, Token auffrischen', () => {
  it('Speichern über die Datenbank-Funktion (ein upsert scheiterte an RLS)', () => {
    const sb = lesen('../src/daten/supabase.ts');
    expect(sb).toContain("sb.rpc('push_abo_speichern'");
    expect(sb).not.toContain("onConflict: 'endpoint'");
  });
  it('Abmelden löscht das Abo dieses Geräts', () => {
    const sb = lesen('../src/daten/supabase.ts');
    const ab = sb.slice(sb.indexOf('async abmelden()'), sb.indexOf('sb.auth.signOut()'));
    expect(ab).toContain(".from('push_abos').delete().eq('endpoint', ziel)");
  });
  it('die App frischt das Apple-Token bei jedem Start auf – ohne zu fragen', () => {
    expect(lesen('../src/app/App.tsx')).toContain('pushAuffrischen(ichId');
    const g = lesen('../src/lib/geraet.ts');
    expect(g).toContain('await applePush(false)');
    expect(g).toContain('if (fragen && recht.receive');
  });
});
