// Hell/Dunkel/Automatisch, Akzent, Glas, Bewegung – alles über data-Attribute an <html>.
import type { Darstellung } from '../../supabase/functions/_shared/logik/typen.ts';

/** Akzentfarben. Bewusst OHNE Grün, Orange und Rot: das sind die Ampelfarben.
 *  Ein grüner Knopf läse sich wie "alles gut". */
export const AKZENTE: Record<string, { hell: string; dunkel: string; druck: string }> = {
  blau: { hell: '#1F4FD1', dunkel: '#2F6BFF', druck: '#173C9E' },
  lila: { hell: '#6A2FB8', dunkel: '#BF5AF2', druck: '#52238F' },
  petrol: { hell: '#0E6E7A', dunkel: '#40C8E0', druck: '#0A535C' },
};

function hexZuRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

let aufraeumen: (() => void) | null = null;

/** standardModus: Mitarbeiter-Ansicht hell (helle Küche), Chef folgt dem System. */
export function darstellungAnwenden(d: Darstellung, standardModus: 'hell' | 'auto') {
  const root = document.documentElement;
  aufraeumen?.();
  aufraeumen = null;
  const modus = d.modus ?? standardModus;
  const setzen = (dunkel: boolean) => {
    root.dataset.modus = dunkel ? 'dunkel' : 'hell';
    const a = AKZENTE[d.akzent ?? 'blau'] ?? AKZENTE.blau;
    const farbe = dunkel ? a.dunkel : a.hell;
    root.style.setProperty('--akzent', farbe);
    root.style.setProperty('--akzent-druck', a.druck);
    root.style.setProperty('--akzent-schatten', hexZuRgba(farbe, dunkel ? 0.3 : 0.32));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dunkel ? '#050506' : '#F4F3EF');
  };
  if (modus === 'auto') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    setzen(mq.matches);
    const f = (e: MediaQueryListEvent) => setzen(e.matches);
    mq.addEventListener('change', f);
    aufraeumen = () => mq.removeEventListener('change', f);
  } else setzen(modus === 'dunkel');
  root.dataset.glas = d.glas ?? 'klar';
  root.dataset.bewegung = d.bewegung === false ? 'aus' : 'an';
}
