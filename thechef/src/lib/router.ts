// Winziger Hash-Router: #/c/bestand → ['c', 'bestand'].
// Hash statt Pfad, damit Netlify und später Capacitor ohne Umleitungen auskommen.
import { useEffect, useState } from 'react';

export function pfad(): string[] {
  return location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}
export function abfrage(): URLSearchParams {
  return new URLSearchParams(location.hash.split('?')[1] ?? '');
}
export function geheZu(ziel: string, ersetzen = false) {
  const h = ziel.startsWith('#') ? ziel : `#${ziel}`;
  if (ersetzen) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo(0, 0);
}
export function zurueck(ersatz: string) {
  // Direkt geöffnet (Push, Lesezeichen): kein Verlauf → zum festen Ziel statt ins Leere.
  if (history.state !== null && history.length > 1) history.back();
  else geheZu(ersatz, true);
}
export function usePfad(): string[] {
  const [p, setP] = useState(pfad);
  useEffect(() => {
    const f = () => setP(pfad());
    window.addEventListener('hashchange', f);
    window.addEventListener('popstate', f);
    return () => { window.removeEventListener('hashchange', f); window.removeEventListener('popstate', f); };
  }, []);
  return p;
}
