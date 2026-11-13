// Apple-Mitteilungen: Anmeldung (ES256-JWT) und was Apples Antworten bedeuten.
// Den echten Versand an api.push.apple.com kann dieser Test NICHT prüfen (kein Apple-Konto,
// kein Netz dorthin) – das steht in EINRICHTEN.md als Schritt mit echtem Gerät.
import { describe, expect, it } from 'vitest';
import { apnsDeuten, apnsJwt, apnsNutzlast, apnsSchluessel } from '../supabase/functions/_shared/logik/apns.ts';

async function testSchluessel() {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', paar.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, oeffentlich: paar.publicKey };
}
const lesen = (teil: string) => JSON.parse(Buffer.from(teil, 'base64url').toString('utf8'));

describe('APNs-Anmeldung (JWT)', () => {
  it('Kopf, Inhalt und Signatur sind so, wie Apple sie prüft', async () => {
    const { pem, oeffentlich } = await testSchluessel();
    const jwt = await apnsJwt(await apnsSchluessel(pem), 'ABC123DEFG', 'TEAM987654', 1790000000);
    const [kopf, inhalt, sig] = jwt.split('.');
    expect(lesen(kopf)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(lesen(inhalt)).toEqual({ iss: 'TEAM987654', iat: 1790000000 });
    // ES256 im JWT = r‖s, genau 64 Byte. DER-kodiert (70–72 Byte) lehnt Apple ab.
    const roh = Buffer.from(sig, 'base64url');
    expect(roh.length).toBe(64);
    const echt = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, oeffentlich, roh, new TextEncoder().encode(`${kopf}.${inhalt}`));
    expect(echt).toBe(true);
  });

  it('Schlüssel aus einem Secret mit wörtlichem \\n wird auch gelesen', async () => {
    const { pem } = await testSchluessel();
    const einzeilig = pem.replace(/\n/g, '\\n');
    await expect(apnsSchluessel(einzeilig)).resolves.toBeDefined();
  });

  it('Test prüft wirklich: fremder Schlüssel besteht die Signaturprüfung nicht', async () => {
    const a = await testSchluessel(), b = await testSchluessel();
    const jwt = await apnsJwt(await apnsSchluessel(a.pem), 'K', 'T', 1);
    const [kopf, inhalt, sig] = jwt.split('.');
    const echt = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, b.oeffentlich, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${kopf}.${inhalt}`));
    expect(echt).toBe(false);
  });
});

describe('APNs-Antworten', () => {
  it('nur 410 räumt ein Abo weg – alles andere bleibt und wird gemeldet', () => {
    expect(apnsDeuten(200, undefined)).toBe('ok');
    expect(apnsDeuten(410, 'Unregistered')).toBe('loeschen');
    expect(apnsDeuten(400, 'BadDeviceToken')).toBe('andere_umgebung');
    expect(apnsDeuten(403, 'ExpiredProviderToken')).toBe('neues_token');
    // Falsche Einrichtung (Topic, Schlüssel) darf NICHT die Abos der Leute löschen.
    expect(apnsDeuten(400, 'DeviceTokenNotForTopic')).toBe('fehler');
    expect(apnsDeuten(403, 'InvalidProviderToken')).toBe('fehler');
    expect(apnsDeuten(500, 'InternalServerError')).toBe('fehler');
  });

  it('Nutzlast: Titel, Text und Ziel für den Tipp', () => {
    expect(apnsNutzlast({ titel: 'Scan fehlt', text: 'Kühlhaus', ziel: '#/m', tag: 'erinnerung' })).toEqual({
      aps: { alert: { title: 'Scan fehlt', body: 'Kühlhaus' }, sound: 'default', 'thread-id': 'erinnerung' },
      ziel: '#/m',
    });
  });
});
