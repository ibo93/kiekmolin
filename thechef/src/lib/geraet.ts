// Was das Gerät kann: Push, Teilen, Vorlesen, Installation.

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

/** Web-Push: auf dem iPhone NUR, wenn die App auf dem Home-Bildschirm liegt (iOS ≥ 16.4). */
export async function pushAbonnieren(vapid: string): Promise<PushSubscriptionJSON> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(istIos() && !istInstalliert() ? 'push_ios_installieren' : 'push_nicht_moeglich');
  const erlaubt = await Notification.requestPermission();
  if (erlaubt !== 'granted') throw new Error('push_abgelehnt');
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(vapid.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (vapid.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const abo = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  return abo.toJSON();
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
