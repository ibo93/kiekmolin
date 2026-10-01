// Kamera über eine eigene Schicht – später in Capacitor gegen die native
// Kamera tauschbar, ohne die Seiten anzufassen.
import { registerPlugin } from '@capacitor/core';
import { istNativ } from './geraet.ts';

/** In der iPhone-App: Taschenlampe nativ (ios/App/App/SceneDelegate.swift → LampePlugin). */
const Lampe = registerPlugin<{
  verfuegbar(): Promise<{ verfuegbar: boolean }>;
  setzen(o: { an: boolean }): Promise<{ an: boolean }>;
}>('Lampe');
export type Kamera = {
  video: HTMLVideoElement;
  taschenlampe: boolean; // wird vom Gerät unterstützt?
  lampe(an: boolean): Promise<boolean>;
  foto(): HTMLCanvasElement;
  stopp(): void;
};

export async function kameraStarten(video: HTMLVideoElement): Promise<Kamera> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('keine_kamera');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play();
  const spur = stream.getVideoTracks()[0];
  // Taschenlampe: Android/Chrome ja. iPhone im Browser: nicht zugesichert –
  // der Knopf erscheint nur, wenn das Gerät "torch" meldet.
  const webLampe = (spur.getCapabilities?.() as { torch?: boolean } | undefined)?.torch === true;
  // iPhone-App: der WebView meldet nie "torch" – dort fragt die App iOS selbst.
  const nativLampe = !webLampe && istNativ() && (await Lampe.verfuegbar().then((r) => r.verfuegbar, () => false));
  let lampeAn = false;
  return {
    video,
    taschenlampe: webLampe || nativLampe,
    async lampe(an) {
      try {
        if (nativLampe) {
          const r = await Lampe.setzen({ an });
          lampeAn = r.an;
          return r.an === an;
        }
        await spur.applyConstraints({ advanced: [{ torch: an } as MediaTrackConstraintSet] });
        lampeAn = an;
        return true;
      } catch {
        return false;
      }
    },
    foto() {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
      return c;
    },
    stopp() {
      // Die native Lampe hängt nicht an der Kamera-Spur – sonst brennt sie weiter.
      if (nativLampe && lampeAn) Lampe.setzen({ an: false }).catch(() => {});
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
