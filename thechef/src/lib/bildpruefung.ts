// Ist das Foto zu dunkel? Sofort am Gerät prüfen – auch ohne Netz im Kühlhaus.
// Die KI meldet das zwar auch (bildqualitaet), aber erst nach dem Hochladen;
// dann steht der Mitarbeiter schon wieder vor der Tür.
//
// Die Grenze ist eine Annahme, NICHT im ÖZ KEBAB gemessen: ein normal
// beleuchtetes Regal liegt deutlich darüber, ein Foto ohne Licht darunter.
// Der Hinweis hält niemanden auf – er schlägt nur Licht und ein zweites Foto vor.
export const ZU_DUNKEL = 45;

/** Mittlere wahrgenommene Helligkeit 0..255 (ITU-R BT.601) aus RGBA-Pixeln. */
export function helligkeit(rgba: ArrayLike<number>): number {
  let summe = 0;
  let n = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    summe += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    n++;
  }
  return n ? summe / n : 0;
}

export function zuDunkel(h: number) {
  return h < ZU_DUNKEL;
}

/** Helligkeit eines Bildes – auf 64 px verkleinert, das reicht und kostet nichts. */
export function bildHelligkeit(bild: CanvasImageSource & { width: number; height: number }): number {
  const c = document.createElement('canvas');
  const f = 64 / Math.max(1, bild.width, bild.height);
  c.width = Math.max(1, Math.round(bild.width * f));
  c.height = Math.max(1, Math.round(bild.height * f));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bild, 0, 0, c.width, c.height);
  return helligkeit(ctx.getImageData(0, 0, c.width, c.height).data);
}

export async function blobHelligkeit(b: Blob): Promise<number> {
  const bild = await createImageBitmap(b);
  try { return bildHelligkeit(bild); } finally { bild.close(); }
}
