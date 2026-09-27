// Weggeworfen.dc.html – Produkt als Bild antippen, Menge mit großen +/- oder per Sprache, speichern.
import { useState } from 'react';
import { useApp, useFehlerText, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { haptik } from '../lib/geraet.ts';
import { geheZu } from '../lib/router.ts';
import { Fehler, KopfMitte, Laden, ProduktBild, ZahlEingabe } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

export function WeggeworfenSeite() {
  const { t, name, einheit } = useT();
  const { api, toast, geaendert } = useApp();
  const fehlerText = useFehlerText();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => {
    const [produkte, weg] = await Promise.all([a.produkte(), a.weggeworfen(new Date(Date.now() - 60 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString())]);
    // Was oft weggeworfen wird, steht vorne
    const oft = new Map<string, number>();
    weg.forEach((w) => oft.set(w.produkt_id, (oft.get(w.produkt_id) ?? 0) + 1));
    return produkte.filter((p) => p.aktiv).sort((a, b) => (oft.get(b.id) ?? 0) - (oft.get(a.id) ?? 0));
  });
  const [wahl, setWahl] = useState<string | null>(null);
  const [menge, setMenge] = useState(1);
  const [speichert, setSpeichert] = useState(false);
  const [fehlerS, setFehlerS] = useState<string | null>(null);
  const p = daten?.find((x) => x.id === wahl);

  async function speichern() {
    if (!p || menge <= 0) return;
    setSpeichert(true);
    setFehlerS(null);
    try {
      await api.wegwerfen(p.id, menge);
      haptik(30);
      geaendert();
      toast(t('weg.gespeichert'));
      geheZu('/m', true);
    } catch (e) {
      setFehlerS(fehlerText(e));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={t('mitarbeiter.weggeworfen')} ziel="/m" />
      <h1 className="titel einblenden" style={{ fontSize: 28 }}>{t('weg.frage')}</h1>
      {laedt && !daten && <Laden />}
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <div className="raster-3 einblenden">
        {daten?.map((x) => (
          <button key={x.id} className="produkt-wahl" aria-pressed={wahl === x.id} onClick={() => { setWahl(x.id); setMenge(1); }}>
            <ProduktBild produkt={x} groesse="gross" />
            <span>{name(x.namen)}</span>
          </button>
        ))}
      </div>
      {p && (
        <div className="stapel einblenden">
          <h2 className="abschnitt">{t('weg.wie_viel')}</h2>
          <ZahlEingabe wert={menge} setWert={setMenge} einheit={einheit(p.zaehleinheit, menge)} />
          {fehlerS && <div className="meldung fehler" role="alert"><Icon name="warnung" />{fehlerS}</div>}
          <button className="knopf-haupt" disabled={speichert || menge <= 0} onClick={speichern}>
            {speichert ? <span className="laden" /> : <><Icon name="haken" groesse={24} strich={2.6} /> {t('allg.speichern')}</>}
          </button>
        </div>
      )}
    </main>
  );
}
