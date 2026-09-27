// Lädt offline gemachte Scans hoch, sobald Netz da ist, und lässt sie erkennen.
// Läuft beim Start, bei "online" und alle 30 Sekunden, solange etwas wartet.
//
// iPhones haben keine Hintergrund-Synchronisation im Browser: hochgeladen
// wird, sobald die App offen ist. Das steht so auch in der Anzeige.
import type { Api } from '../daten/api.ts';
import { alleScans, fotosVon, scanAktualisieren, type WarteScan } from './warteschlange.ts';

type Zuhoerer = (s: WarteScan[]) => void;
const zuhoerer = new Set<Zuhoerer>();
let laeuft = false;

export function abonnieren(f: Zuhoerer) {
  zuhoerer.add(f);
  alleScans().then(f).catch(() => {});
  return () => { zuhoerer.delete(f); };
}
async function melden() {
  const s = await alleScans();
  zuhoerer.forEach((f) => f(s));
}

/** Einen lokalen Scan so weit bringen wie möglich. Gibt die scan_id zurück, wenn erkannt. */
export async function abgleichen(api: Api, nur?: string): Promise<string | null> {
  if (laeuft && !nur) return null;
  laeuft = true;
  let ergebnis: string | null = null;
  try {
    const scans = (await alleScans()).filter((s) => (nur ? s.lokal_id === nur : s.status !== 'erkannt'));
    for (const s of scans) {
      if (!navigator.onLine) break;
      try {
        let scanId = s.scan_id;
        if (s.status === 'lokal' || s.status === 'fehler' || !scanId) {
          const fotos = await fotosVon(s.lokal_id);
          scanId = await api.scanHochladen(s, fotos);
          await scanAktualisieren(s.lokal_id, { status: 'hochgeladen', scan_id: scanId, fehler: undefined });
          await melden();
        }
        await api.erkennen(scanId);
        await scanAktualisieren(s.lokal_id, { status: 'erkannt', scan_id: scanId });
        ergebnis = scanId;
      } catch (e) {
        await scanAktualisieren(s.lokal_id, { status: 'fehler', fehler: String((e as Error).message ?? e), versuche: s.versuche + 1 });
        if (nur) throw e;
      }
      await melden();
    }
  } finally {
    laeuft = false;
  }
  return ergebnis;
}

export function abgleichStarten(api: Api) {
  const los = () => { abgleichen(api).catch(() => {}); };
  window.addEventListener('online', los);
  const t = setInterval(async () => {
    const s = await alleScans().catch(() => []);
    if (s.some((x) => x.status !== 'erkannt')) los();
  }, 30_000);
  los();
  return () => { window.removeEventListener('online', los); clearInterval(t); };
}
