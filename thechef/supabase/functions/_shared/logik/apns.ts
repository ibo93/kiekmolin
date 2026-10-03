// Apple-Mitteilungen (APNs) für die iPhone-App – reine Logik, läuft in Deno und in den Tests.
// Kein npm-Paket: Anmeldung bei Apple ist ein kurzes ES256-JWT, das WebCrypto selbst signiert.

export type ApnsNachricht = { titel: string; text: string; ziel?: string; tag?: string };
export type ApnsUmgebung = 'production' | 'sandbox';

export const APNS_HOST: Record<ApnsUmgebung, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Der .p8-Schlüssel aus dem Apple-Developer-Konto (PEM, PKCS#8). */
export function apnsSchluessel(p8: string): Promise<CryptoKey> {
  const pem = p8.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Anbieter-Token: Apple nimmt es bis 60 Minuten, will aber nicht öfter als alle 20 Minuten ein neues. */
export async function apnsJwt(schluessel: CryptoKey, keyId: string, teamId: string, jetztSek: number): Promise<string> {
  const kopf = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const inhalt = b64url(JSON.stringify({ iss: teamId, iat: jetztSek }));
  // WebCrypto liefert r‖s (64 Byte) – genau das Format, das ES256 im JWT verlangt.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, schluessel, new TextEncoder().encode(`${kopf}.${inhalt}`)));
  return `${kopf}.${inhalt}.${b64url(sig)}`;
}

export function apnsNutzlast(n: ApnsNachricht) {
  return {
    aps: { alert: { title: n.titel, body: n.text }, sound: 'default', ...(n.tag ? { 'thread-id': n.tag } : {}) },
    ...(n.ziel ? { ziel: n.ziel } : {}),
  };
}

export type ApnsFolge = 'ok' | 'loeschen' | 'andere_umgebung' | 'neues_token' | 'fehler';

/**
 * Was eine Antwort von Apple bedeutet. Wichtig ist, was NICHT gelöscht wird:
 * nur 410 (App gelöscht / Token ungültig) räumt auf. Alles andere wird laut
 * gemeldet – ein still weggeräumtes Abo sähe aus wie "keine Mitteilungen".
 */
export function apnsDeuten(status: number, grund: string | undefined): ApnsFolge {
  if (status === 200) return 'ok';
  if (status === 410) return 'loeschen';
  // Xcode-Builds sprechen mit der Sandbox, TestFlight/App Store mit production.
  // Ein Token der jeweils anderen Umgebung meldet Apple als BadDeviceToken.
  if (status === 400 && grund === 'BadDeviceToken') return 'andere_umgebung';
  if (status === 403 && grund === 'ExpiredProviderToken') return 'neues_token';
  return 'fehler';
}
