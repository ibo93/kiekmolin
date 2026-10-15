// Kamera über eine eigene Schicht – später in Capacitor gegen die native
// Kamera tauschbar, ohne die Seiten anzufassen.
import { istNativ } from './geraet.ts';
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
  // Taschenlampe: Android/Chrome über die Videospur. iPhone im Browser: nicht
  // zugesichert – der Knopf erscheint nur, wenn das Gerät "torch" meldet.
  // In der iPhone-App (Xcode) meldet WKWebView nie "torch" – dort schaltet ein
  // natives Plugin das Licht direkt über AVCaptureDevice.
  const nativ = istNativ() ? await nativeLampe() : null;
  const kann = nativ ? nativ.da : (spur.getCapabilities?.() as { torch?: boolean } | undefined)?.torch === true;
  return {
    video,
    taschenlampe: kann,
    async lampe(an) {
      try {
        if (nativ) await (an ? nativ.plugin.enable() : nativ.plugin.disable());
        else await spur.applyConstraints({ advanced: [{ torch: an } as MediaTrackConstraintSet] });
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
      if (nativ) nativ.plugin.disable().catch(() => {}); // Licht nie anlassen
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

async function nativeLampe() {
  try {
    const { Torch } = await import('@capawesome/capacitor-torch');
    return { plugin: Torch, da: (await Torch.isAvailable()).available };
  } catch {
    return null;
  }
}
