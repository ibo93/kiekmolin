// Auf dem iPhone legt sich die Tastatur ÜBER die Seite, statt sie kleiner zu
// machen – unten festgesteckte Leisten (Frage an den Assistenten, Sheets)
// verschwinden dahinter, man sieht nicht, was man tippt. Gemessen im Simulator,
// 28.09.2026. Hier wird die Tastaturhöhe als --tastatur bereitgestellt.

/** Wie viel der Seite unten verdeckt ist, in CSS-px der (verkleinerten) App. */
export function verdeckt(fenster: number, sichtbar: number, versatzOben: number, massstab: number, zoom = 1) {
  // Mit zwei Fingern hineingezoomt: der sichtbare Teil ist kleiner, aber keine Tastatur.
  if (zoom > 1.01) return 0;
  const px = Math.max(0, fenster - sichtbar - versatzOben);
  // Unter 80 px ist es keine Tastatur (Adressleiste, Rundung).
  return px < 80 ? 0 : px / massstab;
}

export function tastaturBeobachten() {
  const vv = window.visualViewport;
  if (!vv) return;
  const wurzel = document.documentElement;
  const massstab = Number(getComputedStyle(wurzel).getPropertyValue('--massstab')) || 1;
  const setzen = () => {
    const h = verdeckt(window.innerHeight, vv.height, vv.offsetTop, massstab, vv.scale);
    wurzel.style.setProperty('--tastatur', `${h}px`);
    wurzel.classList.toggle('tastatur-offen', h > 0);
  };
  vv.addEventListener('resize', setzen);
  vv.addEventListener('scroll', setzen);
  setzen();
}
