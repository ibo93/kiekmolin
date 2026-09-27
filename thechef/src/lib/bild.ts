// Fotos vor dem Upload verkleinern. Weniger Pixel = weniger Kosten je Scan
// und schneller hochgeladen – aus dem Kühlhaus mit schwachem Netz.
//
// 2048 px an der langen Kante: genug, um Kisten zu zählen und ein MHD auf
// dem Etikett zu lesen. (Claude liest bis 2576 px; mehr kostet nur.)
export const SCAN_KANTE = 2048;
export const KATALOG_KANTE = 768;

export async function verkleinern(quelle: Blob | HTMLCanvasElement, kante: number, qualitaet = 0.82) {
  let bild: CanvasImageSource & { width: number; height: number };
  if (quelle instanceof HTMLCanvasElement) bild = quelle;
  else bild = await createImageBitmap(quelle);
  const f = Math.min(1, kante / Math.max(bild.width, bild.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bild.width * f);
  c.height = Math.round(bild.height * f);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bild, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, fehl) => c.toBlob((b) => (b ? ok(b) : fehl(new Error('Foto konnte nicht umgewandelt werden'))), 'image/jpeg', qualitaet));
  return { blob, breite: c.width, hoehe: c.height };
}
