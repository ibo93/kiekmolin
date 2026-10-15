// Einladung per WhatsApp: Der Link wurde aus location.origin gebaut – in der
// iPhone-App ist das „capacitor://localhost“. Der Mitarbeiter bekam einen
// Link, der auf keinem anderen Handy irgendwohin führt (gefunden beim
// Durchklicken der Einrichtung, 04.10.2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const ort = { protocol: 'http:', origin: 'http://localhost:5173' };
const fenster: { Capacitor?: unknown } = {};
vi.stubGlobal('location', ort);
vi.stubGlobal('window', fenster);
vi.stubGlobal('navigator', { userAgent: '' });
const { oeffentlicheAdresse } = await import('../src/lib/geraet.ts');

describe('Adresse für den Einladungs-Link', () => {
  beforeEach(() => { ort.protocol = 'https:'; ort.origin = 'https://thechef.netlify.app'; delete fenster.Capacitor; });
  it('im Browser: die eigene Adresse', () => {
    expect(oeffentlicheAdresse()).toBe('https://thechef.netlify.app');
  });
  it('in der iPhone-App: KEIN Link (sonst capacitor://localhost)', () => {
    ort.protocol = 'capacitor:'; ort.origin = 'capacitor://localhost';
    fenster.Capacitor = { isNativePlatform: () => true };
    expect(oeffentlicheAdresse()).toBeNull();
  });
  it('auch ohne Capacitor-Kennung: nur http(s) gilt als Adresse', () => {
    ort.protocol = 'capacitor:'; ort.origin = 'capacitor://localhost';
    expect(oeffentlicheAdresse()).toBeNull();
  });
});

describe('Verdrahtung', () => {
  const team = readFileSync(new URL('../src/seiten/Team.tsx', import.meta.url), 'utf8');
  it('der Link kommt nicht mehr aus location.origin', () => {
    expect(team).not.toContain("${location.origin}");
    expect(team).toContain('oeffentlicheAdresse()');
  });
  it('ohne Adresse: Text nur mit Code, Knopf kopiert den Code', () => {
    expect(team).toContain("t('team.einladung_text_code'");
    expect(team).toContain("t('team.code_kopieren')");
  });
});
