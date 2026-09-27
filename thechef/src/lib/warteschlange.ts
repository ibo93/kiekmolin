// Offline-Scan: Fotos liegen ZUERST auf dem Gerät und erst dann im Netz.
// Im Kühlhaus ist oft kein Empfang – das darf keinen Scan kosten.
//
// IndexedDB statt localStorage: Fotos sind Blobs und groß.
// Ablauf je Scan:  lokal → hochgeladen (scan_id) → erkannt → (Mitarbeiter bestätigt)
import type { LokalerScan, LokalesFoto } from '../daten/api.ts';

export type WarteScan = LokalerScan & {
  status: 'lokal' | 'hochgeladen' | 'erkannt' | 'fehler';
  scan_id?: string;
  fehler?: string;
  versuche: number;
};

const DB = 'thechef';
let offen: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (offen) return offen;
  offen = new Promise((ok, fehl) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('scans', { keyPath: 'lokal_id' });
      const f = d.createObjectStore('fotos', { keyPath: 'id' });
      f.createIndex('lokal_id', 'lokal_id');
      d.createObjectStore('geister', { keyPath: 'position_id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehl(r.error);
  });
  return offen;
}

function anfrage<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fehl) => { r.onsuccess = () => ok(r.result); r.onerror = () => fehl(r.error); });
}
async function laden<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>, modus: IDBTransactionMode = 'readonly') {
  const d = await db();
  return anfrage(fn(d.transaction(store, modus).objectStore(store)));
}

export async function scanAnlegen(s: LokalerScan) {
  await laden('scans', (st) => st.put({ ...s, status: 'lokal', versuche: 0 } satisfies WarteScan), 'readwrite');
}
export async function scanAktualisieren(lokalId: string, p: Partial<WarteScan>) {
  const alt = await laden<WarteScan | undefined>('scans', (st) => st.get(lokalId));
  if (alt) await laden('scans', (st) => st.put({ ...alt, ...p }), 'readwrite');
}
export async function scanEntfernen(lokalId: string) {
  const fotos = await fotosVon(lokalId);
  const d = await db();
  const tx = d.transaction(['scans', 'fotos'], 'readwrite');
  tx.objectStore('scans').delete(lokalId);
  for (const f of fotos) tx.objectStore('fotos').delete(f.id);
  await new Promise((ok, fehl) => { tx.oncomplete = ok; tx.onerror = () => fehl(tx.error); });
}
export async function alleScans(): Promise<WarteScan[]> {
  return laden('scans', (st) => st.getAll());
}

export async function fotoSpeichern(lokalId: string, f: LokalesFoto) {
  await laden('fotos', (st) => st.put({ ...f, lokal_id: lokalId }), 'readwrite');
  // Das eigene letzte Foto ist das Geisterbild fürs nächste Mal – auch offline.
  if (f.position_id) await laden('geister', (st) => st.put({ position_id: f.position_id, blob: f.blob }), 'readwrite');
}
export async function fotoLoeschen(id: string) {
  await laden('fotos', (st) => st.delete(id), 'readwrite');
}
export async function fotosVon(lokalId: string): Promise<LokalesFoto[]> {
  return laden('fotos', (st) => st.index('lokal_id').getAll(lokalId));
}
export async function geisterbild(positionId: string): Promise<Blob | null> {
  const r = await laden<{ blob: Blob } | undefined>('geister', (st) => st.get(positionId));
  return r?.blob ?? null;
}

/** Speicher dauerhaft anfragen, damit der Browser Fotos nicht still wegräumt. */
export async function speicherSichern() {
  try { await navigator.storage?.persist?.(); } catch { /* nicht überall */ }
}
