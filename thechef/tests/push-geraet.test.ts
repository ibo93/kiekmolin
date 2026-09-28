// Mitarbeiter konnten sich nirgends für Push anmelden – die Scan-Erinnerung
// ging ins Leere. Und der Schalter beim Chef zeigte „an“, weil push_an in der
// Datenbank standardmäßig true ist, obwohl das Handy nie angemeldet wurde.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const lesen = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
let abo: object | null = null;
const umgebung = { permission: 'granted' as NotificationPermission };
vi.stubGlobal('navigator', { userAgent: '', serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => abo } }) } });
vi.stubGlobal('window', { PushManager: class {}, Notification: class {} });
vi.stubGlobal('Notification', { get permission() { return umgebung.permission; } });
const { pushAufGeraet } = await import('../src/lib/geraet.ts');

describe('Ist dieses Gerät für Push angemeldet?', () => {
  beforeEach(() => { abo = null; umgebung.permission = 'granted'; });
  it('erlaubt, aber kein Abo: nein', async () => expect(await pushAufGeraet()).toBe(false));
  it('Abo da, aber Mitteilungen abgelehnt: nein', async () => { abo = {}; umgebung.permission = 'denied'; expect(await pushAufGeraet()).toBe(false); });
  it('erlaubt und Abo da: ja', async () => { abo = {}; expect(await pushAufGeraet()).toBe(true); });
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
