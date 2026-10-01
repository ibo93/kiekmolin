// Taschenlampe in der iPhone-App: der WebView meldet nie "torch", der Knopf
// erschien deshalb nie – im dunklen Kühlhaus das Wichtigste. Jetzt nativ.
// Was dieser Test NICHT kann: prüfen, ob das Licht auf dem Gerät angeht
// (der Simulator hat keine Lampe). Er hält nur die Verdrahtung zusammen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const lesen = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const swift = lesen('../ios/App/App/SceneDelegate.swift');
const kamera = lesen('../src/lib/kamera.ts');

describe('Native Taschenlampe', () => {
  it('die App startet mit der eigenen Bridge, die das Modul anmeldet', () => {
    expect(swift).toContain('window?.rootViewController = ChefBridgeViewController()');
    expect(swift).toContain('bridge?.registerPluginInstance(LampePlugin())');
  });
  it('Name und Methoden stimmen auf beiden Seiten überein', () => {
    expect(swift).toContain('public let jsName = "Lampe"');
    expect(kamera).toContain("registerPlugin<");
    expect(kamera).toContain("('Lampe')");
    for (const m of ['verfuegbar', 'setzen']) {
      expect(swift).toContain(`CAPPluginMethod(name: "${m}"`);
      expect(kamera).toContain(`Lampe.${m}(`);
    }
    expect(swift).toContain('call.getBool("an")');
  });
  it('nur in der App und nur, wenn der Browser selbst keine Lampe kann', () => {
    expect(kamera).toContain('!webLampe && istNativ()');
  });
  it('beim Verlassen des Scans geht die native Lampe aus (sonst brennt sie weiter)', () => {
    const stopp = kamera.slice(kamera.indexOf('stopp() {'));
    expect(stopp).toContain('Lampe.setzen({ an: false })');
  });
});
