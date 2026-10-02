// Was das Gerät kann: Push, Teilen, Vorlesen, Installation.
import type { PushAbo } from '../daten/api.ts';

export function istIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
/** Läuft als echte iPhone-App (Capacitor/Xcode)? */
export function istNativ() {
  return !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}
export function istInstalliert() {
  if (istNativ()) return true;
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Mitteilungen abonnieren.
 *  - iPhone-App (Xcode): über Apple (APNs) – dort gibt es kein Web-Push.
 *  - sonst Web-Push: auf dem iPhone NUR, wenn die App auf dem Home-Bildschirm liegt (iOS ≥ 16.4).
 */
export async function pushAbonnieren(vapid: string | undefined): Promise<PushAbo> {
  if (istNativ()) return applePush();
  if (!vapid) throw new Error('push_nicht_eingerichtet');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(istIos() && !istInstalliert() ? 'push_ios_installieren' : 'push_nicht_moeglich');
  const erlaubt = await Notification.requestPermission();
  if (erlaubt !== 'granted') throw new Error('push_abgelehnt');
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(vapid.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (vapid.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const abo = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  return { art: 'web', abo: abo.toJSON() };
}

/** fragen=false: beim App-Start nur auffrischen, NIE nach der Erlaubnis fragen. */
async function applePush(fragen = true): Promise<PushAbo> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let recht = await PushNotifications.checkPermissions();
  if (fragen && recht.receive !== 'granted' && recht.receive !== 'denied') recht = await PushNotifications.requestPermissions();
  if (recht.receive !== 'granted') throw new Error('push_abgelehnt');
  return new Promise<PushAbo>((ok, nein) => {
    const hoerer: Array<Promise<{ remove(): Promise<void> }>> = [];
    let fertig = false;
    const ende = (f: () => void) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(uhr);
      hoerer.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
      f();
    };
    // Ohne die Fähigkeit "Push Notifications" im Xcode-Projekt antwortet iOS mit
    // registrationError – oder gar nicht. Beides wird eine klare Meldung, nie Stille.
    const uhr = setTimeout(() => ende(() => nein(new Error('push_ios_faehigkeit'))), 20000);
    hoerer.push(PushNotifications.addListener('registration', (t) => ende(() => ok({ art: 'apns', token: t.value }))));
    hoerer.push(PushNotifications.addListener('registrationError', (e) => {
      console.error('APNs-Anmeldung fehlgeschlagen:', e.error);
      ende(() => nein(new Error('push_ios_faehigkeit')));
    }));
    PushNotifications.register().catch((e) => ende(() => nein(e)));
  });
}

/** iPhone-App: Tipp auf eine Mitteilung öffnet die Stelle, um die es geht (wie im Service Worker). */
export async function mitteilungenOeffnen() {
  if (!istNativ()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const ziel = (a.notification.data as { ziel?: unknown } | undefined)?.ziel;
    if (typeof ziel === 'string' && ziel.startsWith('#/')) location.hash = ziel.slice(1);
  });
}

// Merker JE NUTZER: welches Ziel (Apple-Token / Browser-Abo) für ihn gespeichert
// ist. Vorher galt ein Merker fürs ganze Gerät – auf einem geteilten Küchen-iPad
// hielt die App Push für den zweiten Mitarbeiter für „an“, und nichts kam an.
const MERKER = 'thechef-push:';
export function pushGemerkt(nutzerId: string): string | null {
  try { return localStorage.getItem(MERKER + nutzerId); } catch { return null; }
}
export function pushMerken(nutzerId: string, ziel: string | null) {
  try { if (ziel) localStorage.setItem(MERKER + nutzerId, ziel); else localStorage.removeItem(MERKER + nutzerId); } catch { /* privat */ }
}
export function pushZiel(abo: PushAbo): string {
  return abo.art === 'apns' ? abo.token : abo.abo.endpoint ?? '';
}

/** Ist DIESES Gerät für DIESEN Nutzer angemeldet? `push_an` steht in der Datenbank
 *  standardmäßig auf an – ohne Abo auf dem Gerät kommt trotzdem nichts an. */
export async function pushAufGeraet(nutzerId: string): Promise<boolean> {
  const gemerkt = pushGemerkt(nutzerId);
  if (istNativ()) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    if ((await PushNotifications.checkPermissions()).receive !== 'granted') return false;
    return !!gemerkt;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const abo = await reg?.pushManager.getSubscription();
  return !!abo && abo.endpoint === gemerkt;
}

/** iPhone-App, bei jedem Start: Apple kann das Token wechseln (Backup, neues Gerät).
 *  Ohne Auffrischen zeigte die App „an“, während Apple das alte Token verwarf. */
export async function pushAuffrischen(nutzerId: string, speichern: (a: PushAbo) => Promise<void>) {
  if (!istNativ()) return;
  const alt = pushGemerkt(nutzerId);
  if (!alt) return; // nie eingeschaltet – nicht von selbst fragen
  try {
    const abo = await applePush(false);
    const neu = pushZiel(abo);
    if (neu && neu !== alt) { await speichern(abo); pushMerken(nutzerId, neu); }
  } catch (e) {
    // Erlaubnis entzogen o. Ä.: Merker weg, dann zeigt die App wieder „Einschalten“.
    if ((e as Error)?.message === 'push_abgelehnt') pushMerken(nutzerId, null);
  }
}

export function whatsappLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
export function mailLink(betreff: string, text: string) {
  return `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Vorlesen – nur anbieten, wenn eine Stimme für die Sprache da ist (Kurmancî oft nicht). */
export function stimmeFuer(sprache: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const v = speechSynthesis.getVoices();
  return v.find((x) => x.lang.toLowerCase().startsWith(sprache)) ?? null;
}
export function vorlesen(text: string, sprache: string) {
  const s = stimmeFuer(sprache);
  if (!s) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = s;
  u.lang = s.lang;
  u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}

/** Kurzes Vibrieren bei Erfolg – wo es geht. */
export function haptik(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* nicht überall */ }
}
