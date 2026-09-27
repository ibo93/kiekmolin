// Antwort.dc.html – so antwortet der Assistent:
// ein klarer Satz → Zahlen als Kacheln → Quelle mit Stand → eine passende Aktion.
import { useEffect, useRef, useState } from 'react';
import { tagIn } from '../../supabase/functions/_shared/logik/lager.ts';
import type { AssistentAntwort } from '../daten/api.ts';
import { useApp, useFehlerText, useIch } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { abfrage, geheZu } from '../lib/router.ts';
import { KopfMitte, MikroKnopf } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

type Eintrag = { frage: string; antwort: AssistentAntwort | null; fehler?: string };

export function Gespraech() {
  const { t, sprache } = useT();
  const { api } = useApp();
  const fehlerText = useFehlerText();
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [frage, setFrage] = useState('');
  const ende = useRef<HTMLDivElement>(null);
  const gestartet = useRef(false);

  async function fragen(q: string) {
    const f = q.trim();
    if (!f) return;
    setFrage('');
    setEintraege((e) => [...e, { frage: f, antwort: null }]);
    try {
      const a = await api.fragen(f, sprache);
      setEintraege((e) => e.map((x, i) => (i === e.length - 1 ? { ...x, antwort: a } : x)));
    } catch (err) {
      setEintraege((e) => e.map((x, i) => (i === e.length - 1 ? { ...x, fehler: fehlerText(err) } : x)));
    }
  }

  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    api.verlauf().then((v) => setEintraege((e) => [...v.slice(-6).map((x) => ({ frage: x.frage, antwort: x.antwort })), ...e])).catch(() => {});
    const q = abfrage().get('q');
    if (q) { history.replaceState(null, '', '#/c/frage'); fragen(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { ende.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [eintraege]);

  return (
    <main className="seite ohne-nav" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }}>
      <KopfMitte titel={t('nav.assistent')} ziel="/c" />
      {eintraege.length === 0 && <p className="leise" style={{ textAlign: 'center', marginTop: 40 }}>{t('gespraech.leer')}</p>}
      {eintraege.map((e, i) => (
        <div key={i} className="stapel" style={{ gap: 14 }}>
          <div className="blase-frage einblenden">{e.frage}</div>
          {e.fehler ? <div className="meldung fehler" role="alert"><Icon name="warnung" />{e.fehler}</div>
            : e.antwort ? <AntwortKarte a={e.antwort} />
              : <div className="blase-antwort einblenden" aria-busy="true"><span className="laden" /></div>}
        </div>
      ))}
      <div ref={ende} />
      <form className="frage-leiste glas" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', maxWidth: 528, margin: '0 auto', zIndex: 20 }}
        onSubmit={(e) => { e.preventDefault(); fragen(frage); }}>
        <input value={frage} onChange={(e) => setFrage(e.target.value)} placeholder={t('assistent.frag_mich')} aria-label={t('assistent.frag_mich')} enterKeyHint="send" />
        {frage.trim()
          ? <button className="mikro senden" aria-label={t('allg.senden')}><Icon name="senden" groesse={22} spiegeln /></button>
          : <MikroKnopf onText={(x) => setFrage(x)} />}
      </form>
    </main>
  );
}

function AntwortKarte({ a }: { a: AssistentAntwort }) {
  const { t, zahl, wann } = useT();
  const { api, toast, geaendert } = useApp();
  const { betrieb } = useIch();
  const fehlerText = useFehlerText();
  const [erledigt, setErledigt] = useState(false);

  async function aktion() {
    const x = a.aktion;
    if (!x) return;
    if (x.typ === 'einkaufsliste') {
      try {
        const heute = tagIn(betrieb.zeitzone);
        const alt = (await api.einkaufEintraege(heute)).find((e) => e.produkt_id === x.produkt_id);
        await api.einkaufSetzen({ datum: heute, produkt_id: x.produkt_id, menge_extra: (alt?.menge_extra ?? 0) + x.menge_einheiten, abgehakt: false, quelle: 'assistent' });
        setErledigt(true);
        geaendert();
        toast(t('gespraech.auf_liste'));
      } catch (e) { toast(fehlerText(e)); }
      return;
    }
    geheZu({ bestand: '/c/bestand', verlust: '/c/verlust', einkauf: '/c/einkauf', neu_scannen: '/m' }[x.typ]);
  }

  const ton = (art: string) => (art === 'fehlt' ? 'gelb' : '');
  return (
    <div className="blase-antwort einblenden" style={{ animationDelay: '.1s' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.25 }}>{a.satz}</div>
      {a.text && <div style={{ fontSize: 16, lineHeight: 1.45 }}>{a.text}</div>}
      {a.kacheln.length > 0 && (
        <div className="raster-3">
          {a.kacheln.map((k, i) => (
            <div key={i} className={`mini-kachel ${ton(k.art)}`}>
              <div className="klein">{k.titel}</div>
              <div className="zahl">{zahl(k.zahl)} <span style={{ fontSize: 15 }}>{k.einheit}</span></div>
            </div>
          ))}
        </div>
      )}
      {a.daten_alt && <div className="meldung warnung"><Icon name="uhr" />{t('gespraech.daten_alt')}</div>}
      {(a.quelle || a.stand) && (
        <div className="leise" style={{ fontSize: 14, lineHeight: 1.45 }}>
          {a.schaetzung && <strong>{t('gespraech.schaetzung')} · </strong>}
          {a.quelle} {a.stand && t('gespraech.stand', { wann: wann(a.stand) })}
        </div>
      )}
      {a.verworfen && <div className="leise" style={{ fontSize: 13 }}>{t('gespraech.verworfen_warum')}</div>}
      {a.aktion && !erledigt && (
        <button className="knopf akzent-text" style={{ alignSelf: 'flex-start' }} onClick={aktion}>
          <Icon name={a.aktion.typ === 'einkaufsliste' ? 'einkauf' : a.aktion.typ === 'neu_scannen' ? 'kamera' : 'weiter'} groesse={18} spiegeln={a.aktion.typ !== 'einkaufsliste' && a.aktion.typ !== 'neu_scannen'} />
          {t(`aktion.${a.aktion.typ}`)}
        </button>
      )}
      {erledigt && <div className="meldung ok"><Icon name="haken" />{t('gespraech.auf_liste')}</div>}
    </div>
  );
}
