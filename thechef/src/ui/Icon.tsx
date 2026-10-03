// Linien-Icons aus den Mockups (24er Raster, Strich 2, runde Enden).
import type { CSSProperties } from 'react';

const P: Record<string, string[]> = {
  kuehlhaus: ['M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z', 'M12 9v7'],
  tiefkuehler: ['M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9', 'M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5'],
  trocken: ['M3 8l9-5 9 5v8l-9 5-9-5z', 'M3 8l9 5 9-5M12 13v8'],
  sonstig: ['M4 6h16v12H4z', 'M4 10h16'],
  bestand: ['M3 8l9-5 9 5v8l-9 5-9-5z', 'M3 8l9 5 9-5M12 13v8'],
  kamera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z'],
  muell: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  globus: ['M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z', 'M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z'],
  funkeln: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
  einkauf: ['M4 5h2l2 11h10l2-8H7', 'M11.4 20a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0zM18.4 20a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0z'],
  mikro: ['M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z', 'M5 11a7 7 0 0 0 14 0M12 18v3'],
  vorlesen: ['M4 9v6h4l5 4V5L8 9z', 'M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12'],
  haken: ['M5 12.5l4.5 4.5L19 7.5'],
  zurueck: ['M15 6l-6 6 6 6'],
  weiter: ['M9 6l6 6-6 6'],
  darstellung: ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z'],
  muetze: ['M7 14a4 4 0 0 1-1.6-7.7A4.6 4.6 0 0 1 12 3.6a4.6 4.6 0 0 1 6.6 2.7A4 4 0 0 1 17 14v5.5H7z', 'M7 16.8h10'],
  blitz: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  x: ['M6 6l12 12M18 6L6 18'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  whatsapp: ['M4 20l1.3-4A8 8 0 1 1 8.2 19z', 'M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-1.5-1-2-2l1-1-1-2z'],
  warnung: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4.5M12 17.5v.01'],
  offline: ['M3 3l18 18', 'M8.5 8.6A5 5 0 0 0 6 17h11M17.7 13.8A3.5 3.5 0 0 0 15 9.5a5 5 0 0 0-3.2-3.4'],
  hochladen: ['M12 16V4M7 9l5-5 5 5M4 20h16'],
  regler: ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  team: ['M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1', 'M13.5 7.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M21 19v-1a4 4 0 0 0-3-3.9M15.5 3.6a4 4 0 0 1 0 7.8'],
  stift: ['M4 20h4L20 8l-4-4L4 16z', 'M14 6l4 4'],
  foto: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 2-2 5 5', 'M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z'],
  uhr: ['M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z', 'M12 7v5l3 2'],
  ziel: ['M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
  euro: ['M17 6.5A7 7 0 1 0 17 17.5', 'M4 10h9M4 14h9'],
  telefon: ['M8 3h8v18H8z', 'M11 18h2'],
  senden: ['M4 12l16-8-6 16-2-6z'],
  abmelden: ['M10 4H5v16h5', 'M15 8l4 4-4 4M19 12H9'],
  frage: ['M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01'],
};

export function Icon({ name, groesse = 22, strich = 2, style, spiegeln }: { name: string; groesse?: number; strich?: number; style?: CSSProperties; spiegeln?: boolean }) {
  const pfade = P[name] ?? P.sonstig;
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strich}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={spiegeln ? 'spiegeln' : undefined}>
      {name === 'darstellung' && <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />}
      {pfade.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
