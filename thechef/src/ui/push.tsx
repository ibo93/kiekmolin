// Push ein/aus – für Chef (Einstellungen) und Mitarbeiter (Startseite).
// Vorher konnten Mitarbeiter sich nirgends anmelden: die Scan-Erinnerung ging
// ins Leere, ohne Fehlermeldung (CLAUDE.md, Regel 6).
import { useEffect, useState } from 'react';
import { useApp, useFehlerText, useIch } from '../app/kontext.tsx';
import { APNS_GESPEICHERT, pushAbonnieren, pushAufGeraet } from '../lib/geraet.ts';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function usePush() {
  const { api, neuLaden, toast } = useApp();
  const { nutzer } = useIch();
  const fehlerText = useFehlerText();
  // Demo: kein Server, nichts zu abonnieren – dort zählt nur der Schalter.
  const [geraet, setGeraet] = useState<boolean | null>(api.demo ? true : null);
  const [laedt, setLaedt] = useState(false);
  useEffect(() => { if (!api.demo) pushAufGeraet().then(setGeraet, () => setGeraet(false)); }, [api.demo]);

  async function setzen(an: boolean) {
    setLaedt(true);
    try {
      if (an && !api.demo) {
        // Web braucht VAPID, die iPhone-App geht über Apple – das entscheidet pushAbonnieren.
        const abo = await pushAbonnieren(VAPID);
        await api.pushSpeichern(abo);
        if (abo.art === 'apns') try { localStorage.setItem(APNS_GESPEICHERT, '1'); } catch { /* privat */ }
        setGeraet(true);
      }
      await api.profilAendern({ push_an: an });
      await neuLaden();
    } catch (e) { toast(fehlerText(e)); } finally { setLaedt(false); }
  }
  return { aktiv: nutzer.push_an && geraet === true, geprueft: geraet !== null, laedt, setzen };
}
