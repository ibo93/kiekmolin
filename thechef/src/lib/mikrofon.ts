// Audio aufnehmen – umgewandelt wird auf dem Server (Edge Function "sprache"),
// NICHT mit der Browser-Spracherkennung (THECHEF.md).
export type Aufnahme = { stopp(): Promise<Blob>; abbrechen(): void };

function format(): string | undefined {
  const kandidaten = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return kandidaten.find((k) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(k));
}

export async function aufnehmen(maxSekunden = 20): Promise<Aufnahme> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('kein_mikrofon');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const typ = format();
  const rec = new MediaRecorder(stream, typ ? { mimeType: typ } : undefined);
  const teile: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && teile.push(e.data);
  rec.start();
  const ende = () => stream.getTracks().forEach((t) => t.stop());
  const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), maxSekunden * 1000);
  const fertig = new Promise<Blob>((ok) => {
    rec.onstop = () => { clearTimeout(timer); ende(); ok(new Blob(teile, { type: rec.mimeType || typ || 'audio/webm' })); };
  });
  return {
    stopp() { if (rec.state === 'recording') rec.stop(); return fertig; },
    abbrechen() { clearTimeout(timer); if (rec.state === 'recording') rec.stop(); ende(); },
  };
}
